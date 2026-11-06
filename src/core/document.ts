// Document state with undo/redo. States are immutable snapshots that share unchanged items,
// so history costs one array of references per step, never a copy of embedded files.
import type { DocState, EmbeddedAsset, SceneSettings } from './types';

export const DEFAULT_SCENE: SceneSettings = { ambiance: 'studio', floor: '#e9e5de', background: '#f1eee9' };

export function emptyState(name = 'Sans titre'): DocState {
  return { name, items: [], views: [], arrangements: [], scene: { ...DEFAULT_SCENE } };
}

type Listener = (state: DocState, previous: DocState) => void;

const HISTORY_LIMIT = 300;

export class Document {
  state: DocState;
  /** Embedded models and textures, keyed by id. Kept outside history: they are immutable and only pruned on save. */
  assets = new Map<string, EmbeddedAsset>();
  /** Increments on New/Open so late async results can tell they belong to an old document. */
  generation = 0;
  filePath?: string;
  private saved: DocState;
  private past: DocState[] = [];
  private future: DocState[] = [];
  private mergeKey?: string;
  private listeners = new Set<Listener>();

  constructor(state = emptyState()) { this.state = this.saved = state; }

  get dirty() { return this.state !== this.saved; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /**
   * Apply an edit. Edits sharing a `merge` key (a slider drag, a pointer drag) collapse into one
   * undo step until another kind of edit happens.
   */
  update(fn: (s: DocState) => DocState, merge?: string) {
    const prev = this.state, next = fn(prev);
    if (next === prev) return;
    if (!(merge && merge === this.mergeKey)) {
      this.past.push(prev);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.mergeKey = merge;
    this.future = [];
    this.state = next;
    this.emit(prev);
  }

  /**
   * Replace the current state without a new undo step. Used for consequences of an edit that
   * arrive later (objects re-seated once a fabric has settled). A clean document stays clean.
   */
  amend(fn: (s: DocState) => DocState) {
    const prev = this.state, next = fn(prev);
    if (next === prev) return;
    if (prev === this.saved) this.saved = next;
    this.state = next;
    this.emit(prev);
  }

  /** End a merged edit so the next edit starts a new undo step. */
  seal() { this.mergeKey = undefined; }

  undo() { this.step(this.past, this.future); }
  redo() { this.step(this.future, this.past); }

  private step(from: DocState[], to: DocState[]) {
    const s = from.pop();
    if (!s) return;
    to.push(this.state);
    const prev = this.state;
    this.state = s;
    this.mergeKey = undefined;
    this.emit(prev);
  }

  /** Replace the whole document (New / Open / recovery). */
  replace(state: DocState, assets: EmbeddedAsset[], filePath?: string, clean = true) {
    const prev = this.state;
    this.generation++;
    this.state = state;
    this.saved = clean ? state : emptyState();
    this.past = []; this.future = []; this.mergeKey = undefined;
    this.assets = new Map(assets.map(a => [a.id, a]));
    this.filePath = filePath;
    this.emit(prev);
  }

  /** Mark a specific snapshot as saved. Edits made meanwhile stay dirty because they are newer snapshots. */
  markSaved(state: DocState, generation: number, filePath?: string) {
    if (generation !== this.generation) return false;
    this.saved = state;
    if (filePath) this.filePath = filePath;
    this.emit(this.state);
    return true;
  }

  private emit(prev: DocState) { for (const l of this.listeners) l(this.state, prev); }
}
