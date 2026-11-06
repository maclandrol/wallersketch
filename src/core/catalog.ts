import type { DrinkSpec, Finish, ItemType, Vec3 } from './types';
import { GLASSES, glassSize } from './glassware';

export const RISER_MAX_HEIGHT = 0.5;
/** Top face of a tapered riser relative to its base. */
export const TAPER_SCALE = 0.7;

export interface CatalogEntry {
  ref: string;
  /** Presentoir steps or tower levels. */
  steps?: number;
  type: ItemType;
  name: string;
  /** Short grouping label inside a library category. */
  family: string;
  size: Vec3;
  shape?: string;
  finish: Record<string, Finish>;
  drink?: DrinkSpec;
}

export interface Swatch { name: string; color: string }

export const FABRIC_COLORS: Swatch[] = [
  { name: 'Blanc', color: '#f4f2ee' }, { name: 'Ivoire', color: '#eee6d6' }, { name: 'Champagne', color: '#dcc7a1' },
  { name: 'Pêche', color: '#e9b995' }, { name: 'Rose poudré', color: '#e6b8bd' }, { name: 'Fuchsia', color: '#d4245f' },
  { name: 'Framboise', color: '#c0163b' }, { name: 'Bordeaux', color: '#6e1a2a' }, { name: 'Sauge', color: '#9fae95' },
  { name: 'Émeraude', color: '#1f5a47' }, { name: 'Bleu nuit', color: '#1d2a44' }, { name: 'Noir', color: '#18181a' },
  { name: 'Doré', color: '#c09a55' }, { name: 'Argent', color: '#b9bcc0' },
];

export const SOLID_COLORS: Swatch[] = [
  { name: 'Blanc', color: '#f7f6f3' }, { name: 'Ivoire', color: '#eee8dc' }, { name: 'Sable', color: '#d8c6a8' },
  { name: 'Chêne', color: '#b48a5c' }, { name: 'Noyer', color: '#6b4a32' }, { name: 'Gris', color: '#9a9a97' },
  { name: 'Anthracite', color: '#3a3b3d' }, { name: 'Noir', color: '#151517' }, { name: 'Doré', color: '#c4a062' },
  { name: 'Rose', color: '#e7bcc0' }, { name: 'Sauge', color: '#a3b39a' }, { name: 'Bleu', color: '#7ea3c4' },
];

export const FABRIC_TEXTURES = [
  { id: 'satin', name: 'Satin', roughness: 0.32 },
  { id: 'sequins', name: 'Paillettes', roughness: 0.25 },
  { id: 'linen', name: 'Lin', roughness: 0.85 },
  { id: 'velvet', name: 'Velours', roughness: 0.7 },
  { id: 'cotton', name: 'Coton', roughness: 0.92 },
];

export const SURFACE_TEXTURES = [
  { id: '', name: 'Uni' },
  { id: 'wood', name: 'Bois' },
  { id: 'marble', name: 'Marbre' },
];

const table = (ref: string, name: string, family: string, shape: string, w: number, d: number, h = 0.75): CatalogEntry => ({
  ref, type: 'table', name, family, shape, size: [w, h, d],
  finish: { top: { color: '#efece6', roughness: 0.7 }, legs: { color: '#2b2b2d', roughness: 0.45 } },
});

const riser = (ref: string, name: string, family: string, shape: string, w: number, h: number, d: number): CatalogEntry => ({
  ref, type: 'riser', name, family, shape, size: [w, Math.min(h, RISER_MAX_HEIGHT), d],
  finish: { main: { color: '#f7f6f3', roughness: 0.35 } },
});

const fabric = (ref: string, name: string, family: string, shape: string, w: number, d: number, color: string, texture: string): CatalogEntry => ({
  ref, type: 'fabric', name, family, shape, size: [w, 0.003, d],
  finish: { main: { color, texture, roughness: FABRIC_TEXTURES.find(t => t.id === texture)!.roughness } },
});

// Liquids are described from the bottom of the glass to the top.
const drink = (ref: string, name: string, glass: string, layers: [string, number][], garnish: string[], fill = 0.86, extra: Partial<DrinkSpec> = {}): CatalogEntry => ({
  ref, type: 'cocktail', name, family: GLASSES.find(g => g.id === glass)!.name, size: glassSize(glass),
  finish: { glass: { color: '#ffffff', roughness: 0.04 } },
  drink: { glass, fill, layers: layers.map(([color, at]) => ({ color, at })), garnish, ...extra },
});

const decor = (ref: string, name: string, family: string, size: Vec3, finish: Record<string, Finish>): CatalogEntry =>
  ({ ref, type: 'decor', name, family, size, finish });

export const CATALOG: CatalogEntry[] = [
  table('rect-120', 'Table 120 × 60', 'Rectangulaires', 'rect', 1.2, 0.6),
  table('rect-180', 'Table 180 × 75', 'Rectangulaires', 'rect', 1.8, 0.75),
  table('rect-240', 'Banquet 240 × 80', 'Rectangulaires', 'rect', 2.4, 0.8),
  table('rect-300', 'Buffet 300 × 90', 'Rectangulaires', 'rect', 3.0, 0.9),
  table('square-90', 'Carrée 90', 'Rectangulaires', 'rect', 0.9, 0.9),
  table('round-80', 'Ronde Ø 80', 'Rondes', 'round', 0.8, 0.8),
  table('round-120', 'Ronde Ø 120', 'Rondes', 'round', 1.2, 1.2),
  table('round-150', 'Ronde Ø 150', 'Rondes', 'round', 1.5, 1.5),
  table('highboy-70', 'Mange-debout Ø 70', 'Rondes', 'highboy', 0.7, 0.7, 1.1),

  riser('cube-20', 'Cube 20', 'Cubes', 'rect', 0.2, 0.2, 0.2),
  riser('cube-30', 'Cube 30', 'Cubes', 'rect', 0.3, 0.3, 0.3),
  riser('cube-40', 'Cube 40', 'Cubes', 'rect', 0.4, 0.4, 0.4),
  riser('cube-50', 'Cube 50', 'Cubes', 'rect', 0.5, 0.5, 0.5),
  riser('block-60', 'Pavé 60 × 30', 'Pavés', 'rect', 0.6, 0.15, 0.3),
  riser('block-80', 'Pavé 80 × 40', 'Pavés', 'rect', 0.8, 0.25, 0.4),
  riser('step-100', 'Marche 100 × 30', 'Pavés', 'rect', 1.0, 0.1, 0.3),
  riser('column-50', 'Colonne 30 × 50', 'Pavés', 'rect', 0.3, 0.5, 0.3),
  riser('cyl-20', 'Cylindre Ø 20', 'Cylindres', 'round', 0.2, 0.2, 0.2),
  riser('cyl-30', 'Cylindre Ø 30', 'Cylindres', 'round', 0.3, 0.3, 0.3),
  riser('cyl-40', 'Cylindre Ø 40', 'Cylindres', 'round', 0.4, 0.45, 0.4),
  riser('disc-50', 'Plateau Ø 50', 'Cylindres', 'round', 0.5, 0.08, 0.5),
  riser('taper-30', 'Trapèze 30', 'Trapèzes', 'taper', 0.4, 0.3, 0.35),
  riser('taper-45', 'Trapèze 45', 'Trapèzes', 'taper', 0.5, 0.45, 0.4),
  { ...riser('tiers-3', 'Gradins 3 niveaux', 'Présentoirs', 'tiers', 0.9, 0.36, 0.45), steps: 3 },
  { ...riser('tiers-4-lit', 'Gradins lumineux 4 niveaux', 'Présentoirs', 'tiers', 1.2, 0.48, 0.6), steps: 4, finish: { main: { color: '#fbfaf7', roughness: 0.3, glow: 0.45 } } },
  { ...riser('tiers-2-gold', 'Gradins laiton 2 niveaux', 'Présentoirs', 'tiers', 0.6, 0.24, 0.35), steps: 2, finish: { main: { color: '#c9a45c', roughness: 0.22, metalness: 1 } } },
  { ...riser('tray-gold', 'Plateau miroir doré Ø 45', 'Présentoirs', 'round', 0.45, 0.03, 0.45), finish: { main: { color: '#e3c27a', roughness: 0.14, metalness: 1 } } },
  { ...riser('tray-silver', 'Plateau miroir argent 60 × 40', 'Présentoirs', 'rect', 0.6, 0.03, 0.4), finish: { main: { color: '#d9dcdf', roughness: 0.05, metalness: 1 } } },
  { ...riser('plinth-marble', 'Socle marbre noir 40', 'Présentoirs', 'rect', 0.4, 0.4, 0.4), finish: { main: { color: '#3a3a3c', roughness: 0.18, texture: 'marble' } } },

  ...GLASSES.map((g): CatalogEntry => ({
    ref: 'glass-' + g.id, type: 'glass', name: g.name, family: 'Verres', size: glassSize(g.id),
    finish: { glass: { color: '#ffffff', roughness: 0.04 } }, drink: { glass: g.id, fill: 0, layers: [], garnish: [] },
  })),

  // The four drinks of the Mr Waller menu.
  drink('mojito', 'Mojito classique', 'highball', [['#d9e6a6', 0], ['#eef3cf', 1]], ['mint', 'lime-inside', 'lime-wheel', 'straw-black'], 0.9, { ice: 5 }),
  drink('mojito-mango', 'Mojito mangue', 'highball', [['#f2a516', 0], ['#f7c74a', 1]], ['mango', 'mint', 'lime-wheel', 'straw-black'], 0.9, { ice: 4 }),
  drink('sunrise', 'Sunrise', 'highball', [['#b5122c', 0], ['#e8481f', 0.3], ['#f59a1d', 0.62], ['#f8c43c', 1]], ['orange-wheel', 'cherry', 'straw-black'], 0.9, { ice: 3 }),
  drink('blue-lagoon', 'Blue Lagoon', 'highball', [['#0a63d6', 0], ['#22a5f0', 1]], ['lime-wheel', 'mint', 'straw-black'], 0.9, { ice: 5 }),
  // Seen at real installations.
  drink('sunrise-flute', 'Sunrise flûte', 'flute', [['#d0103a', 0], ['#f06a1c', 0.35], ['#f9a521', 0.7], ['#fbc34a', 1]], ['berries-skewer'], 0.92),
  drink('mojito-flute', 'Mojito flûte', 'flute', [['#b9d36a', 0], ['#e3eeb0', 1]], ['lime-inside', 'mint'], 0.92),
  drink('blue-raspberry', 'Framboise bleue', 'stemless-flute', [['#0b6fd0', 0], ['#35b6ef', 1]], ['raspberries', 'gold-stirrer'], 0.9),
  drink('pink-litchi', 'Rose pétillant', 'flute', [['#d8336a', 0], ['#f5b8c9', 0.75], ['#fbe1e8', 1]], ['pink-rim', 'gypsophila', 'bow'], 0.9),
  drink('strawberry-passion', 'Fraise passion', 'goblet', [['#e75b2a', 0], ['#f7a224', 0.45], ['#fbbb3a', 1]], ['strawberry', 'rock-candy', 'bow'], 0.8),
  drink('bubble-tea', 'Bubble Tea', 'bubble-cup', [['#c9a785', 0], ['#e9d6bd', 1]], ['pearls', 'straw-wide', 'dome'], 0.88, { ice: 3 }),
  drink('pina-colada', 'Piña colada', 'hurricane', [['#f3e6b9', 0], ['#fbf5df', 1]], ['pineapple', 'cherry', 'straw-paper'], 0.9),
  drink('margarita', 'Margarita', 'margarita', [['#dfe7a6', 0], ['#eef0c8', 1]], ['salt-rim', 'lime-wedge'], 0.8),
  drink('cosmopolitan', 'Cosmopolitan', 'martini', [['#d42d55', 0], ['#e9577a', 1]], ['orange-peel'], 0.82),
  drink('espresso-martini', 'Espresso martini', 'martini', [['#2a160c', 0], ['#3d2314', 0.82], ['#c99d6d', 0.9], ['#e2c49c', 1]], ['coffee-beans'], 0.84, { layered: true }),
  drink('aperol-spritz', 'Spritz', 'wine', [['#f05a13', 0], ['#f7822a', 1]], ['orange-wheel', 'straw-black'], 0.75, { ice: 4 }),
  drink('strawberry-daiquiri', 'Daïquiri fraise', 'coupe', [['#c8182e', 0], ['#e23a45', 1]], ['strawberry-rim'], 0.85),
  drink('pink-lemonade', 'Limonade rose', 'collins', [['#f07fa0', 0], ['#f9c3d1', 1]], ['lemon-wheel', 'straw-paper'], 0.9, { ice: 5 }),
  drink('red-punch', 'Punch fruits rouges', 'goblet', [['#7c0d25', 0], ['#b31e3a', 1]], ['raspberries', 'blueberries', 'mint'], 0.8),
  drink('old-fashioned', 'Old fashioned', 'tumbler', [['#a85b17', 0], ['#c98035', 1]], ['big-ice', 'orange-peel'], 0.6),
  drink('peach-tea', 'Thé glacé pêche', 'collins', [['#c4621e', 0], ['#e9a24a', 1]], ['lemon-wheel', 'mint', 'straw-paper'], 0.9, { ice: 5 }),
  drink('champagne', 'Champagne', 'coupe', [['#e9cf7a', 0], ['#f6e7b0', 1]], ['gold-rim'], 0.8),
  drink('kir-royal', 'Kir royal', 'flute', [['#7a0f2b', 0], ['#c2264f', 0.55], ['#e9a1a8', 1]], ['gold-rim', 'raspberries'], 0.9),
  drink('b52', 'B-52', 'shot', [['#3b1d0f', 0], ['#3b1d0f', 0.33], ['#e9dcc0', 0.34], ['#e9dcc0', 0.66], ['#d98a2a', 0.67], ['#d98a2a', 1]], [], 0.9, { layered: true }),

  fabric('cloth-320', 'Nappe 320 × 180', 'Nappes', 'rect', 3.2, 1.8, '#18181a', 'satin'),
  fabric('cloth-400', 'Nappe 400 × 220', 'Nappes', 'rect', 4.0, 2.2, '#f4f2ee', 'linen'),
  fabric('cloth-240', 'Nappe 240 × 150', 'Nappes', 'rect', 2.4, 1.5, '#c0163b', 'cotton'),
  fabric('cloth-round-280', 'Nappe ronde Ø 280', 'Nappes', 'round', 2.8, 2.8, '#eee6d6', 'satin'),
  fabric('cloth-round-200', 'Nappe ronde Ø 200', 'Nappes', 'round', 2.0, 2.0, '#e6b8bd', 'velvet'),
  fabric('cloth-sequin-320', 'Nappe paillettes 320 × 180', 'Nappes', 'rect', 3.2, 1.8, '#c8a35e', 'sequins'),
  fabric('cloth-velvet-300', 'Nappe velours 300 × 180', 'Nappes', 'rect', 3.0, 1.8, '#5b1424', 'velvet'),
  fabric('runner-300', 'Chemin de table 300 × 40', 'Chemins et drapés', 'rect', 3.0, 0.4, '#c09a55', 'satin'),
  fabric('drape-150', 'Drapé 150 × 150', 'Chemins et drapés', 'rect', 1.5, 1.5, '#f4f2ee', 'satin'),
  fabric('drape-100', 'Drapé 100 × 100', 'Chemins et drapés', 'rect', 1.0, 1.0, '#e9b995', 'velvet'),

  decor('bouquet-hydrangea', 'Hortensias blancs', 'Fleurs', [0.38, 0.5, 0.38], { flowers: { color: '#f3f1ea', roughness: 0.8 }, vase: { color: '#f7f6f3', roughness: 0.3 } }),
  decor('bouquet-peony', 'Pivoines poudrées', 'Fleurs', [0.34, 0.42, 0.34], { flowers: { color: '#f0c3b4', roughness: 0.8 }, vase: { color: '#f7f6f3', roughness: 0.3 } }),
  decor('bouquet-rose', 'Roses orangées', 'Fleurs', [0.32, 0.4, 0.32], { flowers: { color: '#ea5b25', roughness: 0.75 }, vase: { color: '#f7f6f3', roughness: 0.3 } }),
  decor('gypsophila', 'Gypsophile', 'Fleurs', [0.3, 0.35, 0.3], { flowers: { color: '#fbf6f4', roughness: 0.8 }, vase: { color: '#e9eef0', roughness: 0.05 } }),
  decor('garland', 'Guirlande eucalyptus', 'Fleurs', [1.2, 0.06, 0.18], { leaves: { color: '#7d9a7a', roughness: 0.7 } }),
  decor('dispenser', 'Fontaine à boisson', 'Service', [0.24, 0.42, 0.24], { liquid: { color: '#f5c542' }, stand: { color: '#c9ccd0', roughness: 0.25 } }),
  decor('straw-holder', 'Pot à pailles', 'Service', [0.08, 0.2, 0.08], { main: { color: '#18181a', roughness: 0.5 } }),
  decor('napkin-box', 'Boîte à serviettes', 'Service', [0.2, 0.08, 0.2], { main: { color: '#18181a', roughness: 0.5 }, napkins: { color: '#f7f6f3', roughness: 0.9 } }),
  decor('sign-a5', 'Chevalet A5', 'Signalétique', [0.16, 0.23, 0.07], { main: { color: '#f7f6f3', roughness: 0.6 }, frame: { color: '#c4a062', roughness: 0.3 } }),
  decor('frame-a3', 'Cadre menu A3', 'Signalétique', [0.34, 0.45, 0.16], { main: { color: '#f7f6f3', roughness: 0.6 }, frame: { color: '#f7f6f3', roughness: 0.35 } }),
  decor('candle', 'Photophore', 'Signalétique', [0.09, 0.12, 0.09], { main: { color: '#f1ece2', roughness: 0.6 } }),
  { ...decor('tower-5', 'Pyramide de coupes 5 étages', 'Prestige', [0.56, 0.58, 0.56], { glass: { color: '#ffffff', roughness: 0.03 }, liquid: { color: '#ecd489' } }), steps: 5 },
  { ...decor('tower-3', 'Pyramide de coupes 3 étages', 'Prestige', [0.34, 0.35, 0.34], { glass: { color: '#ffffff', roughness: 0.03 }, liquid: { color: '#ecd489' } }), steps: 3 },
  decor('candelabra', 'Chandelier 5 branches', 'Prestige', [0.42, 0.55, 0.12], { main: { color: '#c9a45c', roughness: 0.25, metalness: 1 }, candles: { color: '#f6f1e6', roughness: 0.6 } }),
  decor('ice-bucket', 'Seau à champagne', 'Prestige', [0.24, 0.3, 0.24], { main: { color: '#d9dcdf', roughness: 0.12, metalness: 1 } }),
  decor('backdrop-curtain', 'Rideau plissé', 'Fonds', [4.0, 2.6, 0.12], { main: { color: '#e6c3a2', texture: 'satin', roughness: 0.45 } }),
  decor('backdrop-wall', 'Mur', 'Fonds', [4.0, 2.6, 0.1], { main: { color: '#f2eee8', roughness: 0.9 } }),
  decor('backdrop-arch', 'Arche', 'Fonds', [1.4, 2.2, 0.08], { main: { color: '#f2d6d6', roughness: 0.8 } }),
];

const entries = new Map(CATALOG.map(e => [e.ref, e]));
export const catalogEntry = (ref: string) => entries.get(ref);
/** Entries created by the operator (drink builder) or an assistant; kept in the personal library. */
const custom = new Map<string, CatalogEntry>();
export function registerEntry(e: CatalogEntry) { custom.set(e.ref, e); entries.set(e.ref, e); }
export function unregisterEntry(ref: string) { custom.delete(ref); entries.delete(ref); }
export const customEntries = () => [...custom.values()];

export const CATEGORIES: { type: ItemType; label: string }[] = [
  { type: 'table', label: 'Tables' },
  { type: 'riser', label: 'Socles' },
  { type: 'fabric', label: 'Tissus' },
  { type: 'cocktail', label: 'Cocktails' },
  { type: 'glass', label: 'Verres' },
  { type: 'decor', label: 'Décor' },
];

/** Garnish labels exposed as toggles in the inspector. */
export const GARNISH_LABELS: Record<string, string> = {
  'mint': 'Menthe', 'lime-wheel': 'Rondelle citron vert', 'lime-inside': 'Citron vert dans le verre', 'lime-wedge': 'Quartier citron vert',
  'lemon-wheel': 'Rondelle citron', 'orange-wheel': 'Rondelle orange', 'orange-peel': 'Zeste', 'cherry': 'Cerise',
  'strawberry': 'Fraise', 'strawberry-rim': 'Fraise sur le bord', 'berries-skewer': 'Brochette de fruits', 'raspberries': 'Framboises',
  'blueberries': 'Myrtilles', 'mango': 'Mangue', 'pineapple': 'Ananas', 'rock-candy': 'Bâton de sucre', 'gypsophila': 'Gypsophile',
  'bow': 'Nœud', 'salt-rim': 'Bord sel', 'pink-rim': 'Bord sucre rose', 'coffee-beans': 'Grains de café', 'pearls': 'Perles de tapioca',
  'big-ice': 'Gros glaçon', 'gold-stirrer': 'Touilleur doré', 'straw-black': 'Paille noire', 'straw-paper': 'Paille rayée',
  'straw-wide': 'Paille large', 'dome': 'Couvercle', 'gold-rim': 'Liseré or', 'sugar-rim': 'Bord sucre',
};
