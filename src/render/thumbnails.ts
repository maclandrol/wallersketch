// Library previews rendered from the real models, so the library shows exactly what gets placed.
// One small offscreen renderer is created on demand and released when the queue is empty.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Item } from '../core/types';
import { buildDrink } from './drinks';
import { buildObject } from './objects';
import * as M from './materials';
import { drape } from '../core/drape';
import { holdsLiquid } from '../core/scene';

const VERSION = 'v3';
const SIZE = 224;
const memory = new Map<string, string>();
let renderer: THREE.WebGLRenderer | null = null, env: THREE.Texture | null = null, releaseTimer = 0;
interface Job { key: string; item: Item; resolve: (url: string) => void; reject: (e: unknown) => void; persist: boolean }
const queue: Job[] = [];
let running = false;

function stored(key: string) {
  try { return localStorage.getItem('thumb:' + VERSION + ':' + key); } catch { return null; }
}
function store(key: string, url: string) {
  try { localStorage.setItem('thumb:' + VERSION + ':' + key, url); } catch { /* storage full or unavailable: keep in memory only */ }
}

/** `persist: false` for transient previews (drink builder, assistant results). */
export function thumbnail(key: string, item: Item, persist = true): Promise<string> {
  const hit = memory.get(key) ?? (persist ? stored(key) : null);
  if (hit) { memory.set(key, hit); return Promise.resolve(hit); }
  return new Promise((resolve, reject) => { queue.push({ key, item, resolve, reject, persist }); if (!running) pump(); });
}

function setup() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  env = pm.fromScene(new RoomEnvironment(), 0.03).texture;
  pm.dispose();
  return renderer;
}

function fabricPreview(item: Item): THREE.Group {
  // A small piece of the actual fabric settled over a block, as a swatch.
  const g = new THREE.Group();
  const r = drape({ shape: item.shape === 'round' ? 'round' : 'rect', width: 0.9, depth: 0.9, x: 0, z: 0, yaw: 0, colliders: [{ kind: 'box', x: 0, z: 0, yaw: 0, bottom: 0, top: 0.35, hx: 0.22, hz: 0.22 }], maxParticles: 1600 });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(r.positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(r.uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(r.indices, 1));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, M.fabric(item.finish.main)));
  return g;
}

function pump() {
  const job = queue.shift();
  if (!job) { running = false; clearTimeout(releaseTimer); releaseTimer = window.setTimeout(release, 4000); return; }
  running = true;
  clearTimeout(releaseTimer);
  // A failed preview must never stall the queue for every later one.
  try { render(job); } catch (e) { console.warn('Aperçu impossible :', e); job.reject(e); }
  setTimeout(pump, 0);
}

function render(job: Job) {
  const r = setup();
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.environmentIntensity = 0.9;
  const key = new THREE.DirectionalLight('#ffffff', 2.4);
  key.position.set(-2, 4, 3);
  scene.add(key, new THREE.HemisphereLight('#ffffff', '#d8d2c8', 0.6));
  const i = job.item;
  const obj = holdsLiquid(i) ? buildDrink(i.drink!, 3, i.finish.glass) : i.type === 'fabric' ? fabricPreview(i) : buildObject(i);
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj), sphere = box.getBoundingSphere(new THREE.Sphere());
  const cam = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
  const flat = i.type === 'fabric' || (i.type === 'table') || i.ref.startsWith('backdrop');
  const dir = new THREE.Vector3(-0.55, flat ? 0.62 : 0.32, 1).normalize();
  cam.position.copy(sphere.center).addScaledVector(dir, sphere.radius / Math.sin((26 * Math.PI) / 360) * 1.02);
  cam.lookAt(sphere.center);
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/webp', 0.9);
  if (job.persist) { memory.set(job.key, url); store(job.key, url); }
  job.resolve(url);
}

function release() {
  if (running || !renderer) return;
  renderer.dispose();
  renderer.forceContextLoss();
  env?.dispose();
  renderer = null; env = null;
}
