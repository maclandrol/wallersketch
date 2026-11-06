// The narrow bridge between the window and the desktop. No Node.js APIs reach the page.
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('native', {
  save: (data, saveAs) => ipcRenderer.invoke('project:save', data, saveAs),
  open: () => ipcRenderer.invoke('project:open'),
  loaded: filePath => ipcRenderer.send('project:loaded', filePath),
  setDirty: dirty => ipcRenderer.send('project:dirty', dirty),
  autosave: data => ipcRenderer.invoke('project:autosave', data),
  recover: () => ipcRenderer.invoke('project:recover'),
  discardRecovery: () => ipcRenderer.invoke('project:discardRecovery'),
  importFile: kind => ipcRenderer.invoke('asset:import', kind),
  exportFiles: (files, folder) => ipcRenderer.invoke('export:files', files, folder),
  reveal: target => ipcRenderer.invoke('export:reveal', target),
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  saveLibrary: data => ipcRenderer.invoke('library:save', data),
  info: () => ipcRenderer.invoke('app:info'),
  onMenu: fn => ipcRenderer.on('menu', (_e, action) => fn(action)),
  copy: text => ipcRenderer.invoke('clipboard:write', text),
  agentInfo: () => ipcRenderer.invoke('agent:info'),
  agentEnable: on => ipcRenderer.invoke('agent:enable', on),
  onAgentRequest: fn => ipcRenderer.on('agent:request', async (_e, req) => {
    try { ipcRenderer.send('agent:response', {id: req.id, result: await fn(req.method, req.params)}); }
    catch (err) { ipcRenderer.send('agent:response', {id: req.id, error: String(err?.message ?? err)}); }
  }),
  onAgentActivity: fn => ipcRenderer.on('agent:activity', (_e, method) => fn(method)),
  assistantKeys: () => ipcRenderer.invoke('assistant:keys'),
  assistantSetKey: (provider, key) => ipcRenderer.invoke('assistant:setKey', provider, key),
  assistantAsk: request => ipcRenderer.invoke('assistant:ask', request),
  convertCAD: (base64, ext) => ipcRenderer.invoke('cad:convert', base64, ext),
});
