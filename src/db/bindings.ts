import {
  ACTIONS, MAX_BINDINGS_PER_ACTION, RESERVED_CODES, type ActionId,
} from "../game/client/bindings";

/**
 * The server's view of the binding table, and the only place a blob off the
 * wire is allowed to become a profile field.
 *
 * It reads the same `ACTIONS` list, the same per-action ceiling and the same
 * reserved codes the settings screen enforces, for the reason `catalogue.ts`
 * reads the same `ARMOURY`: a second copy of the rules on the server is a copy
 * that will disagree with the screen the player is looking at.
 *
 * Why this rejects rather than repairs. An appearance is quietly reduced to the
 * kit a profile owns, because a wrong helm is a cosmetic annoyance. A binding
 * table is the input layer: a malformed one that hydrates on another device is
 * a player who cannot move, and there is no honest guess at what he meant. So
 * anything that is not a table this server would itself have written is refused
 * and the row keeps what it had.
 */

/** What is stored: action id -> physical codes, in order. */
export type StoredBindings = Record<string, string[]>;

const ACTION_IDS: readonly string[] = ACTIONS.map((a) => a.id);

/**
 * `KeyboardEvent.code` is alphanumeric — `KeyW`, `ArrowUp`, `ShiftLeft`,
 * `Digit1`, `Numpad5`, `F3` — and this module's own `Mouse0`..`Mouse4` are
 * too. Nothing else is a code, so nothing else is stored.
 */
const CODE = /^[A-Za-z][A-Za-z0-9]{0,23}$/;

/**
 * A whole table is eleven actions of at most three short codes. The cap is
 * generous against that and still small enough that no request can push a
 * megabyte of JSON into a jsonb column.
 */
const MAX_WIRE_BYTES = 1200;

/**
 * The blob a client sent, or null if it is not one this server will store.
 *
 * Missing actions are allowed and mean "leave it at the default" — the client's
 * `hydrateBindings` fills them in — and an action bound to nothing is allowed,
 * because unbinding is a thing the settings screen offers.
 */
export function sanitizeBindings(raw: unknown): StoredBindings | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  let wire: string;
  try { wire = JSON.stringify(raw); } catch { return null; }
  if (wire.length > MAX_WIRE_BYTES) return null;

  const src = raw as Record<string, unknown>;
  const keys = Object.keys(src);
  if (keys.length === 0 || keys.length > ACTION_IDS.length) return null;

  const out: StoredBindings = {};
  for (const key of keys) {
    if (!ACTION_IDS.includes(key)) return null;
    const codes = src[key];
    if (!Array.isArray(codes) || codes.length > MAX_BINDINGS_PER_ACTION) return null;
    const clean: string[] = [];
    for (const code of codes) {
      if (typeof code !== "string" || !CODE.test(code)) return null;
      // Reserved keys never reach the game loop, so storing one would be a cap
      // on the settings screen that does nothing when it is pressed.
      if (code in RESERVED_CODES) return null;
      if (clean.includes(code)) continue;
      clean.push(code);
    }
    out[key as ActionId] = clean;
  }
  return out;
}

/** What comes back out of a row: a stored table, or null for "never set". */
export function bindingsView(stored: unknown): StoredBindings | null {
  return sanitizeBindings(stored);
}
