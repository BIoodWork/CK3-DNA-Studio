"""Read-only privacy audit of the actual compressed PyInstaller release backend.

Run with the Python version used to build the backend and PyInstaller installed.
No application modules are imported or executed. Additional private identifiers
can be supplied with repeatable --forbid options; reports omit their values.
"""

import argparse
from collections import Counter
import hashlib
import importlib.util
import io
import json
import marshal
from pathlib import Path
import re
import tempfile
import types
import zipfile

from PyInstaller.archive.readers import CArchiveReader


PROFILE = re.compile(
    r"(?i)(?<!\w)(?:[a-z]:[\\/]+users[\\/]+|/(?:home|Users)/)"
    r"([a-z0-9_.{}-]+)"
)
# These are upstream wheel build accounts or literal documentation examples,
# restricted to the exact upstream module where they occur. They do not identify
# the person building or distributing this application.
UPSTREAM_PROFILES = {
    "CArchive:numpy-2.4.3.dist-info\\DELVEWHEEL": {"runneradmin"},
    "PYZ:numpy.__config__": {"runneradmin"},
    "PYZ:numpy.lib._datasource": {"guido", "user", "guido.foobar.txt"},
    "PYZ:numpy.lib._utils_impl": {"user"},
    "PYZ:pydoc_data.topics": {"{name}", "galahad"},
}


class Audit:
    def __init__(self, markers):
        self.markers = []
        for index, marker in enumerate(markers, 1):
            variants = {marker, marker.replace("\\", "/"), marker.replace("/", "\\")}
            variants |= {value.replace("\\", "\\\\") for value in variants}
            encoded = []
            for value in variants:
                if not value:
                    continue
                for encoding, boundary in (
                    ("utf-8", rb"[a-z0-9_]"),
                    ("utf-16-le", rb"[a-z0-9_]\x00"),
                    ("utf-16-be", rb"\x00[a-z0-9_]"),
                ):
                    # Match an account token, not a substring of an unrelated
                    # upstream word or API name.
                    literal = value.casefold().encode(encoding)
                    token = re.escape(literal)
                    encoded.append((literal, re.compile(b"(?<!" + boundary + b")" + token + b"(?!" + boundary + b")")))
            self.markers.append((f"marker-{index}", encoded))
        self.counts = Counter()
        self.failures = set()
        self.upstream = set()
        self.filenames = set()

    def scan(self, location, data):
        self.counts["scanned_bytes"] += len(data)
        lower = data.lower()
        for marker, variants in self.markers:
            if any(literal in lower and pattern.search(lower) for literal, pattern in variants):
                self.failures.add((location, "private-identifier", marker))
        # Latin-1 preserves byte boundaries. UTF-16 covers native PE strings and
        # resources in both endiannesses, including strings at odd byte offsets.
        texts = [data.decode("latin-1")]
        for encoding in ("utf-16-le", "utf-16-be"):
            for offset in (0, 1):
                texts.append(data[offset:].decode(encoding, errors="ignore"))
        for text in texts:
            for match in PROFILE.finditer(text):
                account = match.group(1).casefold()
                if account in UPSTREAM_PROFILES.get(location, set()):
                    self.upstream.add((location, account))
                else:
                    self.failures.add((location, "unreviewed-profile-path", ""))

    def code(self, location, code):
        if not isinstance(code, types.CodeType):
            raise ValueError(f"Expected Python code object in {location}")
        self.counts["code_objects"] += 1
        self.filenames.add(code.co_filename)
        if re.match(r"(?i)^(?:[a-z]:[\\/]|/|\\\\)", code.co_filename):
            self.failures.add((location, "absolute-code-filename", ""))
        self.scan(location + ":co_filename", code.co_filename.encode("utf-8"))
        for item in (*code.co_consts, *code.co_names, *code.co_varnames, *code.co_freevars, *code.co_cellvars):
            self.constant(location, item)

    def constant(self, location, item):
        if isinstance(item, types.CodeType):
            self.code(location, item)
        elif isinstance(item, str):
            self.scan(location, item.encode("utf-8"))
        elif isinstance(item, bytes):
            self.scan(location, item)
        elif isinstance(item, (tuple, frozenset)):
            for nested in item:
                self.constant(location, nested)

    def archive(self, path):
        path = Path(path)
        self.sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
        self.scan("executable", path.read_bytes())
        archive = CArchiveReader(str(path))
        for option in archive.options:
            self.scan("CArchive:option", option.encode("utf-8"))
        for name, entry in archive.toc.items():
            self.counts["carchive_entries"] += 1
            self.scan("CArchive:name", name.encode("utf-8"))
            data = archive.extract(name)
            self.scan("CArchive:" + name, data)
            kind = entry[-1]
            if kind == "z":
                pyz = archive.open_embedded_archive(name)
                for module in pyz.toc:
                    self.counts["pyz_modules"] += 1
                    self.scan("PYZ:name", module.encode("utf-8"))
                    raw = pyz.extract(module, raw=True)
                    if raw is not None:
                        self.scan("PYZ:" + module, raw)
                        self.code("PYZ:" + module, pyz.extract(module))
            elif kind in ("s", "m", "M"):
                self.code("CArchive:" + name, marshal.loads(data))
            elif name.lower().endswith(".zip"):
                with zipfile.ZipFile(io.BytesIO(data)) as zipped:
                    for member in zipped.namelist():
                        self.counts["zip_members"] += 1
                        self.scan("ZIP:name", member.encode("utf-8"))
                        payload = zipped.read(member)
                        location = "ZIP:" + name + ":" + member
                        self.scan(location, payload)
                        if member.endswith(".pyc"):
                            if payload[:4] != importlib.util.MAGIC_NUMBER:
                                raise ValueError("Audit requires the backend's Python version")
                            self.code(location, marshal.loads(payload[16:]))
        return self

    def report(self):
        return {
            "ok": not self.failures,
            "sha256": self.sha256,
            "counts": dict(self.counts),
            "distinct_code_filenames": len(self.filenames),
            "failures": [dict(location=a, reason=b, marker=c) for a, b, c in sorted(self.failures)],
            "reviewed_upstream_profiles": [
                dict(location=a, account=b) for a, b in sorted(self.upstream)
            ],
        }


def self_test():
    """Prove detection behind CArchive, PYZ and ZIP compression and nested code."""
    import struct
    import zlib
    from PyInstaller.archive.writers import CArchiveWriter

    secret = "private-fixture-identity"
    # Keep all synthetic files in this workspace; Windows-managed temp folders
    # may be inaccessible to a restricted release-validation process.
    with tempfile.TemporaryDirectory(prefix="privacy-backend-test-", dir=Path(__file__).resolve().parent) as temporary:
        root = Path(temporary)
        code = compile("def inner():\n    return 1\n", "fixture.py", "exec")
        nested = code.co_consts[0].replace(co_filename="Q:/private/fixture.py")
        code = code.replace(co_consts=(nested, *code.co_consts[1:]))
        script = root / "script.bin"
        script.write_bytes(marshal.dumps(code))

        class FixtureWriter(CArchiveWriter):
            def _write_entry(self, output, entry):
                if entry[3] == "fixture-code":
                    return self._write_blob(output, Path(entry[1]).read_bytes(), entry[0], "s", compress=True)
                return super()._write_entry(output, entry)

        module = compile(f"value = {secret!r}\n", "module.py", "exec")
        packed = zlib.compress(marshal.dumps(module))
        toc = marshal.dumps([("fixture", (0, 12, len(packed)))])
        pyz = root / "fixture.pyz"
        pyz.write_bytes(b"PYZ\0" + importlib.util.MAGIC_NUMBER + struct.pack("!i", 12 + len(packed)) + packed + toc)
        native = root / "native.bin"
        native.write_bytes(secret.encode("utf-16-le"))
        zipped = root / "library.zip"
        with zipfile.ZipFile(zipped, "w", compression=zipfile.ZIP_DEFLATED) as output:
            output.writestr("data.txt", secret)
        output = root / "fixture.exe"
        FixtureWriter(str(output), [
            ("script", str(script), True, "fixture-code"),
            ("PYZ.pyz", str(pyz), False, "z"),
            ("native.bin", str(native), True, "b"),
            ("base_library.zip", str(zipped), True, "x"),
        ], "python.dll")
        result = Audit([secret]).archive(output)
        failures = result.failures
        assert ("CArchive:script", "absolute-code-filename", "") in failures
        for location in ("PYZ:fixture", "CArchive:native.bin", "ZIP:base_library.zip:data.txt"):
            assert (location, "private-identifier", "marker-1") in failures, (location, failures)
        assert result.counts["code_objects"] == 3
        clean = root / "clean.exe"
        FixtureWriter(str(clean), [], "python.dll")
        assert Audit([secret]).archive(clean).report()["ok"]
    print("Privacy audit self-test passed (compressed PYZ/ZIP/native data and nested filenames).")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("executable", nargs="?", default="backend/runtime/win-x64/ck3-dna-bridge.exe")
    parser.add_argument("--forbid", action="append", default=[], help="Additional private marker; value is omitted from report")
    parser.add_argument("--json", type=Path, help="Write an audit report without absolute artifact paths")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    home = Path.home()
    markers = [str(home), *args.forbid]
    if len(home.name) >= 4:
        markers.append(home.name)
    report = Audit(markers).archive(args.executable).report()
    rendered = json.dumps(report, indent=2)
    if args.json:
        args.json.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
