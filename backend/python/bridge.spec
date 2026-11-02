from pathlib import Path
import sys

from PyInstaller.utils.hooks import collect_submodules


SPEC_DIR = Path(SPEC).resolve().parent
PROJECT_DIR = SPEC_DIR.parent.parent
ICON_PATH = PROJECT_DIR / "assets" / "icon.ico"

hiddenimports = collect_submodules("ck3_dna_converter_core") + ["PIL.DdsImagePlugin"]

analysis = Analysis(
    [str(SPEC_DIR / "bridge.py")],
    pathex=[str(SPEC_DIR), str(SPEC_DIR / "src")],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['numpy'],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(analysis.pure)

exe = EXE(
    pyz,
    analysis.scripts,
    analysis.binaries,
    analysis.datas,
    [],
    name="ck3-dna-bridge",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None if sys.platform == "darwin" else str(ICON_PATH),
)
