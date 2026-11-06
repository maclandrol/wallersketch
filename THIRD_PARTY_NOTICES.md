# Third-party software and asset provenance

All library profiles, presentoirs, champagne tower, candelabra,, table/riser/decor geometry, cocktail garnishes, generated weave, UI illustrations and the application icon were made for this project. No proprietary asset library or external hotlink is used. The icon is drawn by `scripts/icon.cjs` (`npm run icon`). The STEP test fixture `scripts/e2e/cube-10mm.stp` comes from the occt-import-js test suite. Reference photos and videos supplied by the operator were used only as visual reference; none of their content is bundled.

The renderer depends on Three.js (MIT), including its official RoomEnvironment, controls and GLTFLoader modules. The desktop application uses Electron (MIT), whose packaged runtimes include Electron/Chromium third-party license files. Build and testing tools are development dependencies recorded in `package-lock.json`; they are not bundled as application features. Their license notices are supplied by the installed packages. Nothing is published or relicensed by this project.

Runtime dependencies bundled with the application:

- Three.js (MIT): https://github.com/mrdoob/three/blob/dev/LICENSE
- occt-import-js and OpenCascade Technology (LGPL-2.1, with OCCT's exception), used unmodified as a separate WebAssembly module for STEP/IGES import: https://github.com/kovacsv/occt-import-js. Its licence texts ship in `node_modules/occt-import-js/dist/`, unpacked in the application package.
- Anthropic TypeScript SDK (Apache-2.0): https://github.com/anthropics/anthropic-sdk-typescript
- OpenAI Node SDK (Apache-2.0): https://github.com/openai/openai-node
- Electron: https://github.com/electron/electron/blob/main/LICENSE
