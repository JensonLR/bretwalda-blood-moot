// THE BRACKET (backlog 7.3) — single elimination, and nothing else.
//
// A pure module for the same reason `spectate.mjs` is one: the rule for who
// fights whom next has to have ONE home, imported by the engine that deals
// the duels and by `tourneytest` that judges them. A second copy in a
// harness is a harness that cannot fail when this file changes.
//
// Shape: `{ stages: [ [match] ] }`, built WHOLE up front — every stage, every
// slot — with `null` sides where a man has yet to be decided (or never will
// be: a bye). Winners flow into fixed slots: stage s, match i sends its
// winner to stage s+1, match ⌊i/2⌋, side i%2. Fixed slots are what let a
// client draw the entire tree from any snapshot.
//
// A match: `{ a: id|null, b: id|null, winner: id|null, done: bool }`.
// `done` with a null winner is a real outcome — both men gone, nobody to
// advance — and the void flows forward as a bye for whoever meets it.

/**
 * Deal the tree for these ids. Seeding is a shuffle — an evening's moot has
 * no rankings to honour — and byes (field smaller than the bracket) land as
 * null sides, resolved by `settle`. `rand` is injectable so a harness can
 * pin the draw.
 */
export function buildBracket(ids, rand = Math.random) {
  const field = [...ids];
  for (let i = field.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [field[i], field[j]] = [field[j], field[i]];
  }
  let size = 1;
  while (size < field.length) size *= 2;
  const stages = [];
  for (let n = size / 2; n >= 1; n /= 2) {
    const stage = [];
    for (let i = 0; i < n; i++) stage.push({ a: null, b: null, winner: null, done: false });
    stages.push(stage);
  }
  // Byes spread across matches rather than stacked: slot k of the first
  // stage takes entrants k and size-1-k style spreading is tournament
  // seeding's job; with a shuffled field, straight fill is the same draw.
  for (let i = 0; i < field.length; i++) {
    const m = stages[0][Math.floor(i / 2)];
    if (i % 2 === 0) m.a = field[i]; else m.b = field[i];
  }
  return { stages };
}

/**
 * Resolve everything that does not need a fight, and name the next duel.
 *
 * Walks the tree in order and settles every match whose outcome is already
 * forced: a bye (one side null), a walkover (a side no longer present — the
 * man left the room), or a void (neither side exists). Each settlement
 * flows its winner forward immediately, so a cascade of walkovers resolves
 * in one call. Returns the next match that needs steel — `{ stage, index,
 * a, b }` with both men present — or `null` when the bracket is finished.
 *
 * `present(id)` is the caller's answer for "is this man still in the
 * room"; the bracket holds no roster of its own.
 */
export function settle(bracket, present) {
  const flow = (s, i, winner) => {
    if (s + 1 >= bracket.stages.length) return;
    const next = bracket.stages[s + 1][Math.floor(i / 2)];
    if (i % 2 === 0) next.a = winner; else next.b = winner;
  };
  for (let s = 0; s < bracket.stages.length; s++) {
    for (let i = 0; i < bracket.stages[s].length; i++) {
      const m = bracket.stages[s][i];
      if (m.done) continue;
      const aIn = m.a != null && present(m.a);
      const bIn = m.b != null && present(m.b);
      if (aIn && bIn) return { stage: s, index: i, a: m.a, b: m.b };
      // Nobody, or one man standing alone: no duel to fight here.
      m.winner = aIn ? m.a : bIn ? m.b : null;
      m.done = true;
      flow(s, i, m.winner);
    }
  }
  return null;
}

/**
 * A duel's verdict. A null winner is a DRAW — both men fell on the same
 * tick — and a bracket cannot advance a draw, so the match stays undone and
 * `settle` deals the same pairing again: the moot demands an answer.
 */
export function reportDuel(bracket, stage, index, winner) {
  const m = bracket.stages[stage][index];
  if (!m || m.done) return;
  if (winner !== m.a && winner !== m.b) return; // a draw, or nonsense
  m.winner = winner;
  m.done = true;
  if (stage + 1 < bracket.stages.length) {
    const next = bracket.stages[stage + 1][Math.floor(index / 2)];
    if (index % 2 === 0) next.a = winner; else next.b = winner;
  }
}

/** The champion: the final's winner, or null while the moot still runs. */
export function champion(bracket) {
  const last = bracket.stages[bracket.stages.length - 1][0];
  return last.done ? last.winner : null;
}
