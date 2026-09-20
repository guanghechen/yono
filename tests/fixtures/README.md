# Migration baseline

`yono-v0.100-reference.ttf` is the previously validated Yono Hand 0.100 build.
It provides an independent baseline for glyph coordinates, advances, encoding,
and vertical metrics. Version 0.101 preserves its advances for every glyph and
its outlines and bearings except for the five explicitly redrawn Chinese glyphs
(补、沿、缩、容、算). Do not regenerate this fixture from the current build.

Version 0.200 redesigns ASCII and every target Chinese character. This fixture
now supplies the independent unhinted pixel baseline for untouched characters;
new glyphs are checked against their vector masters and through WOFF2 round-trips.

SHA-256: `2cd67de328072001afb9a0bce200c8205e60636189804866898cc4738c21b267`.

The font is derived from JasonHandwriting8 by Jason (Yu Ching Sung) and remains
under the SIL Open Font License. Its copyright and full license are embedded
in the font; the license file is also kept under `sources/jason-handwriting-8/`.
