import {
  ARMOURY, defaultAppearance, migrateAppearance, freeCosmeticIds,
  type Appearance, type ArmouryOption,
} from "../game/client/characters";
import type { WarriorClass } from "../game/types";
// The profile marks (backlog 5.5): earned, never bought, so they are not a
// slot — `sanitizeAppearance` narrows them against the row's own record
// instead of against the unlock list. Same shared-module law as `ARMOURY`.
import { earnedMark, type MarkFacts } from "@/game/marks.mjs";

/**
 * The server's view of the shop.
 *
 * It reads the same `ARMOURY` array the armoury screen draws from, on purpose.
 * A second price list on the server is a price list that will disagree with the
 * one the player is looking at the first time somebody re-tunes a helmet, and
 * the disagreement shows up as a purchase that charges the wrong amount rather
 * than as a failing build. The import pulls three.js into the route bundle,
 * which costs a little startup memory once and buys a catalogue that cannot
 * drift.
 */

/** Which field of `Appearance` an armoury slot writes to, and what kind it is. */
const SLOT_FIELD = {
  helm: { field: "helm", numeric: false },
  hair: { field: "hairStyle", numeric: false },
  hairColor: { field: "hairColor", numeric: true },
  beard: { field: "beardStyle", numeric: false },
  beardColor: { field: "beardColor", numeric: true },
  cloak: { field: "cloak", numeric: false },
  armor: { field: "armorColor", numeric: true },
  warPaint: { field: "warPaint", numeric: false },
  // ABSENT UNTIL 26 AUG 2026, AND ITS ABSENCE WAS A PAID DEFECT. The weapon
  // finish (backlog 3.3) has been a real catalogue slot since it shipped —
  // `priceBasket` charged for it and `unlockedCosmetics` recorded it — but
  // with no row here `equipIds` skipped it and `sanitizeAppearance` dropped
  // it, so on a server-linked profile a bought finish reverted to Issued
  // Steel at the next boot: the gold left, the look did not stay. The client
  // never noticed because localStorage kept its own copy until the server's
  // overwrote it.
  weapon: { field: "weapon", numeric: false },
} as const satisfies Record<string, { field: keyof Appearance; numeric: boolean }>;

export type ArmourySlot = keyof typeof SLOT_FIELD;

export const ARMOURY_SLOTS = Object.keys(SLOT_FIELD) as ArmourySlot[];

const BY_ID = new Map<string, ArmouryOption>();
/** slot -> stringified value -> option, so a wire value finds its price. */
const BY_SLOT_VALUE = new Map<string, Map<string, ArmouryOption>>();

for (const group of ARMOURY) {
  for (const opt of group.options) {
    BY_ID.set(opt.id, opt);
    let byValue = BY_SLOT_VALUE.get(opt.slot);
    if (!byValue) { byValue = new Map(); BY_SLOT_VALUE.set(opt.slot, byValue); }
    byValue.set(String(opt.value), opt);
  }
}

const FREE_IDS = freeCosmeticIds();

/** The ids every profile owns from the moment it is minted. */
export function startingUnlocks(): string[] {
  return [...FREE_IDS];
}

function optionForValue(slot: string, value: unknown): ArmouryOption | undefined {
  return BY_SLOT_VALUE.get(slot)?.get(String(value));
}

export function isSlot(slot: string): slot is ArmourySlot {
  return Object.prototype.hasOwnProperty.call(SLOT_FIELD, slot);
}

function readSlot(ap: Appearance, slot: ArmourySlot): string | number | undefined {
  return ap[SLOT_FIELD[slot].field];
}

function writeSlot(ap: Appearance, slot: ArmourySlot, value: string | number): void {
  const spec = SLOT_FIELD[slot];
  if (spec.numeric) (ap[spec.field] as number) = Number(value);
  else (ap[spec.field] as string) = String(value);
}

export function baseAppearance(cls: string): Appearance {
  const known: WarriorClass[] = ["huscarl", "warden", "runekeeper", "berserker"];
  const warrior = known.includes(cls as WarriorClass) ? (cls as WarriorClass) : "warden";
  return defaultAppearance(warrior);
}

/**
 * The armoury ids a given appearance is wearing. A slot whose stored value has
 * been retired from the catalogue simply is not listed, which is the honest
 * answer — the warrior still renders, but there is no purchasable thing to
 * point at.
 */
export function idsForAppearance(ap: Appearance): string[] {
  const ids: string[] = [];
  for (const slot of ARMOURY_SLOTS) {
    const opt = optionForValue(slot, readSlot(ap, slot));
    if (opt) ids.push(opt.id);
  }
  return ids;
}

/**
 * Forces an appearance that arrived over the wire into one the player is
 * actually allowed to be wearing: every slot must name a real catalogue option
 * and one this profile owns. Anything else falls back to what was already
 * equipped, so a doctored payload is silently ignored rather than rejected —
 * the player cannot tell the difference and there is nothing to retry.
 */
export function sanitizeAppearance(
  input: unknown, owned: readonly string[], current: Appearance,
  /**
   * The row's own record, for the mark. Marks are earned rather than owned,
   * so the unlock list can say nothing about them; when the caller passes
   * what the row actually holds, a mark the record does not support is
   * reduced to none — the same silent narrowing as a slot. Omitted (older
   * callers, tests that only care about kit), the stored mark passes through
   * migration untouched.
   */
  facts?: MarkFacts,
): Appearance {
  const out: Appearance = { ...current };
  const raw = (input && typeof input === "object") ? input as Record<string, unknown> : {};
  const candidate = migrateAppearance({ ...current, ...raw } as Appearance);
  const ownedSet = new Set(owned);
  for (const slot of ARMOURY_SLOTS) {
    const opt = optionForValue(slot, readSlot(candidate, slot));
    if (opt && ownedSet.has(opt.id)) writeSlot(out, slot, opt.value);
  }
  out.mark = facts ? earnedMark(candidate.mark, facts).id : candidate.mark;
  return out;
}

export interface PriceCheck {
  /** Ids that exist and are not owned yet, with their catalogue cost. */
  toBuy: ArmouryOption[];
  /** Total the profile must be able to pay. Owned ids cost nothing. */
  cost: number;
  /** Every requested id that is not in the catalogue at all. */
  unknown: string[];
}

/**
 * Prices a basket against the catalogue and against what the profile already
 * owns. The client sends ids; it never sends a price, and a price it did send
 * would be ignored.
 */
export function priceBasket(ids: readonly string[], owned: readonly string[]): PriceCheck {
  const ownedSet = new Set(owned);
  const seen = new Set<string>();
  const toBuy: ArmouryOption[] = [];
  const unknown: string[] = [];
  let cost = 0;
  for (const id of ids) {
    if (typeof id !== "string" || seen.has(id)) continue;
    seen.add(id);
    const opt = BY_ID.get(id);
    if (!opt) { unknown.push(id); continue; }
    if (ownedSet.has(id)) continue;
    toBuy.push(opt);
    cost += opt.cost;
  }
  return { toBuy, cost, unknown };
}

/** Equips a basket of owned ids, one per slot, last id for a slot winning. */
export function equipIds(ap: Appearance, ids: readonly string[]): Appearance {
  const out = { ...ap };
  for (const id of ids) {
    const opt = BY_ID.get(id);
    if (!opt || !isSlot(opt.slot)) continue;
    writeSlot(out, opt.slot, opt.value);
  }
  return out;
}

/** Total catalogue value of a set of ids — used to bound a migration claim. */
export function basketValue(ids: readonly string[]): number {
  let total = 0;
  for (const id of new Set(ids)) total += BY_ID.get(id)?.cost ?? 0;
  return total;
}

/** Keeps only ids that exist in the catalogue. */
export function knownIds(ids: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const id of ids) if (typeof id === "string" && BY_ID.has(id)) out.push(id);
  return out;
}

export type { Appearance };
