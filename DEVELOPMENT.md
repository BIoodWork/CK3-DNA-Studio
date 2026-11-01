# Development and releases

The package version identifies the Studio source, installed application and installer. Studio has its own application identifier and user-data folder, separate from the older Converter.

Use Node.js 22 and Python 3.10+ (the release workflow uses Python 3.14). Install dependencies with `npm ci` and `python -m pip install -r requirements-build.txt`.

- `npm start`: run from source. Set `CK3_CONVERTER_PYTHON` if Python is not available as `python`.
- `npm test`: all regressions. Current conversion and editor integrations require installed CK3/EPE/AGOT files; see tests/README.md.
- `npm test -- --node`: Node regressions without game data.
- `npm run build:backend`: build the standalone backend.
- `node scripts/build-windows.js`: package the application and Windows installer using the local development dependencies.

Release CI runs Node tests and Python game-memory/compatibility tests against isolated fixtures. It does not pretend to run the installed-game integration tests without those definitions. Those integration and rendered-editor tests must pass locally before publishing a new version.

The Windows release workflow builds and audits the backend, packages an installer, uploads assets into a draft, verifies uploaded asset sizes/checksums, then publishes the release. Existing release assets are never overwritten by the script; bump the version for a changed release. Repository credentials come only from the workflow's short-lived GITHUB_TOKEN, never a committed personal token.

Preserve original input, keep uncertain profile detection explicit, and retain unknown named fields. Never silently truncate raw DNA or force a write to an unsupported game executable.

Before publication, inspect the exact source list and application archive. Exclude user libraries, portraits, settings, logs, caches, machine paths and unrelated historical source. Application assets include the required third-party notices; PNG artwork has no generation metadata. Git commits use only the public author identity.
