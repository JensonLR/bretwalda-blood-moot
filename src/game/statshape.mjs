// ============================================================
// STAT SHAPE — the four axes a warrior is described by, and the ONE place the
// maxima on the class-select card come from.
//
// WHY THIS FILE EXISTS. The class rework was measured, gated and shipped on the
// claim that each warrior is high on exactly two of four stats. An adversary
// then opened the screen that claim is made on and found it illegible:
// `page.tsx` drew the bars with maxima typed in beside the roster —
// `HP max={150}`, `SPD value={moveSpeed * 20} max={100}` — and `StatBar`
// clamped the overflow with `Math.min(100, ...)`. After the rework the huscarl's
// 158 health CLAMPED at a 150 ceiling, the runekeeper's 5.6 stride clamped at a
// 5.0 one, and THE WARDEN AND THE RUNEKEEPER DREW IDENTICAL FULL SPEED BARS
// while the runekeeper is 12% faster and SPEED is his headline stat.
//
// A typed-in maximum beside the table it is a maximum OF is this repository's
// third named failure mode — the mirrored definition, five recorded instances —
// wearing the one disguise that survives a type-checker: it is not a duplicated
// value, it is a duplicated FACT ("the biggest health bar in the game is 150"),
// and the fact went stale the moment the roster moved. So there is no maximum
// written down here either. Every one is `Math.max` over the roster that is
// actually being drawn, which cannot be stale and cannot clamp.
//
// TWO DAMAGE DEFINITIONS, DELIBERATELY, AND A GATE ON THE ANSWER. Damage is the
// one axis that is not a column:
//
//   * THE CARD shows a RATE — `attackDamage / attackSpeed`, damage a second off
//     the light chain. It is a quantity a player can be told in four words and
//     it separates all four classes.
//   * THE SHAPE GATE (`tools/classmatrix.mjs`) ranks the better of that rate and
//     the heavy blow, each against its own field maximum, because a berserker's
//     50-damage swing and a runekeeper's 24/s are both honestly "high damage"
//     and a roster is allowed to have two of them for different reasons.
//
// Those are two different questions and neither answer is a copy of the other,
// which is why they are both written here rather than one being derived from the
// other and quietly drifting. What is NOT allowed is for them to disagree about
// the ROSTER: `classmatrix` gates that the two strengths the card shows for each
// class are the two strengths the sheet certifies. If a future edit makes the
// card flatter a warrior the gate calls strong, that gate goes red.
//
// Plain ESM with no imports at all, so the browser bundle, the server and a
// toolchain-free `.mjs` harness can all read the same definition. `statshape.d.ts`
// carries the types.
// ============================================================

/** The four axes, in the order the card draws them. */
export const AXES = ["HEALTH", "SPEED", "DAMAGE", "DEFENCE"];

/** What the card calls each one, in the three letters that fit the bar. */
export const AXIS_LABEL = {
  HEALTH: "HP",
  SPEED: "SPD",
  DAMAGE: "DMG",
  DEFENCE: "DEF",
};

/**
 * Sustained damage: what the light chain pays out per second. `attackSpeed` is
 * the WHOLE stroke — windup, contact and recovery — so this is a real rate and
 * not a ratio of two half-defined things.
 */
export const damageRate = (s) => s.attackDamage / s.attackSpeed;

/**
 * ONE CLASS ON ONE AXIS, AS THE CARD DRAWS IT. Raw units, never normalised —
 * normalising is `cardBars`'s job and it needs the whole roster to do it.
 */
export function cardValue(stats, axis) {
  switch (axis) {
    case "HEALTH": return stats.maxHealth;
    case "SPEED": return stats.moveSpeed;
    case "DAMAGE": return damageRate(stats);
    case "DEFENCE": return stats.blockReduction;
    default: throw new Error(`statshape: no such axis ${axis}`);
  }
}

/**
 * ONE CLASS ON ONE AXIS, AS THE SHAPE GATE RANKS IT. Same three columns; damage
 * is the composite described in the header, normalised inside the axis because
 * a rate and a blow have no common unit.
 */
export function sheetValue(table, cls, axis) {
  if (axis !== "DAMAGE") return cardValue(table[cls], axis);
  const names = Object.keys(table);
  const maxRate = Math.max(...names.map((c) => damageRate(table[c])));
  const maxBlow = Math.max(...names.map((c) => table[c].heavyDamage));
  return Math.max(damageRate(table[cls]) / maxRate, table[cls].heavyDamage / maxBlow);
}

/** Every class's value on an axis, by whichever of the two readings. */
export function valuesOn(table, axis, reading = "card") {
  const out = {};
  for (const cls of Object.keys(table)) {
    out[cls] = reading === "sheet" ? sheetValue(table, cls, axis) : cardValue(table[cls], axis);
  }
  return out;
}

/**
 * THE TWO STRENGTHS. Which classes are in the top half of an axis — the ask,
 * verbatim, was *"each should have 2 stats high"*, and with four classes on an
 * axis "high" is the top two.
 */
export function topTwo(values) {
  return Object.keys(values).sort((a, b) => values[b] - values[a]).slice(0, 2);
}

/** Each class's high axes, under either reading. Used by the card gate. */
export function strengthsOf(table, reading = "card") {
  const out = Object.fromEntries(Object.keys(table).map((c) => [c, []]));
  for (const axis of AXES) for (const c of topTwo(valuesOn(table, axis, reading))) out[c].push(axis);
  return out;
}

/**
 * THE BARS THE CARD DRAWS, for one class, with their maxima taken off the
 * roster it is drawing.
 *
 * `frac` is in [0, 1] BY CONSTRUCTION — the denominator is the largest value any
 * class has on that axis, so the roster leader fills the bar exactly and nobody
 * can exceed it. That is what makes the clamp `page.tsx` used to apply dead
 * code, and dead code is the right state for it: the clamp is what turned a
 * stale ceiling into two warriors drawn identically instead of into an obviously
 * broken bar somebody would have fixed in an afternoon.
 *
 * `text` is the number in the units a player would say it in, for the tooltip
 * and the screen reader, because a bar with no number on it can only ever be
 * read against the other three cards.
 */
export function cardBars(table, cls) {
  const names = Object.keys(table);
  return AXES.map((axis) => {
    const value = cardValue(table[cls], axis);
    const max = Math.max(...names.map((c) => cardValue(table[c], axis)));
    return {
      axis,
      label: AXIS_LABEL[axis],
      value,
      max,
      frac: max > 0 ? value / max : 0,
      text: axisText(axis, value),
    };
  });
}

function axisText(axis, value) {
  switch (axis) {
    case "HEALTH": return `${value} health`;
    case "SPEED": return `${value.toFixed(1)} m/s on foot`;
    case "DAMAGE": return `${value.toFixed(1)} damage a second`;
    case "DEFENCE": return `${Math.round(value * 100)}% of a blow turned by the guard`;
    default: return String(value);
  }
}
