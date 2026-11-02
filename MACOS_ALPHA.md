# macOS Alpha — 1.1.0-alpha.1

An early community test build of Crusader Kings III DNA Studio for macOS. The Windows stable release remains available separately.

## Downloads and installation

- **Apple Silicon (M1 or newer):** use the `macOS-arm64.dmg` download.
- **Intel Mac:** use the `macOS-x64.dmg` download.
- ZIP versions are also provided. Python and Node.js are bundled; no separate installation is required.

Open the DMG and drag **Crusader Kings III DNA Studio** to **Applications**, then launch it there. macOS 12 or newer is required. Only the CI runner's macOS version has been exercised automatically; older supported systems and personal game installations need community testing.

This alpha has an ad-hoc code signature, **not an Apple Developer ID signature or Apple notarization**. macOS may block its first launch. Review the downloaded source and checksums before proceeding; use Apple's documented **Privacy & Security → Open Anyway** option only if you choose to trust this release. Do not disable Gatekeeper system-wide. See [Apple's guidance](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac).

## Included

- Local DNA library with names, portraits, notes, favorites and filters.
- Original DNA preservation; Studio library/profile import and export.
- Gen editor and conversion for Vanilla, EPE and AGOT, using your locally installed definitions.
- Base64 and Ruler Designer text; color palettes from the installed game/mod.
- English and German UI, native macOS edit menus and Command-key clipboard shortcuts. Native Apple Silicon and Intel runtimes.
- Independent library loading with visible loading/error states and retry.

**CK3 Gateway is Windows-only.** Reading or modifying a running CK3 character is unavailable on macOS. The alpha shows this explicitly and refuses game-memory requests. Copy Ruler Designer text from **DNA Code** into CK3 instead; that workflow creates or edits a character through the game's own designer, not an existing character mid-game.

## Game and mod folders

Steam's usual macOS library (`~/Library/Application Support/Steam`) and additional libraries listed in `steamapps/libraryfolders.vdf` are checked. Workshop EPE/AGOT directories are resolved from those libraries. If discovery fails, select the CK3 installation/game folder and the installed EPE or AGOT mod folder in **Settings**. No game or mod assets are included. Not every mod/game version is mutually compatible.

Your Mac library and portraits are stored in `~/Library/Application Support/ck3-dna-studio`. Export a `.ck3dna` backup before trying experimental builds. No personal library or portraits are shipped with this alpha.

## Validation and feedback

The workflow builds both architectures on native macOS runners. It checks synthetic Vanilla/EPE/AGOT editing/conversion and palettes, library persistence, and the packaged Python backend and Electron app. This is **not a claim of validation on a real CK3 Mac installation**.

Please report the Mac model/architecture, macOS version, Studio version, game/mod versions, the steps to reproduce, and the error text through [GitHub Issues](https://github.com/BIoodWork/CK3-DNA-Studio/issues). Do not include your full library or personal paths unless you intend to share them.

Credits and licenses are in `CREDITS.md` and `THIRD_PARTY_NOTICES.md`; Studio's own code remains MIT licensed.
