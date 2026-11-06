// Remote assistants (Claude, ChatGPT, DeepSeek) called from the main process with the
// operator's own API key. The window never sees the key and has no network access of its own.
const fs = require('node:fs');
const path = require('node:path');
const {safeStorage} = require('electron');

const PROVIDERS = ['anthropic', 'openai', 'deepseek'];
const DEFAULT_MODELS = {anthropic: 'claude-opus-5-5', openai: 'gpt-5', deepseek: 'deepseek-chat'};
// DeepSeek serves an OpenAI-compatible API.
const BASE_URLS = {deepseek: 'https://api.deepseek.com'};
const NAMES = {anthropic: 'Claude', openai: 'OpenAI', deepseek: 'DeepSeek'};

class Keys {
  constructor(userData) { this.file = path.join(userData, 'assistant-keys.json'); }
  read() { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return {}; } }
  set(provider, key) {
    if (!PROVIDERS.includes(provider)) throw Error('Fournisseur inconnu.');
    const all = this.read();
    if (!key) delete all[provider];
    else {
      if (!safeStorage.isEncryptionAvailable()) throw Error('Le trousseau du système n’est pas disponible pour protéger la clé.');
      all[provider] = safeStorage.encryptString(String(key).trim()).toString('base64');
    }
    fs.writeFileSync(this.file, JSON.stringify(all), {mode: 0o600});
  }
  get(provider) {
    const v = this.read()[provider];
    return v ? safeStorage.decryptString(Buffer.from(v, 'base64')) : null;
  }
  status() { const all = this.read(); return Object.fromEntries(PROVIDERS.map(p => [p, !!all[p]])); }
}

/**
 * One turn: system = the recipe guide, messages = the conversation so far (text, optional
 * image as a data URL). Returns the assistant's text.
 */
async function ask(keys, {provider, model, system, messages}) {
  const key = keys.get(provider);
  if (!key) throw Error('Ajoutez une clé API ' + NAMES[provider] + '.');
  if (provider === 'anthropic') {
    const Anthropic = require('@anthropic-ai/sdk').default;
    const client = new Anthropic({apiKey: key});
    try {
      const response = await client.beta.messages.create({
        model: model || DEFAULT_MODELS.anthropic,
        max_tokens: 16000,
        // Re-runs on another model server-side if a safety classifier declines.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {effort: 'medium'},
        system: [{type: 'text', text: system, cache_control: {type: 'ephemeral'}}],
        messages: messages.map(m => ({role: m.role, content: anthropicContent(m)})),
      });
      if (response.stop_reason === 'refusal') throw Error('La demande a été refusée par le modèle.');
      return response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw Error('Clé API Claude refusée.');
      if (e instanceof Anthropic.RateLimitError) throw Error('Limite de requêtes atteinte, réessayez dans un instant.');
      if (e instanceof Anthropic.APIConnectionError) throw Error('Pas de connexion à l’API Claude.');
      if (e instanceof Anthropic.APIError) throw Error(`Erreur de l’API Claude (${e.status}) : ${e.message}`);
      throw e;
    }
  }
  const OpenAI = require('openai').default;
  const client = new OpenAI({apiKey: key, baseURL: BASE_URLS[provider]});
  if (provider === 'deepseek' && messages.some(m => m.image)) throw Error('DeepSeek ne lit pas les photos. Retirez la photo ou choisissez Claude ou ChatGPT.');
  try {
    const r = await client.chat.completions.create({
      model: model || DEFAULT_MODELS[provider],
      messages: [{role: 'system', content: system}, ...messages.map(m => ({role: m.role, content: openaiContent(m)}))],
    });
    return r.choices[0]?.message?.content ?? '';
  } catch (e) {
    if (e?.status === 401) throw Error(`Clé API ${NAMES[provider]} refusée.`);
    if (e?.status === 402) throw Error(`Crédit ${NAMES[provider]} épuisé : rechargez le compte sur le site du fournisseur.`);
    throw Error(`Erreur de l’API ${NAMES[provider]} : ` + (e?.message ?? e));
  }
}

function anthropicContent(m) {
  if (!m.image) return m.text;
  const [, mime, data] = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(m.image) ?? [];
  if (!data) throw Error('Image non prise en charge.');
  return [{type: 'image', source: {type: 'base64', media_type: mime, data}}, {type: 'text', text: m.text}];
}
function openaiContent(m) {
  return m.image ? [{type: 'text', text: m.text}, {type: 'image_url', image_url: {url: m.image}}] : m.text;
}

module.exports = {Keys, ask, DEFAULT_MODELS, PROVIDERS};
