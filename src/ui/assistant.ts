// Assistant panel: create assets from a description, three ways:
//  1. Discussion: copy the request into ChatGPT, DeepSeek or any chat and paste the answer
//     back (no key, works with the free web and phone apps);
//  2. API key: the app asks Claude, ChatGPT or DeepSeek directly;
//  3. local agents (Claude Desktop, Claude Code, Codex) through the MCP server.
import type { Editor, Provider } from '../editor';
import { compileRecipe, parseRecipes, previewItem, RecipeError, recipeGuide, type Compiled } from '../core/recipes';
import { registerGlass } from '../core/glassware';
import { thumbnail } from '../render/thumbnails';
import { sceneSummary } from '../agent';
import { button, h, modal, toast } from './dom';
import { icon } from './icons';

type Tab = 'chat' | 'api' | 'local';
let lastTab: Tab = 'chat';
let chatDraft = '';

const CHATS = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
  { name: 'Claude', url: 'https://claude.ai/new' },
];
const KEY_PAGES: Record<string, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
};
let history: { role: 'user' | 'assistant'; text: string; image?: string }[] = [];

function request(description: string, ed: Editor) {
  return `${description}\n\nComposition actuelle (pour le contexte) :\n${JSON.stringify(sceneSummary(ed))}\n\nRéponds avec { "recipes": [...] } dans un bloc \`\`\`json, en français pour les noms.`;
}

export function openAssistant(ed: Editor) {
  const body = h('div', { class: 'assistant' });
  const tabs = h('div', { class: 'segmented', style: 'margin-bottom:14px' });
  const pane = h('div');
  body.append(tabs, pane);
  const close = modal('Assistant de création', body, [], { wide: true });
  const show = (t: Tab) => {
    lastTab = t;
    tabs.replaceChildren(...([['chat', 'ChatGPT, DeepSeek…'], ['api', 'Clé API'], ['local', 'Agents locaux']] as const).map(([id, label]) =>
      h('button', { type: 'button', class: 'seg' + (t === id ? ' on' : ''), onClick: () => show(id) }, label)));
    pane.replaceChildren(t === 'chat' ? chatPane(ed, close) : t === 'api' ? askPane(ed, close) : localPane(ed));
  };
  show(lastTab);
}

/** Preview compiled recipes; the operator chooses to keep them, place them, or not. */
function results(ed: Editor, compiled: Compiled[], errors: string[], close: () => void) {
  const box = h('div', { class: 'recipe-results' });
  if (errors.length) {
    box.append(h('div', { class: 'note warn' }, errors.slice(0, 6).join(' ')));
    // For chat apps: one click prepares the follow-up message for the same conversation.
    box.append(h('div', { style: 'margin:6px 0 4px' }, button('Copier les corrections pour l’assistant', { icon: 'duplicate', class: 'small outline', onClick: async () => {
      await ed.native.copy('Certaines recettes ne sont pas valides. Corrige ces problèmes et renvoie toutes les recettes dans un bloc ```json :\n- ' + errors.join('\n- '));
      toast('Collez ce message dans la même discussion, puis copiez la nouvelle réponse', 'ok');
    } })));
  }
  const entries = compiled.flatMap(c => c.entries);
  const arrangements = compiled.map(c => c.arrangement).filter(Boolean);
  if (!entries.length && !arrangements.length) return box;
  const grid = h('div', { class: 'cards', style: 'padding:8px 0' });
  // Glass profiles are needed to draw the previews; entries join the library only if kept.
  for (const c of compiled) for (const g of c.glasses) registerGlass(g);
  for (const e of entries) {
    const thumb = h('div', { class: 'thumb' }, h('div', { class: 'ph' }));
    grid.append(h('div', { class: 'card' }, thumb, h('div', { class: 'meta' }, h('div', { class: 'name' }, e.name), h('div', { class: 'sub' }, e.family))));
    thumbnail('preview:' + e.ref, previewItem(e), false).then(url => thumb.replaceChildren(h('img', { src: url, alt: '' })));
  }
  for (const a of arrangements) grid.append(h('div', { class: 'card' }, h('div', { class: 'thumb' }, icon('layers', 30)), h('div', { class: 'meta' }, h('div', { class: 'name' }, a!.name), h('div', { class: 'sub' }, `${a!.items.length} objets`))));
  box.append(grid, h('div', { style: 'display:flex;gap:8px;justify-content:flex-end' },
    button('Garder dans la bibliothèque', { class: 'outline', onClick: async () => { for (const c of compiled) await ed.addToLibrary(c); toast('Ajouté à la bibliothèque', 'ok'); close(); } }),
    button('Placer dans la scène', { class: 'primary', onClick: async () => {
      for (const c of compiled) await ed.addToLibrary(c);
      for (const c of compiled) { if (c.arrangement) ed.addArrangement(c.arrangement); else for (const e of c.entries) ed.add(e.ref); }
      close();
    } })));
  return box;
}

function compileAll(text: string): { compiled: Compiled[]; errors: string[] } {
  const compiled: Compiled[] = [], errors: string[] = [];
  let recipes: unknown[];
  try { recipes = parseRecipes(text); } catch (e) { return { compiled, errors: e instanceof RecipeError ? e.problems : [String(e)] }; }
  for (const r of recipes) {
    try { compiled.push(compileRecipe(r)); } catch (e) { errors.push(...(e instanceof RecipeError ? e.problems : [String(e)])); }
  }
  return { compiled, errors };
}

function askPane(ed: Editor, close: () => void): HTMLElement {
  const el = h('div', { class: 'stack' });
  const provider = h('select', { class: 'select' }, h('option', { value: 'openai' }, 'ChatGPT (OpenAI)'), h('option', { value: 'deepseek' }, 'DeepSeek'), h('option', { value: 'anthropic' }, 'Claude (Anthropic)'));
  const model = h('input', { class: 'select', placeholder: 'Modèle', spellcheck: false });
  const keyRow = h('div');
  const prompt = h('textarea', { class: 'prompt', rows: 4, placeholder: 'Ex. : « Un présentoir en gradins miroir pour 24 flûtes, et un cocktail “Rose impériale” rose et or dans une coupe en cristal »' });
  let image: string | undefined;
  const attach = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' });
  const attachLabel = h('span', { class: 'hint' });
  attach.addEventListener('change', () => {
    const f = attach.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast('Image limitée à 5 Mo', 'error'); return; }
    const r = new FileReader();
    r.onload = () => { image = String(r.result); attachLabel.textContent = f.name; };
    r.readAsDataURL(f);
  });
  const out = h('div');
  const attachRow = h('div', { style: 'display:flex;gap:8px;align-items:center' }, button('Joindre une photo…', { icon: 'image', class: 'small', onClick: () => attach.click() }), attach, attachLabel);
  const send = button('Créer', { class: 'primary', icon: 'mine' });
  const refreshKeys = async () => {
    const k = await ed.native.assistantKeys();
    const p = provider.value as Provider;
    if (!model.value || model.dataset.auto) { model.value = k.chosen.provider === p && k.chosen.model ? k.chosen.model : k.models[p]; model.dataset.auto = '1'; }
    const input = h('input', { class: 'select', type: 'password', placeholder: { anthropic: 'Clé API Claude (sk-ant-…)', openai: 'Clé API OpenAI (sk-…)', deepseek: 'Clé API DeepSeek (sk-…)' }[p], style: 'flex:1' });
    keyRow.replaceChildren(k[p]
      ? h('div', { class: 'note', style: 'margin:0;display:flex;gap:8px;align-items:center' }, icon('lock', 14), 'Clé enregistrée, chiffrée par le système.', button('Changer', { class: 'small', onClick: async () => { await ed.native.assistantSetKey(p, ''); refreshKeys(); } }))
      : h('div', { class: 'stack', style: 'gap:6px' },
        h('div', { style: 'display:flex;gap:6px' }, input, button('Enregistrer', { class: 'outline', onClick: async () => { try { await ed.native.assistantSetKey(p, input.value); refreshKeys(); } catch (e) { toast(String((e as Error).message), 'error'); } } })),
        h('div', { class: 'hint' }, 'Une clé API se crée sur le site du fournisseur et se paie à l’usage, séparément de l’abonnement ChatGPT. ', h('a', { href: '#', onClick: (e: Event) => { e.preventDefault(); ed.native.openExternal(KEY_PAGES[p]); } }, 'Créer une clé'), '. Sans clé, utilisez l’onglet « ChatGPT, DeepSeek… ».')));
    attachRow.style.display = p === 'deepseek' ? 'none' : 'flex';
  };
  provider.addEventListener('change', () => { model.dataset.auto = '1'; model.value = ''; refreshKeys(); });
  model.addEventListener('input', () => delete model.dataset.auto);
  ed.native.assistantKeys().then(k => { if (k.chosen.provider) provider.value = k.chosen.provider; refreshKeys(); });
  send.addEventListener('click', async () => {
    if (!prompt.value.trim()) return;
    send.disabled = true;
    out.replaceChildren(h('div', { class: 'pill', style: 'box-shadow:none' }, h('span', { class: 'dot' }), 'L’assistant prépare les éléments…'));
    const system = recipeGuide();
    history = [{ role: 'user', text: request(prompt.value.trim(), ed), image: provider.value === 'deepseek' ? undefined : image }];
    try {
      let answer = await ed.native.assistantAsk({ provider: provider.value, model: model.value.trim() || undefined, system, messages: history });
      let r = compileAll(answer);
      // One repair round: send back the exact problems so the model can fix its recipes.
      if (r.errors.length) {
        history.push({ role: 'assistant', text: answer }, { role: 'user', text: 'Corrige ces problèmes et renvoie toutes les recettes : ' + r.errors.join(' ') });
        answer = await ed.native.assistantAsk({ provider: provider.value, model: model.value.trim() || undefined, system, messages: history });
        r = compileAll(answer);
      }
      out.replaceChildren(results(ed, r.compiled, r.errors, close));
    } catch (e) {
      out.replaceChildren(h('div', { class: 'note warn' }, String((e as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')));
    } finally { send.disabled = false; }
  });
  el.append(
    h('div', { class: 'fields two' }, h('div', { class: 'field' }, h('span', { class: 'num-label' }, 'Assistant'), provider), h('div', { class: 'field' }, h('span', { class: 'num-label' }, 'Modèle'), model)),
    keyRow, prompt,
    h('div', { style: 'display:flex;gap:8px;align-items:center' }, attachRow, h('span', { style: 'flex:1' }), send),
    h('div', { class: 'hint' }, 'La description, la composition actuelle et la photo éventuelle sont envoyées au fournisseur choisi. Rien n’est envoyé sans votre clic.'),
    out);
  return el;
}

function chatPane(ed: Editor, close: () => void): HTMLElement {
  const el = h('div', { class: 'stack' });
  const what = h('textarea', { class: 'prompt', rows: 3, placeholder: 'Ex. : « Un bar à champagne doré pour 80 invités, avec une pyramide de coupes et des gradins pour les flûtes »', value: chatDraft });
  what.addEventListener('input', () => (chatDraft = what.value));
  const answer = h('textarea', { class: 'prompt', rows: 5, placeholder: 'La réponse de l’assistant apparaît ici (ou collez-la).' });
  const out = h('div');
  const copyRequest = async () => {
    await ed.native.copy(recipeGuide() + '\n\n---\n\n' + request(what.value.trim() || 'Propose des éléments adaptés à cette composition.', ed));
  };
  const read = (text: string) => { answer.value = text; const r = compileAll(text); out.replaceChildren(results(ed, r.compiled, r.errors, close)); };
  const step = (n: number, title: string, ...body: (Node | string)[]) => h('div', { class: 'chat-step' }, h('span', { class: 'chat-num' }, String(n)), h('div', { class: 'stack', style: 'gap:8px;flex:1' }, h('strong', null, title), ...body));
  el.append(
    step(1, 'Décrivez ce que vous voulez', what),
    step(2, 'Envoyez la demande à l’assistant',
      h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        ...CHATS.map(c => button(`Copier et ouvrir ${c.name}`, { class: c.name === 'ChatGPT' ? 'primary small' : 'outline small', onClick: async () => { await copyRequest(); await ed.native.openExternal(c.url); toast(`Demande copiée : collez-la dans ${c.name} (${platformPaste()})`, 'ok'); } })),
        button('Copier seulement', { class: 'small', icon: 'duplicate', onClick: async () => { await copyRequest(); toast('Demande copiée', 'ok'); } })),
      h('div', { class: 'hint' }, 'Collez la demande dans une nouvelle discussion et envoyez-la. Elle contient le mode d’emploi pour l’assistant et votre composition actuelle.')),
    step(3, 'Rapportez la réponse',
      h('div', { class: 'hint' }, 'Dans l’assistant, copiez toute la réponse (bouton « Copier » sous le message), puis :'),
      h('div', { style: 'display:flex;gap:6px' },
        button('Coller la réponse', { class: 'primary small', icon: 'import', onClick: async () => { const text = await ed.native.paste(); if (!text.trim()) { toast('Le presse-papiers est vide', 'error'); return; } read(text); } }),
        button('Lire le texte ci-dessous', { class: 'small', onClick: () => read(answer.value) })),
      answer),
    out);
  return el;
}

const platformPaste = () => (navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl+V');

function localPane(ed: Editor): HTMLElement {
  const el = h('div', { class: 'stack' });
  ed.native.agentInfo().then(info => {
    const sw = h('input', { type: 'checkbox', class: 'switch', checked: info.enabled });
    sw.addEventListener('change', async () => { await ed.native.agentEnable(sw.checked); toast(sw.checked ? 'Assistants locaux autorisés' : 'Assistants locaux désactivés'); });
    const snippet = (title: string, text: string, where: string) => h('div', { class: 'snippet' },
      h('div', { class: 'label-row' }, h('strong', null, title), button('Copier', { class: 'small', onClick: async () => { await ed.native.copy(text); toast('Copié', 'ok'); } })),
      h('pre', null, text), h('div', { class: 'hint' }, where));
    el.replaceChildren(
      h('div', { class: 'note', style: 'margin:0' }, 'Pour les assistants installés sur cet ordinateur qui savent piloter des applications (protocole MCP).'),
      h('label', { class: 'toggle', style: 'padding:6px 0' }, h('span', null, h('strong', null, 'Autoriser les assistants de cet ordinateur'), h('div', { class: 'hint' }, 'Claude Desktop, Claude Code ou Codex pourront lire et modifier la composition ouverte (chaque modification reste annulable).')), sw),
      snippet('Claude Code', info.claudeCode, 'À exécuter une fois dans un terminal.'),
      snippet('Claude Desktop', info.claudeDesktop, 'À fusionner dans claude_desktop_config.json (Réglages → Développeur → Modifier la configuration), puis relancer Claude.'),
      snippet('Codex', info.codex, 'À ajouter à ~/.codex/config.toml.'),
      h('div', { class: 'hint' }, 'ChatGPT et DeepSeek dans le navigateur ou sur téléphone ne peuvent pas se connecter ici : utilisez l’onglet « ChatGPT, DeepSeek… ».'),
      h('div', { class: 'hint' }, 'Ensuite, demandez par exemple : « Dans WallerSketch, crée un bar à champagne avec une pyramide de coupes et deux présentoirs en gradins dorés. »'));
  });
  return el;
}
