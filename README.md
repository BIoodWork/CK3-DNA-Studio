# Crusader Kings III DNA Studio

Edit, convert and manage character DNA for **Vanilla, EPE and AGOT** in a local Windows desktop app.

**Version 1.0.1 · Windows x64 · English and German**

[Download the latest release](https://github.com/BIoodWork/CK3-DNA-Studio/releases/latest)

## Getting started

1. Download the Windows installer from the release page and install Studio. The installer is unsigned, so Windows may display a publisher or reputation warning.
2. Open Studio and choose **New DNA**. Paste named Ruler Designer text or a Base64 DNA string, then add a name and an optional portrait.
3. Check the detected format and profile. Choose the source profile if more than one installed profile matches.
4. Create a library entry or open the DNA in the editor.

The packaged application includes its runtime; you do not need to install Node.js, Python or Cheat Engine. English is the default language; select **Deutsch** in the language menu.

## What you can do

- Keep a local library with portraits, notes, favorites and sex filters.
- Edit supported dominant and recessive alleles, template tokens and strengths, with grouped genes and undo/redo.
- Select hair, skin and eye colors from the installed profile's palettes using their X/Y coordinates.
- Inspect text and Base64 representations while retaining the exact original input.
- Preview conversion differences and save a converted variant as a separate entry.
- Import/export Studio `.ck3dna` libraries and import supported CK3-DNA-Manager-Qt JSON exports.
- Read or apply DNA through the **CK3 Gateway** when the running game is supported.

Attached portraits are reference images. Studio does not render a new character portrait when you edit DNA.

## Requirements and compatibility

Use 64-bit Windows. The library can be used without CK3 running or installed. Recognition, editing, palette selection and conversion require the matching game/mod definitions from a local installation. Studio reads those files at runtime; it does not include CK3, EPE or AGOT assets. Automatic discovery can be overridden in Settings.

Direct game access in this release targets **CK3 1.20.1.2, Steam build 26046173**. Other executable builds are refused. Pause the game and open its normal character window before using the Gateway. The selected character and compatibility are checked again before applying DNA.

A detected profile is a match against installed definitions, not proof of the input's historical game/mod version. Ambiguous input requires a source choice. Unsupported originals can be archived without claiming they are editable or compatible. Unknown named fields remain read-only; some genomes cannot be represented as Base64 without losing information.

## Conversion and color limits

Strict conversion stops when a replacement, omission or initialization would be required. Enabling **Allow reported replacements** permits those changes and lists them in the report; review it before saving the variant.

Color previews sample the installed palette and are approximate. Cross-profile palette mapping and matching gene values cannot guarantee the same appearance across different mod meshes, materials or lighting. Named text may preserve metadata that a Base64 gene string cannot contain.

## Local data and backups

Studio works offline and stores its library and portraits locally, separately from the original CK3 DNA Converter. Export the library to make a portable backup. Exports can contain the names, notes, portraits and DNA you saved; review them before sharing. Updating or copying the application folder is not a library backup.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) and [tests/README.md](tests/README.md). Development uses Node.js and Python 3.10+ with Pillow; building the bundled backend also requires PyInstaller.

```text
npm ci
npm test
npm start
npm run build:backend
npm run dist
```

Integration tests require matching installed game/mod definitions. Game-memory tests use simulated memory; do not run test writes against a live game.

## Credits

See [CREDITS.md](CREDITS.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This is an unofficial community tool, unaffiliated with Paradox Interactive or the EPE and AGOT teams.

## License

Studio's own code is available under the [MIT License](LICENSE), copyright BIoodWork. Third-party components keep their respective licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Release packaging excludes private libraries, portraits and settings; see [PRIVACY.md](PRIVACY.md).
