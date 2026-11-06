#!/usr/bin/env node
// WallerSketch MCP server (stdio). Exposes the open composition to MCP clients such as Claude
// Desktop, Claude Code or Codex. It forwards each tool call to the running app through the
// local bridge; the app must be open with "Assistants locaux" enabled.
// Run with the app's runtime: ELECTRON_RUN_AS_NODE=1 <WallerSketch executable> mcp.cjs --user-data <dir>
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');

const argIndex = process.argv.indexOf('--user-data');
const defaultData = process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'WallerSketch')
  : process.platform === 'win32' ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'WallerSketch')
  : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'WallerSketch');
const userData = argIndex > 0 ? process.argv[argIndex + 1] : defaultData;

function callApp(method, params) {
  return new Promise((resolve, reject) => {
    let info;
    try { info = JSON.parse(fs.readFileSync(path.join(userData, 'agent.json'), 'utf8')); }
    catch { return reject(new Error('WallerSketch is not reachable. Open the app and enable "Assistants locaux" in the Assistant panel.')); }
    const conn = net.createConnection(info.socket);
    let buffer = '';
    conn.setEncoding('utf8');
    conn.on('connect', () => conn.write(JSON.stringify({id: 1, token: info.token, method, params}) + '\n'));
    conn.on('data', d => {
      buffer += d;
      const nl = buffer.indexOf('\n');
      if (nl < 0) return;
      conn.end();
      const reply = JSON.parse(buffer.slice(0, nl));
      reply.error ? reject(new Error(reply.error)) : resolve(reply.result);
    });
    conn.on('error', () => reject(new Error('WallerSketch is not running, or its assistant bridge is off.')));
    conn.setTimeout(180000, () => { conn.destroy(); reject(new Error('WallerSketch did not answer in time.')); });
  });
}

const object = (properties, required = []) => ({type: 'object', properties, required, additionalProperties: false});
const num = d => ({type: 'number', description: d});
const TOOLS = [
  {name: 'get_context', method: 'context', description: 'Start here. Returns the asset recipe format (units, kinds, allowed values, catalogue refs), the current scene and the personal library.', inputSchema: object({})},
  {name: 'get_scene', method: 'scene', description: 'Lists every object in the open composition with id, type, position (cm), size (cm) and what it stands on.', inputSchema: object({})},
  {name: 'create_assets', method: 'create_assets', description: 'Validates recipes (see get_context) and adds them to the personal library: tables, presentoirs, fabrics, glasses, cocktails, decor, or whole compositions. Returns the new refs, or the exact problems to fix.', inputSchema: object({recipes: {type: 'array', items: {type: 'object'}, description: 'Recipe objects, each with "kind" and "name".'}}, ['recipes'])},
  {name: 'add_to_scene', method: 'add', description: 'Places a catalogue or library asset (ref) or a saved composition (id). Objects settle on whatever is under them. For glasses and cocktails, count/columns create a grid in one undoable step.', inputSchema: object({asset: {type: 'string'}, on: {type: 'string', description: 'Item id of the table or presentoir to stand on.'}, x_cm: num('Position, right of centre.'), z_cm: num('Position, towards the guests.'), rotation_deg: num('Turn about the vertical axis.'), count: num('Number of glasses (grid).'), columns: num('Glasses per row.'), gap_cm: num('Clear space between glasses.')}, ['asset'])},
  {name: 'update_items', method: 'update', description: 'Changes objects: size_cm [width, height, depth], color (#rrggbb), colors (drink layers bottom→surface), x_cm, z_cm, rotation_deg, name.', inputSchema: object({ids: {type: 'array', items: {type: 'string'}}, size_cm: {type: 'array', items: {type: 'number'}}, color: {type: 'string'}, colors: {type: 'array', items: {type: 'string'}}, x_cm: {type: 'number'}, z_cm: {type: 'number'}, rotation_deg: {type: 'number'}, name: {type: 'string'}}, ['ids'])},
  {name: 'remove_items', method: 'remove', description: 'Deletes objects and everything standing on them (undoable).', inputSchema: object({ids: {type: 'array', items: {type: 'string'}}}, ['ids'])},
  {name: 'render_view', method: 'render', description: 'Renders the composition so you can check your work. view: perspective | front | top | side | the name of a saved view.', inputSchema: object({view: {type: 'string'}, width: {type: 'number'}, height: {type: 'number'}})},
  {name: 'new_scene', method: 'new_scene', description: 'Starts an empty composition (the operator is asked to save unsaved work first in the app).', inputSchema: object({name: {type: 'string'}})},
  {name: 'undo', method: 'undo', description: 'Undoes the last change.', inputSchema: object({})},
];

const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const rl = readline.createInterface({input: process.stdin});
rl.on('line', async line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const {id, method, params} = msg;
  if (id === undefined) return; // notifications
  try {
    if (method === 'initialize') return send({jsonrpc: '2.0', id, result: {protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'wallersketch', version: '2.0.0'}, instructions: 'Call get_context first. Lengths are in centimetres. Render the view after changes to check the result.'}});
    if (method === 'ping') return send({jsonrpc: '2.0', id, result: {}});
    if (method === 'tools/list') return send({jsonrpc: '2.0', id, result: {tools: TOOLS.map(({method: _m, ...t}) => t)}});
    if (method === 'tools/call') {
      const tool = TOOLS.find(t => t.name === params?.name);
      if (!tool) return send({jsonrpc: '2.0', id, error: {code: -32602, message: 'Unknown tool'}});
      try {
        const result = await callApp(tool.method, params.arguments ?? {});
        const content = result?.png ? [{type: 'image', data: result.png, mimeType: 'image/png'}] : [{type: 'text', text: JSON.stringify(result, null, 1)}];
        return send({jsonrpc: '2.0', id, result: {content, isError: !!(result?.errors?.length && !result?.created?.length)}});
      } catch (e) {
        return send({jsonrpc: '2.0', id, result: {content: [{type: 'text', text: e.message}], isError: true}});
      }
    }
    send({jsonrpc: '2.0', id, error: {code: -32601, message: 'Method not found'}});
  } catch (e) {
    send({jsonrpc: '2.0', id, error: {code: -32603, message: String(e?.message ?? e)}});
  }
});
