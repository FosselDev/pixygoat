# Exporting to Unity

How PixyGoat turns an LPC character into a paper-doll format a Unity side can
read sheet by sheet, what it writes, and what the import builds from it.

The format is deliberately close to an engine without being specific to one
game: eight slots in the Mana Seed naming scheme, one grid per page, and a
manifest carrying everything an importer would otherwise have to guess.

## The short version

1. In PixyGoat, **Export → Unity · paper-doll parts**. The target folder
   defaults to `exports/unity`, or to whatever `PIXYGOAT_UNITY_DIR` says —
   sensibly a path under `Assets/`.
2. In Unity, run **Build PixyGoat Character…** and pick the `manifest.json`
   that was written.
3. Answer the question: **Playable character** attaches a Rigidbody2D, a
   capsule collider and the player components; **Graphics only** gives you a
   prefab that nothing but draws.

That is all. The command creates pages, parts, clips, an animator controller
and a prefab. If you only want the sheets and parts, use **Import PixyGoat
Manifest…** and build the rest by hand.

## What PixyGoat writes

```
LPC/
├── Sheets/
│   ├── char_a_walk_0bas_<variant>_v01.png       9×4 cells of 64 px
│   ├── char_a_walk_1out_<variant>_v01.png
│   ├── char_a_walk_2clo_<variant>_v01.png       back layers, draw order -1
│   ├── char_a_slash128_6tla_<variant>_v01.png   6×4 cells of 128 px (oversize)
│   └── …
├── manifest.json
├── character.json      the PixyGoat selection, for loading it again
├── CREDITS.txt         authors and licences of every sprite used
└── CREDITS.csv
```

File names follow the Mana Seed scheme that `CharacterPartImporter` reads:
`char_a_<page>_<layer>_<variant>_v<nn>`. Page codes carry no underscores
(`combat_idle` → `combatidle`), and the variant name is reduced to letters and
digits.

### Slots

| Slot | What goes in it, from LPC |
|---|---|
| `0bas` | body, head, eyes, nose, ears, expression, tail, wings, shadow, wounds, prostheses |
| `1out` | clothes, legs, shoes, gloves, belts, armour, shoulders, neck, backpack, cape (front) |
| `2clo` | **every layer behind the body**: hair back, cape back, a weapon or shield behind the figure |
| `3fac` | glasses, eye patches, masks, earrings, visor, beard, moustache |
| `4har` | hair and hair pieces |
| `5hat` | headwear, bandanas |
| `6tla` | weapons and tools (front) |
| `7tlb` | shields |

The mapping lives in `data/slot-mapping.json`. LPC orders layers by `zPos`;
everything below the body (`zPos < 10`) goes to `2clo` whatever its type is.
Within a slot the LPC order survives, because the slot is rendered as a
composite.

### Pages

One page per LPC animation, the grid being columns × 4 rows (up, left, down,
right); `hurt` and `climb` have a single row.

| Page | Grid | Page | Grid |
|---|---|---|---|
| spellcast | 7×4 | idle | 2×4 |
| thrust | 8×4 | jump | 5×4 |
| walk | 9×4 | sit | 3×4 |
| slash | 6×4 | emote | 3×4 |
| shoot | 13×4 | run | 8×4 |
| hurt | 6×1 | combatidle | 2×4 |
| climb | 6×1 | backslash | 13×4 |
| | | halfslash | 7×4 |

**Oversize:** if the character carries a weapon with 128 or 192 px frames, the
animation it affects gets a page at that cell size instead — `slash128`, for
example, 6×4 at 128 px. Every slot on that page is padded to the larger cell
and the body sits centred, so the rule that all layers of a page share one grid
still holds. The 64 px page of the same animation is then not written.

### manifest.json

```json
{
  "format": "pixygoat.paperdoll",
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

- `drawOrder`: per slot, either `"*": n` for every page, or a page code with one
  array per frame. Today PixyGoat only ever writes the back layer at `-1`, but
  the format carries per-frame tables in case a later export needs them.
- `missing`: slots with nothing in them on a page. The cells stay empty and the
  rig switches that renderer off.
- `cycle`, `frameMs`, `loop`: which columns run in which order, how long a frame
  is held, and whether the animation repeats. That is what lets the Unity
  command build the clips without knowing anything about LPC.

## The Unity side

**Not part of this repository yet.** The importer is so far a reference
implementation living in the Unity project PixyGoat first fed; it belongs here
once it is clear how far it can be pulled loose from that one project's
assumptions (see *Open* below). What it does is written down anyway, because it
describes what the format asks for.

Two files in the editor folder: `PixyGoatManifestImporter.cs` for sheets, pages
and parts, `PixyGoatCharacterBuilder.cs` for clips, controller and prefab. The
builder calls the importer, so **Build PixyGoat Character…** is the whole way.

The importer:

1. Creates a page asset for every page in `manifest.json` (or finds it by its
   page code) and sets `Columns` and `Rows`.
2. Sets, per sheet: sprite mode multiple, 32 pixels per unit, point filtering,
   no compression, mesh type full rect, and slices on **grid by cell size**
   using the page's cell size. Fully transparent cells are left out, exactly as
   they are when slicing by hand.
3. Calls `CharacterPartImporter.Import` for each sheet, so that every slot ends
   up as a part asset with one entry per page (`Part_2clo_josua_v01`).
4. Writes the tables from `drawOrder` into the page assets. Existing tables for
   the same slots are only replaced after asking.
5. Sets `HidesSlots` from `hides`.

The menu item needs a reference to `Unity.2D.Sprite.Editor` in the editor asmdef
that holds it, for grid slicing through `ISpriteEditorDataProvider`.

**The builder also produces:**

- **Clips**, one per page and direction, on the `0bas` renderer, at sample rate
  200, with a closing key and the looping taken from `loop`. On an oversize page
  they point at the 128 or 192 px sprites; since every slot of that page shares
  the grid, the rig runs unchanged.
- **An animator controller** on the parameters the target project's player logic
  writes anyway: `facingX`, `facingY`, `isMoving`, `weaponDrawn`,
  `attackActive`, and the `isAttack` trigger. Directions run as a 2D blend tree,
  because sprite curves are chosen discretely and never interpolated. `facingY`
  defaults to −1: the origin is not a direction in a blend tree, and a figure
  nobody writes a facing for would otherwise show you its back. An existing
  controller is left alone, though missing parameters are still added.
- **A prefab** with a `SortingGroup` on sorting layer Entities, eight slot
  children at `(0, 0.375, 0)`, and a `PaperDollRig` whose body slot, animation
  source part and default parts are set. Every renderer carries the rest pose
  written in, or the character stays invisible until the first play click: the
  rig reads the frame index back from the body renderer, and an empty renderer
  resolves to nothing.
- **Player components**, on request: a Rigidbody2D without gravity, a flat
  capsule collider at the feet, and the target project's movement and animation
  components. Without them nobody writes the animator parameters and the figure
  moves without walking. This step is the most game-specific of all.

**Left to do by hand:** only adding states to the controller, if the game needs
more than standing, walking, a combat stance and an attack.

**Calling it unattended:** `Build` takes `replaceExisting` and
`replaceDrawOrder`. Without values the command asks in a dialog — which, from a
script, means the run waits behind a window nobody can see. Anyone building from
code or across a tool bridge answers both up front.

**Not importable:** the "every LPC layer as its own sheet" export. It produces
slot codes the rig has no renderer for; the importer reports them and skips
those sheets.

## Open

The export is named after its target rather than after a game now, but that has
not made it general. What still comes from one single project and will need a
decision one day:

- **The eight slots** are Mana Seed. Another rig has different ones, possibly
  more. The mapping is already data in `slot-mapping.json`; the set of slots
  itself is not.
- **The sorting layer, the pixels per unit and the `(0, 0.375, 0)` offset** are
  assumptions about the target project. They belong in the manifest, or in the
  dialog.
- **The importer itself** lives outside this repository. It should come here,
  with the game-specific part behind a clear seam.
- **Other engines.** Godot and Tiled read the same grid model; a second exporter
  would mostly be a different manifest.
