// Shared data contracts. All lengths are metres internally; the UI shows centimetres.
// World axes: +Y up, the floor is y = 0, and yaw rotates about +Y (Three.js convention).

export type Vec3 = [number, number, number];
export type ItemType = 'table' | 'riser' | 'glass' | 'cocktail' | 'fabric' | 'decor' | 'model';

/** Appearance of one editable part of an object. */
export interface Finish {
  color: string;
  /** 0 = mirror, 1 = fully matte. */
  roughness?: number;
  /** Procedural pattern name or embedded texture id ("asset:<id>"). */
  texture?: string;
  textureScale?: number;
  /** Degrees. */
  textureRotation?: number;
  /** Emissive glow for lit acrylic risers, 0..1. */
  glow?: number;
  /** Display name of an imported model's material. */
  label?: string;
  /** 1 = polished metal (mirror trays, brass), 0 = non-metal. */
  metalness?: number;
}

export interface LiquidLayer {
  color: string;
  /** Fraction of the liquid height (0 bottom → 1 top) where this colour is fully reached. */
  at: number;
}

export interface DrinkSpec {
  glass: string;
  /** 0..1 of the usable bowl height. */
  fill: number;
  layers: LiquidLayer[];
  /** Hard band between layers instead of a gradient. */
  layered?: boolean;
  garnish: string[];
  ice?: number;
}

export interface Item {
  id: string;
  type: ItemType;
  /** Catalogue entry or embedded model id this instance came from. */
  ref: string;
  name: string;
  /** World position of the footprint centre at the object's base. Fabrics: centre of the piece (y unused, it drapes from above). */
  position: Vec3;
  /** Yaw in radians. */
  rotation: number;
  /** Width (x), height (y), depth (z) in metres. */
  size: Vec3;
  /** Object it rests on; moving the support moves it too. */
  parentId?: string;
  groupId?: string;
  finish: Record<string, Finish>;
  /** Parametric shape for tables and risers: rect | round | taper | highboy. */
  shape?: string;
  drink?: DrinkSpec;
  /** Imported model orientation correction in quarter turns about X and Z. */
  tilt?: [number, number];
  /** Fabric stacking order when pieces overlap. */
  layer?: number;
  locked?: boolean;
  /** Fabric: drape over the table only, or over the risers too. */
  covers?: 'tables' | 'all';
  /** Imported model that other objects and fabrics can rest on. */
  support?: boolean;
  /** Stepped presentoir: number of steps. Champagne tower: number of levels. */
  steps?: number;
}

export interface CameraView {
  id: string;
  name: string;
  position: Vec3;
  target: Vec3;
  fov: number;
}

export interface EmbeddedAsset {
  id: string;
  name: string;
  type: 'model' | 'texture';
  mime: string;
  /** base64 */
  data: string;
}

export interface Arrangement {
  id: string;
  name: string;
  /** Positions relative to the arrangement's footprint centre on the floor. */
  items: Item[];
}

export type Ambiance = 'studio' | 'warm' | 'evening';

export interface SceneSettings {
  ambiance: Ambiance;
  floor: string;
  background: string;
}

export interface DocState {
  name: string;
  items: readonly Item[];
  views: readonly CameraView[];
  arrangements: readonly Arrangement[];
  scene: SceneSettings;
}

export interface ProjectFile extends Omit<DocState, 'items' | 'views' | 'arrangements'> {
  format: 'wallersketch';
  version: 2;
  items: Item[];
  views: CameraView[];
  arrangements: Arrangement[];
  assets: EmbeddedAsset[];
  /** Custom glass profiles used by the project, so it opens anywhere. */
  glasses?: import('./glassware').GlassProfile[];
}
