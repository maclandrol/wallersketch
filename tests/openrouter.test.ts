import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultFreeModel, parseModels } from '../src/core/openrouter';

const sample = { data: [
  { id: 'openai/gpt-5', name: 'GPT-5', pricing: { prompt: '0.00001', completion: '0.00003' }, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, context_length: 400000 },
  { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (free)', pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text'], output_modalities: ['text'] }, context_length: 131072 },
  { id: 'openrouter/free', name: 'Free Models Router', pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, context_length: 200000 },
  { id: 'openrouter/auto', name: 'Auto Router', pricing: { prompt: '-1', completion: '-1' }, context_length: 2000000 },
  { id: 'black-forest/flux', name: 'Flux', pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text'], output_modalities: ['image'] } },
  { name: 'no id' },
] };

test('OpenRouter models: text models only, free ones first, with image support', () => {
  const m = parseModels(sample);
  assert.deepEqual(m.map(x => x.id), ['openrouter/free', 'google/gemma-4-31b-it:free', 'openrouter/auto', 'openai/gpt-5']);
  assert.equal(m.find(x => x.id === 'openrouter/auto')!.free, false);
  assert.equal(m.find(x => x.id === 'openai/gpt-5')!.images, true);
  assert.deepEqual(parseModels({ error: 'down' }), []);
});

test('free mode defaults to the free router, then to the largest free model', () => {
  assert.equal(defaultFreeModel(parseModels(sample)), 'openrouter/free');
  assert.equal(defaultFreeModel(parseModels({ data: sample.data.filter(x => x.id !== 'openrouter/free') })), 'google/gemma-4-31b-it:free');
  assert.equal(defaultFreeModel([]), undefined);
});
