# Sprite Forge – Implementierungsplan v1.0

Stand: 13.09.2026. Freigegebenes Mockup: Vorschlag A (dunkle Variante),
Export-Dialog. Dieser Plan ist die Grundlage für die Umsetzung; nach Freigabe
wird er in `docs/` gepflegt und pro Meilenstein abgehakt.

---

## 1. Ergebnis der Repo-Prüfung

- `spritesheets/` ist **byteidentisch** mit dem Stand des
  Universal-LPC-Spritesheet-Character-Generator-Repos vom **21.07.2025**
  (Commit `e7fa0aee616`, "Add JS script to recompose universal sheets …"):
  298.782 PNGs, keine Datei zu viel, keine zu wenig.
- Die `sheet_definitions` dieses Commits (667 JSON-Dateien) passen zu 659
  Einträgen vollständig. 8 Einträge verweisen auf Ordner, die im Snapshot
  fehlen (Drachen-, Feder-, Flossenschwanz, Pigface-Helm, zwei Gesichts-
  ausdrücke, ein Augen-Set). Diese werden im Katalog als "nicht verfügbar"
  geführt.
- In diesem Stand sind **alle Farbvarianten vorgerendert** (`<anim>/<farbe>.png`).
  Palette-Recoloring zur Laufzeit (heutiger Repo-Stand) ist für 1.0 nicht nötig,
  wird aber im Datenmodell vorgesehen (`variantSource: "file" | "palette"`).
- Der aktuelle Repo-Stand hat Ordner umbenannt (z. B. `arms/gloves` →
  `arms/hands/gloves`, `female` → `thin`) und Assets ergänzt. Für 1.0 gilt der
  Juli-2025-Stand. Ein späteres Update der Assets ist ein Austausch von
  `spritesheets/` plus `data/definitions/` – der Katalog wird neu gebaut.
- Lizenz des Generator-Codes: **GPL-3.0**. Es wird **kein Code** übernommen,
  nur die JSON-Daten (Definitionen, Credits, Frame-Layouts als Daten). Sprite
  Forge selbst steht unter **PolyForm Noncommercial 1.0.0** (Stand 14.09.2026;
  bis dahin MIT) und bleibt damit frei
  verteil- und verkaufbar. Die Sprites tragen ihre eigenen Lizenzen (siehe
  Abschnitt 8).

---

## 2. Zielbild 1.0

Eine lokale Single-Page-App, gestartet über einen kleinen Node-Server
(später Docker), mit der ein Charakter aus den LPC-Sprites zusammengestellt,
animiert geprüft, gespeichert und in drei Formaten exportiert wird:

1. Static-Bloom-Paper-Doll-Parts (Slot-Sheets im Mana-Seed-Namensschema +
   `manifest.json`), direkt in den Unity-Ordner geschrieben.
2. Fertige, flache Spritesheets (je Animation, Universal-Sheet, Einzelframes).
3. Charakter-Datei (`*.character.json`).

Nicht in 1.0: Sprite-Editor, weitere Eingabeformate (Mana Seed, eigene Sheets),
Palette-Recoloring. Alle drei sind im Datenmodell und in der Modulstruktur
vorbereitet.

---

## 3. Technik

| Bereich | Wahl | Lizenz | Begründung |
|---|---|---|---|
| Sprache | TypeScript (strict) | Apache-2.0 | ein Typsystem für Server, Core und App |
| App | Vite + Preact + Preact Signals | MIT | klein, schnell, virtualisierbare Listen, kein Framework-Lock-in |
| Server | Node 22 + Fastify + @fastify/static | MIT | statische Sprites, Katalog-API, Datei-Export |
| PNG lesen/schreiben (Server) | pngjs | MIT | reine JS-Lösung, keine nativen Builds, funktioniert in Docker ohne Toolchain |
| Rendering (Browser) | Canvas 2D + OffscreenCanvas in Web Worker | – | Pixelgenau, `imageSmoothingEnabled=false` |
| ZIP | fflate | MIT | schneller als JSZip, klare Lizenz |
| i18n | eigene Mini-Lösung (JSON je Sprache, `t("key")`) | – | keine Abhängigkeit, leicht erweiterbar |
| Tests | Vitest + Playwright | MIT / Apache-2.0 | Unit-Tests für Core, ein Smoke-Test für die App |
| Paketierung | npm workspaces, ein `npm start` | – | Docker-Image später: `node:22-alpine`, Volume für `spritesheets/` |

Alle Abhängigkeiten sind MIT, Apache-2.0 oder BSD. Vor jedem Release läuft
`license-checker` und schreibt `THIRD_PARTY_LICENSES.md`.

### Ordnerstruktur

```
character-designer/
├── spritesheets/              unverändert, wird nur gelesen
├── data/
│   ├── definitions/           sheet_definitions vom Commit e7fa0aee616 (JSON, unverändert)
│   ├── animations.json        Standard-Animationen: Zeilen, Spalten, Zyklen, Ordnernamen
│   ├── custom-animations.json Oversize-Layouts (128/192 px) als Daten
│   ├── licenses.json          Lizenztexte, Kurzfassungen, Symbole, Pflichten (Abschnitt 8)
│   └── slot-mapping.json      LPC type_name → Static-Bloom-Slot (Abschnitt 6)
├── packages/
│   ├── core/                  reine Logik, ohne DOM und ohne Node-APIs
│   │   ├── catalog/           Typen, Kompatibilität, Suche
│   │   ├── character/         Dokumentmodell, Validierung, Migration
│   │   ├── compose/           Ebenen-Sortierung, Frame-Mathematik, Oversize-Polsterung
│   │   ├── export/            Static-Bloom-Manifest, Sheet-Layouts, Credits-Text
│   │   └── licenses/          Lizenzlogik (strengste Lizenz, Pflichten)
│   ├── server/                Fastify-Server, Katalog-Builder, Datei-Export
│   └── app/                   Preact-App (UI, Worker, Vorschau)
├── docs/                      dieser Plan, Formatbeschreibungen, Unity-Anleitung
├── locales/                   en.json (Primär), de.json, weitere
└── docker/                    Dockerfile, compose.yaml (Meilenstein 7)
```

Der Sprite-Editor kommt später als `packages/editor`, weitere Eingabeformate
als `packages/server/src/sources/<name>.ts` (Interface `SpriteSource`).

---

## 4. Katalog (Server)

Der Katalog ist die Brücke zwischen den 300.000 Dateien und der UI.

**Aufbau beim ersten Start** (danach gecacht in `.cache/catalog.json`,
Fingerprint über Ordner-mtimes und Definitionen):

1. Alle Definitionen laden, `layer_1…layer_9` je Körpertyp auflösen,
   `replace_in_path` expandieren (z. B. `${head}` → male/female/elderly).
2. Je aufgelöstem Ebenen-Pfad das Dateisystem prüfen: Welche Animationen
   liegen als Basis-Sheet vor, welche Farbvarianten je Animation.
   Ergebnis ist die **tatsächliche** Abdeckung, nicht die behauptete.
3. Sheet-Größe aus dem PNG-Header (IHDR, ohne Dekodierung) lesen; daraus
   Zellgröße und Spaltenzahl ableiten. Abweichungen (Universal-Sheets alter
   Bauart, 128/192-px-Frames) werden als `layout` am Sheet vermerkt.
4. Ordner ohne Definition (rund 2.000, überwiegend Unterordner bereits
   erfasster Teile) werden als "Unlisted" mit heuristischem Namen aufgenommen
   und in der UI standardmäßig ausgeblendet (Schalter "Auch unbeschriebene
   Teile zeigen").
5. Credits und Lizenzen je Teil aus den Definitionen; Lizenz-Normalisierung
   (`OGA-BY 3.0+` → `OGA-BY`, Version separat).

**API**

```
GET /api/catalog            komprimierter Katalog (gzip, ETag)
GET /api/health             Version, Sprite-Root, Katalog-Stand
GET /sprites/<pfad>         statisch, Cache-Control: immutable
POST /api/export/static-bloom   Body: Charakter + Optionen → schreibt Dateien, gibt Bericht zurück
POST /api/export/flat           dito für flache Sheets (oder ZIP-Download aus dem Browser)
GET/POST /api/characters    Speichern/Laden im Ordner `characters/` (zusätzlich zu Datei-Download)
```

Der Sprite-Root ist per `--sprites <pfad>` oder `SPRITES_DIR` konfigurierbar.

---

## 5. Charakter-Dokument

```json
{
  "format": "sprite-forge.character",
  "version": 1,
  "name": "josua_v2",
  "source": { "kind": "ulpc", "snapshot": "e7fa0aee616" },
  "bodyType": "male",
  "slots": {
    "body":  { "item": "body",              "variant": "light" },
    "head":  { "item": "heads_human_male",  "variant": "light", "follow": "body" },
    "hair":  { "item": "hair_messy1",       "variant": "black", "visible": true },
    "clothes": { "item": "torso_clothes_longsleeve", "variant": "charcoal" }
  },
  "preview": { "animation": "walk", "direction": "down", "zoom": 6 },
  "export": { "staticBloom": { "variantName": "josua", "targetDir": "…" } }
}
```

- Schlüssel sind die `type_name`s der Definitionen (ein Slot je type_name,
  wie im Generator), Werte die Definitions-IDs. Damit sind Dateien auch mit
  dem Online-Generator abgleichbar.
- **Import aus dem Online-Generator**: URL-Hash (`#sex=male&hair=Messy1_black…`)
  und dessen `character.json` (Version 2) werden gelesen; Aliase werden
  aufgelöst, nicht Auflösbares wird gemeldet.
- Migrationen laufen über `version`; Core hält einen Migrationspfad je Version.

---

## 6. Export für Static Bloom

### Zuordnung LPC → Slots

| Static-Bloom-Slot | LPC type_names (Auszug) |
|---|---|
| `0bas` Body | body, head, eyes, eye_color, eyebrows, nose, ears, ears_inner, furry_ears, horns, expression, wrinkes, wound_*, tail, wings, fins, shadow, prosthesis_* |
| `1out` Outfit | clothes, legs, shoes, socks, dress, sleeves, jacket, vest, apron, overalls, armour, chainmail, shoulders, bracers, gloves, wrists, belt, buckles, sash, cargo, neck, necklace, charm, backpack, backpack_straps, bauldron, quiver, ammo, bandages |
| `2clo` Cloak | cape, cape_trim – **und alle Rück-Ebenen** anderer Teile (siehe unten) |
| `3fac` Face | facial_*, earrings, earring_*, visor, beard, mustache, facial_mask |
| `4har` Hair | hair, hairextl, hairextr, ponytail, updo, hairtie |
| `5hat` Hat | hat, hat_*, headcover, bandana, bandana_overlay |
| `6tla` ToolA | weapon, weapon_magic_crystal, tools |
| `7tlb` ToolB | shield, shield_* |

Die Tabelle liegt in `data/slot-mapping.json` und ist im Export-Dialog
pro Teil überschreibbar ("dieses Teil nach 3fac").

### Seiten (Pages)

Eine Seite je LPC-Animation. Page-Code = Ordnername ohne Unterstrich
(`combat_idle` → `combatidle`), weil der Unity-Importer den Dateinamen an `_`
trennt. Raster = LPC-Spalten × 4 Zeilen (hurt und climb: × 1). Zeilenfolge
bleibt LPC (up, left, down, right); die Unity-Clips referenzieren ohnehin
Zellen, nicht Richtungen.

**Oversize-Animationen** (Waffen mit 128/192-px-Frames): Alle Slots der
betroffenen Seite werden auf die große Zellgröße gepolstert (Körper zentriert
in der 128-Zelle), Page-Code z. B. `slash128`. So bleibt die Regel "alle Ebenen
einer Seite teilen ein Raster" erhalten. Ist keine Oversize-Waffe angelegt,
entfällt die Seite.

### Rück-Ebenen (bg / behind)

LPC zeichnet z. B. Haar-Rückseite, Umhang hinten und Schwert hinter dem Körper
als eigene Ebenen mit `zPos < 10`. Static Bloom hat einen Renderer je Slot.
Lösung (freigegeben): alle Ebenen mit `zPos` unter dem Körper werden in
**einen** Rück-Slot komponiert (`2clo`), und `manifest.json` trägt für diesen
Slot die Zeichenreihenfolge `-1` für alle Frames. Frames, in denen LPC eine
Ebene per Richtung vor oder hinter dem Körper wechselt (Waffen-Slash), werden
aus dem `fg`/`bg`-Paar der Definition abgeleitet und ebenfalls in das
Manifest geschrieben.

### manifest.json

```json
{
  "format": "sprite-forge.static-bloom", "version": 1,
  "variant": "josua", "cellSize": 64,
  "pages": { "walk": { "columns": 9, "rows": 4, "cellSize": 64 }, "slash128": { "columns": 6, "rows": 4, "cellSize": 128 } },
  "slots": { "0bas": ["body","head","hair"], "2clo": ["cape:back","hair:back"] },
  "drawOrder": { "2clo": { "*": -1 }, "6tla": { "walk": [6,6,…], "slash": [6,-1,…] } },
  "hides": { "5hat": ["4har"] },
  "missing": { "6tla": ["combatidle","backslash","halfslash"] },
  "credits": "CREDITS.txt"
}
```

### Unity-Seite (Erweiterung des Importers)

Kleine, rückwärtskompatible Ergänzung an `CharacterPartImporter`:

- Menüpunkt "Static Bloom → Import Sprite Forge Manifest": liest
  `manifest.json` neben den Sheets, legt fehlende Page-Assets mit dem
  richtigen Raster an, füllt `Draw Order Overrides` aus `drawOrder` und
  `HidesSlots` aus `hides`. Bestehende Tabellen werden nur nach Rückfrage
  überschrieben (Dialog).
- Slicing (Grid By Cell Size) wird per `TextureImporter`-API automatisch
  gesetzt, damit Schritt 3 der bisherigen Anleitung entfällt.
- Doku-Ergänzung in `docs/paperdoll-usage.md` (Abschnitt "LPC-Import").

Die Erweiterung wird in einem eigenen Meilenstein umgesetzt und im Unity-
Projekt getestet (Import eines Beispielcharakters, Rig läuft in der Szene).

---

## 7. App (UI)

Umsetzung des freigegebenen Mockups. Wesentliche Verhaltensregeln:

- **Ebenen-Stack** (links): feste Slot-Liste je Gruppe, aus `type_name`s.
  Leere Slots bleiben sichtbar. Klick öffnet den Katalog des Slots.
  Auge = Sichtbarkeit (wird gespeichert, wirkt auch auf Export).
- **Katalog** (Mitte): Kategoriebaum aus den Definitionen (wie der
  Generator, aber flach als Chips), Suche über Name, ID, Tags, Farbe.
  Filter "Passend" = nur Teile mit Sheets für den Körpertyp.
  Thumbnails werden im Worker auf dem aktuellen Charakter gerendert
  (Basis + Teil), 48×48 Ausschnitt, in IndexedDB gecacht.
  Abdeckungs-Badge = tatsächlich vorhandene Animationen.
- **Farben**: Leiste unter dem Katalog. `match_body_color`-Teile folgen der
  Körperfarbe (lösbar). Bart/Augenbrauen folgen der Haarfarbe (lösbar).
- **Vorschau** (rechts): Worker rendert das Composite je Animation einmal
  in ein OffscreenCanvas; Hauptthread zeigt Frames per `drawImage` mit
  Zyklus und Timing aus `animations.json`. 1 oder 4 Richtungen. Zoom 1–8×,
  drei Hintergründe, Referenzraster, Ebenen-Explosion (Ebenen versetzt
  gezeichnet, zur Kontrolle der Reihenfolge).
- **Warnungen**: fehlende Animationen je Ebene, Teile ohne Sheets für den
  Körpertyp nach Körpertyp-Wechsel, Lizenzkonflikte (Abschnitt 8).
- **Undo/Redo** über einen Dokument-Stack (Snapshots des Charakter-JSON).
- **Tastatur**: Pfeile = Richtung, Leertaste = Play/Pause, 1–9 = Zoom,
  Strg+S/O/E = Speichern/Laden/Export.
- **Sprachen**: `locales/en.json` als Referenz, `de.json`; Umschalter im
  Kopf; fehlende Schlüssel fallen auf Englisch zurück. Weitere Sprachen sind
  eine Datei.

---

## 8. Lizenzen und Credits

- `data/licenses.json` beschreibt jede vorkommende Lizenz (CC0, CC-BY,
  CC-BY-SA, OGA-BY, GPL 2/3, OGA-SA) mit Symbolen und Ja/Nein-Antworten:
  kommerziell nutzen, verändern, Namensnennung nötig, Weitergabe unter
  gleicher Lizenz nötig, Quellcode-Pflicht (GPL), Link zum Volltext.
- **Lizenz-Panel** im Kopfbereich: zeigt für den aktuellen Charakter die
  "wirksame" Lizenz (strengste Kombination) als Symbole plus Klartext
  ("Du darfst verkaufen. Du musst 14 Autoren nennen. Wenn du die Sprites
  veränderst, müssen die Änderungen unter CC-BY-SA bleiben."). Per Teil
  aufklappbar. Hinweis, dass das keine Rechtsberatung ist.
- **Lizenzfilter** im Katalog: erlaubte Lizenzen ankreuzen, andere Teile
  werden ausgegraut (nicht versteckt), mit Begründung im Tooltip.
- **Credits-Export**: `CREDITS.txt` und `CREDITS.csv` je Export, Format wie
  im Generator (Datei, Autoren, Lizenzen, Links), damit die Namensnennung
  vollständig ist.

---

## 9. Meilensteine

| # | Meilenstein | Inhalt | Abnahmekriterium |
|---|---|---|---|
| 0 | Gerüst | Workspaces, TypeScript, Lint, Vitest, `npm start` startet Server und App, Daten aus dem Repo-Commit unter `data/` | `npm start` öffnet eine leere App mit Health-Anzeige |
| 1 | Katalog | Katalog-Builder, Cache, API, Kompatibilitätsregeln, Tests gegen den echten Ordner | Katalog für alle 667 Definitionen in < 60 s beim ersten Start, < 2 s aus dem Cache; Abdeckung stimmt stichprobenartig |
| 2 | Vorschau | Compose-Modul, Worker, animierte Vorschau, alle 15 Animationen, Oversize | Beispielcharakter läuft in allen Animationen pixelgleich zum Online-Generator (Vergleichsbild) |
| 3 | Auswahl-UI | Ebenen-Stack, Katalog mit Thumbnails, Farben, Körpertypen, Suche, Filter, Warnungen, Undo/Redo | Mockup-Funktionen vollständig, flüssiges Scrollen bei 96+ Kacheln |
| 4 | Speichern und flacher Export | Charakter-JSON, Laden per Datei/Drag-and-drop, Import aus Generator-URL/JSON, flache Sheets, ZIP, Credits | Export eines Charakters entspricht dem Generator-Export (Bildvergleich) |
| 5 | Static-Bloom-Export | Slot-Komposition, Pages, Oversize-Polsterung, `manifest.json`, Schreiben in den Zielordner, Unity-Importer-Erweiterung, Doku | Beispielcharakter läuft im Static-Bloom-Rig mit Walk und Slash inklusive Rück-Ebene |
| 6 | Lizenzen und Sprachen | Lizenz-Panel, Filter, Erklärungen, Credits, en/de, Umschalter | Jede im Katalog vorkommende Lizenz hat eine Erklärung; UI ist vollständig übersetzt |
| 7 | Feinschliff | Tastatur, Zufall, Docker, `THIRD_PARTY_LICENSES.md`, README, Smoke-Test | Docker-Container startet mit gemountetem Sprite-Ordner |

Reihenfolge ist verbindlich; jeder Meilenstein endet mit einem lauffähigen
Stand. Ein Git-Repository wird in Meilenstein 0 angelegt.

---

## 10. Risiken und Gegenmaßnahmen

| Risiko | Maßnahme |
|---|---|
| Erststart-Scan über 300.000 Dateien dauert | Nur Verzeichnisse lesen, PNG-Header statt Dekodierung, Cache mit Fingerprint, Fortschrittsanzeige |
| Thumbnails für tausende Teile | Rendering im Worker, nur sichtbare Kacheln, IndexedDB-Cache, kleine Ausschnitte |
| Rück-Ebenen in einem Slot verlieren die LPC-Feinsortierung untereinander | Innerhalb des Rück-Slots wird nach LPC-zPos komponiert; nur die Relation zum Körper ist -1 |
| Static-Bloom-Rig kennt keine Pages mit anderer Zellgröße im selben Clip-Satz | Oversize nur als eigene Pages; Doku beschreibt, dass Clips je Page angelegt werden |
| Kinder-Körpertyp hat wenige Teile | "Passend"-Filter macht das sichtbar; kein Sonderfall im Code |
| Assets ohne Definition | "Unlisted"-Einträge, standardmäßig ausgeblendet |
| Spätere Asset-Updates ändern Ordnernamen | Aliase aus neueren Definitionen werden beim Katalogbau berücksichtigt; Migration im Charakter-Dokument |

---

## 11. Offene Punkte für die Freigabe

1. App-Name: "Sprite Forge" (Platzhalter) oder ein anderer Name?
2. Ort der gespeicherten Charaktere: `characters/` im Projekt (Vorschlag) oder frei wählbar?
3. Standard-Zielordner für den Static-Bloom-Export: `E:\00_dev\static-bloom\staticbloom-poc\Assets\_Project\Art\Characters\LPC\Sheets\` (Vorschlag).

---

## 12. Stand der Umsetzung (13.09.2026)

| # | Meilenstein | Stand |
|---|---|---|
| 0 | Gerüst | erledigt (Workspaces, TypeScript, Vitest, `npm start`, Daten aus Commit `e7fa0aee616`) |
| 1 | Katalog | erledigt (Scan + Definitionen, Cache mit Fingerprint, 659/667 Teile verfügbar, erster Scan ~60 s, aus Cache ~2 s) |
| 2 | Vorschau | erledigt (alle 15 Animationen, Oversize-Layouts, 4 Richtungen, Zoom, Hintergründe, Raster, Ebenen-Explosion, Filmstreifen) |
| 3 | Auswahl-UI | erledigt bis auf "Unlisted"-Teile (284 Ordner ohne Definition bleiben in 1.0 unsichtbar) |
| 4 | Speichern und flacher Export | erledigt (Server-Ablage `characters/`, Datei-Download, Drag-and-drop, Autosave; Export je Animation, Universal-Sheet, Einzelframes, ZIP oder Ordner, Credits) |
| 5 | Static-Bloom-Export | erledigt (Slot-Sheets, Pages, Oversize, `manifest.json`; Unity-Importer `PixyGoatManifestImporter` erzeugt Pages, Slicing, Parts, Zeichenreihenfolge; Testimport mit 15 Pages und 4 Parts erfolgreich) |
| 6 | Lizenzen und Sprachen | erledigt (Lizenz-Panel mit wirksamer Lizenz, Pflichten, Je-Teil-Tabelle, Filter; en/de umschaltbar) |
| 7 | Feinschliff | erledigt: Tastatur, Zufall, Dockerfile + compose, `THIRD_PARTY_LICENSES.md`, README. Offen: Docker-Build noch nicht ausgeführt, kein Playwright-Smoke-Test |

Nicht in 1.0 (bewusst verschoben): Import von Generator-URLs/JSON (Format
liegt vor, Aliase fehlen im Juli-2025-Stand), "Unlisted"-Teile, Rendering im
Web Worker (Hauptthread reicht bei den gemessenen Zeiten), `hides` im Manifest
(LPC liefert keine Information dazu; Feld ist vorhanden und wird importiert).
