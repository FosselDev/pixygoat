# Export für Static Bloom

Wie PixyGoat einen LPC-Charakter in das Paper-Doll-Format von Static Bloom
bringt, was dabei entsteht und wie der Import in Unity läuft.

## Kurzfassung

1. In PixyGoat **Exportieren → Static Bloom · Paper-Doll-Parts**, Ordner ist
   standardmäßig `Assets/_Project/Art/Characters/LPC` im Unity-Projekt.
2. In Unity **Tools → Static Bloom → Characters → Build PixyGoat Character…**
   und die geschriebene `manifest.json` wählen.
3. Die Rückfrage beantworten: **Playable character** hängt Rigidbody2D,
   Kapsel-Collider und die Spieler-Komponenten an, **Graphics only** liefert
   ein Prefab, das nur zeichnet.

Fertig. Der Befehl legt Seiten, Parts, Clips, Animator Controller und Prefab
an. Wer nur die Sheets und Parts will, nimmt **Import PixyGoat Manifest…**
und baut den Rest von Hand (Abschnitt 5 in `paperdoll-usage.md`).

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
  "pages": { "walk": { "columns": 9, "rows": 4, "cellSize": 64, "directions": ["up","left","down","right"],
                       "cycle": [1,2,3,4,5,6,7,8], "frameMs": 100, "loop": true },
             "slash128": { "columns": 6, "rows": 4, "cellSize": 128, "layout": "slash_128",
                           "cycle": [0,1,2,3,4,5], "frameMs": 90, "loop": false } },
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
- `cycle`, `frameMs`, `loop`: welche Spalten in welcher Reihenfolge laufen, wie
  lange ein Bild steht und ob die Animation sich wiederholt. Damit baut der
  Unity-Befehl die Clips, ohne etwas über LPC zu wissen.

## Die Unity-Seite

Zwei Dateien in `Assets/_Project/Editor/Characters/`:
`PixyGoatManifestImporter.cs` für Sheets, Seiten und Parts und
`PixyGoatCharacterBuilder.cs` für Clips, Controller und Prefab. Der Builder
ruft den Importer auf, **Build PixyGoat Character…** ist also der ganze Weg.

Der Importer:

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

**Der Builder erzeugt zusätzlich:**

- **Clips**, einen je Seite und Richtung, auf dem `0bas`-Renderer, mit Sample
  Rate 200, Abschluss-Key und der Schleifeneinstellung aus `loop`. Bei einer
  Oversize-Page zeigen sie auf die 128- oder 192-px-Sprites; da alle Slots der
  Page dasselbe Raster haben, läuft der Rig unverändert.
- **Animator Controller** auf den Parametern von `PlayerAnimator`: `facingX`,
  `facingY`, `isMoving`, `weaponDrawn`, `attackActive` und der Trigger
  `isAttack`. Richtungen laufen als 2D-Blend-Tree, weil Sprite-Kurven diskret
  gewählt und nie interpoliert werden. `facingY` ist auf −1 voreingestellt:
  der Ursprung ist im Blend-Tree keine Richtung, und eine Figur, für die
  niemand die Blickrichtung schreibt, zeigt sonst ihren Rücken. Ein
  vorhandener Controller bleibt unangetastet, fehlende Parameter ergänzt der
  Befehl trotzdem.
- **Prefab** mit `SortingGroup` auf Sorting Layer Entities, acht Slot-Kindern
  auf `(0, 0.375, 0)` und einem `PaperDollRig`, dessen Body Slot, Animation
  Source Part und Default Parts gesetzt sind. Jeder Renderer trägt die
  Ruhepose fest eingetragen, sonst bleibt der Charakter bis zum ersten
  Play-Klick unsichtbar: das Rig liest den Frame-Index aus dem Body-Renderer
  zurück, und ein leerer Renderer löst nichts auf.
- **Spieler-Komponenten**, auf Wunsch: Rigidbody2D ohne Schwerkraft, ein
  flacher Kapsel-Collider an den Füßen und die Kette aus `PlayerAim`,
  `PlayerWeaponState`, `PlayerActionState`, `PlayerMovementDynamic` und
  `PlayerAnimator`. Ohne sie schreibt niemand die Animator-Parameter, und die
  Figur bewegt sich, ohne zu laufen.

**Danach von Hand:** nur noch die Zustände im Controller ergänzen, wenn das
Spiel mehr braucht als Stehen, Gehen, Kampfhaltung und Angriff.

**Nicht importierbar:** der Export "jede LPC-Ebene als eigenes Sheet". Er
erzeugt Slot-Codes, für die der Rig keinen Renderer hat; der Importer meldet
sie und überspringt die Sheets.
