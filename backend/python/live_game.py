"""Bounded CK3 1.20.1.2 memory access; no hooks or retained DNA backups."""
from __future__ import annotations

import base64
import binascii
import ctypes as C
import hashlib
import hmac
from ctypes import wintypes as W
from dataclasses import dataclass
import os
import re
import secrets
import struct
import time
from typing import Any

SUPPORTED_VERSION = "1.20.1.2"
STEAM_BUILD = "26046173"
MASK = 0xFFFFFFFF
# Process-local identity proof. It contains no DNA and is never persisted.
_SELECTION_SECRET = secrets.token_bytes(32)


class LiveGameError(RuntimeError):
    def __init__(self, message: str, code: str = "live_error"):
        super().__init__(message)
        self.code = code


def murmur3(data: bytes) -> int:
    """The game's cached DNA hash: MurmurHash3 x86_32, seed zero."""
    def rol(x: int, n: int) -> int:
        return ((x << n) | (x >> (32 - n))) & MASK
    h = 0
    limit = len(data) & ~3
    for i in range(0, limit, 4):
        k = int.from_bytes(data[i:i + 4], "little")
        k = rol((k * 0xCC9E2D51) & MASK, 15)
        k = (k * 0x1B873593) & MASK
        h = (rol(h ^ k, 13) * 5 + 0xE6546B64) & MASK
    tail = data[limit:]
    if tail:
        k = int.from_bytes(tail, "little")
        k = rol((k * 0xCC9E2D51) & MASK, 15)
        h ^= (k * 0x1B873593) & MASK
    h ^= len(data)
    h = ((h ^ (h >> 16)) * 0x85EBCA6B) & MASK
    h = ((h ^ (h >> 13)) * 0xC2B2AE35) & MASK
    return (h ^ (h >> 16)) & MASK


def decode_dna(value: Any) -> bytes:
    if not isinstance(value, str) or len(value) > 100000:
        raise LiveGameError("Bitte eine rohe Base64-DNA einfügen.", "invalid_dna")
    text = value.strip()
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1]
    text = re.sub(r"\s", "", text)
    if not text or len(text) % 4 or not re.fullmatch(r"[A-Za-z0-9+/]*={0,2}", text):
        raise LiveGameError("Die Zwischenablage enthält keine gültige rohe Base64-DNA.", "invalid_dna")
    try:
        data = base64.b64decode(text, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise LiveGameError("Die Base64-DNA ist beschädigt.", "invalid_dna") from exc
    if base64.b64encode(data).decode("ascii") != text or len(data) % 4:
        raise LiveGameError("Die DNA hat ungültiges Padding oder unvollständige Gene.", "invalid_dna")
    return data


class WindowsMemory:
    """One short-lived process handle, with write rights only for explicit paste."""
    def __init__(self, *, writable: bool = False):
        if os.name != "nt":
            raise LiveGameError("Direkter Spielzugriff ist nur unter Windows verfügbar.", "not_windows")
        self.k = C.WinDLL("kernel32", use_last_error=True)
        self.handle = None
        self._configure()
        pids = self._processes()
        if not pids:
            raise LiveGameError("CK3 ist nicht gestartet.", "not_running")
        if len(pids) != 1:
            raise LiveGameError("Mehrere CK3-Prozesse gefunden. Bitte nur eine Instanz öffnen.", "ambiguous_process")
        self.pid = pids[0]
        self.base, self.module_path = self._module(self.pid)
        rights = 0x410 | (0x28 if writable else 0)
        self.handle = self.k.OpenProcess(rights, False, self.pid)
        if not self.handle:
            raise LiveGameError("Kein Zugriff auf CK3. App und Spiel mit denselben Benutzerrechten starten.", "access_denied")
        self.writable = writable

    def _configure(self) -> None:
        k = self.k
        k.CreateToolhelp32Snapshot.argtypes = [W.DWORD, W.DWORD]
        k.CreateToolhelp32Snapshot.restype = W.HANDLE
        k.CloseHandle.argtypes = [W.HANDLE]
        k.CloseHandle.restype = W.BOOL
        k.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
        k.OpenProcess.restype = W.HANDLE
        k.ReadProcessMemory.argtypes = [W.HANDLE, C.c_void_p, C.c_void_p, C.c_size_t, C.POINTER(C.c_size_t)]
        k.ReadProcessMemory.restype = W.BOOL
        k.WriteProcessMemory.argtypes = [W.HANDLE, C.c_void_p, C.c_void_p, C.c_size_t, C.POINTER(C.c_size_t)]
        k.WriteProcessMemory.restype = W.BOOL

    def _tool_snapshot(self, flags: int, pid: int):
        snapshot = self.k.CreateToolhelp32Snapshot(flags, pid)
        if snapshot in (None, C.c_void_p(-1).value):
            raise LiveGameError("Der CK3-Prozess konnte nicht untersucht werden.", "process_unavailable")
        return snapshot

    def _processes(self) -> list[int]:
        class PE(C.Structure):
            _fields_ = [("dwSize", W.DWORD), ("cntUsage", W.DWORD), ("th32ProcessID", W.DWORD),
                        ("th32DefaultHeapID", C.c_size_t), ("th32ModuleID", W.DWORD),
                        ("cntThreads", W.DWORD), ("th32ParentProcessID", W.DWORD),
                        ("pcPriClassBase", W.LONG), ("dwFlags", W.DWORD), ("szExeFile", W.WCHAR * 260)]
        self.k.Process32FirstW.argtypes = [W.HANDLE, C.POINTER(PE)]
        self.k.Process32FirstW.restype = W.BOOL
        self.k.Process32NextW.argtypes = [W.HANDLE, C.POINTER(PE)]
        self.k.Process32NextW.restype = W.BOOL
        snap = self._tool_snapshot(2, 0)
        try:
            item = PE(); item.dwSize = C.sizeof(item)
            found = []
            success = self.k.Process32FirstW(snap, C.byref(item))
            while success:
                if item.szExeFile.lower() == "ck3.exe":
                    found.append(item.th32ProcessID)
                success = self.k.Process32NextW(snap, C.byref(item))
            return found
        finally:
            self.k.CloseHandle(snap)

    def _module(self, pid: int) -> tuple[int, str]:
        class ME(C.Structure):
            _fields_ = [("dwSize", W.DWORD), ("th32ModuleID", W.DWORD), ("th32ProcessID", W.DWORD),
                        ("GlblcntUsage", W.DWORD), ("ProccntUsage", W.DWORD),
                        ("modBaseAddr", C.c_void_p), ("modBaseSize", W.DWORD), ("hModule", W.HMODULE),
                        ("szModule", W.WCHAR * 256), ("szExePath", W.WCHAR * 260)]
        self.k.Module32FirstW.argtypes = [W.HANDLE, C.POINTER(ME)]
        self.k.Module32FirstW.restype = W.BOOL
        self.k.Module32NextW.argtypes = [W.HANDLE, C.POINTER(ME)]
        self.k.Module32NextW.restype = W.BOOL
        snap = self._tool_snapshot(0x18, pid)
        try:
            item = ME(); item.dwSize = C.sizeof(item)
            success = self.k.Module32FirstW(snap, C.byref(item))
            while success:
                if item.szModule.lower() == "ck3.exe":
                    return int(item.modBaseAddr), item.szExePath
                success = self.k.Module32NextW(snap, C.byref(item))
        finally:
            self.k.CloseHandle(snap)
        raise LiveGameError("Das laufende CK3-Modul wurde nicht gefunden.", "process_unavailable")

    def read(self, address: int, size: int) -> bytes:
        if not isinstance(address, int) or address < 0x10000 or not 0 <= size <= 100000:
            raise LiveGameError("Ungültige CK3-Speicheradresse.", "read_failed")
        result = C.create_string_buffer(size)
        got = C.c_size_t()
        if not self.k.ReadProcessMemory(self.handle, address, result, size, C.byref(got)) or got.value != size:
            raise LiveGameError("CK3-Daten sind nicht mehr lesbar. Auswahl erneut öffnen.", "read_failed")
        return result.raw

    def write(self, address: int, data: bytes) -> int:
        if not self.writable:
            raise LiveGameError("Dieser Zugriff ist nur lesend.", "write_failed")
        result = C.create_string_buffer(data)
        got = C.c_size_t()
        self.k.WriteProcessMemory(self.handle, address, result, len(data), C.byref(got))
        return got.value

    def close(self):
        if self.handle:
            self.k.CloseHandle(self.handle)
            self.handle = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


@dataclass(frozen=True)
class Character:
    pid: int
    id: int
    name: str
    character: int
    data: int
    capacity: int
    gene_count: int
    context: int
    hash: int

    def target_key(self):
        return (self.pid, self.id, self.character, self.data, self.capacity, self.gene_count, self.context)

    def public(self) -> dict[str, Any]:
        return {"connected": True, "ready": True, "pid": self.pid, "id": self.id, "name": self.name,
                "selectionToken": self.selection_token(),
                "geneCount": self.gene_count, "byteCount": self.gene_count * 4,
                "gameVersion": SUPPORTED_VERSION, "steamBuild": STEAM_BUILD}

    def selection_token(self) -> str:
        # Exclude the mutable DNA hash so successful writes preserve identity.
        identity = struct.pack("<7Q", *self.target_key())
        return hmac.new(_SELECTION_SECRET, identity, hashlib.sha256).hexdigest()


class LiveGame:
    """No instance field stores a gene buffer, copied DNA or a session backup."""
    def __init__(self, memory):
        self.memory = memory
        self.base = memory.base

    def u32(self, address: int) -> int:
        return struct.unpack("<I", self.memory.read(address, 4))[0]

    def u64(self, address: int) -> int:
        return struct.unpack("<Q", self.memory.read(address, 8))[0]

    def pointer(self, address: int) -> int:
        result = self.u64(address)
        if result < 0x10000:
            raise LiveGameError("Kein Charakterfenster verfügbar. Im geladenen Spiel einen Charakter öffnen.", "no_selection")
        return result

    def cstring(self, address: int, limit: int) -> str:
        return self.memory.read(address, limit).split(b"\0", 1)[0].decode("utf-8", errors="replace")

    def type_name(self, obj: int) -> str:
        vt = self.pointer(obj)
        col = self.pointer(vt - 8)
        return self.cstring(self.base + self.u32(col + 12) + 16, 128)

    def verify_build(self) -> None:
        if (self.memory.read(self.base, 2) != b"MZ" or self.u32(self.base + 0x3C) != 0x158
                or self.memory.read(self.base + 0x158, 4) != b"PE\0\0"
                or self.u32(self.base + 0x160) != 0x6AD5E20C
                or self.u32(self.base + 0x1A8) != 0x61DA000
                or self.memory.read(self.base + 0xE764C9, 16) != bytes.fromhex("41 8b 40 18 49 8b e8 48 8b fa 4c 8b f1 39 41 18")
                or self.memory.read(self.base + 0xC922E9, 7) != bytes.fromhex("48 81 c1 60 01 00 00")):
            raise LiveGameError("Dieser CK3-Build ist für den direkten Spielzugriff nicht geprüft. Unterstützt: 1.20.1.2 / Steam 26046173.", "unsupported_build")

    def selected(self) -> Character:
        app = self.pointer(self.base + 0x5CCD808)
        if self.u32(app + 0x1C8) != 4:
            raise LiveGameError("Zuerst einen CK3-Spielstand laden.", "no_game")
        holder = self.pointer(self.base + 0x5C7F4B8)
        interface = self.pointer(holder + 0x10)
        if self.type_name(interface) != ".?AVCIngameInterfaceIdlerGfx@@":
            raise LiveGameError("Die Spieloberfläche ist noch nicht verfügbar.", "no_game")
        context = self.pointer(interface + 0x88)
        window = self.pointer(context + 0xD8)
        if self.type_name(window) != ".?AVCCharacterWindow@@":
            raise LiveGameError("Bitte das normale Charakterfenster in CK3 öffnen.", "no_selection")
        cid = self.u32(window + 0xC8)
        if cid == MASK:
            raise LiveGameError("Kein Charakter ausgewählt.", "no_selection")
        db = self.pointer(self.base + 0x5C7C4F0)
        index = cid & 0xFFFFFF
        if index >= self.u32(db + 0x2C):
            raise LiveGameError("Die Charakterauswahl hat sich geändert.", "selection_changed")
        array = self.pointer(db + 0x20)
        ch = self.pointer(array + index * 16 + 8)
        if self.u32(ch + 0x18) != cid or self.u32(ch + 0x1C) != 0x43686172:
            raise LiveGameError("Die Charakterauswahl ist nicht mehr gültig.", "selection_changed")
        dna = self.pointer(ch + 0x160)
        capacity, count = self.u32(ch + 0x168), self.u32(ch + 0x16C)
        if not 1 <= count <= 8192 or not count <= capacity <= 65536:
            raise LiveGameError("Die DNA-Struktur passt nicht zum geprüften Build.", "invalid_layout")
        length, strcap = self.u64(ch + 0x30), self.u64(ch + 0x38)
        if length > 256 or strcap < length:
            raise LiveGameError("Der Charaktername ist nicht lesbar.", "read_failed")
        name_address = ch + 0x20 if strcap < 16 else self.pointer(ch + 0x20)
        name = self.memory.read(name_address, length).decode("utf-8", errors="replace") if length else "Charakter"
        result = Character(self.memory.pid, cid, name, ch, dna, capacity, count,
                           self.u64(ch + 0x180), self.u32(ch + 0x178))
        if self.u32(window + 0xC8) != cid or self.u32(ch + 0x18) != cid:
            raise LiveGameError("Die Charakterauswahl hat sich geändert.", "selection_changed")
        return result

    def snapshot(self) -> tuple[Character, bytes]:
        selected = self.selected()
        raw = self.memory.read(selected.data, selected.gene_count * 4)
        if murmur3(raw) != selected.hash:
            raise LiveGameError("Der DNA-Prüfwert passt nicht. Spiel pausieren und Charakterfenster erneut öffnen.", "hash_mismatch")
        return selected, raw

    @staticmethod
    def check_expected(selected: Character, expected: Any) -> None:
        if (not isinstance(expected, dict) or type(expected.get("pid")) is not int
                or type(expected.get("id")) is not int or not isinstance(expected.get("selectionToken"), str)
                or not re.fullmatch(r"[0-9a-f]{64}", expected["selectionToken"])):
            raise LiveGameError("Die automatische Charaktererkennung ist noch nicht bereit.", "no_expected_target")
        if (expected["pid"] != selected.pid or expected["id"] != selected.id
                or not hmac.compare_digest(expected["selectionToken"], selected.selection_token())):
            raise LiveGameError("Der ausgewählte Charakter hat sich geändert. Die Anzeige kurz aktualisieren lassen und erneut klicken.", "selection_changed")

    def status(self) -> dict[str, Any]:
        # Deliberately no read of the raw gene buffer here.
        return self.selected().public()

    def copy(self, expected: Any = None) -> dict[str, Any]:
        selected, raw = self.snapshot()
        if expected is not None:
            self.check_expected(selected, expected)
        if self.selected().target_key() != selected.target_key():
            raise LiveGameError("Die Charakterauswahl hat sich geändert.", "selection_changed")
        return {**selected.public(), "dna": base64.b64encode(raw).decode("ascii")}

    def _same_object(self, selected: Character) -> bool:
        ch = selected.character
        return (self.u32(ch + 0x18) == selected.id and self.u32(ch + 0x1C) == 0x43686172
                and self.u64(ch + 0x160) == selected.data and self.u32(ch + 0x168) == selected.capacity
                and self.u32(ch + 0x16C) == selected.gene_count and self.u64(ch + 0x180) == selected.context)

    def paste(self, value: Any, expected: Any, deadline: float | None = None) -> dict[str, Any]:
        new = decode_dna(value)
        selected, original = self.snapshot()
        self.check_expected(selected, expected)
        if len(new) != len(original):
            raise LiveGameError(f"DNA-Länge passt nicht: {len(new)} Bytes eingefügt, {len(original)} benötigt. Nichts wurde geändert.", "length_mismatch")
        if new == original:
            return {**selected.public(), "changed": False, "message": "Die DNA ist bereits identisch."}
        current, current_raw = self.snapshot()
        if current.target_key() != selected.target_key() or current.hash != selected.hash or current_raw != original:
            raise LiveGameError("Auswahl oder DNA hat sich geändert. Erneut versuchen.", "selection_changed")
        # A queued request may outlive its UI timeout. Check only before writing;
        # once started, the transaction must finish its verification or rollback.
        if deadline is not None:
            if type(deadline) not in (int, float) or not 0 < deadline < float("inf"):
                raise LiveGameError("Ungültiges Zeitlimit. Nichts wurde geändert.", "invalid_deadline")
            if time.time() * 1000 >= deadline:
                raise LiveGameError("Zeitlimit abgelaufen. Nichts wurde geändert.", "timeout")
        try:
            if self.memory.write(selected.data, new) != len(new):
                raise LiveGameError("DNA-Schreiben fehlgeschlagen.", "write_failed")
            if self.memory.write(selected.character + 0x178, struct.pack("<I", murmur3(new))) != 4:
                raise LiveGameError("Prüfwert-Schreiben fehlgeschlagen.", "write_failed")
            check, result = self.snapshot()
            if check.target_key() != selected.target_key() or result != new:
                raise LiveGameError("Die Änderung konnte nicht bestätigt werden.", "readback_failed")
        except Exception as exc:
            restored = False
            try:
                if self._same_object(selected):
                    a = self.memory.write(selected.data, original)
                    b = self.memory.write(selected.character + 0x178, struct.pack("<I", selected.hash))
                    restored = (a == len(original) and b == 4 and self.memory.read(selected.data, len(original)) == original
                                and self.u32(selected.character + 0x178) == selected.hash)
            except Exception:
                pass
            if restored:
                raise LiveGameError(f"{exc} Die ursprüngliche DNA wurde wiederhergestellt.", "write_rolled_back") from exc
            raise LiveGameError(f"{exc} Wiederherstellung nicht bestätigt! Spielstand NICHT speichern; Spielstand erneut laden.", "rollback_failed") from exc
        return {**selected.public(), "changed": True,
                "message": f"DNA von {selected.name} (ID {selected.id}) ersetzt und geprüft. Charakterfenster erneut öffnen."}


def handle_live(action: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = payload or {}
    if action not in {"game_status", "game_copy", "game_paste"}:
        raise LiveGameError("Unbekannte Spielaktion.", "invalid_action")
    try:
        with WindowsMemory(writable=action == "game_paste") as memory:
            game = LiveGame(memory)
            game.verify_build()
            if action == "game_status":
                return game.status()
            if action == "game_copy":
                return game.copy(payload.get("expectedTarget"))
            return game.paste(payload.get("dna"), payload.get("expectedTarget"), payload.get("deadline"))
    except LiveGameError as exc:
        if action == "game_status":
            return {"connected": exc.code not in {"not_running", "process_unavailable", "access_denied", "not_windows"},
                    "ready": False, "message": str(exc), "errorCode": exc.code,
                    "gameVersion": SUPPORTED_VERSION, "steamBuild": STEAM_BUILD}
        raise
