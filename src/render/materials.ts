// Shared materials, keyed by appearance. Identical finishes reuse one material (and one shader).
import * as THREE from 'three';
import type { Finish } from '../core/types';
import { crystalNormal, fabricNormal, importedTexture, sequinNormal, surfaceMap } from './textures';

const cache = new Map<string, THREE.Material>();
const get = <T extends THREE.Material>(key: string, make: () => T): T => (cache.get(key) as T) ?? (cache.set(key, make()).get(key) as T);

export type TextureResolver = (assetId: string) => string | undefined;
let resolveAsset: TextureResolver = () => undefined;
let onTextureLoad = () => {};
export function configureTextures(resolver: TextureResolver, loaded: () => void) { resolveAsset = resolver; onTextureLoad = loaded; }

function assetTexture(texture: string | undefined, f: Finish): THREE.Texture | null {
  if (!texture?.startsWith('asset:')) return null;
  const id = texture.slice(6), url = resolveAsset(id);
  if (!url) return null;
  const base = importedTexture(id, url, onTextureLoad);
  const scale = f.textureScale ?? 1, rot = f.textureRotation ?? 0;
  if (scale === 1 && rot === 0) return base;
  const key = id + scale + '/' + rot;
  const t = transformed.get(key) ?? base.clone();
  t.repeat.set(1 / scale, 1 / scale); t.rotation = (rot * Math.PI) / 180; t.center.set(0.5, 0.5);
  t.source = base.source; t.needsUpdate = true;
  transformed.set(key, t);
  return t;
}
const transformed = new Map<string, THREE.Texture>();

/** Opaque surfaces: tables, risers, decor parts. `uvScale` turns metre UVs into texture tiles. */
export function solid(f: Finish, opts: { side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
  const key = ['solid', f.color, f.roughness ?? 0.5, f.texture ?? '', f.textureScale ?? 1, f.textureRotation ?? 0, f.glow ?? 0, f.metalness ?? 0, opts.side ?? 0].join('|');
  return get(key, () => {
    // Mirror and brass finishes: polished metal that reflects the room.
    const m = new THREE.MeshStandardMaterial({ color: f.color, roughness: f.roughness ?? 0.5, metalness: f.metalness ?? 0, envMapIntensity: f.metalness ? 3.2 : 1, side: opts.side ?? THREE.FrontSide });
    const map = assetTexture(f.texture, f) ?? (f.texture ? surfaceMap(f.texture) : null);
    if (map) m.map = map;
    if (f.glow) { m.emissive = new THREE.Color(f.color); m.emissiveIntensity = f.glow * 0.9; }
    return m;
  });
}

/** Metals keep some diffuse response so they never turn black under dim ambiances. */
export function metal(color: string, roughness = 0.3): THREE.MeshStandardMaterial {
  return get('metal|' + color + roughness, () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.65, envMapIntensity: 2.2 }));
}

export function fabric(f: Finish): THREE.MeshPhysicalMaterial {
  const kind = f.texture?.startsWith('asset:') ? 'cotton' : f.texture || 'cotton';
  const key = ['fabric', f.color, kind, f.roughness ?? 0.8, f.texture ?? '', f.textureScale ?? 1].join('|');
  return get(key, () => {
    const c = new THREE.Color(f.color);
    const m = new THREE.MeshPhysicalMaterial({ color: c, roughness: f.roughness ?? 0.8, side: THREE.DoubleSide, normalMap: kind === 'sequins' ? sequinNormal() : fabricNormal(kind) });
    m.normalScale.set(0.6, 0.6);
    if (kind === 'sequins') { m.metalness = 0.75; m.roughness = 0.22; m.envMapIntensity = 2; m.normalScale.set(1, 1); }
    if (kind === 'satin') { m.sheen = 1; m.sheenRoughness = 0.35; m.sheenColor = c.clone().lerp(new THREE.Color('#ffffff'), c.getHSL({ h: 0, s: 0, l: 0 }).l < 0.2 ? 0.18 : 0.45); m.clearcoat = 0.15; m.clearcoatRoughness = 0.4; }
    if (kind === 'velvet') { m.sheen = 1; m.sheenRoughness = 0.8; m.sheenColor = c.clone().lerp(new THREE.Color('#ffffff'), 0.25); }
    const map = assetTexture(f.texture, f);
    if (map) { m.map = map; map.repeat.set(1 / (f.textureScale ?? 1), 1 / (f.textureScale ?? 1)); }
    return m;
  });
}

/**
 * Thin glassware: a clear, reflective shell. It is transparent rather than transmissive so the
 * drink inside (which is transmissive) is seen through it without a second refraction pass.
 */
export function glass(plastic = false, tint = '#ffffff', roughness = 0.03, cut = false): THREE.MeshPhysicalMaterial {
  return get('glass|' + plastic + tint + roughness + cut, () => {
    const m = new THREE.MeshPhysicalMaterial({
      color: tint, metalness: 0, roughness: plastic ? 0.12 : roughness, transparent: true, opacity: plastic ? 0.22 : cut ? 0.24 : 0.16,
      specularIntensity: 1, envMapIntensity: cut ? 2.2 : 1.6, clearcoat: plastic ? 0 : 0.6, clearcoatRoughness: 0.05, side: THREE.DoubleSide, depthWrite: false,
    });
    if (cut) { m.normalMap = crystalNormal(); m.normalScale.set(0.8, 0.8); }
    return m;
  });
}

/** Ice reads as glassy cubes, also through the drink. */
export function ice(): THREE.MeshPhysicalMaterial {
  return get('ice', () => new THREE.MeshPhysicalMaterial({ color: '#e4f0f5', roughness: 0.04, clearcoat: 1, envMapIntensity: 1.2 }));
}

/** Translucent drink: garnish, ice and fruit inside show through, tinted by the colour ramp. */
export function liquid(map: THREE.Texture, key: string): THREE.MeshPhysicalMaterial {
  return get('liquid|' + key, () => new THREE.MeshPhysicalMaterial({
    map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0.16, roughness: 0.06, metalness: 0,
    transmission: 0.55, thickness: 0.05, ior: 1.34, specularIntensity: 0.8,
  }));
}

export function plain(color: string, roughness = 0.6, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return get('plain|' + color + roughness + JSON.stringify(extra), () => new THREE.MeshStandardMaterial({ color, roughness, ...extra }));
}

export function allMaterials() { return [...cache.values()]; }
