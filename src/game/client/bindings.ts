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
  | "attack" | "heavy" | "block" | "ability" | "shove"
  | "lockon"
  | "emote1" | "emote2" | "emote3";

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
  { id: "shove", label: "Shove", hint: "Two hands — breaks a guard, drives a man back" },
  { id: "ability", label: "Class deed", hint: "The warrior's own trick" },
  // Off until pressed: desktop mouse-look is unchanged by default and this is
  // the door for anyone who wants the phone's camera. A toggle rather than a
  // hold, because a lock you have to keep a finger on is a hand you cannot
  // fight with — which is the whole problem it was built to answer.
  { id: "lockon", label: "Lock on", hint: "Hold the camera on the nearest foe — off by default", desktopOnly: true },
  // The victory emotes. Keys are a desktop thing, but the actions are not
  // desktopOnly: a phone performs the same three from the round-break and
  // summary surfaces, so the badge would be a lie.
  { id: "emote1", label: "Emote: raise the blade", hint: "Lift the weapon to the sky" },
  { id: "emote2", label: "Emote: beat the boss", hint: "Hammer the shield boss — or the chest" },
  { id: "emote3", label: "Emote: taunt", hint: "Jeer at the beaten" },
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
 *
 * ONE EXCEPTION, AND IT IS A BUG FIX: crouch shipped on
 * `["ControlLeft","ControlRight"]` and was dead on every Mac in the world. See
 * `PLATFORM_MODIFIER_CODES` below, and `defaultsRuleViolations()`, which is the
 * rule that stops the next one.
 */
export const DEFAULT_BINDINGS: Bindings = Object.freeze({
  forward: Object.freeze(["KeyW", "ArrowUp"]),
  back: Object.freeze(["KeyS", "ArrowDown"]),
  left: Object.freeze(["KeyA", "ArrowLeft"]),
  right: Object.freeze(["KeyD", "ArrowRight"]),
  sprint: Object.freeze(["ShiftLeft", "ShiftRight"]),
  dodge: Object.freeze(["Space"]),
  // C, not Ctrl. Ctrl is the right-click modifier on macOS — the browser takes
  // the chord before the page sees a keydown, and Ctrl-drag is a system
  // gesture — so the shipped crouch was a control that did nothing for every
  // Mac player, and crouch is a real tactic (`CROUCH_DROP` in engine.mjs drops
  // a crouching man's hitbox so cuts land at the legs). C is free, it is
  // conventional, and it is the same physical key everywhere. Alt was the other
  // candidate and is refused by the same rule: it is Option on a Mac and
  // composes characters rather than reporting a plain key.
  crouch: Object.freeze(["KeyC"]),
  attack: Object.freeze(["Mouse0"]),
  heavy: Object.freeze(["KeyE", "KeyV"]),
  block: Object.freeze(["Mouse2"]),
  // F sits under the index finger off WASD and nothing else claims it.
  shove: Object.freeze(["KeyF"]),
  ability: Object.freeze(["KeyQ"]),
  // R is free, sits under the index finger off WASD, and is where every game
  // in the reference class already puts a lock.
  lockon: Object.freeze(["KeyR"]),
  // The number row is the emote shelf every other game trained: reachable
  // without leaving WASD, and nothing else in the table claims a digit.
  emote1: Object.freeze(["Digit1"]),
  emote2: Object.freeze(["Digit2"]),
  emote3: Object.freeze(["Digit3"]),
}) as Bindings;

/** Most a single action will hold. Two is the shipped shape; three leaves room. */
export const MAX_BINDINGS_PER_ACTION = 3;

/**
 * Keys the browser or the game has already spoken for. Refused with a reason
 * rather than accepted and then silently not working.
 *
 * THIS LIST IS THE SERVER CONTRACT. `src/db/bindings.ts` reads it and rejects a
 * whole table containing any of these, so nothing may be ADDED here that a
 * shipped table might already contain — a row written before the rule would
 * come back `null` and take a player's entire remap with it. New refusals go in
 * `PLATFORM_MODIFIER_CODES`, which the screen enforces and the server tolerates.
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

/**
 * THE RULE: no binding may be a bare platform modifier.
 *
 * Ctrl-to-crouch was dead on a MacBook for the whole life of this game, and the
 * reason is not a bug anywhere in this file — it is that **Ctrl is the
 * right-click modifier on macOS**. The browser turns Ctrl-click into a context
 * menu and Ctrl-drag into a system gesture before the page is consulted, so a
 * key the settings screen happily accepted never arrived. Option (Alt) is the
 * same shape of mistake from the other end: macOS uses it to compose
 * characters, and holding it changes what every other key reports.
 *
 * A modifier is a thing you hold WITH something else. It is a poor game control
 * on every platform and an impossible one on some, so it is refused with the
 * reason rather than accepted and quietly dropped — the difference between a
 * control that does not exist and one that does nothing.
 *
 * Deliberately NOT merged into `RESERVED_CODES`: the server validates against
 * that list and would reject an entire stored table on sight of one legacy
 * `ControlLeft`. `coerce()` below strips them on the way in instead, so old
 * tables heal rather than break.
 */
export const PLATFORM_MODIFIER_CODES: Readonly<Record<string, string>> = Object.freeze({
  ControlLeft: "Ctrl is the right-click modifier on a Mac — the browser takes it before the game does.",
  ControlRight: "Ctrl is the right-click modifier on a Mac — the browser takes it before the game does.",
  AltLeft: "Alt is Option on a Mac, where it composes characters instead of reporting a key.",
  AltRight: "Alt is Option on a Mac, where it composes characters instead of reporting a key.",
  MetaLeft: "Cmd on a Mac and the system key on Windows; neither can be held reliably in a browser.",
  MetaRight: "Cmd on a Mac and the system key on Windows; neither can be held reliably in a browser.",
  // Old Gecko names for the same two physical keys. A Firefox that still
  // reports them must not slip a modifier past the rule.
  OSLeft: "The system key cannot be held reliably in a browser.",
  OSRight: "The system key cannot be held reliably in a browser.",
});

/** Own-property lookup: these tables are object literals, so a code of
 *  `constructor` or `toString` would otherwise come back as Object's own. */
function reasonIn(map: Readonly<Record<string, string>>, code: string): string | null {
  return Object.prototype.hasOwnProperty.call(map, code) ? map[code] : null;
}

/** Every code that is a bare platform modifier, for the rule and the strip. */
export function isPlatformModifier(code: BindingCode): boolean {
  return reasonIn(PLATFORM_MODIFIER_CODES, code) !== null;
}

/**
 * Why `code` may not SHIP as a default, or null if it may.
 *
 * Function keys are included and the reserved list is not enough on its own:
 * F1 is help, F3 is find, F6 is the address bar and F7 is caret browsing, and
 * which of them the browser eats varies by browser. A default has to work on
 * every machine that opens the link, so none of them is a candidate.
 */
export function unsafeDefaultReason(code: BindingCode): string | null {
  return reasonIn(PLATFORM_MODIFIER_CODES, code)
    ?? reasonIn(RESERVED_CODES, code)
    ?? (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)
      ? `${code} is a browser function key on at least one platform.`
      : null);
}

/**
 * The rule, applied to the shipped table. Empty means the defaults are clean.
 *
 * Exported so `tools/bindsynctest.mjs` asserts the same implementation the game
 * uses rather than a second copy of the list — the failure mode this project has
 * hit three times is a test that measures a different quantity from the code.
 */
export function defaultsRuleViolations(): string[] {
  const out: string[] = [];
  const seen = new Map<BindingCode, ActionId>();
  for (const id of ACTION_IDS) {
    for (const code of DEFAULT_BINDINGS[id]) {
      const why = unsafeDefaultReason(code);
      if (why) out.push(`${id} defaults to ${code}: ${why}`);
      const already = seen.get(code);
      if (already) out.push(`${id} and ${already} both default to ${code}.`);
      else seen.set(code, id);
    }
    if (DEFAULT_BINDINGS[id].length === 0) out.push(`${id} ships with no binding at all.`);
  }
  return out;
}

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

/**
 * Anything shaped like a table, from localStorage or from a profile row.
 *
 * THE HEALING STEP. Every table written before the platform-modifier rule
 * carries `crouch: ["ControlLeft","ControlRight"]`, and those rows are on the
 * war rolls and in localStorage on every device that has ever remapped
 * anything. They are stripped here, on the way in, so a Mac player's crouch
 * comes back without him being told to reset — and because `commit()` writes
 * the cleaned table straight back to storage and up to the profile, it heals
 * once and stays healed.
 *
 * An action left with NOTHING by the strip gets its shipped default back rather
 * than being handed an unbound control. An action that was already empty is left
 * empty: unbinding is a thing the screen offers and "Unbound" is a real answer.
 */
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
    const kept = codes.filter((c) => !isPlatformModifier(c));
    next[id] = kept.length === 0 && codes.length > 0 ? [...DEFAULT_BINDINGS[id]] : kept;
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

/**
 * Is this still the shipped table? Asked at sign-in: a profile with no bindings
 * on the roll takes this device's, and there is no point writing a row for a
 * player who has never touched a key.
 */
export function bindingsAreDefault(b: Bindings = getBindings()): boolean {
  return ACTION_IDS.every((id) => {
    const mine = b[id] ?? [];
    const shipped = DEFAULT_BINDINGS[id];
    return mine.length === shipped.length && mine.every((c, i) => c === shipped[i]);
  });
}

export function subscribeBindings(onChange: () => void): () => void {
  load();
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

/**
 * Called for every change, with the whole table, so the profile layer can send
 * it up. Bindings sit with the cosmetics on the server profile so they follow a
 * player through the four-word recovery code; localStorage is written either
 * way, and remains the whole store wherever there is no database. One call,
 * from the boot in `page.tsx`.
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
  return reasonIn(RESERVED_CODES, code) ?? reasonIn(PLATFORM_MODIFIER_CODES, code);
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

/**
 * Resolve the layout AND the platform once, then re-label. Called from an
 * effect, so both land after hydration. Await before drawing the list.
 */
export async function loadKeyboardLayout(): Promise<void> {
  const was = mac;
  resolveMac();
  let changed = mac !== was;
  try {
    const nav = navigator as unknown as KeyboardLayoutCapable;
    const map = await nav.keyboard?.getLayoutMap?.();
    if (map) { layout = map; changed = true; }
  } catch { /* not supported; names it is */ }
  if (changed) for (const l of listeners) l();
}

const CODE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  Space: "Space", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  ShiftLeft: "L Shift", ShiftRight: "R Shift", ControlLeft: "L Ctrl", ControlRight: "R Ctrl",
  AltLeft: "L Alt", AltRight: "R Alt", MetaLeft: "L Win", MetaRight: "R Win",
  Enter: "Enter", Backspace: "Backspace", CapsLock: "Caps",
  Mouse0: "Left mouse", Mouse1: "Middle mouse", Mouse2: "Right mouse", Mouse3: "Mouse 4", Mouse4: "Mouse 5",
});

/**
 * The same physical keys, named the way they are PRINTED ON A MAC.
 *
 * A Mac user hunting for crouch is looking for ⌃, and "L Ctrl" is not a word
 * that appears anywhere on his machine — the key says `control`, Option is not
 * Alt, and Command is not Windows. The remap screen exists to tell a player
 * which key he is looking at, so on a Mac it has to speak Mac. Everything else
 * (letters, digits, arrows) is already layout-resolved by `getLayoutMap()` and
 * is the same on both.
 */
const MAC_CODE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  ControlLeft: "⌃ Control", ControlRight: "⌃ Control (R)",
  AltLeft: "⌥ Option", AltRight: "⌥ Option (R)",
  MetaLeft: "⌘ Command", MetaRight: "⌘ Command (R)",
  ShiftLeft: "⇧ Shift", ShiftRight: "⇧ Shift (R)",
  Enter: "↩ Return", Backspace: "⌫ Delete", CapsLock: "⇪ Caps",
});

/**
 * FALSE UNTIL `loadKeyboardLayout` SAYS OTHERWISE, and that is not timidity —
 * it is the same rule the caps already live under. These labels are
 * server-rendered, React replays the server's answer during hydration, and a
 * cap that reads "L Shift" in the HTML and "⇧ Shift" on the first client render
 * throws #418 and re-renders the landing screen. Resolving inside the effect
 * that already re-labels for the keyboard layout puts the change after
 * hydration, on a path that notifies the same listeners.
 */
let mac = false;

function resolveMac(): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as unknown as { userAgentData?: { platform?: string }; platform?: string; userAgent?: string };
  const claim = nav.userAgentData?.platform || nav.platform || nav.userAgent || "";
  mac = /mac/i.test(claim);
}

/** What to print on the key cap for a code, on THIS keyboard and THIS platform. */
export function labelForCode(code: BindingCode): string {
  if (!code) return "Unbound";
  const named = (mac ? reasonIn(MAC_CODE_NAMES, code) : null) ?? reasonIn(CODE_NAMES, code);
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
