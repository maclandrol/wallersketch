# Working with AI assistants

An assistant can prepare assets from a short description, for example *"a gold champagne bar for 80 guests, with a coupe tower and steps for the flutes"*. You then adjust the result by hand like anything else.

Open the **Assistant** button at the top of the window. There are three ways to use it, from the simplest to the most technical.

Whatever the route, the assistant replies with [asset recipes](RECIPES.md), a small JSON format. WallerSketch checks every recipe (sizes, the 50 cm limit on presentoirs, known glasses and garnishes) and shows a preview before anything is added. Everything an assistant adds can be undone.

## 1. ChatGPT, DeepSeek or Claude in the browser or the phone app

This works with free accounts and needs no setup. It is the recommended way.

1. In the **ChatGPT, DeepSeek…** tab, describe what you want.
2. Click **Copier et ouvrir ChatGPT** (or DeepSeek, or Claude). The request is copied and the site opens in your browser.
3. Start a new conversation, paste with ⌘V or Ctrl+V, and send.
4. When the answer is complete, copy it with the copy button under the message.
5. Back in WallerSketch, click **Coller la réponse**. The new items appear with previews.
6. Click **Garder dans la bibliothèque** to keep them, or **Placer dans la scène** to add them to the composition.

The request already contains the instructions the assistant needs and a summary of your current composition, so you don't have to explain anything else.

If some recipes are invalid, the app lists the problems and offers **Copier les corrections pour l'assistant**. Paste that message into the same conversation, then copy the new answer and click **Coller la réponse** again.

On a phone, use **Copier seulement**, send the text to yourself, and paste it into the app there.

### Optional: a ChatGPT assistant that already knows WallerSketch

If you use ChatGPT often, you can create a custom GPT once so you don't have to send the instructions every time:

1. In ChatGPT, go to **Explore GPTs → Create → Configure**.
2. Name it "WallerSketch" and paste the content of [RECIPES.md](RECIPES.md) into **Instructions**.
3. Save it. From then on, open this GPT and paste only your request (the copied text still works as is).

DeepSeek has no equivalent, so keep using the copied request there.

## 2. With an API key

In the **Clé API** tab, WallerSketch sends the request itself and reads the answer, so there is no copying. You can also attach a photo of a past installation or a mood board (not with DeepSeek, which doesn't read images).

- Choose **ChatGPT (OpenAI)**, **DeepSeek** or **Claude (Anthropic)**.
- Create a key on the provider's site (the **Créer une clé** link opens the right page): [OpenAI](https://platform.openai.com/api-keys), [DeepSeek](https://platform.deepseek.com/api_keys), [Anthropic](https://console.anthropic.com/settings/keys).
- API use is paid per request and is separate from a ChatGPT Plus subscription. A request usually costs a few cents; DeepSeek is the cheapest.
- Default models: `gpt-5`, `deepseek-chat` and `claude-opus-5-5`. You can type another model name.

What happens to your data:
- On the desktop app, the key is encrypted with the system keychain (macOS Keychain, Windows DPAPI, Linux secret store). Only the desktop process reads it; the app window has no network access.
- On the tablet version, the key is stored in the browser's storage on that device and sent only to the provider you chose.
- Each request sends your description, a summary of the composition, the recipe instructions and the photo if you attached one. Nothing is sent until you click **Créer**.
- If recipes come back with problems, the app sends the errors back once so the model can fix them.

## 3. Local agents through MCP (advanced)

This needs the desktop app. It is for assistants installed on the same computer that can drive applications through the [Model Context Protocol](https://modelcontextprotocol.io): Claude Desktop, Claude Code, Codex and similar tools. ChatGPT and DeepSeek in a browser or on a phone cannot connect this way; use route 1 for them.

1. In the **Agents locaux** tab, turn on **Autoriser les assistants de cet ordinateur**.
2. Copy the configuration shown for your tool. It contains the right paths for your computer:
   - **Claude Code**: a `claude mcp add wallersketch …` command to run once in a terminal.
   - **Claude Desktop**: a block to merge into `claude_desktop_config.json` (Settings → Developer → Edit Config), then restart Claude.
   - **Codex**: a block to add to `~/.codex/config.toml`.
3. Keep WallerSketch open and ask, for example: *"In WallerSketch, build a champagne bar with a five-level coupe tower and two gold stepped presentoirs of kir royal."*

With the default install location on macOS, the Claude Desktop configuration looks like this:

```json
{
  "mcpServers": {
    "wallersketch": {
      "command": "/Applications/WallerSketch.app/Contents/MacOS/WallerSketch",
      "args": ["/Applications/WallerSketch.app/Contents/Resources/mcp.cjs"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

On Windows, the command is usually `%LOCALAPPDATA%\Programs\WallerSketch\WallerSketch.exe` and the script `%LOCALAPPDATA%\Programs\WallerSketch\resources\mcp.cjs`. The app shows the exact values for your installation.

| Tool | Purpose |
|---|---|
| `get_context` | Recipe instructions, current scene and personal library. Agents call it first. |
| `get_scene` | Every object with its id, type, position and size in cm, and what it stands on. |
| `create_assets` | Checks recipes and adds them to the library, or returns the exact problems. |
| `add_to_scene` | Places an asset or a saved composition, optionally on an object; `count` and `columns` make a grid of glasses. |
| `update_items` | Size, colour, drink colours, position, rotation, name. |
| `remove_items` | Deletes objects and what stands on them. |
| `render_view` | Returns an image of a view so the agent can check its work. |
| `new_scene`, `undo` | Start again, or step back. |

The bridge is off by default. When it is on, it only listens on a socket private to your user account (a Unix socket readable only by you on macOS and Linux, a per-user named pipe on Windows), every request must carry a random token stored in your data folder, and it only accepts the commands above: no file access and no network.
