// Browser implementation of the desktop bridge, for the tablet / web version. Projects open
// and save through the system file picker and share sheet, everything else lives in IndexedDB
// on the device. Local agents (MCP) and CAD conversion need the desktop app.
import type { AgentInfo, CADMesh, Native, Provider } from '../editor';
import type { EmbeddedAsset } from '../core/types';

const DB = 'wallersketch';
function store<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('kv', mode), req = fn(tx.objectStore('kv'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => open.result.close();
    };
  });
}
const get = <T>(key: string) => store<T | undefined>('readonly', s => s.get(key) as IDBRequest<T | undefined>);
const put = (key: string, value: unknown) => store('readwrite', s => s.put(value, key));
const del = (key: string) => store('readwrite', s => s.delete(key));

/** Let the person pick one file. Resolves null if the picker is dismissed. */
function pick(accept?: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

const toBase64 = (f: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
  r.onerror = () => reject(r.error);
  r.readAsDataURL(f);
});

/** Save or share files: the share sheet on tablets (Files, Photos, AirDrop…), downloads elsewhere. */
async function deliver(files: File[], share = true): Promise<boolean> {
  if (share && navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); return true; }
    catch (e) { if ((e as Error).name === 'AbortError') return false; }
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  }
  return true;
}

const safeName = (s: string) => s.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 90) || 'WallerSketch';

function dataToFile(name: string, data: string): File {
  if (data.startsWith('<svg')) return new File([data], safeName(name) + '.svg', { type: 'image/svg+xml' });
  const [head, b64] = data.split(',');
  const mime = /^data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const ext = { 'image/png': '.png', 'model/gltf-binary': '.glb', 'model/vnd.usdz+zip': '.usdz', 'text/plain': '.obj' }[mime] ?? '';
  return new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], safeName(name) + ext, { type: mime });
}

const MODEL_EXT = ['glb', 'gltf', 'obj', 'stl', 'ply', '3mf', 'dae', 'fbx'];
const MAX_IMPORT = 80 * 1024 * 1024;

async function checkImport(f: File, kind: 'model' | 'texture'): Promise<EmbeddedAsset> {
  if (f.size > MAX_IMPORT) throw new Error('Import limité à 80 Mo par fichier.');
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  let mime = 'application/octet-stream';
  if (kind === 'model') {
    if (ext === 'step' || ext === 'stp' || ext === 'iges' || ext === 'igs') throw new Error('Les fichiers STEP et IGES s’importent dans l’application de bureau. Exportez-les en GLB pour la tablette.');
    if (!MODEL_EXT.includes(ext)) throw new Error('Formats acceptés : GLB, glTF, OBJ, STL, PLY, 3MF, DAE, FBX.');
    const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
    if (ext === 'glb') { if (String.fromCharCode(...head) !== 'glTF') throw new Error('Fichier GLB invalide.'); mime = 'model/gltf-binary'; }
    if (ext === 'gltf') {
      const json = JSON.parse(await f.text());
      for (const r of [...(json.buffers ?? []), ...(json.images ?? [])]) if (r.uri && !String(r.uri).startsWith('data:')) throw new Error('Utilisez un GLB ou un glTF avec toutes ses ressources intégrées.');
      mime = 'model/gltf+json';
    }
  } else {
    if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) throw new Error('Choisissez une image PNG, JPEG ou WebP.');
    const bmp = await createImageBitmap(f).catch(() => { throw new Error('L’image est illisible.'); });
    if (bmp.width > 8192 || bmp.height > 8192 || bmp.width * bmp.height > 32e6) throw new Error('Texture limitée à 8 192 pixels par côté et 32 mégapixels.');
    bmp.close();
    mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  }
  return { id: crypto.randomUUID(), name: f.name, type: kind, mime, data: await toBase64(f) };
}

const PROVIDERS: Provider[] = ['anthropic', 'openai', 'deepseek'];
const MODELS: Record<Provider, string> = { anthropic: 'claude-opus-5-5', openai: 'gpt-5', deepseek: 'deepseek-chat' };
const NAMES: Record<Provider, string> = { anthropic: 'Claude', openai: 'OpenAI', deepseek: 'DeepSeek' };

async function keyStatus() {
  const keys = (await get<Record<string, string>>('keys')) ?? {};
  return Object.fromEntries(PROVIDERS.map(p => [p, !!keys[p]])) as Record<Provider, boolean>;
}

/** One assistant turn from the browser (all three providers accept direct browser calls). */
async function ask(r: Parameters<Native['assistantAsk']>[0]): Promise<string> {
  const provider = r.provider as Provider;
  const key = ((await get<Record<string, string>>('keys')) ?? {})[provider];
  if (!key) throw new Error('Ajoutez une clé API ' + NAMES[provider] + '.');
  await put('assistant', { provider, model: r.model });
  if (provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    try {
      const response = await client.beta.messages.create({
        model: r.model || MODELS.anthropic,
        max_tokens: 16000,
        // Re-runs on another model server-side if a safety classifier declines.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: r.system, cache_control: { type: 'ephemeral' } }],
        messages: r.messages.map(m => ({ role: m.role, content: m.image ? [imageBlock(m.image), { type: 'text' as const, text: m.text }] : m.text })),
      });
      if (response.stop_reason === 'refusal') throw new Error('La demande a été refusée par le modèle.');
      return response.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n');
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new Error('Clé API Claude refusée.');
      if (e instanceof Anthropic.RateLimitError) throw new Error('Limite de requêtes atteinte, réessayez dans un instant.');
      if (e instanceof Anthropic.APIConnectionError) throw new Error('Pas de connexion à l’API Claude.');
      if (e instanceof Anthropic.APIError) throw new Error(`Erreur de l’API Claude (${e.status}) : ${e.message}`);
      throw e;
    }
  }
  if (provider === 'deepseek' && r.messages.some(m => m.image)) throw new Error('DeepSeek ne lit pas les photos. Retirez la photo ou choisissez Claude ou ChatGPT.');
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: key, baseURL: provider === 'deepseek' ? 'https://api.deepseek.com' : undefined, dangerouslyAllowBrowser: true });
  try {
    const res = await client.chat.completions.create({
      model: r.model || MODELS[provider],
      messages: [{ role: 'system', content: r.system }, ...r.messages.map(m => (m.role === 'assistant'
        ? { role: 'assistant' as const, content: m.text }
        : { role: 'user' as const, content: m.image ? [{ type: 'text' as const, text: m.text }, { type: 'image_url' as const, image_url: { url: m.image } }] : m.text }))],
    });
    return res.choices[0]?.message?.content ?? '';
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401) throw new Error(`Clé API ${NAMES[provider]} refusée.`);
    if (status === 402) throw new Error(`Crédit ${NAMES[provider]} épuisé : rechargez le compte sur le site du fournisseur.`);
    throw new Error(`Erreur de l’API ${NAMES[provider]} : ` + ((e as Error).message ?? e));
  }
}

function imageBlock(dataUrl: string) {
  const [, mime, data] = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl) ?? [];
  if (!data) throw new Error('Image non prise en charge.');
  return { type: 'image' as const, source: { type: 'base64' as const, media_type: mime as 'image/png' | 'image/jpeg' | 'image/webp', data } };
}

const unavailable = () => Promise.reject(new Error('Disponible dans l’application de bureau.'));

export function webNative(): Native {
  let dirty = false;
  addEventListener('beforeunload', e => { if (dirty) e.preventDefault(); });
  let current: string | undefined;
  return {
    web: true,
    async save(data, saveAs) {
      const name = (JSON.parse(data).name as string) || 'Composition';
      const file = new File([data], safeName(saveAs || !current ? name : current.replace(/\.(wsketch|cocktail)$/, '')) + '.wsketch', { type: 'application/json' });
      // A plain download: on an iPad the project lands in Files, under Downloads.
      await deliver([file], false);
      current = file.name;
      await del('recovery');
      return { path: file.name };
    },
    async open() {
      const f = await pick();
      if (!f) return { canceled: true };
      if (f.size > 250 * 1024 * 1024) throw new Error('Projet trop volumineux (250 Mo maximum).');
      current = f.name;
      return { data: await f.text(), path: f.name };
    },
    loaded(path) { current = path; dirty = false; del('recovery').catch(() => {}); },
    setDirty(d) { dirty = d; },
    autosave: data => put('recovery', { project: data, path: current }).then(() => {}),
    async recover() { const r = await get<{ project: string; path?: string }>('recovery'); return r ? { data: r.project, path: r.path } : null; },
    discardRecovery: () => del('recovery').then(() => {}),
    async importFile(kind) {
      const f = await pick(kind === 'texture' ? 'image/png,image/jpeg,image/webp' : undefined);
      return f ? checkImport(f, kind) : null;
    },
    async exportFiles(files) {
      const ok = await deliver(files.map(f => dataToFile(f.name, f.data)));
      return ok ? { count: files.length } : { canceled: true };
    },
    reveal: async () => {},
    loadLibrary: async () => (await get<string>('library')) ?? null,
    saveLibrary: data => put('library', data).then(() => {}),
    onMenu: () => {},
    copy: text => navigator.clipboard.writeText(text),
    paste: () => navigator.clipboard.readText(),
    openExternal: async url => { window.open(url, '_blank', 'noopener'); },
    agentInfo: unavailable as () => Promise<AgentInfo>,
    agentEnable: unavailable,
    onAgentRequest: () => {},
    onAgentActivity: () => {},
    async assistantKeys() { const chosen = (await get<{ provider?: Provider; model?: string }>('assistant')) ?? {}; return { ...(await keyStatus()), models: MODELS, chosen }; },
    async assistantSetKey(provider, key) {
      const keys = (await get<Record<string, string>>('keys')) ?? {};
      if (key.trim()) keys[provider] = key.trim(); else delete keys[provider];
      await put('keys', keys);
      return keyStatus();
    },
    convertCAD: unavailable as () => Promise<CADMesh[]>,
    assistantAsk: ask,
  };
}
