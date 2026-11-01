"""Refresh exact installed license texts, never application/user data.

This maintenance command is not required during CI packaging: the reviewed
notice files are committed. Run it with the pinned build Python and dependency
versions when upgrading dependencies, then review the generated manifest.
"""
import argparse
import hashlib
import importlib.metadata as metadata
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parent.parent
DESTINATION = ROOT / 'assets' / 'third-party'


def collect(electron_dist=None):
    DESTINATION.mkdir(parents=True, exist_ok=True)
    manifest = []

    def copy(source, filename, component, version, origin):
        target = DESTINATION / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        manifest.append({'file': filename, 'component': component, 'version': version,
                         'origin': origin, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})

    copy(Path(sys.base_prefix) / 'LICENSE.txt', 'CPython-LICENSE.txt', 'CPython', sys.version.split()[0], 'Official CPython Windows installation: LICENSE.txt')
    documentation = Path(sys.base_prefix) / 'Doc/html/_sources/license.rst.txt'
    if not documentation.is_file():
        raise FileNotFoundError('CPython third-party license documentation is required to refresh notices. Packaging uses the committed copy instead.')
    copy(documentation, 'CPython-THIRD-PARTY-LICENSES.rst.txt', 'CPython standard library/native extensions', sys.version.split()[0], 'Official CPython documentation: license.rst')
    packages = [('Pillow', 'Pillow'), ('PyInstaller', 'PyInstaller'), ('pyinstaller-hooks-contrib', 'PyInstaller-hooks'),
                ('pefile', 'build-tools/pefile'), ('altgraph', 'build-tools/altgraph'), ('packaging', 'build-tools/packaging'),
                ('pywin32-ctypes', 'build-tools/pywin32-ctypes'), ('setuptools', 'build-tools/setuptools')]
    for package, destination in packages:
        distribution = metadata.distribution(package)
        files = [file for file in distribution.files or []
                 if '.dist-info/' in str(file).replace('\\', '/')
                 and Path(file).name.upper().startswith(('LICENSE', 'COPYING', 'NOTICE'))
                 and str(file).replace('\\', '/').split('/')[0].endswith('.dist-info')]
        if not files:
            raise FileNotFoundError(f'No installed license text found for {package}.')
        for file in sorted(files, key=str):
            copy(distribution.locate_file(file), destination + '-' + Path(file).name, package, distribution.version,
                 f'Installed {package} distribution license text')
    if electron_dist:
        copy(electron_dist / 'LICENSE', 'Electron-LICENSE.txt', 'Electron', (electron_dist / 'version').read_text().strip(), 'Official Electron runtime: LICENSE')
    copy(ROOT / 'src/renderer/lucide-LICENSE.txt', 'Lucide-Feather-LICENSE.txt', 'Lucide and Feather icons', 'see preserved upstream notices', 'Vendored Lucide license file')
    (DESTINATION / 'installed-license-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Copied {len(manifest)} installed license documents; manifest contains no local installation paths.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--electron-dist', type=Path)
    args = parser.parse_args()
    collect(args.electron_dist)
