# WallerSketch: architecture, decisions and limits

WallerSketch 2 is a rewrite of an earlier prototype ("Cocktail Studio" 1.x), whose cloth was a geometric envelope rather than a drape. Its project files (`.cocktail`, format version 1 and 2) still open.

## Changes to the requirements

The product targets come from the consolidated specification. These points refine it, based on the reference photos and videos of real Mr Waller installations:

| Topic | Decision | Why |
|---|---|---|
| Fabric over risers | Each fabric has a **Recouvre aussi les socles** switch. Tablecloths (*nappes*) cover the table only, and the risers stand on the cloth. Drapes (*drapés*) pass over the risers. | Every reference installation puts white risers *on* a coloured tablecloth. The spec only described cloth draped over risers. Both are needed. |
| Overhang | The fabric inspector shows the real drop (*retombée*) past each table edge, computed from the dimensions. | This is what installers measure. |
| Moving a dressed table | Dragging a cloth that lies on a table moves the whole table and everything on it. Alt-drag moves the cloth alone. | The cloth covers the table, so it is what you click. |
| Installation prep | When nothing is selected, the right panel shows an **À prévoir** list: tables, risers by size, fabrics, drinks by name and glasses. The SVG plan numbers each riser and gives its position from its table's back-left corner. | It answers "what do we load in the van" and "where does each block go". |
| Signs and menus | The A5 table tent and the A3 frame take an image, for example the operator's own menu. They are blank until an image is added. | Seen in every reference set-up. No invented text. |
| Lit risers | Risers have an **Éclairé de l'intérieur** switch. | The video installations use lit acrylic blocks. |
| Library previews | Thumbnails are rendered from the real 3D models. | The library shows exactly what gets placed. |
| Export formats | 16:9, 4:3, 1:1, 4:5 and 9:16 (story), in HD, 2880 px or 4K. | Proposals are shared by WhatsApp and Instagram, as the reference menu is. |
| Starting point | On first launch the app opens a bar modelled on the reference photo. After that, **New** offers five templates. Templates come with Ensemble, Face and Dessus views. | The first image takes no setup, as the spec asks. |
| Platforms | Linux (AppImage, .deb) next to macOS and Windows; CI tests all three. | Requested during implementation. |
| Snapping | Positions snap to a 1, 5 or 10 cm grid in the frame of the support, starting at its corner; Alt drags freely; keyboard nudges stay exact. | Installers measure from table edges. |
| Luxury presentation | Stepped presentoirs (2–6 steps, cloth follows each step), mirror and brass finishes, sequin cloth, cut crystal, gold rims, a champagne coupe tower, candelabra, ice bucket. | High-end events. |
| Assistants | One JSON recipe format for every kind of asset, three routes to reach it (copy-paste with ChatGPT or DeepSeek in the browser, an API key, local MCP agents). | Works with remote and local agents, and without any. |
| Interchange | Imports convert to GLB once; exports GLB, OBJ, USDZ. STEP/IGES through OpenCascade in a separate process. | Exchange with CAD and Blender; AR on phones. |

## Architecture

TypeScript with Three.js 0.181 in an Electron 42 window, bundled by esbuild. The interface uses plain DOM with no UI framework.

| Area | Files | Responsibility |
|---|---|---|
| Data contracts | `src/core/types.ts` | Units in metres; +Y up; Three.js yaw convention; the shape of a project. |
| Library | `src/core/catalog.ts`, `src/core/glassware.ts` | 9 tables, 20 presentoirs, 13 glass profiles, 23 cocktails, 10 fabrics and 18 decor pieces, all procedural and original; registries for custom entries and glass profiles. |
| Recipes | `src/core/recipes.ts` | The asset format for people and assistants: validation with actionable errors, compilation to library entries, the reference text (also `docs/RECIPES.md`). |
| Scene rules | `src/core/scene.ts` | Support hierarchy, rigid transforms around a shared pivot, duplication, grids, footprints, inventory. |
| History | `src/core/document.ts` | Immutable snapshots that share unchanged items, so an undo step costs one array of references. Merge keys turn a drag into one undo step. Saved-state tracking is by reference, so undoing back to the saved version is clean and edits made during a save stay dirty. |
| Project files | `src/core/project.ts` | Versioned JSON with embedded models and textures, validation, link repair, and v1 migration. |
| Cloth | `src/core/drape.ts`, `src/core/fabric.ts`, `src/core/heightfield.ts` | Position-based cloth settling in a worker, collider selection in the fabric's own frame (so a rigid move keeps the cached shape), and a height index for fast surface queries. |
| Rendering | `src/render/*` | Viewport, procedural meshes and materials, instanced drinks, thumbnails. |
| Editor | `src/editor.ts` | Every command. Every command re-seats objects on the surface underneath. |
| Interface | `src/app.ts`, `src/ui/*` | Shell, library, scene list, inspector, drink builder, assistant panel, dialogs, presentation mode. |
| Assistants | `src/agent.ts`, `desktop/agent.cjs`, `desktop/mcp.cjs`, `desktop/assistant.cjs` | Command set shared by every assistant route; local socket bridge; stdio MCP server; Claude, ChatGPT and DeepSeek API calls with keychain-encrypted keys. |
| Interchange | `src/render/interchange.ts`, `desktop/cad.cjs` | Format conversion to GLB, 3D export, STEP/IGES in an Electron utility process. |
| Plan | `src/plan.ts` | SVG plan computed from scene geometry. |
| Desktop | `desktop/main.cjs`, `preload.cjs`, `persistence.cjs` | Sandboxed window, narrow bridge, atomic writes, import validation, native dialogs and menus. |

### Security model

The window is sandboxed with context isolation, a strict Content Security Policy (no `eval`) and no network: every outgoing request is blocked. It talks to the desktop only through the commands in `preload.cjs`. Parsing of untrusted CAD files happens in a separate utility process. API keys are encrypted with Electron `safeStorage` and only read in the main process, which is the only part allowed to contact the Anthropic, OpenAI or DeepSeek API. The local agent bridge is off by default, private to the user account and token-protected.

### Cloth

Each fabric is a finite grid of particles: polar for round cloths, so the hem is clean. It is dropped flat above its supports and settled with stretch, shear and bending constraints, friction, and collisions against box, cylinder and taper colliders and the floor. Length is preserved by the constraints, so the size of the piece decides how far it falls.

Collider edges are rounded by about one particle spacing, so triangles wrap a corner instead of cutting through it. Results are cached by a key built in the fabric's own frame: colour changes, undo and moving a dressed table do not recompute. Pieces that overlap are stacked with growing clearance.

### Rendering cost

- Drinks are drawn as instanced batches: one draw call per distinct part instead of one per glass, with three garnish variants so neighbouring glasses differ.
- Geometry and materials are shared through caches.
- The view renders only when something changes.
- Glass is a transparent, reflective shell. The drink inside is transmissive, so fruit, mint and ice show through it without a second refraction pass.

## Known limits

- **Cloth fall:** mean strain is about 1–3 %. On a long drop the hem hangs about 5–8 cm lower than the exact geometric drop. The *retombée* figure in the inspector uses exact dimensions.
- **Cloth collisions:** no self-collision. Because of the edge rounding, cloth stands 2–4 cm off the sides of a solid. An imported model that is marked as able to carry objects collides as its bounding box.
- **Objects on a slope:** an object on sloping cloth rests on the highest point under its foot. It never sinks in, but it can stand slightly proud on the low side.
- **Glass ordering:** instanced transparent glasses are sorted per batch, not per glass. At this opacity, ordering artefacts are rare.
- **Imports:** imported models are meshes. They can be scaled, tilted in quarter turns and recoloured per material, but they are not parametric.
- **Thumbnails:** library thumbnails are cached in local storage, and regenerated if that is unavailable.
- **Signing:** packages are not code-signed or notarized, so first launch asks for confirmation (see the README).
- **Tower and imports:** the champagne tower is decor, not a support; imported models carry objects only when marked **Peut porter des objets**, and then act as their bounding box for cloth.
- **MCP:** the app must be open for local agents to work.

## Performance

Apple M5, development build, canvas 880 × 888 CSS px, after warm-up (`npm run bench`):

| Scene | Frame interval mean / p95 | Draw calls |
|---|---|---|
| Example bar (75 objects, 60 drinks, cloth, curtain) | 16.7 / 18.4 ms | 558 |
| 3 dressed tables, 12 presentoirs, 400 drinks | 16.7 / 17.6 ms | 421 |

16.7 ms is the 60 Hz display cap. Before instanced drinks the dense scene took 22 ms with 10,271 draw calls. An edit with re-seating takes about 1.5 ms; moving a table with 200 drinks, 3 ms. Packaged startup to first frame: 0.4–0.6 s. The startup bundle is 390 KB minified; format importers and OpenCascade load only when used.
