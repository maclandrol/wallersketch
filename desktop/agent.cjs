// Local bridge for AI assistants running on the same computer (Claude Desktop, Claude Code,
// Codex…). They start desktop/mcp.cjs, which connects here. Off until the operator enables it.
// Requests carry a random token stored in the user's data folder; the socket is user-only.
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function socketPath(userData) {
  if (process.platform === 'win32') return '\\\\.\\pipe\\wallersketch-' + crypto.createHash('sha1').update(userData).digest('hex').slice(0, 12);
  return path.join(userData, 'agent.sock');
}

class AgentServer {
  constructor(userData, forward) {
    this.userData = userData;
    this.forward = forward; // (method, params) => Promise<result>
    this.server = null;
    this.onActivity = () => {};
  }

  get infoFile() { return path.join(this.userData, 'agent.json'); }

  start() {
    if (this.server) return;
    const token = crypto.randomBytes(24).toString('hex'), sock = socketPath(this.userData);
    if (process.platform !== 'win32') fs.rmSync(sock, {force: true});
    this.token = token;
    this.server = net.createServer(conn => {
      let buffer = '';
      conn.setEncoding('utf8');
      conn.on('data', chunk => {
        buffer += chunk;
        if (buffer.length > 50 * 1024 * 1024) return conn.destroy();
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1);
          this.handle(line).then(reply => conn.write(JSON.stringify(reply) + '\n'));
        }
      });
      conn.on('error', () => {});
    });
    this.server.listen(sock, () => {
      if (process.platform !== 'win32') fs.chmodSync(sock, 0o600);
      fs.writeFileSync(this.infoFile, JSON.stringify({socket: sock, token}), {mode: 0o600});
    });
  }

  stop() {
    this.server?.close();
    this.server = null;
    fs.rmSync(this.infoFile, {force: true});
  }

  async handle(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return {error: 'Invalid JSON'}; }
    const id = msg.id;
    if (typeof msg.token !== 'string' || msg.token.length !== this.token.length || !crypto.timingSafeEqual(Buffer.from(msg.token), Buffer.from(this.token))) return {id, error: 'Unauthorised'};
    if (typeof msg.method !== 'string') return {id, error: 'Missing method'};
    this.onActivity(msg.method);
    try { return {id, result: await this.forward(msg.method, msg.params ?? {})}; }
    catch (e) { return {id, error: String(e?.message ?? e)}; }
  }
}

/** How each MCP client should launch the bridge: the app's own runtime runs mcp.cjs as Node. */
function connectionInfo(app, userData) {
  const script = app.isPackaged ? path.join(process.resourcesPath, 'mcp.cjs') : path.join(__dirname, 'mcp.cjs');
  const command = process.execPath, args = [script, '--user-data', userData], env = {ELECTRON_RUN_AS_NODE: '1'};
  const q = s => (/[\s"]/.test(s) ? JSON.stringify(s) : s);
  return {
    command, args, env,
    claudeDesktop: JSON.stringify({mcpServers: {wallersketch: {command, args, env}}}, null, 2),
    claudeCode: `claude mcp add wallersketch --env ELECTRON_RUN_AS_NODE=1 -- ${[command, ...args].map(q).join(' ')}`,
    codex: `[mcp_servers.wallersketch]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\nenv = { ELECTRON_RUN_AS_NODE = "1" }`,
  };
}

module.exports = {AgentServer, connectionInfo, socketPath};
