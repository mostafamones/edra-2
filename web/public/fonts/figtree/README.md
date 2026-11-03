# Figtree Latin variable subset

`figtree-latin-wght-normal.woff2` preserves the Google Fonts subset served by
Next's `next/font/google` in baseline commit
`2031f337edf007b462a0c6d76bf2961cfa97edc4` (Figtree 2.002, normal, weights 300–900).
It was recovered from the source-verified baseline's generated media cache.

SHA-256: `8330490a01c60c196eae00b823de8102275aaa5862e7b76a7af21b8745338928`
(20,184 bytes). Licensed under the SIL Open Font License; see `OFL.txt`.

The Fontsource 5.3.0 Latin asset has identical glyph metrics and OpenType shaping
tables but includes a `prep` program absent here. That program changes Chromium's
small-text layout: a 220px marketing paragraph becomes one line instead of two.
Keep this asset and its root font preload aligned. Do not compensate with page
widths, letter spacing, explicit line breaks, or Arabic fallback changes.

See [framework migration verification](../../../docs/technical/framework-migration.md)
for the maintained browser scope and verification limitations.
