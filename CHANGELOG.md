# Changelog

## 1.0.0 — 2026-09-15

First public release.

Build a pixel character from LPC parts, watch all fifteen animations while you
work, and export flat spritesheets or paper-doll parts with a manifest. Runs on
your own machine, in your own browser.

- **The catalogue.** 659 parts across 6 body types, filtered to what a body type
  can wear, searchable by name, tag and colour, with per-animation coverage on
  every tile.
- **The preview.** All fifteen animations, any facing, a frame strip, four
  directions at once and an exploded layer view.
- **Licences you can read.** Every part carries its terms; the panel says what
  the strictest one on your character obliges you to do, the filter greys out
  what you do not accept, and every export writes `CREDITS.txt` and
  `CREDITS.csv` without being asked.
- **Exports.** Unity paper-doll parts with `manifest.json` and an importer that
  builds pages, clips and a prefab; flat spritesheets per animation, as a
  universal sheet or as single frames; and the character file itself.
- **Setup without a manual.** PixyGoat ships no LPC content at all. It fetches
  the sheet definitions itself — three seconds, one folder out of the generator
  repository, no clone — and for the sprites it either finds them on your
  machine or hands you the command and watches the folder while you run it.
- **English and German**, switchable at any time.

Known limits: sheet directories without a definition are not listed, there is
no sprite editor, and importing from a generator URL or JSON is not in yet.
