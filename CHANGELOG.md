# Changelog

## 2.3.0 (10 November 2026)

- Moving glasses: a glass now stays under the pointer where it was grabbed instead of jumping behind it, a click just beside a glass picks it, and glasses snap by the centimetre and to their neighbours' edges rather than to the 5 cm grid.
- Ranger: put the selection in one row, or in a grid with a number per row and a gap, adjusted live and undone in one step.
- Camera from the keyboard: + and − to zoom, arrows to turn and tilt, Shift and arrows to slide, 0 to frame everything. Space and drag, or a right drag, slides the view; a right click without moving still opens the menu.
- A shortcuts sheet, opened with ? or from the menus.
- The selection is drawn over everything else and the rest of the scene fades further. Framing a single glass keeps its neighbours in view.
- Web app: new versions are fetched fresh and applied on the next launch (before, an old copy could stay in use). The version number is shown at the bottom of the … menu.

## 2.2.0 (10 November 2026)

- Selecting several objects: draw a box with the new Sélection tool or Shift-drag from an empty spot. Only objects fully inside are taken, so the table under them stays out.
- A selection bar above the scene names what is selected and acts on all of it: duplicate, rotate, align edges or centres, distribute with equal gaps, replace cocktails or glasses in place, group, lock, frame and delete.
- Select the same objects, or add what stands on the selection, from the bar or the context menu.
- While dragging, objects snap to the edges and centre of their support and of their neighbours, with a guide line and the distance to the support's edges. The grid applies otherwise.
- The selection stays sharp while the rest of the scene fades. Double-click an object to frame it.
- Vider la composition, with a confirmation, in the File menu, the context menu and the Scène tab.
- Menus open within the window and close when their button is clicked again.

## 2.1.0 (10 November 2026)

- WallerSketch now runs on iPad and Android tablets as a web app at maclandrol.github.io/wallersketch. Added to the home screen, it opens full screen and works offline.
- Touch: tap to add from the library, long press for the context menu, a larger rotation handle. In portrait the library and properties open as drawers.
- On the tablet, projects open and save through the Files app, and images, plans and 3D files go through the share sheet. The library, recovery and API keys stay on the device.
- Duplicating a tablecloth that lies on a table now duplicates the whole dressed table, as dragging it already did.

## 2.0.2 (7 November 2026)

- Assistant: the first tab is now a guided copy and paste for ChatGPT, DeepSeek or Claude in the browser or phone app. One button copies the request and opens the site, another reads the answer from the clipboard.
- Invalid recipes come with a ready correction message to paste back into the same conversation.
- DeepSeek can be used with an API key, next to ChatGPT and Claude, with links to each key page.
- Documentation rewritten for chat users; MCP setup moved to an advanced section with example configurations.

## 2.0.1 (6 November 2026)

- Windows installer: add the multi-size application icon used by the installer and `.wsketch` file association (the 2.0.0 Windows build failed without it).

## 2.0.0 (6 November 2026)

First public release of WallerSketch, a rewrite of the Cocktail Studio prototype.

**Compose**
- Tables (rectangular, round, high), presentoirs (cubes, blocks, cylinders, tapers, 2–6 step tiers, mirror trays, marble plinths, lit acrylic), 13 glass profiles, 23 cocktails, fabrics in satin, linen, velvet, cotton and sequins, and decor: flowers, dispenser, signs, a champagne coupe tower, a candelabra, an ice bucket and curtains.
- Physically settled cloth: tablecloths that hang, fold and stop at the floor; drapes that follow the risers and steps underneath; the drop at each edge shown from real dimensions.
- Objects settle on what is under them and move with it. Grids of glasses with live preview and exact count. Snapping to a 1, 5 or 10 cm grid aligned to the table, Alt to move freely.
- Mirror and brass finishes, cut crystal, gold rims.

**Create**
- Quick drink builder with live preview; custom cocktails live in "Mes cocktails" across projects.
- AI assistant in three routes: in the app with a Claude or OpenAI key (with photo input), copy-paste with any chat assistant, or local agents (Claude Desktop, Claude Code, Codex) through the bundled MCP server.
- Asset recipes: a documented JSON format for tables, presentoirs, fabrics, glasses, cocktails, decor and whole compositions, validated with precise error messages.
- Imports from GLB/glTF, OBJ, STL, PLY, 3MF, DAE, FBX, and STEP/IGES from CAD tools in real units.

**Present and prepare**
- Saved views, full-screen presentation, PNG export up to 4K in landscape, square, 4:5 and story formats.
- Dimensioned SVG plan with numbered riser positions and the packing list.
- 3D export to GLB, OBJ and USDZ (AR on iPhone and iPad).

**Platforms**
- macOS (Apple Silicon and Intel), Windows x64, Linux x64 (AppImage, .deb). Packages are not code-signed.
- Projects are self-contained `.wsketch` files; `.cocktail` files from the prototype open.
