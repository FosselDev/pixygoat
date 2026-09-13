# Export für Static Bloom

Wie PixyGoat einen LPC-Charakter in das Paper-Doll-Format von Static Bloom
bringt, was dabei entsteht und wie der Import in Unity läuft.

## Kurzfassung

1. In PixyGoat **Exportieren → Static Bloom · Paper-Doll-Parts**, Ordner ist
   standardmäßig `Assets/_Project/Art/Characters/LPC` im Unity-Projekt.
2. In Unity **Tools → Static Bloom → Characters → Import PixyGoat Manifest…**
   und die geschriebene `manifest.json` wählen (oder den Ordner im
   Project-Fenster markieren und **Assets → Static Bloom → Import PixyGoat
   Manifest**).
3. Der Importer setzt Import-Einstellungen, slict alle Sheets im Raster ihrer
   Page, erzeugt Page- und Part-Assets und schreibt die Zeichenreihenfolge.
   Übrig bleiben die Clips für den Körper (Abschnitt 5 in
   `paperdoll-usage.md`).

## Was PixyGoat schreibt

```
LPC/
├── Sheets/
│   ├── char_a_walk_0bas_<variant>_v01.png       9×4 Zellen à 64 px
│   ├── char_a_walk_1out_<variant>_v01.png
│   ├── char_a_walk_2clo_<variant>_v01.png       Rück-Ebenen, Zeichenreihenfolge -1
│   ├── char_a_slash128_6tla_<variant>_v01.png   6×4 Zellen à 128 px (Oversize)
│   └── …
├── manifest.json
├── character.json      die PixyGoat-Auswahl, zum Wiederladen
├── CREDITS.txt         Autoren und Lizenzen der verwendeten Sprites
└── CREDITS.csv
```

Der Dateiname folgt dem Mana-Seed-Schema, das `CharacterPartImporter` liest:
`char_a_<page>_<layer>_<variant>_v<nn>`. Page-Codes enthalten keine
Unterstriche (`combat_idle` → `combatidle`), der Variantenname wird auf
Buchstaben und Ziffern reduziert.

### Slots

| Slot | Inhalt aus LPC |
|---|---|
| `0bas` | Körper, Kopf, Augen, Nase, Ohren, Ausdruck, Schwanz, Flügel, Schatten, Wunden, Prothesen |
| `1out` | Kleidung, Beine, Schuhe, Handschuhe, Gürtel, Rüstung, Schultern, Hals, Rucksack, Umhang (Vorderseite) |
| `2clo` | **alle Ebenen hinter dem Körper**: Haar-Rückseite, Umhang hinten, Waffe/Schild hinter der Figur |
| `3fac` | Brillen, Augenklappen, Masken, Ohrringe, Visier, Bart, Schnurrbart |
| `4har` | Haare und Haarteile |
| `5hat` | Kopfbedeckungen, Bandanas |
| `6tla` | Waffen und Werkzeuge (Vorderseite) |
| `7tlb` | Schilde |

Die Zuordnung liegt in `data/slot-mapping.json`. LPC zeichnet Ebenen nach
`zPos`; alles unter dem Körper (`zPos < 10`) landet in `2clo`, unabhängig vom
Typ. Innerhalb eines Slots bleibt die LPC-Reihenfolge erhalten, weil der Slot
als Composite gerendert wird.

### Pages

Eine Page je LPC-Animation, Raster = Spalten × 4 Zeilen (up, left, down,
right); `hurt` und `climb` haben eine Zeile.

| Page | Raster | Page | Raster |
|---|---|---|---|
| spellcast | 7×4 | idle | 2×4 |
| thrust | 8×4 | jump | 5×4 |
| walk | 9×4 | sit | 3×4 |
| slash | 6×4 | emote | 3×4 |
| shoot | 13×4 | run | 8×4 |
| hurt | 6×1 | combatidle | 2×4 |
| climb | 6×1 | backslash | 13×4 |
| | | halfslash | 7×4 |

**Oversize:** Trägt der Charakter eine Waffe mit 128- oder 192-px-Frames,
bekommt die betroffene Animation eine Page mit dieser Zellgröße, etwa
`slash128` (6×4 à 128 px). Alle Slots dieser Page sind auf die große Zelle
gepolstert, der Körper sitzt zentriert. Die Regel "alle Ebenen einer Page
teilen ein Raster" bleibt damit erhalten. Die 64-px-Page derselben Animation
wird dann nicht geschrieben.

### manifest.json

```json
{
  "format": "pixygoat.static-bloom",
  "variant": "josua",
  "pages": { "walk": { "columns": 9, "rows": 4, "cellSize": 64, "directions": ["up","left","down","right"] },
             "slash128": { "columns": 6, "rows": 4, "cellSize": 128, "layout": "slash_128" } },
  "slots": { "0bas": [ { "file": "Sheets/char_a_walk_0bas_josua_v01.png", "parts": ["body:body:light", "head:heads_human_male:light"] } ] },
  "drawOrder": { "2clo": { "*": -1 } },
  "hides": {},
  "missing": { "6tla": ["spellcast", "jump"] },
  "files": ["Sheets/…"]
}
```

- `drawOrder`: je Slot entweder `"*": n` für alle Pages oder ein Page-Code mit
  einem Array je Frame. PixyGoat schreibt heute nur die Rück-Ebene mit `-1`;
  das Format trägt aber auch Frame-Tabellen, falls ein späterer Export sie
  braucht.
- `missing`: Slots ohne Inhalt in einer Page. Die Zellen bleiben leer, der Rig
  schaltet den Renderer dort ab.

## Der Unity-Importer

`Assets/_Project/Editor/Characters/PixyGoatManifestImporter.cs`, Menü
**Tools → Static Bloom → Characters → Import PixyGoat Manifest…**

1. Legt für jede Page in `manifest.json` ein Page-Asset an (oder findet es
   über den Page-Code) und setzt `Columns`/`Rows`.
2. Setzt je Sheet: Sprite Mode Multiple, PPU 32, Point-Filter, keine
   Kompression, Mesh Type Full Rect, und slict auf **Grid By Cell Size** mit
   der Zellgröße der Page. Vollständig transparente Zellen werden
   ausgelassen, genau wie beim manuellen Slicing.
3. Ruft `CharacterPartImporter.Import` für jedes Sheet, so dass je Slot ein
   Part-Asset mit einem Eintrag je Page entsteht (`Part_2clo_josua_v01`).
4. Schreibt die Tabellen aus `drawOrder` in die Page-Assets. Bestehende
   Tabellen für dieselben Slots werden nur nach Rückfrage ersetzt.
5. Setzt `HidesSlots` aus `hides`.

Der Menüpunkt braucht die Referenz `Unity.2D.Sprite.Editor` in
`StaticBloom.Editor.asmdef` (Grid-Slicing über `ISpriteEditorDataProvider`).

**Danach von Hand:** Clips für den Körper anlegen (`0bas`-Sheets, Sample Rate
200, Abschluss-Key) und die Zustände im Animator Controller. Bei Oversize-Pages
verweisen die Clips auf die 128-px-Sprites der Page `slash128`; da alle Slots
dieser Page dasselbe Raster haben, läuft der Rig unverändert.

**Nicht importierbar:** der Export "jede LPC-Ebene als eigenes Sheet". Er
erzeugt Slot-Codes, für die der Rig keinen Renderer hat; der Importer meldet
sie und überspringt die Sheets.
