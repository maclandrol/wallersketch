// Desktop shell: window, native menus and dialogs, and the only code with filesystem access.
const {app, BrowserWindow, dialog, ipcMain, protocol, Menu, shell, clipboard, utilityProcess} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {MAX_PROJECT, MAX_IMPORT, projectText, readBounded, atomicWrite, validateImport, exportBytes, safeName} = require('./persistence.cjs');
const {AgentServer, connectionInfo} = require('./agent.cjs');
const {Keys, ask, DEFAULT_MODELS, PROVIDERS} = require('./assistant.cjs');

app.setName('WallerSketch');
if (!app.isPackaged && process.env.WALLERSKETCH_USER_DATA && path.isAbsolute(process.env.WALLERSKETCH_USER_DATA)) {
  require('node:fs').mkdirSync(process.env.WALLERSKETCH_USER_DATA, {recursive: true});
  app.setPath('userData', process.env.WALLERSKETCH_USER_DATA);
}
protocol.registerSchemesAsPrivileged([{scheme: 'app', privileges: {standard: true, secure: true, supportFetchAPI: true}}]);

const page = 'app://wallersketch/index.html';
const isMac = process.platform === 'darwin';
const MAX_LIBRARY = 200 * 1024 * 1024;
let win, currentPath, pendingOpen, dirty = false, quitting = false, session = 0;
let saveQueue = Promise.resolve(), autosaveQueue = Promise.resolve();
const userFile = name => path.join(app.getPath('userData'), name);

// Automated checks answer native dialogs from a queue file. Never active in packaged builds.
const testDialogs = !app.isPackaged && process.env.WALLERSKETCH_TEST_DIALOGS;
async function nextAnswer() {
  const queue = JSON.parse(await fs.readFile(testDialogs, 'utf8'));
  const answer = queue.shift();
  await fs.writeFile(testDialogs, JSON.stringify(queue));
  return answer ?? null;
}
const showSave = async options => (testDialogs ? (a => ({canceled: !a, filePath: a}))(await nextAnswer()) : dialog.showSaveDialog(win, options));
const showOpen = async options => (testDialogs ? (a => ({canceled: !a, filePaths: a ? [a] : []}))(await nextAnswer()) : dialog.showOpenDialog(win, options));

function trusted(event) {
  if (event.sender !== win?.webContents || event.senderFrame !== win?.webContents.mainFrame || event.senderFrame?.url !== page) throw Error('Requête non autorisée.');
}
function handle(channel, fn) { ipcMain.handle(channel, async (event, ...args) => { trusted(event); return fn(...args); }); }
function title() {
  win?.setTitle((currentPath ? path.basename(currentPath).replace(/\.(wsketch|cocktail)$/, '') : 'WallerSketch') + (dirty && !isMac ? ' •' : ''));
  if (isMac) { win?.setDocumentEdited(dirty); win?.setRepresentedFilename(currentPath || ''); }
}
const send = action => () => win?.webContents.send('menu', action);

function menu() {
  const item = (label, accelerator, action) => ({label, accelerator, click: send(action)});
  return Menu.buildFromTemplate([
    ...(isMac ? [{label: app.name, submenu: [{role: 'about', label: 'À propos de WallerSketch'}, {type: 'separator'}, {role: 'hide', label: 'Masquer'}, {role: 'hideOthers', label: 'Masquer les autres'}, {type: 'separator'}, {role: 'quit', label: 'Quitter'}]}] : []),
    {label: 'Fichier', submenu: [
      item('Nouveau…', 'CmdOrCtrl+N', 'new'), item('Ouvrir…', 'CmdOrCtrl+O', 'open'), {type: 'separator'},
      item('Enregistrer', 'CmdOrCtrl+S', 'save'), item('Enregistrer sous…', 'CmdOrCtrl+Shift+S', 'saveAs'), {type: 'separator'},
      item('Importer un modèle 3D…', 'CmdOrCtrl+I', 'importModel'), item('Exporter…', 'CmdOrCtrl+E', 'export'),
      ...(isMac ? [] : [{type: 'separator'}, {role: 'quit', label: 'Quitter'}]),
    ]},
    {label: 'Édition', submenu: [
      item('Annuler', 'CmdOrCtrl+Z', 'undo'), item('Rétablir', isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y', 'redo'), {type: 'separator'},
      {role: 'cut', label: 'Couper'}, {role: 'copy', label: 'Copier'}, {role: 'paste', label: 'Coller'},
      item('Dupliquer', 'CmdOrCtrl+D', 'duplicate'), item('Tout sélectionner', 'CmdOrCtrl+A', 'selectAll'), {type: 'separator'},
      item('Grouper', 'CmdOrCtrl+G', 'group'), item('Dégrouper', 'CmdOrCtrl+Shift+G', 'ungroup'),
    ]},
    {label: 'Affichage', submenu: [
      // Single-key shortcuts (1, 2, 3, F) live in the window so they never fire while typing.
      item('Vue 3/4', undefined, 'view:perspective'), item('Face', undefined, 'view:front'), item('Dessus', undefined, 'view:top'), item('Cadrer', undefined, 'frame'), {type: 'separator'},
      item('Présenter', 'CmdOrCtrl+Enter', 'present'), {type: 'separator'}, {role: 'togglefullscreen', label: 'Plein écran'},
    ]},
    {label: 'Fenêtre', submenu: [{role: 'minimize', label: 'Réduire'}, {role: 'zoom', label: 'Agrandir'}]},
  ]);
}

async function chooseProject() {
  const r = await showOpen({title: 'Ouvrir une composition', properties: ['openFile'], filters: [{name: 'Composition WallerSketch', extensions: ['wsketch', 'cocktail']}]});
  return r.canceled ? undefined : r.filePaths[0];
}

app.whenReady().then(async () => {
  const root = path.resolve(app.getAppPath(), 'dist');
  const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'";
  const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2'};
  protocol.handle('app', async request => {
    const url = new URL(request.url), relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (url.host !== 'wallersketch' || request.method !== 'GET' || !/^[a-zA-Z0-9_./-]+$/.test(relative) || relative.split('/').includes('..')) return new Response('Not found', {status: 404});
    const file = path.resolve(root, relative || 'index.html'), type = types[path.extname(file)];
    if (!file.startsWith(root + path.sep) || !type) return new Response('Not found', {status: 404});
    try { return new Response(await fs.readFile(file), {headers: {'Content-Type': type, 'Content-Security-Policy': csp}}); }
    catch { return new Response('Not found', {status: 404}); }
  });

  win = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1100, minHeight: 700, title: 'WallerSketch', backgroundColor: '#f4f2ee', show: false,
    titleBarStyle: 'hidden', ...(isMac ? {trafficLightPosition: {x: 16, y: 17}} : {titleBarOverlay: {color: '#fbfaf8', symbolColor: '#1d1b18', height: 52}}),
    webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false},
  });
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({action: 'deny'}));
  wc.on('will-navigate', (event, url) => { if (url !== page) event.preventDefault(); });
  wc.session.setPermissionRequestHandler((_c, _p, cb) => cb(false));
  wc.session.setPermissionCheckHandler(() => false);
  wc.session.webRequest.onBeforeRequest({urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*']}, (_d, cb) => cb({cancel: true}));
  win.once('ready-to-show', () => win.show());
  win.on('close', event => {
    if (!dirty || quitting || testDialogs) return;
    event.preventDefault();
    const r = dialog.showMessageBoxSync(win, {type: 'question', message: 'Quitter sans enregistrer ?', detail: 'Les modifications de cette composition seront perdues.', buttons: ['Annuler', 'Quitter sans enregistrer'], defaultId: 0, cancelId: 0, noLink: true});
    if (r === 1) { quitting = true; win.close(); }
  });
  Menu.setApplicationMenu(menu());

  handle('project:save', async (data, saveAs) => {
    const started = session;
    projectText(data);
    let destination = currentPath;
    if (saveAs === true || !destination) {
      const r = await showSave({title: 'Enregistrer la composition', defaultPath: (destination || safeName(JSON.parse(data).name, '.wsketch')).replace(/\.cocktail$/, '.wsketch'), filters: [{name: 'Composition WallerSketch', extensions: ['wsketch']}], properties: ['createDirectory', 'showOverwriteConfirmation']});
      if (r.canceled || !r.filePath) return {canceled: true};
      destination = r.filePath.endsWith('.wsketch') ? r.filePath : r.filePath + '.wsketch';
    }
    saveQueue = saveQueue.catch(() => {}).then(() => atomicWrite(destination, data));
    await saveQueue;
    // A save that finishes after New/Open must not rename the newer document.
    if (started === session) { currentPath = destination; title(); }
    return {path: destination};
  });
  handle('project:open', async () => {
    const chosen = await chooseProject();
    if (!chosen) return {canceled: true};
    const data = projectText((await readBounded(chosen, MAX_PROJECT)).toString('utf8'));
    pendingOpen = chosen;
    return {data, path: chosen};
  });
  ipcMain.on('project:loaded', (event, filePath) => {
    try { trusted(event); } catch { return; }
    if (filePath !== undefined && filePath !== pendingOpen) return;
    session++; currentPath = filePath; pendingOpen = undefined; dirty = false; title();
    autosaveQueue = autosaveQueue.catch(() => {}).then(() => fs.rm(userFile('recovery.wsketch'), {force: true}));
  });
  ipcMain.on('project:dirty', (event, value) => { try { trusted(event); } catch { return; } dirty = value === true; title(); });
  handle('project:autosave', async data => {
    projectText(data);
    autosaveQueue = autosaveQueue.catch(() => {}).then(() => atomicWrite(userFile('recovery.wsketch'), JSON.stringify({path: currentPath ?? null, project: data})));
    await autosaveQueue;
  });
  handle('project:recover', async () => {
    try {
      const raw = JSON.parse((await readBounded(userFile('recovery.wsketch'), MAX_PROJECT + 4096)).toString('utf8'));
      return {data: projectText(raw.project), path: typeof raw.path === 'string' ? raw.path : undefined};
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      return null;
    }
  });
  handle('project:discardRecovery', () => fs.rm(userFile('recovery.wsketch'), {force: true}));

  handle('asset:import', async kind => {
    if (!['model', 'texture'].includes(kind)) throw Error('Type d’import invalide.');
    const r = await showOpen({title: kind === 'model' ? 'Importer un modèle 3D' : 'Choisir une image', properties: ['openFile'], filters: [kind === 'model' ? {name: 'Modèles 3D et CAO', extensions: ['glb', 'gltf', 'obj', 'stl', 'ply', '3mf', 'dae', 'fbx', 'step', 'stp', 'iges', 'igs']} : {name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp']}]});
    if (r.canceled || !r.filePaths[0]) return null;
    return validateImport(r.filePaths[0], await readBounded(r.filePaths[0], MAX_IMPORT), kind);
  });

  handle('export:files', async (files, suggested) => {
    if (!Array.isArray(files) || files.length < 1 || files.length > 100) throw Error('Export limité à 100 fichiers.');
    const out = files.map(exportBytes);
    if (out.length === 1) {
      const ext = out[0].kind;
      const r = await showSave({title: 'Exporter', defaultPath: out[0].name, filters: [{name: {svg: 'Plan SVG', png: 'Image PNG', glb: 'Scène 3D GLB', obj: 'Scène 3D OBJ', usdz: 'Réalité augmentée USDZ'}[ext], extensions: [ext]}], properties: ['createDirectory', 'showOverwriteConfirmation']});
      if (r.canceled || !r.filePath) return {canceled: true};
      const dest = r.filePath.endsWith('.' + ext) ? r.filePath : r.filePath + '.' + ext;
      await atomicWrite(dest, out[0].bytes);
      return {path: dest, count: 1};
    }
    const r = await showOpen({title: 'Choisir le dossier d’export', buttonLabel: 'Exporter ici', properties: ['openDirectory', 'createDirectory']});
    if (r.canceled || !r.filePaths[0]) return {canceled: true};
    const dir = typeof suggested === 'string' && suggested ? path.join(r.filePaths[0], safeName(suggested, '')) : r.filePaths[0];
    await fs.mkdir(dir, {recursive: true});
    const names = new Set();
    for (const f of out) { let n = f.name, k = 2; while (names.has(n.toLowerCase())) n = f.name.replace(/(\.\w+)$/, ` ${k++}$1`); f.name = n; names.add(n.toLowerCase()); }
    for (const f of out) await atomicWrite(path.join(dir, f.name), f.bytes);
    return {path: dir, count: out.length};
  });
  handle('export:reveal', async target => { if (!testDialogs && typeof target === 'string' && path.isAbsolute(target)) shell.showItemInFolder(target); });

  // Personal library shared by all projects: saved arrangements, imported models, custom drinks.
  handle('library:load', async () => {
    try { return (await readBounded(userFile('library.json'), MAX_LIBRARY)).toString('utf8'); }
    catch (e) { return null; }
  });
  handle('library:save', async data => {
    if (typeof data !== 'string' || Buffer.byteLength(data) > MAX_LIBRARY) throw Error('Bibliothèque trop volumineuse.');
    JSON.parse(data);
    await atomicWrite(userFile('library.json'), data);
  });
  handle('app:info', () => ({platform: process.platform, version: app.getVersion()}));

  // STEP/IGES conversion runs in a separate utility process, started on first use.
  let cad, cadSeq = 0;
  const cadJobs = new Map();
  handle('cad:convert', (base64, ext) => new Promise((resolve, reject) => {
    if (!['step', 'stp', 'iges', 'igs'].includes(ext) || typeof base64 !== 'string') return reject(Error('Format CAO invalide.'));
    if (!cad) {
      cad = utilityProcess.fork(path.join(__dirname, 'cad.cjs'), [], {serviceName: 'WallerSketch CAD'});
      cad.on('message', m => { const job = cadJobs.get(m.id); cadJobs.delete(m.id); m.error ? job?.reject(Error(m.error)) : job?.resolve(m.meshes); });
      cad.on('exit', () => { for (const j of cadJobs.values()) j.reject(Error('La conversion CAO s’est arrêtée.')); cadJobs.clear(); cad = null; });
    }
    const id = ++cadSeq;
    cadJobs.set(id, {resolve, reject});
    const bytes = Buffer.from(base64, 'base64');
    cad.postMessage({id, ext, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)});
  }));
  handle('clipboard:write', text => { if (typeof text === 'string' && text.length < 2_000_000) clipboard.writeText(text); });
  handle('clipboard:read', () => clipboard.readText().slice(0, 2_000_000));
  // Only the assistant sites and their API key pages open in the browser.
  const EXTERNAL = new Set(['chatgpt.com', 'chat.deepseek.com', 'claude.ai', 'platform.openai.com', 'platform.deepseek.com', 'console.anthropic.com']);
  handle('open:external', url => { const u = new URL(url); if (u.protocol === 'https:' && EXTERNAL.has(u.hostname)) shell.openExternal(u.toString()); });

  // Assistants. Local ones (MCP) go through a user-only socket, enabled by the operator.
  const settingsFile = userFile('settings.json');
  const settings = (() => { try { return JSON.parse(require('node:fs').readFileSync(settingsFile, 'utf8')); } catch { return {}; } })();
  const saveSettings = () => atomicWrite(settingsFile, JSON.stringify(settings));
  let agentSeq = 0;
  const pendingAgent = new Map();
  const agent = new AgentServer(app.getPath('userData'), (method, params) => new Promise((resolve, reject) => {
    const id = ++agentSeq;
    pendingAgent.set(id, {resolve, reject});
    wc.send('agent:request', {id, method, params});
    setTimeout(() => { if (pendingAgent.delete(id)) reject(Error('No answer from the window.')); }, 120000);
  }));
  agent.onActivity = method => wc.send('agent:activity', method);
  ipcMain.on('agent:response', (event, {id, result, error}) => {
    try { trusted(event); } catch { return; }
    const p = pendingAgent.get(id);
    if (!p) return;
    pendingAgent.delete(id);
    error ? p.reject(Error(error)) : p.resolve(result);
  });
  if (settings.agentEnabled) agent.start();
  handle('agent:info', () => ({enabled: !!settings.agentEnabled, ...connectionInfo(app, app.getPath('userData'))}));
  handle('agent:enable', async on => { settings.agentEnabled = on === true; on === true ? agent.start() : agent.stop(); await saveSettings(); return settings.agentEnabled; });
  app.on('before-quit', () => agent.stop());

  // Remote assistants (Claude, OpenAI) with the operator's key, encrypted by the OS keychain.
  const keys = new Keys(app.getPath('userData'));
  handle('assistant:keys', () => ({...keys.status(), models: DEFAULT_MODELS, chosen: settings.assistant ?? {}}));
  handle('assistant:setKey', (provider, key) => { keys.set(provider, key); return keys.status(); });
  handle('assistant:ask', async request => {
    if (!request || !PROVIDERS.includes(request.provider) || !Array.isArray(request.messages) || typeof request.system !== 'string') throw Error('Requête invalide.');
    settings.assistant = {provider: request.provider, model: request.model || undefined};
    saveSettings();
    return ask(keys, request);
  });

  await win.loadURL(page);
});
app.on('window-all-closed', () => app.quit());
