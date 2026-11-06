# Changelog

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
