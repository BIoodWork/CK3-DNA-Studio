# Third-party notices

Studio's MIT license applies to its own code. Third-party software retains its own copyright notices and license terms. The files below preserve upstream notices; acknowledgements do not imply endorsement.

The installed application includes a readable `third-party` folder. In the source tree these same files are under `assets/third-party`. `installed-license-manifest.json` records the versions and SHA-256 checksums of license documents copied from the reviewed build environment. The maintenance collector does not copy local application data or installation paths.

## Application and backend

| Component | Reviewed version | Notices |
| --- | --- | --- |
| Electron | 36.9.5 | MIT notice in `third-party/Electron-LICENSE.txt` and `LICENSE.electron.txt` beside the application. The Electron runtime's complete Chromium and dependency notices remain in `LICENSES.chromium.html` beside the application. |
| CPython | 3.14.3 | `third-party/CPython-LICENSE.txt` preserves the official Windows distribution's license bundle, including historical Python licenses, native dependencies and Microsoft Distributable Code terms. `CPython-THIRD-PARTY-LICENSES.rst.txt` preserves the official documentation's additional notices. |
| Pillow / Python Imaging Library | 12.1.1 | `third-party/Pillow-LICENSE` includes the MIT-CMU notice and the wheel's bundled image/font/compression-library notices. The original copyright identities of Secret Labs AB, Fredrik Lundh, Jeffrey A. Clark and other contributors are preserved in that file. |
| PyInstaller bootloader and runtime hooks | 6.19.0 | `third-party/PyInstaller-COPYING.txt` includes the GPL terms, bootloader exception and notices for embedded runtime components. `PyInstaller-hooks-LICENSE` preserves the Community Hooks license details. |
| Lucide and Feather icons | lucide-react 1.8.0 | `third-party/Lucide-Feather-LICENSE.txt` preserves the ISC and applicable Feather MIT notices. The original vendored notice is also in `src/renderer/lucide-LICENSE.txt`. |

The native backend includes standard-library functionality and native libraries supplied with CPython/Pillow. The preserved license bundles cover these dependencies. Additional standalone upstream notices are provided for bzip2, libffi, XZ/liblzma, OpenSSL, zlib-ng and Zstandard. The standalone versions follow [CPython 3.14.3's Windows dependency list](https://github.com/python/cpython/blob/v3.14.3/PCbuild/get_externals.bat); Pillow's separately bundled versions are listed in its own complete notice file. The XZ notice distinguishes the liblzma library from the separately licensed XZ command-line tools.

The backend does not require NumPy. The public build excludes it rather than incorporating an unrelated optional installation into the release.

## Windows installer

The installer is built using electron-builder 26.8.1 and its NSIS toolset. `third-party/NSIS-COPYING.txt` preserves the cached NSIS 3.0.4.1 distribution's copyright and license bundle, including its compression-module terms. NSIS source is available from [NSIS](https://nsis.sourceforge.io/) and the build toolset from [electron-builder-binaries](https://github.com/electron-userland/electron-builder-binaries).

The installer uses unmodified third-party NSIS plugin DLLs supplied by that toolset. StdUtils 1.1.4.0 identifies LoRd_MuldeR as its copyright holder. Its corresponding [1.14 source release](https://github.com/lordmulder/stdutils/tree/1.14), LGPL 2.1 text, installer-use clarification, RHash notice and BLAKE2 notice are preserved in `third-party/StdUtils-*`. The [Nsis7z 19.00 plugin](https://nsis.sourceforge.io/Nsis7z_plug-in) credits Igor Pavlov, Nik Medved, Marek Mizanin and Stuart Welch in the supplied binary; its upstream page provides its source distribution and 7-Zip licensing information. Its LGPL text is included in `third-party/StdUtils-LGPL.txt`, the unmodified standard LGPL 2.1 text shared by those components. Other helper plugins retain their upstream terms; the [electron-builder toolset's plugin notice inventory](https://github.com/electron-userland/electron-builder-binaries/blob/master/packages/nsis/assets/nsis-plugin-licenses.sh) documents its plugin sources and notice handling. These components are not relicensed under Studio's MIT license.

## Development tools

The source lockfile and `requirements-build.txt` identify build dependencies. The `third-party/build-tools` folder preserves notices for the installed pefile, altgraph, packaging, pywin32-ctypes, setuptools and electron-builder development tools. These notices do not assert that each complete development package is embedded in the application. Runtime notices above remain separate from the development tools' terms.

Game and mod assets are read from the user's installation and are not distributed here. Community acknowledgements are in [CREDITS.md](CREDITS.md).
