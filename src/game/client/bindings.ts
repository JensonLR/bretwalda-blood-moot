// One binding table, keyed on physical position.
//
// See docs/KEYBINDS.md for why this exists. The short version: the game used to
// test `event.key`, which is the CHARACTER a key produces. On AZERTY the keys in
// the WASD positions produce z q s d, so a French or Belgian player pressing the
// shape everyone knows walked nowhere; Dvorak and Colemak are wrong differently.
// `event.code` is the physical position — `KeyW` is the same key on every
// layout — so every binding here is a code, and the defaults reproduce exactly
// what the literals in input.ts used to do.
//
// Mouse buttons are bindings too, written `Mouse0`..`Mouse4`, because block is
// right-mouse today and a player who wants it on a key must be able to say so.

// ---------------------------------------------------------------------------
// The actions
// ---------------------------------------------------------------------------

export type ActionId =
  | "forward" | "back" | "left" | "right"
  | "sprint" | "dodge" | "crouch"
  | "attack" | "heavy" | "block" | "ability";

export interface ActionMeta {
  id: ActionId;
  /** For the settings list. */
  label: string;
  /** One line under the label. */
  hint: string;
  /**
   * Desktop only. Crouch is deliberately absent from the touch path (see the
   * hit-zone work) and a remap screen must not imply a phone can crouch.
   */
  desktopOnly?: boolean;
  /** The four movement keys also choose the swing direction. Worth saying. */
  alsoAims?: boolean;
}

/** Display order for the settings screen. */
export const ACTIONS: readonly ActionMeta[] = Object.freeze([
  { id: "forward", label: "Forward", hint: "Walk forward — overhead cut", alsoAims: true },
  { id: "back", label: "Back", hint: "Walk back — thrust", alsoAims: true },
  { id: "left", label: "Left", hint: "Step left — cut from the left", alsoAims: true },
  { id: "right", label: "Right", hint: "Step right — cut from the right", alsoAims: true },
  { id: "sprint", label: "Sprint", hint: "Run, at the cost of wind" },
  { id: "dodge", label: "Dodge", hint: "Roll clear" },
  { id: "crouch", label: "Crouch", hint: "Duck a high blow", desktopOnly: true },
  { id: "attack", label: "Attack", hint: "Swing" },
  { id: "heavy", label: "Heavy attack", hint: "A slower, harder blow" },
  { id: "block", label: "Block", hint: "Raise the shield" },
  { id: "ability", label: "Class deed", hint: "The warrior's own trick" },
]);

const ACTION_IDS: readonly ActionId[] = ACTIONS.map((a) => a.id);

/** A `KeyboardEvent.code`, or `Mouse0`..`Mouse4` for a mouse button. */
export type BindingCode = string;

export type Bindings = Readonly<Record<ActionId, readonly BindingCode[]>>;

/**
 * Exactly today's behaviour, expressed as physical positions.
 *
 * `shift` and `control` as `event.key` matched either side of the keyboard, so
 * both sides are bound. The arrow keys were already the alternate for WASD and
 * they survive as second bindings.
 */
export const DEFAULT_BINDINGS: Bindings = Object.freeze({
  forward: Object.freeze(["KeyW", "ArrowUp"]),
  back: Object.freeze(["KeyS", "ArrowDown"]),
  left: Object.freeze(["KeyA", "ArrowLeft"]),
  right: Object.freeze(["KeyD", "ArrowRight"]),
  sprint: Object.freeze(["ShiftLeft", "ShiftRight"]),
  dodge: Object.freeze(["Space"]),
  crouch: Object.freeze(["ControlLeft", "ControlRight"]),
  attack: Object.freeze(["Mouse0"]),
  heavy: Object.freeze(["KeyE", "KeyV"]),
  block: Object.freeze(["Mouse2"]),
  ability: Object.freeze(["KeyQ"]),
}) as Bindings;

/** Most a single action will hold. Two is the shipped shape; three leaves room. */
export const MAX_BINDINGS_PER_ACTION = 3;

/**
 * Keys the browser or the game has already spoken for. Refused with a reason
 * rather than accepted and then silently not working.
 */
export const RESERVED_CODES: Readonly<Record<string, string>> = Object.freeze({
  Escape: "Escape closes menus.",
  Tab: "Tab moves between controls on the page.",
  F5: "F5 reloads the page; the browser takes it first.",
  F11: "F11 is the browser's full screen.",
  F12: "F12 opens the browser's tools.",
  MetaLeft: "The system key cannot be held reliably in a browser.",
  MetaRight: "The system key cannot be held reliably in a browser.",
  ContextMenu: "The menu key is the browser's.",
});

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

const STORE_KEY = "bretwalda.bindings";

function cloneDefaults(): Record<ActionId, BindingCode[]> {
  const out = {} as Record<ActionId, BindingCode[]>;
  for (const id of ACTION_IDS) out[id] = [...DEFAULT_BINDINGS[id]];
  return out;
}

let table: Record<ActionId, BindingCode[]> = cloneDefaults();
/** Replaced, never mutated in place, so `useSyncExternalStore` can compare it. */
let snapshot: Bindings = freeze(table);
let loaded = false;

const listeners = new Set<() => void>();
let persist: ((bindings: Bindings) => void) | null = null;

function freeze(t: Record<ActionId, BindingCode[]>): Bindings {
  const out = {} as Record<ActionId, readonly BindingCode[]>;
  for (const id of ACTION_IDS) out[id] = Object.freeze([...t[id]]);
  return Object.freeze(out) as Bindings;
}

function isActionId(v: unknown): v is ActionId {
  return typeof v === "string" && (ACTION_IDS as readonly string[]).includes(v);
}

/** Anything shaped like a table, from localStorage or from a profile row. */
function coerce(raw: unknown): Record<ActionId, BindingCode[]> | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const next = cloneDefaults();
  let sawOne = false;
  for (const id of ACTION_IDS) {
    const v = src[id];
    if (!Array.isArray(v)) continue;
    const codes = v.filter((c): c is string => typeof c === "string" && c.length > 0)
      .slice(0, MAX_BINDINGS_PER_ACTION);
    next[id] = codes;
    sawOne = true;
  }
  return sawOne ? next : null;
}

function commit(next: Record<ActionId, BindingCode[]>): void {
  table = next;
  snapshot = freeze(table);
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(snapshot));
  } catch { /* private mode: the remap still holds for this session */ }
  persist?.(snapshot);
  for (const l of listeners) l();
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const parsed = coerce(JSON.parse(raw));
    if (parsed) { table = parsed; snapshot = freeze(table); }
  } catch { /* corrupt or locked down: defaults */ }
}

// ---------------------------------------------------------------------------
// Reading — what a settings screen and the HUD reference both call
// ---------------------------------------------------------------------------

/** The whole table. Stable identity between changes; safe for React. */
export function getBindings(): Bindings {
  load();
  return snapshot;
}

/** Server snapshot for `useSyncExternalStore`: nothing is rendered from storage on the server. */
export function getServerBindings(): Bindings {
  return DEFAULT_BINDINGS;
}

/** Every code bound to one action, in order. First is the primary. */
export function bindingsFor(action: ActionId): readonly BindingCode[] {
  return getBindings()[action] ?? [];
}

export function subscribeBindings(onChange: () => void): () => void {
  load();
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

/**
 * Called for every change, with the whole table, so the profile layer can send
 * it up. Bindings belong with the cosmetics on the server profile so they
 * follow a player through the four-word recovery code; until the profile row
 * carries the field, this fires and localStorage is the store. One call.
 */
export function setBindingsPersister(fn: ((bindings: Bindings) => void) | null): void {
  persist = fn;
}

/**
 * Take a table that came back from the server (or from any store outside this
 * module) as the truth. Unknown actions and non-string codes are dropped;
 * anything the payload does not mention keeps its default. No-ops on junk.
 */
export function hydrateBindings(raw: unknown): boolean {
  load();
  const parsed = coerce(raw);
  if (!parsed) return false;
  commit(parsed);
  return true;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Every other action already holding `code`. Empty means the key is free. */
export function conflictsFor(code: BindingCode, action?: ActionId): ActionId[] {
  const b = getBindings();
  return ACTION_IDS.filter((id) => id !== action && b[id].includes(code));
}

/** The reason a code cannot be bound, or null if it can. */
export function reservedReason(code: BindingCode): string | null {
  return RESERVED_CODES[code] ?? null;
}

export type RebindResult =
  | { ok: true; bindings: Bindings; tookFrom: ActionId[] }
  | { ok: false; reason: "reserved" | "conflict" | "unknown" | "full"; message: string; conflicts: ActionId[] };

/**
 * Bind `code` to `action`.
 *
 * `slot` replaces that binding; omitted, the code is appended as an alternate.
 * A code already used elsewhere is REFUSED with the actions that hold it, so
 * the screen can say so and offer to take it; call again with `force: true` to
 * take it, which removes it from those actions rather than firing two.
 */
export function rebind(
  action: ActionId,
  code: BindingCode,
  opts: { slot?: number; force?: boolean } = {},
): RebindResult {
  load();
  if (!isActionId(action)) return { ok: false, reason: "unknown", message: `No such action: ${action}`, conflicts: [] };
  if (!code) return { ok: false, reason: "unknown", message: "No key was pressed.", conflicts: [] };
  const reserved = reservedReason(code);
  if (reserved) return { ok: false, reason: "reserved", message: reserved, conflicts: [] };

  const clash = conflictsFor(code, action);
  if (clash.length && !opts.force) {
    const names = clash.map((id) => ACTIONS.find((a) => a.id === id)?.label ?? id).join(", ");
    return { ok: false, reason: "conflict", message: `Already bound to ${names}.`, conflicts: clash };
  }

  const next = cloneCurrent();
  for (const id of clash) next[id] = next[id].filter((c) => c !== code);

  const own = next[action].filter((c) => c !== code);
  if (typeof opts.slot === "number" && opts.slot >= 0 && opts.slot < next[action].length) {
    const kept = [...next[action]];
    kept[opts.slot] = code;
    next[action] = kept.filter((c, i) => c === code ? i === opts.slot : true);
  } else {
    if (own.length >= MAX_BINDINGS_PER_ACTION) {
      return {
        ok: false, reason: "full", conflicts: [],
        message: `${ACTIONS.find((a) => a.id === action)?.label} already has ${MAX_BINDINGS_PER_ACTION} keys. Replace one.`,
      };
    }
    next[action] = [...own, code];
  }
  commit(next);
  return { ok: true, bindings: snapshot, tookFrom: clash };
}

/** Drop one code from one action. An action may end up with none — "Unbound". */
export function unbind(action: ActionId, code: BindingCode): Bindings {
  load();
  const next = cloneCurrent();
  next[action] = next[action].filter((c) => c !== code);
  commit(next);
  return snapshot;
}

/** Back to the shipped table. The way out for a player who bound movement to nothing reachable. */
export function resetBindings(): Bindings {
  load();
  commit(cloneDefaults());
  return snapshot;
}

/** Back to the shipped table for one action only. */
export function resetAction(action: ActionId): Bindings {
  load();
  const next = cloneCurrent();
  next[action] = [...DEFAULT_BINDINGS[action]];
  commit(next);
  return snapshot;
}

function cloneCurrent(): Record<ActionId, BindingCode[]> {
  const out = {} as Record<ActionId, BindingCode[]>;
  for (const id of ACTION_IDS) out[id] = [...table[id]];
  return out;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/**
 * `KeyW` is W on QWERTY and Z on AZERTY, and the screen must show the player
 * what is actually printed on the key in front of them. `getLayoutMap()` gives
 * that; where it is missing (Firefox, Safari) the fallback is the code's own
 * name, which is at worst the QWERTY letter and never a lie about position.
 */
let layout: Map<string, string> | null = null;

interface KeyboardLayoutCapable {
  keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> };
}

/** Resolve the layout once, then re-label. Await before drawing the list. */
export async function loadKeyboardLayout(): Promise<void> {
  try {
    const nav = navigator as unknown as KeyboardLayoutCapable;
    const map = await nav.keyboard?.getLayoutMap?.();
    if (map) { layout = map; for (const l of listeners) l(); }
  } catch { /* not supported; names it is */ }
}

const CODE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  Space: "Space", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  ShiftLeft: "L Shift", ShiftRight: "R Shift", ControlLeft: "L Ctrl", ControlRight: "R Ctrl",
  AltLeft: "L Alt", AltRight: "R Alt", Enter: "Enter", Backspace: "Backspace", CapsLock: "Caps",
  Mouse0: "Left mouse", Mouse1: "Middle mouse", Mouse2: "Right mouse", Mouse3: "Mouse 4", Mouse4: "Mouse 5",
});

/** What to print on the key cap for a code, on THIS keyboard. */
export function labelForCode(code: BindingCode): string {
  if (!code) return "Unbound";
  const named = CODE_NAMES[code];
  if (named) return named;
  const produced = layout?.get(code);
  if (produced) return produced.toUpperCase();
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return code;
}

/** "W or ↑" — the whole binding for one action, for the HUD control reference. */
export function labelForAction(action: ActionId, join = " or "): string {
  const codes = bindingsFor(action);
  return codes.length ? codes.map(labelForCode).join(join) : "Unbound";
}

// ---------------------------------------------------------------------------
// Capture — the settings screen's "press a key" state
// ---------------------------------------------------------------------------

/**
 * Listen for the next key or mouse button and hand back its code, reserved or
 * not, so the screen can refuse it with a reason. Returns a cancel function;
 * capture also ends of its own accord once it has fired.
 */
export function captureBinding(onCode: (code: BindingCode) => void): () => void {
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("mousedown", onMouse, true);
  };
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    stop();
    onCode(e.code);
  };
  const onMouse = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    stop();
    onCode(`Mouse${e.button}`);
  };
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("mousedown", onMouse, true);
  return stop;
}

// ---------------------------------------------------------------------------
// The live keyboard — physical codes, tracked here rather than by the canvas
// ---------------------------------------------------------------------------

const heldCodes = new Set<BindingCode>();
/**
 * Codes seen going down since the last sample. Sampling is 60 Hz and a dodge is
 * exactly the input a player stabs at fastest, so a tap shorter than one poll
 * has to be latched or it is never observed. `sampleInput` clears it.
 */
const tappedCodes = new Set<BindingCode>();
let wired = false;

/** Idempotent; safe to call every frame. Never touches `window` on the server. */
export function ensureKeyTracking(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
    heldCodes.add(e.code);
    // Auto-repeat is a held key, not a fresh press; latching it would fire a
    // dodge every time the OS repeated the keystroke.
    if (!e.repeat) tappedCodes.add(e.code);
  });
  window.addEventListener("keyup", (e) => { heldCodes.delete(e.code); });
  // Buttons 0 and 2 are NOT tracked here: the canvas already reports them, and
  // it reports them only for clicks that landed on the canvas. Tracking them on
  // `window` as well would make a click on a HUD button swing the sword.
  window.addEventListener("mousedown", (e) => {
    if (e.button === 0 || e.button === 2) return;
    heldCodes.add(`Mouse${e.button}`);
    tappedCodes.add(`Mouse${e.button}`);
  });
  window.addEventListener("mouseup", (e) => { heldCodes.delete(`Mouse${e.button}`); });
  // A key held when the window goes away is a key that never comes up, and a
  // stuck W walks a man into the fire.
  window.addEventListener("blur", () => { heldCodes.clear(); tappedCodes.clear(); });
}

/** Is any code bound to this action down right now? */
export function isActionDown(action: ActionId, mouse?: { left: boolean; right: boolean }): boolean {
  for (const code of getBindings()[action]) {
    if (heldCodes.has(code)) return true;
    if (mouse && code === "Mouse0" && mouse.left) return true;
    if (mouse && code === "Mouse2" && mouse.right) return true;
  }
  return false;
}

/** Down now, or tapped since the last sample. What one-shot deeds ask. */
export function isActionHit(action: ActionId, mouse?: { left: boolean; right: boolean }): boolean {
  if (isActionDown(action, mouse)) return true;
  for (const code of getBindings()[action]) if (tappedCodes.has(code)) return true;
  return false;
}

/** Called by `sampleInput` once the latch has been read. */
export function clearTapped(): void {
  tappedCodes.clear();
}
