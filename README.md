# PixyGoat

A local, browser-based pixel-art character designer for the
[Universal LPC Spritesheet](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)
assets. Build a character from body, head, hair, clothing, armour and weapons,
check every animation live, and export it either as flat spritesheets or as
paper-doll parts for the Static Bloom Unity rig.

## Requirements

- Node.js 22 or newer
- The LPC `spritesheets/` folder (snapshot of the generator repository from
  2025-07-21, commit `e7fa0aee616`) next to this README, or anywhere else with
  `--sprites <path>`

## Run

```bash
npm install
npm start
```

Then open <http://127.0.0.1:4600>. The first start scans the spritesheet folder
(about a minute for 300 000 files) and caches the catalog in `.cache/`. Later
starts take a few seconds.

Options (flags or environment variables):

| Flag | Variable | Default |
|---|---|---|
| `--sprites <dir>` | `PIXYGOAT_SPRITES` | `./spritesheets` |
| `--port <n>` | `PIXYGOAT_PORT` | `4600` |
| `--host <addr>` | `PIXYGOAT_HOST` | `127.0.0.1` |
| `--characters <dir>` | `PIXYGOAT_CHARACTERS` | `./characters` |
| `--cache <dir>` | `PIXYGOAT_CACHE` | `./.cache` |
| | `PIXYGOAT_UNITY_DIR` | Static Bloom `Art/Characters/LPC` when found |
| | `PIXYGOAT_EXPORT_DIR` | `./exports/flat` |
| `--rebuild` | | force a catalog rebuild |

### Docker

```bash
docker compose up --build
```

`compose.yaml` mounts `./spritesheets`, `./characters` and `./exports`. Set
`PIXYGOAT_SPRITES_HOST` to use a spritesheet folder elsewhere.

## Development

```bash
npm run dev        # server on 4600 with reload, Vite app on 5173
npm test           # core unit tests
npm run typecheck
npm run catalog    # build the catalog on the command line
```

Packages: `packages/core` (catalog model, compositing, export planning,
license analysis; no DOM, no Node APIs), `packages/server` (Fastify: scan,
catalog, sprites, character storage, file export), `packages/app` (Preact UI).
Data lives in `data/` (sheet definitions from the generator, animation and
oversize layouts, slot grouping and mapping, license texts) and `locales/`.

## Documentation

- [docs/implementation-plan.md](docs/implementation-plan.md) – decisions, architecture, milestones
- [docs/static-bloom-export.md](docs/static-bloom-export.md) – export format and the Unity importer

## Licenses

PixyGoat itself is MIT licensed (see `LICENSE`). Third-party npm packages are
listed in `THIRD_PARTY_LICENSES.md`. The sheet definitions under
`data/definitions/` are data files from the LPC generator repository and
carry the credits of the artists; the sprites themselves are licensed by their
authors (CC0, CC-BY, CC-BY-SA, OGA-BY, GPL) and PixyGoat writes the matching
`CREDITS.txt` with every export. The in-app license panel explains what each
license allows.
