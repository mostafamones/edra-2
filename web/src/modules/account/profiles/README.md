# Avatar color profiles and LittleCMS

`cmyk.icm` is the unmodified default libvips CMYK profile used by the original Sharp pipeline.

Source: https://raw.githubusercontent.com/libvips/libvips/v8.18.2/libvips/colour/profiles/cmyk.icm

SHA-256: `156e7c14f244cfc4ed83a755ca4803d80e15dd249b40fae82cb127d3902e15c7`

The embedded copyright tag states: “Created by Graeme W. Gill. Released into the public domain. No Warranty, Use at your own risk.”

The server embeds this profile as a data URL; it is never fetched or emitted to the client. Embedded valid CMYK JPEG profiles take precedence. Sharp is used only as the verification oracle.

`srgb.icm` and `p3.icm` are the unmodified libvips v8.18.2 profiles, respectively [sRGB.icm](https://raw.githubusercontent.com/libvips/libvips/v8.18.2/libvips/colour/profiles/sRGB.icm) and [p3.icm](https://raw.githubusercontent.com/libvips/libvips/v8.18.2/libvips/colour/profiles/p3.icm). Both embedded copyright tags state CC0. SHA-256:

- sRGB: `c56e1685d888f5edb92fe07f2750f387f8fe8e91b32ff8fb0b56bfbbb9458353`
- P3: `231752984cd4a5278e1b8d2390fe496767d4511fc81f54e1a5c69ae9ab4c42b5`

Eight-bit transforms use sRGB output. Tagged 16-bit RGB PNGs use P3 at 16 bits before reducing to eight bits, matching the original Sharp/libvips processing path. Invalid/mismatched profiles fall back to the existing untagged behavior (or the default CMYK profile). PNG ICC decompression stops above 8 MiB. This is a compatibility corpus, not proof for every ICC profile or malformed input.

`lcms/lcms.wasm` is built from [LittleCMS tag lcms2.19.1](https://github.com/mm2/Little-CMS/tree/lcms2.19.1), under the adjacent MIT LICENSE. The source archive SHA-256 is `267705e278e2f7c2fb886c259dadcbaeb2be52748bcbc71c79f08aacacb7a709`. Its Zig 0.15.2 build is 255,205 bytes, SHA-256 `5e6313a84b59a3f8d3254ffde3982ce895cca1cb65f083e51e43ff518cfae72d`.

Rebuild from `web/` with `node src/modules/account/profiles/lcms/build.mjs /absolute/path/to/zig` (Zig must report 0.15.2). The script checks the downloaded archive hash, sorts source files and exports only the required C API. Compilation happens only during development. The Wasm reactor has a 256 KiB stack and 32 MiB maximum linear memory. The Workers adapter returns EBADF for filesystem calls, supplies a fixed profile timestamp and permits no filesystem I/O. All transform/profile/batch allocations are freed in `finally`; the module's grown linear memory remains allocated for reuse. That cap covers LittleCMS alone, not PDF.js, jSquash, V8 or the whole isolate.
