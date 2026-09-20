# GlyphWiki structure data

User-authorized source: <https://glyphwiki.org/dump.tar.gz>.

- Official archive last modified: 2026-09-19 17:01:35 UTC.
- Archive size: 114,594,786 bytes.
- Archive SHA-256: `6601c1c282a1c21c7210f0b88888761f3a160caf9aa10432e22d002f76704aa9`.
- `subset.json` SHA-256: `75f3e63e43d8dc79f798b99b20ded3d32b8bdc51d23b60d6db57c4029d9d75c3`.
- Targets: all 20,976 Han codepoints in `artifacts/coverage-baseline.json`.
- Root selection: exact `uXXXX-g` when available (17,117), otherwise canonical `uXXXX` (3,859).
- Retained records: 34,642 roots, components, and pinned historical versions.

The subset preserves the original stroke strings and referenced `@version`
records. The official archive escapes `@` in record names as `\@`; the importer
normalizes that archive representation before resolving references.

`LICENSE.txt` and `README_en.txt` are copied from the same official archive.
The data license permits use, modification, and redistribution, including
commercial use, without warranty. Copyright 2009 GlyphWiki Project.

Yono decodes this structural data in `src/glyphwiki.ts` and applies its own pen
renderer. No KAGE rendering engine package or implementation is bundled.
The 44 hand-placed Yono Chinese masters take precedence over the source skeletons.

To reproduce the exact subset, supply the pinned archive:

```sh
pnpm import:glyphwiki /path/to/dump.tar.gz
```

The full archive is not required for normal offline builds. Updating the subset
requires reviewing its provenance, coverage, and generated glyphs before changing
the pinned digest in `src/design.ts`.
