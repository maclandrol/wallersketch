# Working with AI assistants

WallerSketch does not need an assistant, but it is built so that one can help: describe *"a champagne bar for 80 guests on two round tables, gold and ivory"* and get the presentoirs, cloths, cocktails and arrangement to refine by hand.

Every route ends in the same place: **asset recipes**, a small JSON format described in [RECIPES.md](RECIPES.md). The app validates each recipe (units, limits such as the 50 cm presentoir height, known garnishes and glasses) and reports every problem in plain words, which assistants use to correct themselves. Nothing enters the library or the scene until it validates, and every change made by an assistant can be undone.

## 1. In the app, with an API key

*Assistant → Décrire.* Choose **Claude (Anthropic)** or **ChatGPT (OpenAI)**, paste your API key once, then describe what you want. You can attach a photo of an installation or a mood board.

- The key is encrypted with the operating system's keychain (macOS Keychain, Windows DPAPI, the Linux secret store) and only the desktop process reads it. The app window never sees it and has no network access of its own.
- What is sent: your description, a compact summary of the open composition, the recipe reference, and the photo if you attached one. Nothing is sent until you click **Créer**.
- Default models: `claude-opus-5-5` and `gpt-5`. You can type another model name.
- If recipes come back with problems, the app sends the exact errors back once so the model can fix them, then shows the results with previews. **Garder dans la bibliothèque** keeps them; **Placer dans la scène** keeps and places them.

Claude requests use the Messages API with medium effort, prompt caching on the recipe reference, and server-side fallback if a safety classifier declines.

## 2. Copy and paste with any chat assistant

*Assistant → Copier-coller.* **Copier la consigne** puts the recipe reference, the current composition and your request on the clipboard. Paste it into ChatGPT, Claude, Gemini or any other chat assistant, copy its whole answer, paste it back and click **Lire la réponse**. This needs no key and works with assistants on the web or on a phone.

## 3. Local agents through MCP

Claude Desktop, Claude Code, Codex and other [Model Context Protocol](https://modelcontextprotocol.io) clients can drive WallerSketch directly: read the scene, create assets, place them, and render a view to look at the result.

1. In *Assistant → Assistants locaux*, turn on **Autoriser les assistants de cet ordinateur**.
2. Copy the snippet for your client:
   - **Claude Code**: one `claude mcp add wallersketch …` command to run in a terminal.
   - **Claude Desktop**: a block for `claude_desktop_config.json` (Settings → Developer → Edit Config), then restart Claude.
   - **Codex**: a block for `~/.codex/config.toml`.
3. Ask, for example: *"In WallerSketch, build a champagne bar with a five-level coupe tower and two gold stepped presentoirs of kir royal."*

The snippet runs the bundled `mcp.cjs` with the app's own runtime, so nothing else needs installing. WallerSketch must be open.

| Tool | Purpose |
|---|---|
| `get_context` | The recipe reference, the current scene and the personal library. Agents call this first. |
| `get_scene` | Every object: id, type, position and size in cm, what it stands on. |
| `create_assets` | Validates recipes and adds them to the library; returns refs or exact problems. |
| `add_to_scene` | Places a ref or a saved composition, optionally on an object; `count` and `columns` make a grid of glasses. |
| `update_items` | Size, colour, drink colours, position, rotation, name. |
| `remove_items` | Deletes objects and what stands on them. |
| `render_view` | Returns a PNG of a view so the agent can check its work. |
| `new_scene`, `undo` | Start again, or step back. |

**Security.** The bridge is off by default. When on, it listens only on a socket private to your user account (a `0600` Unix socket on macOS and Linux, a per-user named pipe on Windows), and every request carries a random token stored in your data folder. It exposes only the commands above: no file access, no network.
