# WallerSketch

**Design cocktail-table installations in 3D, show them to the client, and know exactly what to bring on the day.**

A barman friend who sets up cocktail bars for weddings, baby showers and corporate events asked me to make this. Proposals used to be a few phone photos of past events and a lot of "imagine it in pink". WallerSketch lets the operator compose the actual table — tables, presentoirs, cloths that really drape, glasses and cocktails — present it, export the images, and print a dimensioned plan for the installation crew.

![The example bar](docs/images/example-bar.png)

## What it does

- **Compose** with a library of tables, presentoirs (cubes, steps, cylinders, mirror trays, lit acrylic), fabrics (satin, linen, velvet, sequins), 13 glass profiles, 23 prepared cocktails and decor (flowers, dispenser, signs, candelabra, champagne tower, ice bucket, curtains). Drag onto the scene; objects settle on whatever is under them and move with it.
- **Real cloth.** Fabrics are simulated: drop a 320 × 180 cloth on a table and it hangs, folds and stops at the floor. A drape passes over the risers; a tablecloth stays under them. The inspector shows the drop at each edge.
- **Grids and snapping.** Turn one cocktail into 24 in rows of 6 with a live preview; positions snap to a 1, 5 or 10 cm grid aligned to the table (Alt to move freely).
- **Create your own.** A drink builder (glass, colours, garnish, ice, crystal) and an AI assistant that turns a description — or a photo — into tables, presentoirs, fabrics, glasses, cocktails or a whole composition.
- **Present and export.** Saved viewpoints, full-screen presentation, PNG up to 4K in 16:9, 4:5 or story format, a dimensioned SVG plan with riser positions and the packing list, and 3D export (GLB for Blender or CAD tools, OBJ, USDZ to show the table in AR on an iPhone).
- **Import from CAD and 3D tools**: GLB/glTF, OBJ, STL, PLY, 3MF, DAE, FBX, and STEP/IGES straight from CAD software (converted with OpenCascade, in real units).
- **Offline.** Projects are single self-contained `.wsketch` files.

![A luxury set-up: sequin cloth, lit steps, champagne tower](docs/images/luxury.png)

## AI assistants

WallerSketch works with Claude and ChatGPT three ways (details in [docs/AI.md](docs/AI.md)):

1. **In the app** — *Assistant → Décrire*, with your own Claude or OpenAI API key (stored encrypted by the operating system). Describe what you want, optionally attach a photo, preview the result, keep it.
2. **Any chat assistant** — *Copier-coller*: copy the context into ChatGPT or Claude on the web, paste the answer back.
3. **Local agents** — Claude Desktop, Claude Code or Codex connect through the bundled MCP server; they can read the scene, create assets, place them and render the result to check their work.

Assistants write [asset recipes](docs/RECIPES.md), a small JSON format the app validates before anything is added.

## Install

Download the latest build from [Releases](https://github.com/maclandrol/wallersketch/releases):

| Platform | File | First launch |
|---|---|---|
| macOS (Apple Silicon or Intel) | `.dmg` | Not notarized: right-click the app → **Open** → **Open**. |
| Windows 10/11 (x64) | `.exe` installer | SmartScreen may warn: **More info → Run anyway**. |
| Linux (x64) | `.AppImage` or `.deb` | `chmod +x WallerSketch-*.AppImage`, then run it. |

The [user guide](docs/GUIDE.md), in French like the app, goes from the first table to the installation plan.

## Develop

Requires Node.js 22 or later.

```bash
npm ci
```

```bash
npm start
```

| Command | What it does |
|---|---|
| `npm test` | Unit tests: cloth solver, scene rules, history, file format, recipes, plan. |
| `npm run e2e` | Drives the real app with mouse and keyboard: editing; files and imports; snapping, cloth over steps, CAD import, exports, drink builder and the MCP bridge. |
| `npm run bench` | Frame time, edit cost and memory on representative scenes. |
| `npm run typecheck` | Strict TypeScript. |
| `npm run pack:mac`, `pack:win`, `pack:linux` | Packages into `release/`. |
| `npm run docs` | Regenerates [docs/RECIPES.md](docs/RECIPES.md) from the source. |
| `npm run icon` | Redraws the application icon. |

CI runs the unit and end-to-end suites on Ubuntu, Windows and macOS for every push. Tagged releases are built on each OS, launched and exercised there, then uploaded. How it works — cloth simulation, rendering, file format, security model — is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Third-party software and licences: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
