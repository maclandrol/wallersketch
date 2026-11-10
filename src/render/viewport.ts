// The 3D view: renders the document, answers surface queries and turns pointer input into
// intents (select, move, rotate, drop). It never edits the document itself.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CameraView, DocState, EmbeddedAsset, Item, SceneSettings, Vec3 } from '../core/types';
import { buildDrink } from './drinks';
import { buildObject } from './objects';
import * as M from './materials';
import { drapeInput, drapeKey, fabricCovers } from '../core/fabric';
import type { DrapeResult } from '../core/drape';
import { footprintCorners, holdsLiquid, isSupport, withDescendants } from '../core/scene';
import { SurfaceIndex } from '../core/heightfield';
import { glassFootRadius, glassProfile } from '../core/glassware';

/** Pointer capture can fail when the pointer is already gone (a touch that ended): ignore that. */
function grabPointer(el: Element, id: number) { try { el.setPointerCapture(id); } catch { /* pointer gone */ } }

export interface ViewportEvents {
  select(ids: string[], mode: 'replace' | 'toggle' | 'single' | 'add'): void;
  /** Live drag of the selection; `final` closes the undo step. */
  /** `free`: Alt held, no grid snapping. */
  move(ids: string[], delta: Vec3, final: boolean, free: boolean): void;
  rotate(ids: string[], yaw: number, pivot: Vec3, final: boolean): void;
  surfacesChanged(fabricIds: string[]): void;
  hover(id: string | null): void;
  drapeBusy(count: number): void;
  contextMenu(id: string | null, x: number, y: number): void;
}

interface Entry { item: Item; shapeKey: string; group: THREE.Group }

const VIEW_DIRS = {
  perspective: { az: -0.62, el: 0.42 },
  front: { az: 0, el: 0.12 },
  top: { az: 0, el: Math.PI / 2 - 0.001 },
  side: { az: -Math.PI / 2, el: 0.12 },
};
export type ViewName = keyof typeof VIEW_DIRS;

// Low ambient light keeps fold and contact shadows readable on pale fabrics.
const AMBIANCES = {
  studio: { key: '#ffffff', keyI: 3.6, fill: 0.2, env: 0.36, exposure: 1.05, sky: '#ffffff', ground: '#d9d3c9' },
  warm: { key: '#ffdcb4', keyI: 3.8, fill: 0.18, env: 0.3, exposure: 1.05, sky: '#ffe4c4', ground: '#a88d70' },
  evening: { key: '#ffc78a', keyI: 2.6, fill: 0.06, env: 0.16, exposure: 1.0, sky: '#4a4f70', ground: '#1a1714' },
};

/** Stable description of everything that changes geometry or materials (not placement). */
function shapeKey(i: Item) {
  const { position, rotation, parentId, name, locked, groupId, ...rest } = i;
  return JSON.stringify(rest);
}

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.02, 80);
  readonly controls: OrbitControls;
  private root = new THREE.Group();
  private overlay = new THREE.Group();
  private entries = new Map<string, Entry>();
  private state?: DocState;
  private selection: string[] = [];
  private hovered: string | null = null;
  private floor: THREE.Mesh;
  private key = new THREE.DirectionalLight('#ffffff', 2.6);
  private hemi = new THREE.HemisphereLight('#ffffff', '#d9d3c9', 0.55);
  private envTex: THREE.Texture;
  private needsRender = true;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private worker: Worker;
  private drapes = new Map<string, { geometry: THREE.BufferGeometry; result: DrapeResult; index: SurfaceIndex }>();
  // Drinks are drawn as instanced batches: one draw call per distinct part, not per glass.
  private batches = new Map<string, { mesh: THREE.InstancedMesh; ids: string[] }>();
  private templates = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4; cast: boolean }[]>();
  private batchRoot = new THREE.Group();
  private drinksDirty = false;
  /** One settling job in flight per fabric; newer requests wait for it, then re-check. */
  private pendingDrape = new Map<string, string>();
  private drapeSeq = 0;
  private models = new Map<string, Promise<THREE.Group | null> | THREE.Group | null>();
  private assets = new Map<string, EmbeddedAsset>();
  private ghost = new THREE.Group();
  private ghostMat = new THREE.MeshBasicMaterial({ color: '#1f6feb', transparent: true, opacity: 0.28, depthWrite: false });
  private ring: THREE.Group;
  private pointer?: { id: number; x: number; y: number; mode: 'pending' | 'move' | 'rotate' | 'orbit' | 'box'; ids: string[]; anchor: THREE.Vector3; plane: THREE.Plane; last: Vec3; start: number; pivot: Vec3; startAngle: number; lastYaw: number; additive: boolean; toggle?: string };
  private anim?: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; t0: number; ms: number };
  private size = { w: 1, h: 1 };
  helpersVisible = true;
  /** Selection tool: a drag on empty space draws a selection box (Shift does the same). */
  boxTool = false;
  private marquee = Object.assign(document.createElement('div'), { className: 'marquee' });
  private coarse = matchMedia('(pointer: coarse)').matches;

  constructor(private host: HTMLElement, private events: ViewportEvents) {
    // Retina screens already have twice the pixels: multisampling on top of that costs a lot of
    // GPU time for an edge quality nobody sees.
    this.renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 1.5, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    // The drinks refract what is behind them: that background is blurry anyway, half size is plenty.
    this.renderer.transmissionResolutionScale = 0.5;
    this.renderer.setPixelRatio(this.fullRatio);
    // Shadows depend on the objects and the light, not on the camera: redrawn only when those change.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    // Neutral studio colour until a composition (and its background) is loaded.
    this.renderer.setClearColor('#ece9e3');
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    pmrem.dispose();
    this.scene.environment = this.envTex;

    this.floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e9e5de', roughness: 0.95 }));
    this.floor.receiveShadow = true;
    this.floor.userData.floor = true;
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0002;
    this.key.shadow.normalBias = 0.015;
    this.key.shadow.radius = 5;
    this.scene.add(this.floor, this.key, this.key.target, this.hemi, this.root, this.overlay, this.focusDrinks);
    // Lights and the editor overlay also take part in the focus pass (layer 1).
    this.overlay.add(this.guides);
    for (const o of [this.key, this.hemi, this.overlay]) o.layers.enable(1);
    this.veil.frustumCulled = false;
    this.root.add(this.batchRoot);
    this.overlay.add(this.ghost);
    this.ring = this.makeRing();
    this.overlay.add(this.ring);

    this.camera.position.set(-2.2, 2.0, 3.4);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.8, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.01;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 25;
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = true;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.addEventListener('change', () => this.invalidate());

    this.worker = new Worker('./drape.worker.js', { type: 'module' });
    this.worker.onmessage = e => this.onDrape(e.data);

    M.configureTextures(id => { const a = this.assets.get(id); return a ? `data:${a.mime};base64,${a.data}` : undefined; }, () => this.invalidate());
    new ResizeObserver(() => this.resize()).observe(host);
    this.bindPointer();
    this.resize();
    const loop = () => { requestAnimationFrame(loop); this.tick(); };
    loop();
  }

  invalidate() { this.needsRender = true; }

  /**
   * Full sharpness when the view is still; fewer pixels while it moves (orbit, drag, camera
   * animation), which is what keeps a Retina tablet smooth. One sharp frame follows each move.
   */
  private fullRatio = Math.min(this.coarse ? 1.6 : 2, window.devicePixelRatio);
  private moveRatio = Math.min(this.fullRatio, this.coarse ? 1 : 1.25);
  private lastMotion = 0;
  private shadowsDirty = true;
  private adaptResolution(moving: boolean) {
    const r = this.renderer, now = performance.now();
    if (moving) {
      this.lastMotion = now;
      if (r.getPixelRatio() !== this.moveRatio) r.setPixelRatio(this.moveRatio);
    } else if (r.getPixelRatio() !== this.fullRatio && now - this.lastMotion > 160) {
      r.setPixelRatio(this.fullRatio);
      this.needsRender = true;
    }
  }

  private resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  private tick() {
    if (this.anim) {
      const t = Math.min(1, (performance.now() - this.anim.t0) / this.anim.ms), e = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(this.anim.from[0], this.anim.to[0], e);
      this.controls.target.lerpVectors(this.anim.from[1], this.anim.to[1], e);
      if (t >= 1) this.anim = undefined;
      this.needsRender = true;
    }
    const orbiting = this.controls.update();
    if (orbiting) this.needsRender = true;
    this.adaptResolution(orbiting || !!this.anim || this.pointer?.mode === 'move' || this.pointer?.mode === 'rotate');
    if (!this.needsRender) return;
    this.needsRender = false;
    // Fog only blends the far floor into the background, whatever the camera distance.
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) { const d = this.camera.position.distanceTo(this.controls.target); fog.near = d * 1.6 + 4; fog.far = d * 3 + 14; }
    this.updateOverlay();
    this.placeGuideLabel();
    this.render();
  }

  // ------------------------------------------------------------------ smart guides

  private guides = new THREE.Group();
  private guideMat = new THREE.LineBasicMaterial({ color: '#1f6feb', depthTest: false, transparent: true });
  private guideLabel = Object.assign(document.createElement('div'), { className: 'guide-label' });
  private guideAt: THREE.Vector3 | null = null;

  /** Alignment lines and the live distance label shown while dragging (empty to clear). */
  setGuides(lines: [Vec3, Vec3][], label: { text: string; at: Vec3 } | null) {
    this.guides.traverse(o => (o as THREE.Line).geometry?.dispose());
    this.guides.clear();
    for (const [a, b] of lines) {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]), this.guideMat);
      l.renderOrder = 11;
      this.guides.add(l);
    }
    if (label) {
      this.guideLabel.textContent = label.text;
      this.guideAt = new THREE.Vector3(...label.at);
      if (!this.guideLabel.isConnected) this.host.append(this.guideLabel);
    } else { this.guideAt = null; this.guideLabel.remove(); }
    this.invalidate();
  }

  private placeGuideLabel() {
    if (!this.guideAt) return;
    const v = this.guideAt.clone().project(this.camera), r = this.renderer.domElement.getBoundingClientRect(), h = this.host.getBoundingClientRect();
    this.guideLabel.style.left = (r.left - h.left + ((v.x + 1) / 2) * r.width) + 'px';
    this.guideLabel.style.top = (r.top - h.top + ((1 - v.y) / 2) * r.height - 34) + 'px';
  }

  /** Frame objects from the current viewing direction (double-click). */
  frameKeepingDirection(ids: string[]) {
    const b = this.contentBounds(ids);
    if (b.isEmpty()) return;
    const sphere = b.getBoundingSphere(new THREE.Sphere());
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const fov = (this.camera.fov * Math.PI) / 180, fit = Math.min(fov, fov * this.camera.aspect);
    const dist = Math.max(0.5, (sphere.radius * 1.6) / Math.sin(fit / 2));
    this.animateTo(sphere.center.clone().addScaledVector(dir, dist), sphere.center.clone());
  }

  // ------------------------------------------------------------------ focus on the selection

  /** Fade the rest of the scene while something is selected (the composition stays readable). */
  focusSelection = true;
  private veil = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthTest: false, depthWrite: false }));
  private veilCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private veilGrey = new THREE.Color('#9a9894');
  private focusDrinks = new THREE.Group();
  private focusKey: unknown[] = [];
  private focused = new Set<THREE.Object3D>();

  /**
   * Two passes: the whole scene, a veil in the background colour, then the selection (and what
   * stands on it) drawn again on layer 1 with the editor overlay, so it stands out clearly.
   */
  private render() {
    const r = this.renderer;
    if (this.shadowsDirty) { r.shadowMap.needsUpdate = true; this.shadowsDirty = false; }
    r.render(this.scene, this.camera);
    if (!this.focusSelection || !this.helpersVisible || !this.selection.length || !this.state) return;
    this.updateFocus();
    // A light grey wash in the background's tone: the rest stays readable, just set back.
    (this.veil.material as THREE.MeshBasicMaterial).color.copy((this.scene.background as THREE.Color | null) ?? new THREE.Color('#ece9e3')).lerp(this.veilGrey, 0.35);
    r.autoClear = false;
    r.render(this.veil, this.veilCamera);
    r.clearDepth();
    // A colour background forces a clear in Three.js: remove it (and fog) for the focus pass.
    const fog = this.scene.fog, background = this.scene.background;
    this.scene.fog = null;
    this.scene.background = null;
    this.camera.layers.set(1);
    r.render(this.scene, this.camera);
    this.camera.layers.set(0);
    this.scene.fog = fog;
    this.scene.background = background;
    r.autoClear = true;
  }

  /** Put the selected objects on layer 1; drinks are instanced, so they get plain copies there. */
  private updateFocus() {
    const ids = withDescendants(this.state!.items, this.selection);
    const key = [this.state!.items, this.selection, this.drapes.size];
    if (!key.some((v, k) => v !== this.focusKey[k])) return;
    this.focusKey = key;
    for (const o of this.focused) o.layers.disable(1);
    this.focused.clear();
    this.focusDrinks.clear();
    let drinks = 0;
    for (const id of ids) {
      const e = this.entries.get(id);
      if (!e) continue;
      if (holdsLiquid(e.item)) {
        if (++drinks > 300) continue;
        const g = buildDrink(e.item.drink!, hash(e.item.id), e.item.finish.glass);
        g.position.set(...e.item.position);
        g.rotation.y = e.item.rotation;
        g.traverse(o => o.layers.set(1));
        g.updateMatrixWorld(true);
        this.focusDrinks.add(g);
      } else e.group.traverse(o => { o.layers.enable(1); this.focused.add(o); });
    }
  }

  // ------------------------------------------------------------------ document sync

  setAssets(assets: Map<string, EmbeddedAsset>) { this.assets = assets; }

  /** Bring the view up to date. `partial` skips fabric and shadow work for intermediate states. */
  sync(state: DocState, partial = false) {
    this.shadowsDirty = true;
    const prev = this.state;
    this.state = state;
    if (!prev || prev.scene !== state.scene) this.applyScene(state.scene);
    // A partial sync (while re-seating objects) may already have seen these items: the drink
    // batches, fabrics and shadows it skipped still need updating.
    if (prev?.items === state.items) {
      if (!partial && (this.drinksDirty || this.partialPending)) this.finishSync();
      return;
    }
    const seen = new Set<string>();
    for (const item of state.items) {
      seen.add(item.id);
      const e = this.entries.get(item.id);
      if (e && e.item === item) continue;
      if (holdsLiquid(item)) this.drinksDirty = true;
      const key = shapeKey(item);
      if (e && e.shapeKey === key) { e.item = item; this.place(e.group, item); continue; }
      if (e) this.dispose(e);
      const group = this.build(item);
      this.entries.set(item.id, { item, shapeKey: key, group });
      if (!holdsLiquid(item)) this.root.add(group);
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) { if (holdsLiquid(e.item)) this.drinksDirty = true; this.dispose(e); this.entries.delete(id); }
    if (partial) { this.partialPending = true; return; }
    this.finishSync();
  }

  private partialPending = false;
  private finishSync() {
    this.partialPending = false;
    if (this.drinksDirty) this.rebuildDrinks();
    this.updateDrapes();
    this.fitShadows();
    this.invalidate();
  }

  /** Geometry and materials live in shared caches, so removing an object only detaches it. */
  private dispose(e: Entry) { this.root.remove(e.group); }

  private place(g: THREE.Group, i: Item) {
    if (holdsLiquid(i)) this.drinksDirty = true;
    g.position.set(i.position[0], i.type === 'fabric' ? 0 : i.position[1], i.position[2]);
    g.rotation.set(0, i.rotation, 0);
    g.updateMatrixWorld(true);
  }

  private build(i: Item): THREE.Group {
    let g: THREE.Group;
    if (holdsLiquid(i)) g = new THREE.Group();
    else if (i.type === 'fabric') { g = new THREE.Group(); this.attachDrape(g, i); }
    else if (i.type === 'model') { g = new THREE.Group(); this.attachModel(g, i); }
    else g = buildObject(i);
    g.userData.itemId = i.id;
    g.traverse(o => { o.userData.itemId = i.id; if ((o as THREE.Mesh).isMesh) o.updateMatrix(); });
    this.place(g, i);
    return g;
  }

  // ------------------------------------------------------------------ instanced drinks

  /** Meshes of one drink design. Neighbouring glasses use one of three garnish variants. */
  private template(i: Item) {
    const variant = hash(i.id) % 3;
    const key = JSON.stringify([i.drink, i.finish.glass]) + '#' + variant;
    let t = this.templates.get(key);
    if (!t) {
      if (this.templates.size > 300) this.templates.clear();
      const g = buildDrink(i.drink ?? { glass: 'highball', fill: 0, layers: [], garnish: [] }, variant + 1, i.finish.glass);
      g.updateMatrixWorld(true);
      t = [];
      g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) t!.push({ geometry: m.geometry, material: m.material as THREE.Material, matrix: m.matrixWorld.clone(), cast: m.castShadow }); });
      this.templates.set(key, t);
    }
    return { key, parts: t };
  }

  private rebuildDrinks() {
    this.drinksDirty = false;
    const buckets = new Map<string, { part: ReturnType<Viewport['template']>['parts'][number]; matrices: THREE.Matrix4[]; ids: string[] }>();
    const base = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (const e of this.entries.values()) {
      if (!holdsLiquid(e.item)) continue;
      const { key, parts } = this.template(e.item);
      base.compose(p.set(...e.item.position), q.setFromAxisAngle(up, e.item.rotation), one);
      parts.forEach((part, k) => {
        const id = key + '|' + k;
        const b = buckets.get(id) ?? buckets.set(id, { part, matrices: [], ids: [] }).get(id)!;
        b.matrices.push(base.clone().multiply(part.matrix));
        b.ids.push(e.item.id);
      });
    }
    for (const [id, b] of buckets) {
      let batch = this.batches.get(id);
      const n = b.matrices.length;
      if (!batch || batch.mesh.instanceMatrix.count < n) {
        if (batch) { this.batchRoot.remove(batch.mesh); batch.mesh.dispose(); }
        const mesh = new THREE.InstancedMesh(b.part.geometry, b.part.material, Math.max(4, 2 ** Math.ceil(Math.log2(n))));
        mesh.castShadow = b.part.cast;
        mesh.userData.batch = id;
        this.batchRoot.add(mesh);
        batch = { mesh, ids: [] };
        this.batches.set(id, batch);
      }
      batch.mesh.count = n;
      b.matrices.forEach((m, k) => batch!.mesh.setMatrixAt(k, m));
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.mesh.computeBoundingSphere();
      batch.mesh.computeBoundingBox();
      batch.ids = b.ids;
    }
    for (const [id, batch] of this.batches) if (!buckets.has(id)) { this.batchRoot.remove(batch.mesh); batch.mesh.dispose(); this.batches.delete(id); }
  }

  /** Item id under a ray hit, including instanced drinks. */
  private hitId(hit?: THREE.Intersection): string | null {
    if (!hit) return null;
    const batch = hit.object.userData.batch as string | undefined;
    if (batch !== undefined && hit.instanceId !== undefined) return this.batches.get(batch)?.ids[hit.instanceId] ?? null;
    return (hit.object.userData.itemId as string) ?? null;
  }

  // ------------------------------------------------------------------ fabrics

  private drapeFor(i: Item) { return drapeKey(drapeInput(i, this.state!.items)); }

  private attachDrape(g: THREE.Group, i: Item) {
    const key = this.drapeFor(i), cached = this.drapes.get(key);
    if (cached) {
      g.userData.drapeKey = key;
      const m = new THREE.Mesh(cached.geometry, M.fabric(i.finish.main ?? { color: '#ffffff' }));
      m.castShadow = m.receiveShadow = true; m.userData.part = 'main'; m.userData.itemId = i.id;
      g.add(m);
    }
  }

  /** Request settling for fabrics whose supports changed; reuse finished shapes when possible. */
  private updateDrapes() {
    const items = this.state!.items, changed: string[] = [];
    for (const i of items) {
      if (i.type !== 'fabric') continue;
      const e = this.entries.get(i.id)!;
      const input = drapeInput(i, items), key = drapeKey(input);
      const mesh = e.group.children[0] as THREE.Mesh | undefined;
      if (e.group.userData.drapeKey === key && mesh) continue;
      const cached = this.drapes.get(key);
      if (cached) {
        e.group.clear();
        this.attachDrape(e.group, i);
        e.group.userData.drapeKey = key;
        // Surface queries run before the next render, so world matrices must be current now.
        e.group.updateMatrixWorld(true);
        changed.push(i.id);
        continue;
      }
      if (this.pendingDrape.has(i.id)) continue;
      this.pendingDrape.set(i.id, key);
      this.worker.postMessage({ id: ++this.drapeSeq, fabric: i.id, key, input });
    }
    this.events.drapeBusy(this.pendingDrape.size);
    if (changed.length) queueMicrotask(() => this.events.surfacesChanged(changed));
  }

  private onDrape(msg: { fabric: string; key: string; result?: DrapeResult; error?: string }) {
    this.shadowsDirty = true;
    this.pendingDrape.delete(msg.fabric);
    const key = msg.key;
    if (msg.result) {
      const r = msg.result, geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(r.positions, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(r.uvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(r.indices, 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      this.drapes.set(key, { geometry, result: r, index: new SurfaceIndex(r.positions, r.indices) });
      // Keep the cache bounded: old shapes are rarely revisited beyond undo depth.
      if (this.drapes.size > 60) { const first = this.drapes.keys().next().value!; this.drapes.get(first)!.geometry.dispose(); this.drapes.delete(first); }
    } else console.warn('Drapé impossible :', msg.error);
    if (this.state) this.updateDrapes();
    this.invalidate();
  }

  // ------------------------------------------------------------------ imported models

  private attachModel(g: THREE.Group, i: Item) {
    const add = (model: THREE.Group | null) => {
      if (!model) return;
      const m = model.clone(true);
      // Per-instance material copies so recolouring one material never affects other parts.
      let n = 0;
      m.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = mesh.receiveShadow = true;
        const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(mat => {
          const part = 'm' + (mat.userData.index ?? n++), f = i.finish[part], c = (mat as THREE.MeshStandardMaterial).clone();
          if (f) { c.color?.set(f.color); if (f.roughness !== undefined) c.roughness = f.roughness; }
          mesh.userData.part = part;
          return c;
        });
        mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
      });
      g.add(fitModel(m, i));
      g.traverse(o => (o.userData.itemId = i.id));
      g.updateMatrixWorld(true);
      this.invalidate();
      this.events.surfacesChanged([]);
    };
    const cached = this.models.get(i.ref);
    if (cached instanceof THREE.Group || cached === null) return add(cached);
    const promise = cached ?? this.loadModel(i.ref);
    this.models.set(i.ref, promise);
    promise.then(model => { this.models.set(i.ref, model); if (this.entries.get(i.id)?.group === g) add(model); });
  }

  private async loadModel(id: string): Promise<THREE.Group | null> {
    const a = this.assets.get(id);
    if (!a) return null;
    const bin = Uint8Array.from(atob(a.data), c => c.charCodeAt(0));
    const data = a.mime === 'model/gltf+json' ? new TextDecoder().decode(bin) : bin.buffer;
    try {
      const gltf = await new GLTFLoader().parseAsync(data, '');
      let n = 0;
      gltf.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) for (const mat of [m.material].flat()) if (mat.userData.index === undefined) mat.userData.index = n++; });
      return gltf.scene;
    } catch (e) { console.warn(e); return null; }
  }

  /** Natural dimensions and material names of an embedded model, used right after import. */
  async inspectModel(asset: EmbeddedAsset): Promise<{ size: Vec3; materials: { part: string; name: string; color: string }[] }> {
    this.assets.set(asset.id, asset);
    const model = await this.loadModel(asset.id);
    if (!model) throw new Error('Le modèle ne contient aucune géométrie lisible.');
    this.models.set(asset.id, model);
    const box = new THREE.Box3().setFromObject(model), s = box.getSize(new THREE.Vector3());
    if (!(s.x > 0 || s.y > 0 || s.z > 0) || !Number.isFinite(s.x)) throw new Error('Le modèle ne contient aucune géométrie lisible.');
    const materials: { part: string; name: string; color: string }[] = [], seen = new Set<number>();
    model.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of [m.material].flat()) {
        const idx = mat.userData.index as number;
        if (seen.has(idx)) continue;
        seen.add(idx);
        materials.push({ part: 'm' + idx, name: mat.name || 'Matière ' + (idx + 1), color: '#' + ((mat as THREE.MeshStandardMaterial).color?.getHexString() ?? 'ffffff') });
      }
    });
    return { size: [s.x, s.y, s.z], materials };
  }

  // ------------------------------------------------------------------ scene look

  private applyScene(s: SceneSettings) {
    this.shadowsDirty = true;
    const a = AMBIANCES[s.ambiance];
    const bg = new THREE.Color(s.background);
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, 9, 22);
    (this.floor.material as THREE.MeshStandardMaterial).color.set(s.floor);
    this.key.color.set(a.key); this.key.intensity = a.keyI;
    this.hemi.color.set(a.sky); this.hemi.groundColor.set(a.ground); this.hemi.intensity = a.fill;
    this.scene.environmentIntensity = a.env;
    this.renderer.toneMappingExposure = a.exposure;
    this.invalidate();
  }

  private fitShadows() {
    this.shadowsDirty = true;
    const b = this.contentBounds();
    const c = b.isEmpty() ? new THREE.Vector3(0, 0.5, 0) : b.getCenter(new THREE.Vector3());
    const r = b.isEmpty() ? 2 : Math.max(1.5, b.getSize(new THREE.Vector3()).length() / 2 + 0.3);
    this.key.position.set(c.x - r * 0.8, c.y + r * 2.2, c.z + r * 1.4);
    this.key.target.position.copy(c);
    const cam = this.key.shadow.camera;
    cam.left = cam.bottom = -r; cam.right = cam.top = r; cam.near = 0.1; cam.far = r * 6;
    cam.updateProjectionMatrix();
  }

  /**
   * Bounds from stored dimensions (cheap, and independent of mesh detail). Without ids: the
   * composition without backdrops, since a wall would dwarf the table in framing.
   */
  contentBounds(ids?: string[]): THREE.Box3 {
    const b = new THREE.Box3(), v = new THREE.Vector3();
    const add = (e: Entry) => {
      const i = e.item;
      if (i.type === 'fabric') { const mb = new THREE.Box3().setFromObject(e.group); if (!mb.isEmpty()) { b.union(mb); return; } }
      const bottom = i.type === 'fabric' ? 0 : i.position[1], top = i.type === 'fabric' ? 0.8 : i.position[1] + i.size[1];
      for (const [x, z] of footprintCorners(i)) { b.expandByPoint(v.set(x, bottom, z)); b.expandByPoint(v.set(x, top, z)); }
    };
    for (const [id, e] of this.entries) if (ids ? ids.includes(id) : !e.item.ref.startsWith('backdrop')) add(e);
    if (!ids && b.isEmpty()) for (const e of this.entries.values()) add(e);
    return b;
  }

  // ------------------------------------------------------------------ camera

  private animateTo(pos: THREE.Vector3, target: THREE.Vector3, ms = 450) {
    this.anim = { from: [this.camera.position.clone(), this.controls.target.clone()], to: [pos, target], t0: performance.now(), ms };
    this.invalidate();
  }

  /** Turn around the target (radians), and tilt up or down. */
  /** Where the camera is going (repeated key presses add up instead of restarting midway). */
  private cameraGoal(): [THREE.Vector3, THREE.Vector3] {
    return this.anim ? [this.anim.to[0].clone(), this.anim.to[1].clone()] : [this.camera.position.clone(), this.controls.target.clone()];
  }

  orbitBy(az: number, el = 0) {
    const [pos, t] = this.cameraGoal(), s = new THREE.Spherical().setFromVector3(pos.sub(t));
    s.theta += az;
    s.phi = THREE.MathUtils.clamp(s.phi - el, 0.02, this.controls.maxPolarAngle);
    this.animateTo(t.clone().add(new THREE.Vector3().setFromSpherical(s)), t, 220);
  }

  /** Move closer (factor < 1) or further away. */
  zoomBy(factor: number) {
    const [pos, t] = this.cameraGoal(), off = pos.sub(t);
    off.setLength(THREE.MathUtils.clamp(off.length() * factor, this.controls.minDistance, this.controls.maxDistance));
    this.animateTo(t.clone().add(off), t, 200);
  }

  /** Slide the view sideways or up, as a fraction of what is visible. */
  panBy(dx: number, dy: number) {
    const [pos, t] = this.cameraGoal(), h = 2 * pos.distanceTo(t) * Math.tan((this.camera.fov * Math.PI) / 360);
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const off = right.multiplyScalar(dx * h * this.camera.aspect).addScaledVector(up, dy * h);
    this.animateTo(pos.add(off), t.add(off), 200);
  }

  /** While Space is held, a drag with the left button slides the view (trackpads have no right drag). */
  private panMode = false;
  setPanMode(on: boolean) {
    if (on === this.panMode || (on && this.pointer)) return;
    this.panMode = on;
    this.controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.host.classList.toggle('panning', on);
  }

  /** Frame the selection or the whole composition from a named direction. */
  frame(view: ViewName = 'perspective', ids?: string[], instant = false) {
    const b = this.contentBounds(ids?.length ? ids : undefined);
    if (b.isEmpty()) b.set(new THREE.Vector3(-1, 0, -0.5), new THREE.Vector3(1, 1, 0.5));
    const sphere = b.getBoundingSphere(new THREE.Sphere());
    // A single glass framed alone fills the screen: keep some of its surroundings in view.
    sphere.radius = Math.max(sphere.radius, 0.3);
    const dir = VIEW_DIRS[view] ?? VIEW_DIRS.perspective;
    const fov = (this.camera.fov * Math.PI) / 180, fit = Math.min(fov, fov * this.camera.aspect);
    const dist = (sphere.radius * 1.08) / Math.sin(fit / 2);
    const target = sphere.center.clone();
    const pos = new THREE.Vector3(Math.sin(dir.az) * Math.cos(dir.el), Math.sin(dir.el), Math.cos(dir.az) * Math.cos(dir.el)).multiplyScalar(dist).add(target);
    if (instant) { this.camera.position.copy(pos); this.controls.target.copy(target); this.invalidate(); }
    else this.animateTo(pos, target);
  }

  currentView(): Omit<CameraView, 'id' | 'name'> {
    const p = this.camera.position, t = this.controls.target;
    return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z], fov: this.camera.fov };
  }

  applyView(v: Omit<CameraView, 'id' | 'name'>, instant = false) {
    this.camera.fov = v.fov; this.camera.updateProjectionMatrix();
    const pos = new THREE.Vector3(...v.position), target = new THREE.Vector3(...v.target);
    if (instant) { this.anim = undefined; this.camera.position.copy(pos); this.controls.target.copy(target); this.controls.update(); this.invalidate(); }
    else this.animateTo(pos, target);
  }

  // ------------------------------------------------------------------ surfaces

  private surfaceMeshes(exclude: Set<string>, forType?: Item['type']): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const [id, e] of this.entries) {
      if (exclude.has(id)) continue;
      const t = e.item.type;
      if (t === 'table' || t === 'riser' || (t === 'model' && e.item.support)) out.push(e.group);
      // Risers ignore drapés that pass over them, otherwise they would climb onto their own cover.
      else if (t === 'fabric' && !(forType === 'riser' && fabricCovers(e.item) === 'all')) out.push(e.group);
    }
    return out;
  }

  /**
   * Height of the surface under (x, z) and the support object underneath. Fabrics count as
   * surfaces, but the reported support is the solid object below the cloth.
   */
  probe(x: number, z: number, exclude: Set<string>, forType?: Item['type']): { y: number; support?: string } {
    // Solid supports by ray; their meshes are small.
    const solids: THREE.Object3D[] = [];
    for (const [id, e] of this.entries) {
      const t = e.item.type;
      if (!exclude.has(id) && (t === 'table' || t === 'riser' || (t === 'model' && e.item.support))) solids.push(e.group);
    }
    this.ray.set(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
    this.ray.far = 40;
    const hit = this.ray.intersectObjects(solids, true)[0];
    let y = hit ? hit.point.y : 0;
    const support = this.hitId(hit) ?? undefined;
    // Settled fabrics through their height index.
    for (const [id, e] of this.entries) {
      if (e.item.type !== 'fabric' || exclude.has(id) || (forType === 'riser' && fabricCovers(e.item) === 'all')) continue;
      const d = this.drapes.get(e.group.userData.drapeKey);
      if (!d) continue;
      const c = Math.cos(e.item.rotation), s = Math.sin(e.item.rotation), dx = x - e.item.position[0], dz = z - e.item.position[2];
      const h = d.index.heightAt(dx * c - dz * s, dx * s + dz * c);
      if (h > y) y = h;
    }
    return { y, support };
  }

  /** Resting height for an object at (x, z), sampling its foot so it never sinks into a slope. */
  restingHeight(item: Item, x: number, z: number, exclude: Set<string>): { y: number; support?: string } {
    if (item.type === 'table' || item.type === 'fabric') return { y: 0 };
    if (item.ref.startsWith('backdrop')) return { y: 0 };
    const r = holdsLiquid(item) ? glassFootRadius(glassProfile(item.drink?.glass ?? 'highball')) * 0.7 : Math.min(item.size[0], item.size[2]) * 0.35;
    const centre = this.probe(x, z, exclude, item.type);
    let y = centre.y;
    if (!isSupport(item) || item.type === 'riser') {
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) y = Math.max(y, this.probe(x + dx, z + dz, exclude, item.type).y);
    }
    return { y, support: centre.support };
  }

  // ------------------------------------------------------------------ selection & overlay

  setSelection(ids: string[]) { this.selection = ids; this.invalidate(); }

  private outlines = new THREE.Group();
  private outlineMat = new THREE.LineBasicMaterial({ color: '#1f6feb', depthTest: false, transparent: true });
  private hoverMat = new THREE.LineBasicMaterial({ color: '#1f6feb', depthTest: false, transparent: true, opacity: 0.35 });

  private makeRing() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 6, 128).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1f6feb', depthTest: false, transparent: true, opacity: 0.55 }));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: '#1f6feb', depthTest: false }));
    knob.position.set(1, 0, 0);
    knob.userData.rotateHandle = true; ring.userData.rotateHandle = true;
    ring.renderOrder = knob.renderOrder = 10;
    g.add(ring, knob);
    g.visible = false;
    return g;
  }

  private overlayKey: unknown[] = [];
  /** Grid snapping, shown on the support under the dragged object. */
  snap = { enabled: true, step: 0.05 };
  private dragging: { id: string; free: boolean } | null = null;
  private snapGrid = new THREE.Group();

  private updateOverlay() {
    const show = this.helpersVisible;
    this.ghost.visible = show;
    const ids = show ? this.selection : [];
    // Outlines change only with the selection, the hover or the objects: not while orbiting.
    const key = [this.state?.items, ids, show && this.hovered, this.drapes.size, this.dragging?.free, this.snap.enabled, this.snap.step];
    if (key.some((v, k) => v !== this.overlayKey[k])) {
      this.overlayKey = key;
      this.overlay.remove(this.outlines);
      this.outlines.traverse(o => (o as THREE.Line).geometry?.dispose());
      this.outlines = new THREE.Group();
      this.overlay.add(this.outlines);
      for (const id of ids) this.outline(id, this.outlineMat);
      if (show && this.hovered && !ids.includes(this.hovered)) this.outline(this.hovered, this.hoverMat);
      this.drawSnapGrid();
    }
    // Rotation ring around the selection's footprint, scaled to stay usable at any zoom.
    const movable = ids.filter(id => !this.entries.get(id)?.item.locked);
    if (movable.length && !this.pointer?.mode.startsWith('m')) {
      const b = this.contentBounds(movable), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
      const r = Math.max(0.08, Math.hypot(s.x, s.z) / 2 + 0.04);
      this.ring.position.set(c.x, b.min.y + 0.003, c.z);
      this.ring.scale.setScalar(r);
      // Knob keeps a constant on-screen size; it sits on the ring at the front-right.
      const knob = this.ring.children[1];
      // Finger-sized on touch screens.
      knob.scale.setScalar((this.camera.position.distanceTo(this.ring.position) * (this.coarse ? 0.016 : 0.008)) / (r * 0.045));
      this.ring.visible = true;
    } else this.ring.visible = false;
    // Helpers are drawn above the focus veil.
    this.overlay.traverse(o => o.layers.enable(1));
  }

  /** Snapping grid on the surface the dragged object rests on, aligned to that surface. */
  private drawSnapGrid() {
    this.overlay.remove(this.snapGrid);
    this.snapGrid.traverse(o => (o as THREE.LineSegments).geometry?.dispose());
    this.snapGrid = new THREE.Group();
    const d = this.dragging, item = d && this.entries.get(d.id)?.item;
    // Glasses snap by the centimetre: a grid that fine would only clutter the table.
    if (!item || d.free || !this.snap.enabled || !this.helpersVisible || holdsLiquid(item)) return;
    const support = item.parentId ? this.entries.get(item.parentId)?.item : undefined;
    const base = support ?? { position: [item.position[0], 0, item.position[2]], rotation: 0, size: [2, 0, 2] as Vec3 };
    const [w, , dd] = support ? support.size : base.size;
    let step = this.snap.step;
    while (Math.max(w, dd) / step > 80) step *= 2;
    const pts: number[] = [], y = item.position[1] + 0.0015;
    for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) pts.push(x, 0, -dd / 2, x, 0, dd / 2);
    for (let z = -dd / 2; z <= dd / 2 + 1e-6; z += step) pts.push(-w / 2, 0, z, w / 2, 0, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(geo, this.gridMat);
    lines.position.set(base.position[0], y, base.position[2]);
    lines.rotation.y = base.rotation;
    lines.renderOrder = 8;
    this.snapGrid.add(lines);
    this.overlay.add(this.snapGrid);
  }
  // Under objects (depth-tested) and light, so it guides without covering what is dragged.
  private gridMat = new THREE.LineBasicMaterial({ color: '#1f6feb', transparent: true, opacity: 0.14, depthWrite: false });

  private outline(id: string, mat: THREE.LineBasicMaterial) {
    const e = this.entries.get(id);
    if (!e) return;
    const i = e.item;
    let pts: THREE.Vector3[];
    const y = (i.type === 'fabric' ? 0 : i.position[1]) + 0.002;
    if (i.type === 'fabric') {
      const b = new THREE.Box3().setFromObject(e.group);
      if (b.isEmpty()) return;
      pts = [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.max.x, b.max.z], [b.min.x, b.max.z]].map(([x, z]) => new THREE.Vector3(x, b.max.y + 0.002, z));
    } else if (i.shape === 'round' || i.shape === 'highboy' || holdsLiquid(i)) {
      const r = i.size[0] / 2 + 0.006;
      pts = Array.from({ length: 48 }, (_, k) => new THREE.Vector3(i.position[0] + Math.cos(k / 48 * Math.PI * 2) * r, y, i.position[2] + Math.sin(k / 48 * Math.PI * 2) * r));
    } else {
      const c = Math.cos(i.rotation), s = Math.sin(i.rotation), w = i.size[0] / 2 + 0.006, d = i.size[2] / 2 + 0.006;
      pts = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, z]) => new THREE.Vector3(i.position[0] + x * c + z * s, y, i.position[2] - x * s + z * c));
      if (i.type === 'riser' || i.type === 'table') {
        // Top edge too, so tall objects read clearly.
        const top = pts.map(p => p.clone().setY(i.position[1] + i.size[1] + 0.002));
        const l2 = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(top), mat);
        l2.renderOrder = 9; this.outlines.add(l2);
      }
    }
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
    line.renderOrder = 9;
    this.outlines.add(line);
  }

  // ------------------------------------------------------------------ ghosts (placement previews)

  /** Show translucent copies of `items` where they would be placed. */
  showGhosts(items: Item[]) {
    this.ghost.clear();
    for (const i of items) {
      const g = holdsLiquid(i) ? buildDrink({ ...i.drink!, garnish: [], ice: 0 }, 1) : i.type === 'fabric' ? fabricGhost(i) : buildObject(i);
      g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = this.ghostMat; m.castShadow = false; } });
      this.place(g, i);
      if (i.type === 'fabric') g.position.y = 0.002;
      this.ghost.add(g);
    }
    this.invalidate();
  }
  clearGhosts() { if (this.ghost.children.length) { this.ghost.clear(); this.invalidate(); } }

  // ------------------------------------------------------------------ pointer

  /** World point under the cursor on surfaces (or the floor), ignoring `exclude`. */
  pick(clientX: number, clientY: number, exclude = new Set<string>(), forType?: Item['type']): { point: THREE.Vector3; support?: string } {
    this.setRay(clientX, clientY);
    const hits = this.ray.intersectObjects([...this.surfaceMeshes(exclude, forType), this.floor], true);
    for (const h of hits) {
      // Accept only upward-facing hits: you place things on tops, not on sides.
      const n = h.face?.normal.clone().transformDirection(h.object.matrixWorld);
      if (h.object.userData.floor) return { point: h.point };
      if (n && n.y > 0.5) return { point: h.point, support: h.object.userData.itemId };
    }
    const p = new THREE.Vector3();
    this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    return { point: p };
  }

  private setRay(clientX: number, clientY: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.ray.far = 100;
  }

  itemAt(clientX: number, clientY: number): string | null {
    this.setRay(clientX, clientY);
    const hit = this.ray.intersectObjects(this.root.children, true)[0], id = this.hitId(hit);
    const it = id ? this.entries.get(id)?.item : undefined;
    if (it && holdsLiquid(it)) return id;
    return this.glassNear(clientX, clientY, hit?.distance ?? Infinity) ?? id;
  }

  /**
   * Glasses are a few pixels wide at a normal zoom: a click just beside one (on the table or the
   * riser under it) takes the glass, as long as nothing stands in front of it.
   */
  private glassNear(x: number, y: number, depth: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect(), v = new THREE.Vector3(), edge = new THREE.Vector3();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const slack = this.coarse ? 14 : 6;
    let best: string | null = null, bestD = Infinity;
    for (const [id, e] of this.entries) {
      const i = e.item;
      if (!holdsLiquid(i)) continue;
      v.set(i.position[0], i.position[1] + i.size[1] / 2, i.position[2]);
      if (v.distanceTo(this.camera.position) > depth + 0.05) continue;
      edge.copy(v).addScaledVector(right, i.size[0] / 2).project(this.camera);
      v.project(this.camera);
      if (v.z > 1) continue;
      const sx = r.left + ((v.x + 1) / 2) * r.width, sy = r.top + ((1 - v.y) / 2) * r.height;
      const rx = Math.abs(edge.x - v.x) / 2 * r.width, ry = rx * (i.size[1] / i.size[0]);
      // Ellipse around the glass on screen, widened by a few pixels.
      const d = Math.hypot((x - sx) / (rx + slack), (y - sy) / (ry + slack));
      if (d < 1 && d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    // Touch: a long press opens the context menu (there is no right click on a tablet).
    let press: { timer: number; x: number; y: number } | null = null;
    const cancelPress = () => { if (press) { clearTimeout(press.timer); press = null; } };
    el.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      cancelPress();
      const x = e.clientX, y = e.clientY;
      press = { x, y, timer: window.setTimeout(() => {
        press = null;
        if (this.pointer && this.pointer.mode !== 'pending' && this.pointer.mode !== 'orbit') return;
        this.pointer = undefined;
        this.controls.enabled = true;
        this.events.contextMenu(this.itemAt(x, y), x, y);
      }, 550) };
    });
    el.addEventListener('pointermove', e => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress(); });
    el.addEventListener('pointerup', cancelPress);
    el.addEventListener('pointercancel', cancelPress);
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || this.pointer || this.panMode) return;
      el.focus();
      this.anim = undefined;
      // Rotation handle first.
      this.setRay(e.clientX, e.clientY);
      if (this.ring.visible && this.ray.intersectObjects(this.ring.children, false).length) {
        const c = this.ring.position, ang = this.pointerAngle(e.clientX, e.clientY, c);
        this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'rotate', ids: this.selection.filter(id => !this.entries.get(id)?.item.locked), anchor: c.clone(), plane: new THREE.Plane(), last: [0, 0, 0], start: 0, pivot: [c.x, c.y, c.z], startAngle: ang, lastYaw: 0, additive: false };
        this.controls.enabled = false;
        grabPointer(el, e.pointerId);
        return;
      }
      const id = this.itemAt(e.clientX, e.clientY);
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      // A drag that starts on the selection always moves all of it, whatever the tool or
      // modifier; a click on it with Shift (no drag) still removes that object.
      const onSelection = !!id && this.selection.includes(id) && !e.altKey;
      // With the selection tool on, a drag elsewhere draws a box (in a dense display almost every
      // point is on a glass); a tap without moving still selects what is under it.
      if (this.boxTool && !onSelection) {
        this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'box', ids: id ? [id] : [], anchor: new THREE.Vector3(), plane: new THREE.Plane(), last: [0, 0, 0], start: performance.now(), pivot: [0, 0, 0], startAngle: 0, lastYaw: 0, additive };
        this.controls.enabled = false;
        grabPointer(el, e.pointerId);
        return;
      }
      if (!id) {
        const box = e.shiftKey;
        this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: box ? 'box' : 'orbit', ids: [], anchor: new THREE.Vector3(), plane: new THREE.Plane(), last: [0, 0, 0], start: performance.now(), pivot: [0, 0, 0], startAngle: 0, lastYaw: 0, additive };
        if (box) { this.controls.enabled = false; grabPointer(el, e.pointerId); }
        return;
      }
      if (additive && !onSelection) { this.events.select([id], 'toggle'); return; }
      if (!onSelection) this.events.select([id], e.altKey ? 'single' : 'replace');
      let ids = this.selection.filter(s => !this.entries.get(s)?.item.locked);
      // The grabbed object leads the drag (its surface and its snapping).
      if (ids.includes(id)) ids = [id, ...ids.filter(s => s !== id)];
      if (!ids.length) { if (additive) this.events.select([id], 'toggle'); return; }
      // A cloth lying on a table drags the whole dressed table; Alt moves the cloth alone.
      if (!e.altKey) ids = [...new Set(ids.map(s => { const it = this.entries.get(s)?.item; return it?.type === 'fabric' && it.parentId && !this.entries.get(it.parentId)?.item.locked ? it.parentId : s; }))];
      // Grab point on a horizontal plane through the hit, so the object follows the cursor exactly.
      const hit = this.ray.intersectObjects(this.root.children, true)[0];
      const e0 = this.entries.get(ids.includes(id) ? id : ids[0])!;
      const anchor = new THREE.Vector3(e0.item.position[0], 0, e0.item.position[2]);
      // Objects follow the surface under the cursor, so the grab offset is measured at the height
      // they stand on: grabbing a glass by its rim must not make it jump behind the pointer.
      const planeY = e0.item.type === 'table' ? (hit?.point.y ?? 0) : e0.item.position[1];
      this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'pending', ids, anchor, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), last: [0, 0, 0], start: performance.now(), pivot: [0, 0, 0], startAngle: 0, lastYaw: 0, additive, toggle: additive ? id : undefined };
      const grab = new THREE.Vector3();
      this.ray.ray.intersectPlane(this.pointer.plane, grab);
      this.pointer.anchor.sub(grab);
      this.controls.enabled = false;
      grabPointer(el, e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      const p = this.pointer;
      if (!p) {
        const id = e.buttons ? null : this.itemAt(e.clientX, e.clientY);
        if (id !== this.hovered) { this.hovered = id; this.events.hover(id); el.style.cursor = id ? 'pointer' : ''; this.invalidate(); }
        return;
      }
      if (p.id !== e.pointerId) return;
      if (p.mode === 'pending' && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) { p.mode = 'move'; this.hovered = null; }
      if (p.mode === 'move') this.dragMove(e.clientX, e.clientY, p, false, e.altKey);
      if (p.mode === 'rotate') this.dragRotate(e, p, false);
      if (p.mode === 'box') this.drawMarquee(p.x, p.y, e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      const p = this.pointer;
      if (!p || p.id !== e.pointerId) return;
      this.pointer = undefined;
      this.controls.enabled = true;
      if (p.mode === 'move') this.dragMove(e.clientX, e.clientY, p, true, e.altKey);
      else if (p.mode === 'rotate') this.dragRotate(e, p, true);
      else if (p.mode === 'box') {
        if (p.ids.length && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) this.events.select(p.ids, p.additive ? 'toggle' : 'replace');
        else this.finishMarquee(p.x, p.y, e.clientX, e.clientY, p.additive);
      }
      else if (p.mode === 'orbit' && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 4 && !p.additive) this.events.select([], 'replace');
      else if (p.mode === 'pending' && p.toggle) this.events.select([p.toggle], 'toggle');
      this.invalidate();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', () => { if (this.hovered && !this.pointer) { this.hovered = null; this.events.hover(null); this.invalidate(); } });
    el.addEventListener('dblclick', e => { const id = this.itemAt(e.clientX, e.clientY); if (id) this.frameKeepingDirection([...withDescendants(this.state!.items, [id])]); });
    // Right drag slides the view: the menu opens only for a right click that did not move.
    let right: { x: number; y: number } | null = null;
    el.addEventListener('pointerdown', e => { right = e.button === 2 ? { x: e.clientX, y: e.clientY } : null; });
    el.addEventListener('pointerup', e => {
      if (e.button !== 2 || !right) return;
      const still = Math.hypot(e.clientX - right.x, e.clientY - right.y) < 5;
      right = null;
      if (still) this.events.contextMenu(this.itemAt(e.clientX, e.clientY), e.clientX, e.clientY);
    });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  private drawMarquee(x0: number, y0: number, x1: number, y1: number) {
    const r = this.host.getBoundingClientRect(), m = this.marquee;
    if (!m.isConnected) this.host.append(m);
    Object.assign(m.style, { left: Math.min(x0, x1) - r.left + 'px', top: Math.min(y0, y1) - r.top + 'px', width: Math.abs(x1 - x0) + 'px', height: Math.abs(y1 - y0) + 'px' });
  }

  /** Select every object whose centre falls inside the box drawn on screen. */
  private finishMarquee(x0: number, y0: number, x1: number, y1: number, additive: boolean) {
    this.marquee.remove();
    if (Math.hypot(x1 - x0, y1 - y0) < 6) { if (!additive) this.events.select([], 'replace'); return; }
    const r = this.renderer.domElement.getBoundingClientRect(), v = new THREE.Vector3();
    const [left, right, top, bottom] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
    const ids: string[] = [];
    // Like design tools: only objects entirely inside the box, so a box drawn around the glasses
    // on a table does not also take the table.
    for (const [id, e] of this.entries) {
      const i = e.item;
      if (i.type === 'fabric') continue;
      const bottomY = i.position[1], topY = i.position[1] + i.size[1];
      const inside = footprintCorners(i).every(([x, z]) => [bottomY, topY].every(y => {
        v.set(x, y, z).project(this.camera);
        const sx = r.left + ((v.x + 1) / 2) * r.width, sy = r.top + ((1 - v.y) / 2) * r.height;
        return v.z < 1 && sx >= left && sx <= right && sy >= top && sy <= bottom;
      }));
      if (inside) ids.push(id);
    }
    this.events.select(ids, additive ? 'add' : 'replace');
  }

  private dragMove(x: number, y: number, p: NonNullable<Viewport['pointer']>, final: boolean, free = false) {
    const items = this.state!.items, moving = withDescendants(items, p.ids);
    const primary = this.entries.get(p.ids[0])?.item;
    if (!primary) return;
    // Follow surfaces: project the cursor onto what is under it, excluding what is moving.
    const hit = this.pick(x, y, moving, primary.type);
    const target = hit.point.clone();
    // Grab offset measured on the initial plane keeps the object under the cursor.
    this.setRay(x, y);
    const onPlane = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(p.plane, onPlane) && primary.type === 'table') target.copy(onPlane);
    const nx = target.x + p.anchor.x, nz = target.z + p.anchor.z;
    const delta: Vec3 = [nx - primary.position[0], 0, nz - primary.position[2]];
    if (Math.abs(delta[0]) + Math.abs(delta[2]) < 1e-5 && !final) return;
    this.dragging = final ? null : { id: primary.id, free };
    this.events.move(p.ids, delta, final, free);
  }

  private pointerAngle(x: number, y: number, centre: THREE.Vector3) {
    this.setRay(x, y);
    const pt = new THREE.Vector3();
    this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -centre.y), pt);
    return Math.atan2(-(pt.z - centre.z), pt.x - centre.x);
  }

  private dragRotate(e: PointerEvent, p: NonNullable<Viewport['pointer']>, final: boolean) {
    const ang = this.pointerAngle(e.clientX, e.clientY, new THREE.Vector3(...p.pivot));
    let yaw = ang - p.startAngle;
    if (!e.altKey) yaw = Math.round(yaw / (Math.PI / 12)) * (Math.PI / 12);
    const step = yaw - p.lastYaw;
    p.lastYaw = yaw;
    if (step || final) this.events.rotate(p.ids, step, p.pivot, final);
  }

  /** Library drag-and-drop: where an object would land. */
  dropPoint(clientX: number, clientY: number, type: Item['type']) { return this.pick(clientX, clientY, new Set(), type); }

  // ------------------------------------------------------------------ output

  /** Render the current camera to an image without editor overlays. */
  capture(width: number, height: number, view?: Omit<CameraView, 'id' | 'name'>): string {
    const prev = { w: this.size.w, h: this.size.h, pos: this.camera.position.clone(), target: this.controls.target.clone(), fov: this.camera.fov, ratio: this.renderer.getPixelRatio() };
    this.overlay.visible = false;
    if (view) { this.camera.position.set(...view.position); this.controls.target.set(...view.target); this.camera.fov = view.fov; this.camera.lookAt(this.controls.target); }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.overlay.visible = true;
    this.renderer.setPixelRatio(prev.ratio);
    this.camera.position.copy(prev.pos); this.controls.target.copy(prev.target); this.camera.fov = prev.fov;
    this.resize();
    this.camera.lookAt(this.controls.target);
    this.tick();
    return url;
  }

  /**
   * A plain copy of the composition (or of some objects) for export: drinks as individual
   * meshes, fabrics with their settled shape, no editor helpers.
   */
  exportObject(ids?: string[]): THREE.Group {
    const out = new THREE.Group();
    out.name = this.state?.name ?? 'WallerSketch';
    for (const [id, e] of this.entries) {
      if (ids && !ids.includes(id)) continue;
      const i = e.item;
      const g = holdsLiquid(i) ? buildDrink(i.drink!, hash(i.id), i.finish.glass) : e.group.clone(true);
      g.name = i.name;
      g.position.set(i.position[0], i.type === 'fabric' ? 0 : i.position[1], i.position[2]);
      g.rotation.set(0, i.rotation, 0);
      out.add(g);
    }
    out.updateMatrixWorld(true);
    return out;
  }

  /** Warm up shaders for the current scene so the first interaction does not stall. */
  async prepare() { await this.renderer.compileAsync(this.scene, this.camera); this.invalidate(); }

  get busy() { return this.pendingDrape.size > 0; }

  /** Resolves once every fabric has settled (for renders requested by assistants). */
  whenSettled(): Promise<void> {
    return new Promise(resolve => { const check = () => (this.busy ? setTimeout(check, 50) : resolve()); check(); });
  }

  stats() { const i = this.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures }; }
}

function fabricGhost(i: Item) {
  const g = new THREE.Group();
  const geom = i.shape === 'round' ? new THREE.CircleGeometry(i.size[0] / 2, 48) : new THREE.PlaneGeometry(i.size[0], i.size[2]);
  g.add(new THREE.Mesh(geom.rotateX(-Math.PI / 2)));
  return g;
}

/** Orient, ground and scale an imported model to the item's size (scale applies after the tilt). */
function fitModel(model: THREE.Object3D, i: Item): THREE.Group {
  const turned = new THREE.Group(), holder = new THREE.Group();
  model.rotation.set(((i.tilt?.[0] ?? 0) * Math.PI) / 2, 0, ((i.tilt?.[1] ?? 0) * Math.PI) / 2);
  turned.add(model);
  turned.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(turned), s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);
  holder.add(turned);
  const k = (a: number, b: number) => (b > 1e-6 ? a / b : 1);
  holder.scale.set(k(i.size[0], s.x), k(i.size[1], s.y), k(i.size[2], s.z));
  return holder;
}

export function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
