// Runs cloth settling off the main thread so editing stays responsive.
import { drape, type DrapeInput } from '../core/drape';

self.onmessage = (e: MessageEvent<{ id: number; fabric: string; key: string; input: DrapeInput }>) => {
  const { id, fabric, key, input } = e.data;
  try {
    const r = drape(input);
    (self as unknown as Worker).postMessage({ id, fabric, key, result: r }, [r.positions.buffer, r.uvs.buffer, r.indices.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, fabric, key, error: String((err as Error)?.message ?? err) });
  }
};
