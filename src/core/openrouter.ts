// OpenRouter: one key for hundreds of models, some of them free. The list is public and changes
// often, so it is read live from the API rather than written into the app.
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface RemoteModel { id: string; name: string; free: boolean; images: boolean; context: number }

/** The API's model list, reduced to what the app needs, free models first then by name. */
export function parseModels(json: unknown): RemoteModel[] {
  const data = (json as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) return [];
  const out: RemoteModel[] = [];
  for (const m of data as { id?: string; name?: string; pricing?: { prompt?: string; completion?: string }; architecture?: { input_modalities?: string[]; output_modalities?: string[] }; context_length?: number }[]) {
    if (typeof m.id !== 'string') continue;
    // Text out only: image and audio generators cannot write recipes.
    if (m.architecture?.output_modalities && !m.architecture.output_modalities.includes('text')) continue;
    const free = m.id.endsWith(':free') || (Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0);
    out.push({ id: m.id, name: m.name || m.id, free, images: !!m.architecture?.input_modalities?.includes('image'), context: m.context_length ?? 0 });
  }
  return out.sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
}

/**
 * Free mode default: OpenRouter's free router, which sends each request to a free model that is
 * available at that moment (individual free models come and go). Failing that, the free model
 * with the largest context, since recipes are long.
 */
export function defaultFreeModel(models: RemoteModel[]): string | undefined {
  if (models.some(m => m.id === 'openrouter/free')) return 'openrouter/free';
  return [...models].filter(m => m.free).sort((a, b) => b.context - a.context)[0]?.id;
}
