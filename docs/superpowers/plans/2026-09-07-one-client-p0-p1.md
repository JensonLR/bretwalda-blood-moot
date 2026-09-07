# ONE CLIENT — P0 (retire Unity) + P1 (make the war fire) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the Unity client and its tooling, then make the persistent war
actually fire — solo matches bank at a discount, scheduled Moots concentrate
real play, and the map updates while you watch it.

**Architecture:** The engine classifies a match (`moot` / `solo`) and whether it
fell inside a Moot window; `war.mjs` — the pure rules module — prices that
classification; `db/war.ts` banks it under a daily cap inside the existing
idempotent transaction. No new opinion about the war is added to the engine and
no arithmetic is added to the database layer.

**Tech Stack:** Node ESM (`.mjs`, no build step, no test framework), TypeScript
+ Next.js 16 + React 19 for the app, Drizzle ORM over `pg`, three.js for the
renderer. Tests are bespoke `.mjs` harnesses driven by `npm run <name>`.

## Global Constraints

- **The spec is `docs/ONE-CLIENT.md`.** Every task below implements a numbered
  section of it. Read the section before starting the task.
- **There is no test framework.** Tests are `.mjs` files under `tools/` that
  call a local `check(name, pass, detail)` and exit non-zero on failure. Do not
  add Jest, Vitest, or any runner.
- **`npm run platformcheck` must stay 6/6** after every task. It is the law
  that keeps the sim off the renderer.
- **`npm run typecheck` and `npm run lint` must pass** before every commit.
- **Connection strings are credentials.** Never commit one, never put one in
  `drizzle.config.json`, never print one. Test databases are passed by env var.
- **`db/schema.sql` is GENERATED from `src/db/schema.ts`.** Never hand-edit it;
  regenerate per `db/README.md`.
- **Every gate is shown RED before it is believed green.** A step that adds a
  check is followed by a step that runs it and expects failure.
- **Commit after every task.** Small commits, in the repo's voice: what changed
  and why it was wrong before.

---

## File Structure

**P0 — deleted**
- `tools/unitywire.mjs`, `tools/unityui.mjs`, `tools/unitycheck.sh`, `tools/palettesync.mjs`

**P0 — modified**
- `package.json` — four scripts removed
- `tools/cliptime.mjs`, `tools/shadercheck.mjs`, `tools/severtest.mjs`, `tools/portraittest.mjs` — repointed at the three.js client
- `tools/blender/*.mjs` — export sink retargeted from `StreamingAssets` to `art/gltf/`

**P1 — modified**
- `src/game/war.mjs` — `WAR_WEIGHT`, `WAR_SKILL_FLOOR`, `SOLO_DAILY_CAP`, `bankedPoints`, `bankCap`, `MOOT_HOUR`, `inMootWindow`, `nextMootAt`
- `src/game/engine.mjs` — `dealGroundFor` (:2379), `warReport` (:4565)
- `src/game/engine.d.ts` — `MatchEndReport` gains `kind` and `inMoot`
- `src/db/schema.ts` — `warLedger.kind`
- `src/db/index.ts` — the in-place `ALTER TABLE` beside the existing ones (:372)
- `src/db/war.ts` — the cap, and the re-clamp that must stop using `POINTS.cap`
- `src/game/client/factionMap/FactionMap.tsx` — polling + the Moot countdown
- `public/sw.js` — push listeners (Task 13, cut-able)
- `tools/wartest.mjs`, `tools/warflow.mjs` — the gates

**P1 — created**
- `db/schema.sql` regenerated

---

## Task 1: Retire the four Unity-only tools

Implements spec §4.2.

**Files:**
- Delete: `tools/unitywire.mjs`, `tools/unityui.mjs`, `tools/unitycheck.sh`, `tools/palettesync.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing
- Produces: nothing. This task only removes.

- [ ] **Step 1: Confirm nothing in the tree calls them**

```bash
grep -rn "unitywire\|unityui\|unitycheck\|palettesync" \
  --include="*.mjs" --include="*.ts" --include="*.tsx" --include="*.json" \
  --include="*.yml" --include="*.sh" . \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
  | grep -v "^./docs/"
```

Expected: matches ONLY in `package.json` (the four script lines) and inside the
four files themselves. If anything else references them — a CI workflow, another
tool — stop and report it; do not delete.

- [ ] **Step 2: Delete the four files**

```bash
git rm tools/unitywire.mjs tools/unityui.mjs tools/unitycheck.sh tools/palettesync.mjs
```

- [ ] **Step 3: Remove their four npm scripts**

In `package.json`, delete exactly these four lines:

```json
    "unitywire": "node tools/unitywire.mjs",
    "unityui": "node tools/unityui.mjs",
    "palettesync": "node tools/palettesync.mjs",
```

(`unitycheck.sh` has no script entry — confirm with `grep unitycheck package.json`,
which should print nothing.)

- [ ] **Step 4: Verify the tree is clean**

```bash
npm run lint && npm run typecheck && npm run platformcheck
```

Expected: lint clean, typecheck clean, `platformcheck` prints `PASS 6/6`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Retire the Unity client's four tools

unitywire held the Unity client to the wire, unityui to its screen rules,
unitycheck compiled its C# without an editor, and palettesync existed only
so that two clients would wear one palette. With one client there is one
palette and none of these have a subject. docs/ONE-CLIENT.md §4.2.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Repoint the four surviving tools at the three.js client

Implements spec §4.3. These test properties that outlived Unity.

**Files:**
- Modify: `tools/cliptime.mjs`, `tools/shadercheck.mjs`, `tools/severtest.mjs`, `tools/portraittest.mjs`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces: four green gates that read only `src/`

- [ ] **Step 1: See exactly what each one reads from Unity**

```bash
for f in tools/cliptime.mjs tools/shadercheck.mjs tools/severtest.mjs tools/portraittest.mjs; do
  echo "=== $f ==="
  grep -n "Unity\|unity\|BRETWALDA - Blood Moot\|StreamingAssets\|Assets/Bretwalda\|\.cs\b" "$f"
done
```

Record the output. Each hit is either (a) a path into the Unity project, or
(b) a comment. Paths must be replaced; comments must be rewritten, not deleted —
they carry the reason the gate exists.

- [ ] **Step 2: Run all four to capture the BEFORE state**

```bash
npm run cliptime; echo "cliptime exit=$?"
npm run shadercheck; echo "shadercheck exit=$?"
npm run severtest; echo "severtest exit=$?"
npm run portraittest; echo "portraittest exit=$?"
```

Expected: some will already fail, because the Unity project they read is no
longer being maintained. **Write down each tool's check count and exit code.**
This is the baseline the repoint is judged against — a tool that went from
12/12 to 8/8 has lost four checks and that must be deliberate, not accidental.

- [ ] **Step 3: Repoint each tool's source of truth**

For each of the four, replace the Unity path with the three.js equivalent:

| Tool | Was reading | Now reads |
|---|---|---|
| `cliptime.mjs` | Unity `ClipDriver` clip lengths | `src/game/client/render/anim.ts` clip table |
| `shadercheck.mjs` | Unity `.shader` files | `src/game/client/render/materials.ts` + `postfx.ts` shader sources |
| `severtest.mjs` | Unity sever zones | `src/game/engine.mjs` sever zones + `src/game/client/characters.ts` bone seams |
| `portraittest.mjs` | `StreamingAssets` portrait PNGs | `art/blender/portrait-*.png` (the exporter's own output dir) |

**Do not weaken an assertion to make it pass.** If a check cannot be expressed
against the three.js client, delete it and say so in the commit message with
the reason. A silently-loosened gate is worse than a deleted one.

- [ ] **Step 4: Run all four and compare against the baseline**

```bash
npm run cliptime && npm run shadercheck && npm run severtest && npm run portraittest
```

Expected: all four exit 0. Check-count changes vs. Step 2 must each be explained
in the commit message.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Four gates outlived their target, and now read the client we keep

cliptime holds the animation and the server to one story about a blow;
shadercheck holds a shader to declaring every name it uses; severtest holds
the cut to the zones the engine can name; portraittest holds the class
picker's four men to being men rather than magenta. None of those
properties belonged to Unity. Repointed at src/, with every check-count
change accounted for. docs/ONE-CLIENT.md §4.3.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Retarget the Blender export sink

Implements spec §4.4. The exporters are engine-neutral; only their destination
was Unity-shaped. This directory becomes P2's input.

**Files:**
- Modify: every file under `tools/blender/` that writes to `StreamingAssets`

**Interfaces:**
- Consumes: nothing
- Produces: `art/gltf/` as the canonical export destination, read by P2's loader

- [ ] **Step 1: Find every sink**

```bash
grep -rn "StreamingAssets" tools/ | tee /tmp/sinks.txt
wc -l /tmp/sinks.txt
```

Expected: 14 lines.

- [ ] **Step 2: Add the destination constant**

Create `tools/blender/sink.mjs`:

```js
// WHERE AUTHORED ASSETS LAND.
//
// This was `BRETWALDA - Blood Moot/Assets/StreamingAssets` — a path into a
// Unity project that is no longer built (docs/ONE-CLIENT.md §4.4). The
// exporters themselves were never Unity-specific: they write glTF, which
// three.js reads natively. Only the destination was.
//
// This directory is P2's input. An exporter writes here; the renderer's asset
// loader will read here; nothing else should know the path.
import { join } from "node:path";
export const GLTF_SINK = join(process.cwd(), "art", "gltf");
```

- [ ] **Step 3: Replace all 14 sinks**

In each file listed by `/tmp/sinks.txt`, import `GLTF_SINK` and use it in place
of the hardcoded StreamingAssets path. Example, before:

```js
const dest = join(root, "BRETWALDA - Blood Moot", "Assets", "StreamingAssets", "models");
```

after:

```js
import { GLTF_SINK } from "./sink.mjs";
const dest = join(GLTF_SINK, "models");
```

- [ ] **Step 4: Verify no sink survives and the check-mode exporters still run**

```bash
grep -rn "StreamingAssets" tools/ && echo "FAIL: sink survives" || echo "OK: no StreamingAssets left"
npm run armourytest
```

Expected: `OK: no StreamingAssets left`, and `armourytest` (which is
`exportarmoury.mjs --check`) exits 0.

- [ ] **Step 5: Ignore the export output**

Append to `.gitignore`:

```
# Authored glTF, written by tools/blender/* and read by the renderer's asset
# loader (docs/ONE-CLIENT.md P2). Generated, large, and reproducible from the
# code that describes the shapes — so it is not carried here.
/art/gltf/
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "The exporters write to art/gltf, not into a Unity project

tools/blender/* was always engine-neutral — it writes glTF, which three.js
reads as natively as Unity did. Only the destination was Unity-shaped, in
14 places. One constant owns it now, and it is the directory P2's asset
loader will read. docs/ONE-CLIENT.md §4.4.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Price a match kind — `war.mjs` gains the weights

Implements spec §5.2 and §5.4. Pure arithmetic, no database, gated by `wartest`.

**Files:**
- Modify: `src/game/war.mjs`, `src/game/war.d.ts`, `tools/wartest.mjs`

**Interfaces:**
- Consumes: existing `POINTS`, `pointsFor(result)` from `war.mjs`
- Produces:
  - `WAR_WEIGHT: Readonly<{ moot: 1, mootBonus: 1.5, solo: 0.3 }>`
  - `WAR_SKILL_FLOOR: 0.7`
  - `SOLO_DAILY_CAP: 24`
  - `bankedPoints(result: MatchResult, kind: "moot"|"solo", inMoot?: boolean): number`
  - `bankCap(kind: "moot"|"solo", inMoot?: boolean): number`

- [ ] **Step 1: Write the failing checks**

In `tools/wartest.mjs`, in the section that already tests `pointsFor` (search for
`"the cap holds, so one farmed match cannot move a border"`), add after it:

```js
  // ---- WHAT A KIND IS WORTH (docs/ONE-CLIENT.md §5) ----
  {
    const hand = { kills: 3, isWinner: true };          // 2 + 3 + 12 = 17
    const raw = pointsFor(hand);
    check("a two-human match outside a Moot is worth its full points",
      bankedPoints(hand, "moot") === raw, `${bankedPoints(hand, "moot")} vs ${raw}`);
    check("a Moot-window match pays the bonus",
      bankedPoints(hand, "moot", true) === Math.floor(raw * 1.5),
      `${bankedPoints(hand, "moot", true)} vs ${Math.floor(raw * 1.5)}`);
    check("a solo match banks the discount, and it is less than a moot",
      bankedPoints(hand, "solo") === Math.floor(raw * 0.3)
        && bankedPoints(hand, "solo") < bankedPoints(hand, "moot"));
    check("an unknown kind banks nothing rather than defaulting to full",
      bankedPoints(hand, "friendly") === 0 && bankedPoints(hand, undefined) === 0);
    check("banked points are whole numbers — a ledger of halves cannot reconcile",
      Number.isInteger(bankedPoints(hand, "solo", true))
        && Number.isInteger(bankedPoints(hand, "moot", true)));
    check("no kind can bank a negative",
      bankedPoints({ kills: 0, isWinner: false }, "solo") >= 0);
  }

  // ---- THE CAP RISES WITH THE BONUS, OR THE BONUS IS A LIE ----
  {
    check("the moot cap is the plain cap", bankCap("moot") === POINTS.cap);
    check("the Moot-window cap admits the bonus — a 40 clamp would eat it",
      bankCap("moot", true) === Math.floor(POINTS.cap * 1.5),
      `${bankCap("moot", true)} vs ${Math.floor(POINTS.cap * 1.5)}`);
    check("the solo cap is the discounted cap",
      bankCap("solo") === Math.floor(POINTS.cap * 0.3));
    const monster = { kills: 99, isWinner: true };
    check("every kind's banked points respect that kind's own cap",
      bankedPoints(monster, "moot") <= bankCap("moot")
        && bankedPoints(monster, "moot", true) <= bankCap("moot", true)
        && bankedPoints(monster, "solo") <= bankCap("solo"));
  }

  // ---- THE SKILL FLOOR ----
  check("the skill floor sits above recruit and at or below warrior",
    WAR_SKILL_FLOOR > 0.45 && WAR_SKILL_FLOOR <= 0.7, `floor ${WAR_SKILL_FLOOR}`);
```

Add `bankedPoints`, `bankCap`, `WAR_SKILL_FLOOR` to the existing `war.mjs`
import at the top of `tools/wartest.mjs`.

- [ ] **Step 2: Run the gate and watch it fail**

```bash
npm run wartest
```

Expected: FAIL. `SyntaxError` or `bankedPoints is not a function` — the imports
do not exist yet.

- [ ] **Step 3: Implement in `src/game/war.mjs`**

Add immediately after the existing `pointsFor` function:

```js
/**
 * WHAT A KIND OF FIGHT IS WORTH, and why the war stopped being frozen.
 *
 * Read `docs/ONE-CLIENT.md` §2 before changing a number here. On 7 Sep 2026 the
 * production ledger held 2 rows against 85 matches and the map had never moved
 * once, because `warReport` banked nothing from a match with fewer than two
 * humans and two humans in one room was, at 26 players, a coincidence.
 *
 * So a lone man's fight banks — at a discount, capped daily, and only against
 * bots worth beating. And a fight during the Moot pays MORE, because the whole
 * point of naming an hour is that turning up to it should be worth something.
 *
 * THESE THREE NUMBERS ARE NOT MEASURED. There were 26 players and 85 matches
 * when they were chosen and that is not enough to fit anything to. They are a
 * starting position, to be revisited once the map has moved for a fortnight.
 * Do not cite them as tuned.
 */
export const WAR_WEIGHT = Object.freeze({ moot: 1, mootBonus: 1.5, solo: 0.3 });

/**
 * The bot skill a solo fight must clear to bank anything. `recruit` is 0.45 and
 * is the tutorial's opponent; a war that can be dragged by beating the tutorial
 * is not a war.
 *
 * Stated as a NUMBER rather than a difficulty name deliberately: the engine's
 * `BOT_SKILL` is a map, not an ordering, so "at least warrior" is not a
 * comparison anything can make. A difficulty added later is ranked by the same
 * number that makes it hard, and nobody has to remember to extend a list.
 */
export const WAR_SKILL_FLOOR = 0.7;

/**
 * The most a man may bank from solo fights in one UTC day.
 *
 * UTC, not Europe/London, and the split from the Moot's hour is deliberate:
 * London has an hour that happens twice each October, and a day boundary that
 * repeats is a boundary a cap can be walked through. The Moot's hour is local
 * because it is an appointment with people. See `docs/ONE-CLIENT.md` §5.4.
 *
 * Two clean solo wins, and then the map wants another man.
 */
export const SOLO_DAILY_CAP = 24;

/** The ceiling on ONE match of a given kind. `bankCap` is the only truth. */
export function bankCap(kind, inMoot = false) {
  if (kind === "solo") return Math.floor(POINTS.cap * WAR_WEIGHT.solo);
  if (kind === "moot") return Math.floor(POINTS.cap * (inMoot ? WAR_WEIGHT.mootBonus : WAR_WEIGHT.moot));
  return 0;
}

/**
 * What one man's match is worth to the war, priced by what kind of fight it was.
 *
 * The ENGINE names the situation; THIS module prices it. An engine that knows
 * what 0.3 means is an engine with a second opinion about the war.
 */
export function bankedPoints(result, kind, inMoot = false) {
  const weight = kind === "solo"
    ? WAR_WEIGHT.solo
    : kind === "moot" ? (inMoot ? WAR_WEIGHT.mootBonus : WAR_WEIGHT.moot) : 0;
  if (!weight) return 0;
  return Math.max(0, Math.min(bankCap(kind, inMoot), Math.floor(pointsFor(result) * weight)));
}
```

- [ ] **Step 4: Declare them in `src/game/war.d.ts`**

```ts
  export const WAR_WEIGHT: Readonly<{ moot: number; mootBonus: number; solo: number }>;
  export const WAR_SKILL_FLOOR: number;
  export const SOLO_DAILY_CAP: number;
  export type WarKind = "moot" | "solo";
  export function bankCap(kind: WarKind | string, inMoot?: boolean): number;
  export function bankedPoints(result: unknown, kind: WarKind | string, inMoot?: boolean): number;
```

- [ ] **Step 5: Run the gate and watch it pass**

```bash
npm run wartest && npm run typecheck
```

Expected: `wartest` PASS with 79 + 10 = **89 checks**, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/game/war.mjs src/game/war.d.ts tools/wartest.mjs
git commit -m "war.mjs prices a kind of fight, and the cap rises with the bonus

The engine will name the situation; this module prices it. Two numbers and
a floor, all three explicitly unmeasured and labelled as such.

The cap is the part that would have gone wrong quietly: pointsFor already
clamps at POINTS.cap 40, so a 1.5x Moot bonus on a good hand would have been
computed and then clipped straight back to 40 — the bonus present in the
arithmetic and absent from the ledger. bankCap is the one truth about a
ceiling and it moves with the weight. docs/ONE-CLIENT.md §5.2, §5.4.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The Moot's hour — a window that survives October

Implements spec §6.1. Pure, DST-correct by construction, no database.

**Files:**
- Modify: `src/game/war.mjs`, `src/game/war.d.ts`, `tools/wartest.mjs`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `MOOT_HOUR: 20`, `MOOT_MINUTES: 60`
  - `inMootWindow(atMs: number): boolean`
  - `nextMootAt(atMs: number): number` — epoch ms of the next window's start

- [ ] **Step 1: Write the failing checks**

Append to `tools/wartest.mjs` after Task 4's block:

```js
  // ---- THE MOOT'S HOUR (docs/ONE-CLIENT.md §6.1) ----
  {
    // Two dates chosen for the offset, not the season: 15 Jan is GMT (UTC+0),
    // 15 Jul is BST (UTC+1). A window computed in the wrong offset opens at
    // the wrong hour for half the year and says nothing about it.
    const gmtInside  = Date.UTC(2027, 0, 15, 20, 30);   // 20:30 London (GMT)
    const gmtOutside = Date.UTC(2027, 0, 15, 19, 30);   // 19:30 London
    const bstInside  = Date.UTC(2027, 6, 15, 19, 30);   // 20:30 London (BST)
    const bstOutside = Date.UTC(2027, 6, 15, 20, 30);   // 21:30 London

    check("the Moot is open at 20:30 London in winter", inMootWindow(gmtInside));
    check("the Moot is shut at 19:30 London in winter", !inMootWindow(gmtOutside));
    check("the Moot is open at 20:30 London in summer — BST, not UTC", inMootWindow(bstInside));
    check("the Moot is shut at 21:30 London in summer", !inMootWindow(bstOutside));
    check("the window is exactly MOOT_MINUTES long",
      inMootWindow(Date.UTC(2027, 0, 15, 20, 0))
        && inMootWindow(Date.UTC(2027, 0, 15, 20, 59))
        && !inMootWindow(Date.UTC(2027, 0, 15, 21, 0)));

    const next = nextMootAt(gmtOutside);
    check("nextMootAt from before the window points at today's window",
      next === Date.UTC(2027, 0, 15, 20, 0), `${new Date(next).toISOString()}`);
    check("nextMootAt from inside the window points at TOMORROW, not now",
      nextMootAt(gmtInside) > gmtInside
        && nextMootAt(gmtInside) - gmtInside > 20 * 3600_000);
    check("nextMootAt always lands inside a window",
      inMootWindow(nextMootAt(gmtOutside)) && inMootWindow(nextMootAt(bstOutside)));
  }
```

Add `inMootWindow`, `nextMootAt`, `MOOT_HOUR`, `MOOT_MINUTES` to the `war.mjs`
import in `tools/wartest.mjs`.

- [ ] **Step 2: Run the gate and watch it fail**

```bash
npm run wartest
```

Expected: FAIL — `inMootWindow is not a function`.

- [ ] **Step 3: Implement in `src/game/war.mjs`**

Add after Task 4's block:

```js
/* --------------------------------------------------------------------------
   THE MOOT'S HOUR
   -------------------------------------------------------------------------- */

/**
 * The hour the Moot convenes, in LONDON, and it is a constant rather than a
 * table because a table is what you build when a schedule needs to vary. It
 * does not yet. `docs/ONE-CLIENT.md` §6.1.
 *
 * London, not UTC, because this is an appointment with people: an hour that
 * drifted by one twice a year would be a broken appointment. The conversion is
 * done by `Intl`, which knows when the clocks go back — so this file holds no
 * DST arithmetic of its own and cannot get it wrong.
 */
export const MOOT_HOUR = 20;
export const MOOT_MINUTES = 60;
const MOOT_TZ = "Europe/London";

const LONDON = new Intl.DateTimeFormat("en-GB", {
  timeZone: MOOT_TZ, hour12: false,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit",
});

/** Wall-clock London parts for an instant. */
function londonParts(atMs) {
  const p = {};
  for (const part of LONDON.formatToParts(new Date(atMs))) p[part.type] = part.value;
  // Some ICU builds render midnight as "24" under hour12:false. Normalise it,
  // or the first hour of every day reads as the last hour of the day before.
  const hour = Number(p.hour) % 24;
  return { year: +p.year, month: +p.month, day: +p.day, hour, minute: +p.minute };
}

/** Is the war watching more closely right now? */
export function inMootWindow(atMs) {
  const { hour, minute } = londonParts(atMs);
  const mins = hour * 60 + minute;
  const start = MOOT_HOUR * 60;
  return mins >= start && mins < start + MOOT_MINUTES;
}

/**
 * When the next window OPENS, as epoch ms. Inside a window this answers
 * tomorrow's, not "now" — the countdown a player reads should never sit at
 * zero while the thing it counts to is already happening.
 *
 * Found by search rather than arithmetic: stepping minute-wise from an hour
 * before the earliest candidate costs nothing here and cannot be wrong about a
 * clock change, which closed-form UTC arithmetic repeatedly is.
 */
export function nextMootAt(atMs) {
  const MINUTE = 60_000;
  // Start one minute past now, so "inside the window" walks out of it first.
  let t = Math.ceil((atMs + MINUTE) / MINUTE) * MINUTE;
  if (inMootWindow(atMs)) {
    // Walk to the end of the window we are in before looking for the next.
    while (inMootWindow(t)) t += MINUTE;
  }
  const limit = t + 49 * 60 * MINUTE;     // two days is always enough
  for (; t <= limit; t += MINUTE) {
    if (inMootWindow(t)) {
      // Rewind to the window's first minute — the search entered mid-step only
      // if the caller's clock was mid-minute.
      while (inMootWindow(t - MINUTE)) t -= MINUTE;
      return t;
    }
  }
  return limit;   // unreachable while MOOT_MINUTES > 0; never throws at a caller
}
```

- [ ] **Step 4: Declare in `src/game/war.d.ts`**

```ts
  export const MOOT_HOUR: number;
  export const MOOT_MINUTES: number;
  export function inMootWindow(atMs: number): boolean;
  export function nextMootAt(atMs: number): number;
```

- [ ] **Step 5: Run the gate and watch it pass**

```bash
npm run wartest && npm run typecheck
```

Expected: PASS with **97 checks**, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/game/war.mjs src/game/war.d.ts tools/wartest.mjs
git commit -m "The Moot convenes at eight, London, and October cannot move it

A constant, not a table: a table is what you build when a schedule needs to
vary and this one does not. Intl does the timezone conversion, so this file
holds no DST arithmetic of its own and therefore cannot get it wrong — the
gate proves it on a January date and a July date, which is the same wall
clock at two different UTC offsets. nextMootAt inside a window answers
tomorrow, because a countdown that reads zero while the thing is happening
is worse than no countdown. docs/ONE-CLIENT.md §6.1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Deal a territory to a solo room

Implements spec §5.0, site 1 of 2. **Without this task, Task 7 banks nothing.**

**Files:**
- Modify: `src/game/engine.mjs:2379`
- Modify: `tools/wartest.mjs`

**Interfaces:**
- Consumes: existing `dealTerritory(seed, front)`, `territory(id)` from `war.mjs`
- Produces: `room.territoryId` non-null on solo rooms

- [ ] **Step 1: Read the spec section**

Read `docs/ONE-CLIENT.md` §5.0 in full. It explains why this task exists as a
separate task from the `warReport` change, and why doing only the other one
ships a green build that banks nothing.

- [ ] **Step 2: Write the failing check**

Add to `tools/wartest.mjs`:

```js
  // ---- A SOLO ROOM FIGHTS OVER GROUND (docs/ONE-CLIENT.md §5.0) ----
  //
  // The gate that would have caught the one-site fix. dealGroundFor used to
  // null the territory on a solo room, so relaxing warReport's human count
  // alone left gate 3 — "no territory" — rejecting every solo match, and the
  // change would have shipped green having banked nothing.
  {
    const eng = makeEngine({ autoTick: false });
    const room = eng.__testRoom({ mode: "solo", solo: true });
    eng.__testDealGround(room);
    check("a solo room is dealt a real territory", !!territory(room.territoryId),
      `territoryId=${room.territoryId}`);

    const friendly = eng.__testRoom({ mode: "public", friendly: true });
    eng.__testDealGround(friendly);
    check("a friendly moot still has NO ground at stake — unchanged",
      friendly.territoryId === null, `territoryId=${friendly.territoryId}`);
  }
```

**If `makeEngine` exposes no such test hooks**, do not invent them as production
API. Instead drive it the way `tools/warflow.mjs` already drives a room — read
that file's room-creation helper and copy its approach — and adapt this check to
that idiom. Report which route you took.

- [ ] **Step 3: Run and watch it fail**

```bash
npm run wartest
```

Expected: FAIL on `a solo room is dealt a real territory`, with
`territoryId=null`.

- [ ] **Step 4: Implement**

In `src/game/engine.mjs`, replace line 2379:

```js
    if (!room || room.mode === "solo" || room.solo) { if (room) room.territoryId = null; return; }
```

with:

```js
    if (!room) return;
    // A SOLO ROOM IS DEALT GROUND LIKE ANY OTHER, since 7 Sep 2026.
    //
    // It used to be nulled here, and that one line was why relaxing
    // `warReport`'s human count would not have been enough: gate 3 rejects a
    // report with no territory, so a solo match would have been classified,
    // priced, and then dropped for having nowhere to bank it. Both sites move
    // together or neither does. docs/ONE-CLIENT.md §5.0.
    //
    // `room.friendly` below is UNTOUCHED and is the reason no second rule is
    // needed to keep a friendly moot out of the war: it has no ground, so it
    // banks nothing, exactly as it always did.
```

Leave the `room.friendly` branch at the next line exactly as it is.

- [ ] **Step 5: Run and watch it pass**

```bash
npm run wartest && npm run protocoltest && npm run playtest
```

Expected: `wartest` PASS with **99 checks**. `protocoltest` and `playtest` must
also pass — a solo room now carries a territory through the wire, and those are
the suites that would notice a snapshot shape change.

- [ ] **Step 6: Commit**

```bash
git add src/game/engine.mjs tools/wartest.mjs
git commit -m "A solo room is dealt ground, which is half of why the war was frozen

dealGroundFor nulled the territory on any solo room, and warReport's third
gate rejects a report without one. So the obvious fix — relax the human
count — would have shipped green and banked nothing, which is the exact
defect shape backlog 2.8 records about the woodpile: verified at one
integration point, broken at the one nobody looked at.

The friendly branch is untouched. It is why a friendly moot needs no second
rule to stay out of the war: no ground, nothing to bank.
docs/ONE-CLIENT.md §5.0.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: `warReport` classifies instead of rejecting

Implements spec §5.0 site 2, and §5.1.

**Files:**
- Modify: `src/game/engine.mjs:4565-4585`, `src/game/engine.d.ts:54`
- Modify: `tools/wartest.mjs`

**Interfaces:**
- Consumes: `bankedPoints`, `WAR_SKILL_FLOOR`, `inMootWindow` from `war.mjs` (Tasks 4, 5)
- Produces: `MatchEndReport` gains `kind: "moot"|"solo"` and `inMoot: boolean`;
  `entries[].points` are now BANKED points, already weighted

- [ ] **Step 1: Extend the `MatchEndReport` type**

In `src/game/engine.d.ts`, inside `interface MatchEndReport`, after `territoryId`:

```ts
    /**
     * WHAT KIND OF FIGHT THIS WAS, priced by war.mjs rather than here.
     * "moot" is two or more humans; "solo" is one man against bots worth
     * beating. A friendly match and a match below the skill floor produce no
     * report at all. docs/ONE-CLIENT.md §5.1.
     */
    kind: "moot" | "solo";
    /** Whether it fell inside the Moot's hour. Decides the bonus weight. */
    inMoot: boolean;
```

- [ ] **Step 2: Write the failing checks**

Add to `tools/wartest.mjs`:

```js
  // ---- WHAT WARREPORT NOW CLASSIFIES (docs/ONE-CLIENT.md §5.1) ----
  {
    const R = (over) => ({
      mode: "public", solo: false, friendly: false,
      matchId: "m1", code: "ROOM", territoryId: TERRITORIES[0].id,
      difficulty: "warrior", ...over,
    });
    const two = [{ id: "p1", name: "A", kills: 2, isWinner: true },
                 { id: "p2", name: "B", kills: 1, isWinner: false }];
    const one = [{ id: "p1", name: "A", kills: 2, isWinner: true },
                 { id: "bot_1", name: "Bot", kills: 1, isWinner: false }];

    check("two humans make a moot", classifyMatch(R(), two)?.kind === "moot");
    check("one human against warrior bots makes a solo report",
      classifyMatch(R({ mode: "solo", solo: true }), one)?.kind === "solo");
    check("one human against RECRUIT bots banks nothing",
      classifyMatch(R({ mode: "solo", solo: true, difficulty: "recruit" }), one) === null);
    check("a friendly match banks nothing, whoever is in it",
      classifyMatch(R({ friendly: true }), two) === null);
    check("a match with no territory banks nothing",
      classifyMatch(R({ territoryId: null }), two) === null);
    check("an unknown difficulty banks nothing rather than defaulting to pass",
      classifyMatch(R({ mode: "solo", solo: true, difficulty: "sleepy" }), one) === null);
    check("a solo report carries only the human, never the bot",
      classifyMatch(R({ mode: "solo", solo: true }), one)?.entries.length === 1);
    check("the solo entry is worth less than the same hand in a moot",
      classifyMatch(R({ mode: "solo", solo: true }), one).entries[0].points
        < classifyMatch(R(), two).entries[0].points);
  }
```

Export `classifyMatch` from `engine.mjs` for this — see Step 4. Import it and
`TERRITORIES` at the top of `tools/wartest.mjs`.

- [ ] **Step 3: Run and watch it fail**

```bash
npm run wartest
```

Expected: FAIL — `classifyMatch is not a function`.

- [ ] **Step 4: Implement**

In `src/game/engine.mjs`, replace the whole `warReport` function (lines
4565–4585) with:

```js
  /**
   * WHAT KIND OF FIGHT THIS WAS. The engine names the situation; `war.mjs`
   * prices it. An engine that knows what 0.3 means is an engine with a second
   * opinion about the war.
   *
   * This USED to return null on any match with fewer than two humans, and on
   * 7 Sep 2026 that gate was found to have banked 2 matches out of 85 in four
   * weeks: at 26 players, two humans in one room at one moment is a
   * coincidence rather than an event. The war was not broken — 79 checks green
   * — it was starved. docs/ONE-CLIENT.md §2.
   *
   * Exported for `tools/wartest.mjs`, which holds the classification without a
   * database and without a socket.
   */
  function classifyMatch(room, results) {
    if (!room) return null;
    // A friendly moot is a fight the war agreed not to watch. No report, ever.
    if (room.friendly) return null;
    if (!room.matchId || !territory(room.territoryId)) return null;

    const humans = results.filter((r) => r && typeof r.id === "string" && !r.id.startsWith("bot_"));
    if (humans.length === 0) return null;

    const kind = humans.length >= 2 ? "moot" : "solo";
    // A war that can be dragged by beating the tutorial is not a war. The floor
    // is a SKILL NUMBER, not a difficulty name, because BOT_SKILL is a map and
    // not an ordering — so a difficulty added later is ranked by the same
    // number that makes it hard. An unknown difficulty scores undefined and
    // fails the comparison, which is the answer we want.
    if (kind === "solo" && !(BOT_SKILL[room.difficulty] >= WAR_SKILL_FLOOR)) return null;

    const at = wallNow();
    const inMoot = inMootWindow(at);
    const entries = humans
      .map((r) => ({ playerId: r.id, name: r.name, points: bankedPoints(r, kind, inMoot) }))
      .filter((e) => e.points > 0);
    if (entries.length === 0) return null;

    return {
      // Stable for the life of this match and unique across matches.
      matchKey: `${room.code}:${room.matchId}`,
      territoryId: room.territoryId,
      kind, inMoot, entries, at,
    };
  }
  function warReport(room, results) { return classifyMatch(room, results); }
```

Add to `war.mjs`'s import at the top of `engine.mjs` (line 25):

```js
import { TERRITORIES, territory, pointsFor, dealTerritory,
         bankedPoints, bankCap, WAR_SKILL_FLOOR, inMootWindow } from "./war.mjs";
```

Export `classifyMatch` from the engine's public surface next to the other
exports, and declare it in `src/game/engine.d.ts`:

```ts
    /** Test seam: what kind of fight this was, without a socket or a database. */
    classifyMatch(room: unknown, results: unknown[]): MatchEndReport | null;
```

- [ ] **Step 5: Run and watch it pass**

```bash
npm run wartest && npm run protocoltest && npm run playtest && npm run typecheck
```

Expected: `wartest` PASS with **107 checks**, the rest green, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/game/engine.mjs src/game/engine.d.ts tools/wartest.mjs
git commit -m "warReport stops rejecting and starts classifying

A lone man's fight now banks, at war.mjs's discount, and only against bots
worth beating — the floor is a skill NUMBER because BOT_SKILL is a map and
not an ordering, so an unknown difficulty scores undefined and fails the
comparison, which is the answer we want.

A friendly match still banks nothing and needs no new rule to say so. The
report carries its kind and whether it fell in the Moot's hour, so the
database banks what the rules priced rather than pricing it a second time.
docs/ONE-CLIENT.md §5.1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: The `kind` column

Implements spec §5.3.

**Files:**
- Modify: `src/db/schema.ts`, `src/db/index.ts` (beside line 372), `db/schema.sql` (regenerated)

**Interfaces:**
- Consumes: nothing
- Produces: `warLedger.kind: text NOT NULL DEFAULT 'moot'`

- [ ] **Step 1: Add the column to the Drizzle schema**

In `src/db/schema.ts`, inside `warLedger`, immediately after `points`:

```ts
  /**
   * HOW THIS POINT WAS EARNED — "moot" (two or more humans) or "solo" (one man
   * against bots worth beating). `points` above is what was BANKED, already
   * weighted by `war.mjs`.
   *
   * The column exists so that retuning the solo discount is visible rather than
   * invisible: a retune changes future banking and leaves history alone, and
   * without this nobody could tell which rows were priced under which weight.
   *
   * The default backfills correctly. The two rows that existed when this landed
   * were both two-human matches.
   */
  kind: text("kind").notNull().default("moot"),
```

- [ ] **Step 2: Add the in-place migration**

In `src/db/index.ts`, immediately after line 372's hearth_id ALTER:

```ts
    await db.execute(sql`ALTER TABLE war_ledger ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'moot'`);
```

- [ ] **Step 3: Regenerate `db/schema.sql`**

```bash
npx drizzle-kit generate --dialect=postgresql --schema=./src/db/schema.ts --out=/tmp/g
cp /tmp/g/0000_*.sql db/schema.sql
grep -n "kind" db/schema.sql
```

Expected: the generated file contains the `kind` column on `war_ledger`.

- [ ] **Step 4: Prove the migration runs on a real database**

```bash
WAR_TEST_DB="$SCRATCH_DB" npm run warflow
```

(`SCRATCH_DB` is a throwaway Postgres URL — `warflow` DROPS AND RECREATES the
war tables, so never point it at anything you want to keep.)

Expected: `warflow` passes, and the run creates `war_ledger` with `kind`.

- [ ] **Step 5: Verify typecheck and lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/index.ts db/schema.sql
git commit -m "war_ledger records how a point was earned

points is what was banked, already weighted. kind is which weight it was
banked under, so that retuning the solo discount is a visible change to
future rows rather than an invisible reinterpretation of old ones. The
default backfills correctly: both rows that existed were two-human matches.
docs/ONE-CLIENT.md §5.3.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: The daily cap, and the re-clamp that would have eaten the bonus

Implements spec §5.4. **Contains the second of the two traps.**

**Files:**
- Modify: `src/db/war.ts` (`bankMatchDetailed`, `bankOne`)
- Modify: `tools/warflow.mjs`

**Interfaces:**
- Consumes: `bankCap`, `SOLO_DAILY_CAP` from `war.mjs`; `report.kind`, `report.inMoot` from Task 7
- Produces: `WarOutcomeKind` gains `"capped"`

- [ ] **Step 1: Fix the re-clamp FIRST, and understand why**

`bankMatchDetailed` currently re-clamps every man against `POINTS.cap`:

```ts
      const points = Math.min(POINTS.cap, Math.max(0, Math.floor(claim.entry.points)));
```

`POINTS.cap` is 40. A Moot-window match pays up to 60. **This line would compute
the bonus and then clip it straight back to 40** — the bonus present in the
arithmetic and absent from the ledger, with no error anywhere. Replace it with:

```ts
      // Re-clamped against the ceiling for THIS KIND of fight, not the flat
      // POINTS.cap. That clamp was 40 and a Moot-window match pays up to 60, so
      // it would have computed the bonus and then clipped it away silently —
      // the second of the two traps docs/ONE-CLIENT.md §5.0 warns about, and
      // the same shape as the first. bankCap is the one truth about a ceiling.
      //
      // Not a second opinion — the same function the engine priced him with —
      // but this process may one day not be the one that ran the match.
      const ceiling = bankCap(report.kind, report.inMoot);
      const points = Math.min(ceiling, Math.max(0, Math.floor(claim.entry.points)));
```

Update the import at the top of `src/db/war.ts` to bring in `bankCap` and
`SOLO_DAILY_CAP` alongside `POINTS`.

- [ ] **Step 2: Write the failing checks in `warflow`**

`tools/warflow.mjs` drives real Postgres. Add:

```js
  // ---- THE MOOT BONUS SURVIVES THE BANK (ONE-CLIENT §5.4) ----
  //
  // RED-FIRST NOTE: with the old `Math.min(POINTS.cap, ...)` in place this
  // check fails at 40, which is how we know it is measuring the clamp and not
  // just agreeing with the arithmetic.
  {
    const banked = await bankAndRead({ kind: "moot", inMoot: true, kills: 9, isWinner: true });
    check("a Moot-window match banks above the plain cap",
      banked > 40, `banked ${banked}`);
    check("and still respects its own ceiling", banked <= 60, `banked ${banked}`);
  }

  // ---- THE SOLO DAILY CAP ----
  {
    await resetLedgerForProfile(PROFILE);
    let total = 0;
    // Ten good solo matches in one day, each worth 12 uncapped.
    for (let i = 0; i < 10; i++) {
      total += await bankAndRead({ kind: "solo", inMoot: false, kills: 9, isWinner: true, matchKey: `cap:${i}` });
    }
    check("the solo daily cap holds across many matches in one day",
      total === SOLO_DAILY_CAP, `banked ${total} against a cap of ${SOLO_DAILY_CAP}`);

    const outcomes = await bankOutcomes({ kind: "solo", inMoot: false, kills: 9, isWinner: true, matchKey: "cap:over" });
    check("a man over his cap is TOLD, not silently ignored",
      outcomes.some((o) => o.kind === "capped"));
  }

  // ---- A PART-CAPPED MATCH BANKS THE REMAINDER, NOT ZERO ----
  {
    await resetLedgerForProfile(PROFILE);
    await bankAndRead({ kind: "solo", inMoot: false, kills: 9, isWinner: true, matchKey: "part:1" }); // 12
    const second = await bankAndRead({ kind: "solo", inMoot: false, kills: 9, isWinner: true, matchKey: "part:2" }); // 12 -> 24
    const third = await bankAndRead({ kind: "solo", inMoot: false, kills: 9, isWinner: true, matchKey: "part:3" });
    check("the match that crosses the cap banks the REMAINDER, not zero",
      second === 12 && third === 0, `second ${second}, third ${third}`);
  }

  // ---- IDEMPOTENCY STILL RULES, WITH THE CAP IN THE WAY ----
  {
    await resetLedgerForProfile(PROFILE);
    const a = await bankAndRead({ kind: "solo", inMoot: false, kills: 2, isWinner: true, matchKey: "same:1" });
    const b = await bankAndRead({ kind: "solo", inMoot: false, kills: 2, isWinner: true, matchKey: "same:1" });
    check("a retried match banks nothing twice, cap or no cap", b === 0, `retry banked ${b}`);
    check("and the first one did land", a > 0);
  }

  // ---- §5.0's GATE: a solo room carries a territory end to end ----
  check("a solo room's match reaches the ledger with a real territory",
    (await lastLedgerRow()).territory_id !== null);
```

Write `bankAndRead`, `bankOutcomes`, `resetLedgerForProfile` and `lastLedgerRow`
as local helpers in `warflow.mjs`, following the file's existing helper style —
read the file first and match how it already builds reports and queries rows.

- [ ] **Step 3: Run and watch them fail**

```bash
WAR_TEST_DB="$SCRATCH_DB" npm run warflow
```

Expected: FAIL. Specifically `a Moot-window match banks above the plain cap`
reporting `banked 40` **if you have not yet applied Step 1** — run it once with
Step 1 reverted to see that, then re-apply. The cap checks fail because no cap
exists yet.

- [ ] **Step 4: Implement the cap in `bankMatchDetailed`**

Add `"capped"` to the `WarOutcomeKind` union with a doc comment:

```ts
  /** He is at his solo ceiling for the day. Tomorrow it resets. */
  | "capped"
```

Inside the `for (const claim of bound)` loop, after the `points <= 0` guard and
before the `bankOne` call:

```ts
      // THE SOLO DAILY CAP — docs/ONE-CLIENT.md §5.4.
      //
      // Read inside the same transaction as the insert (see bankOne), so two
      // concurrent match-ends cannot both see room under the ceiling and both
      // bank. A part-capped match banks the REMAINDER rather than zero: a man
      // with 10 points of headroom in a 30-point match banks 10, because a
      // cliff at the boundary is something a player feels and cannot see.
      let allowed = points;
      if (report.kind === "solo") {
        const used = await soloBankedToday(db, season.id, claim.profileId);
        allowed = Math.max(0, Math.min(points, SOLO_DAILY_CAP - used));
        if (allowed === 0) {
          outcomes.push({ playerId: claim.entry.playerId, kind: "capped", people: side });
          continue;
        }
      }
```

and pass `points: allowed` to `bankOne` instead of `points`.

Add the helper above `bankMatchDetailed`:

```ts
/**
 * What this man has already banked from solo fights today.
 *
 * UTC, deliberately, and the split from the Moot's LONDON hour is argued in
 * `war.mjs`'s SOLO_DAILY_CAP comment: London has an hour that happens twice
 * each October, and a day boundary that repeats is one a cap can be walked
 * through.
 */
async function soloBankedToday(db: Db, seasonId: number, profileId: number): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(points), 0)::int AS used
      FROM war_ledger
     WHERE season_id = ${seasonId}
       AND profile_id = ${profileId}
       AND kind = 'solo'
       AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`);
  const first = (rows as unknown as { rows?: Array<{ used: number }> }).rows?.[0];
  return Number(first?.used ?? 0);
}
```

Pass `kind: report.kind` through `bankOne`'s entry object and into the
`warLedger` insert values.

- [ ] **Step 5: Run and watch them pass**

```bash
WAR_TEST_DB="$SCRATCH_DB" npm run warflow && npm run wartest && npm run typecheck && npm run lint
```

Expected: `warflow` green with its new checks, `wartest` still 107, typecheck
and lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/db/war.ts tools/warflow.mjs
git commit -m "The solo cap, and the clamp that would have eaten the Moot bonus

Two things, and the second is the more dangerous. bankMatchDetailed
re-clamped every man at POINTS.cap 40; a Moot-window match pays up to 60, so
it would have computed the bonus and then clipped it away with nothing
raised anywhere. bankCap is the one truth about a ceiling and it moves with
the weight. That is the same defect shape as the territory in §5.0, found
the same way — by reading the whole path rather than the one line the change
was about.

The cap itself is read inside the insert's transaction, so two concurrent
match-ends cannot both find room under it. A part-capped match banks the
remainder rather than zero, because a cliff at the boundary is a thing a
player feels and cannot see. And a capped man is told: 'capped' is an
outcome kind, not silence. docs/ONE-CLIENT.md §5.4.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: The gate that would have caught §2

Implements spec §7's last bullet — the most important gate in this plan.

**Files:**
- Modify: `tools/warflow.mjs`

**Interfaces:**
- Consumes: everything from Tasks 4–9
- Produces: a check that fails on any future build where ordinary play banks nothing

- [ ] **Step 1: Write the check**

Add to `tools/warflow.mjs`, as its final section:

```js
  // ==========================================================================
  // THE GATE THAT WOULD HAVE CAUGHT IT.
  //
  // On 7 Sep 2026 this repository had 79 green war checks and a production
  // ledger holding 2 rows against 85 matches, with zero territories ever
  // flipped. Every one of those checks was correct. Not one of them asked the
  // question a player asks: I played for an evening — did any of it count?
  //
  // This does. It plays a REPRESENTATIVE ALPHA SESSION — solo rooms, one human,
  // ordinary difficulty, the way a lone tester actually plays — and requires
  // the ledger to be non-empty and the contest to have moved. A build where
  // ordinary play banks nothing fails here, however green everything else is.
  //
  // docs/HANDOVER.md: "a gate green because the case is absent is not a gate."
  // ==========================================================================
  {
    await resetSeason();
    const SESSION = 6;
    for (let i = 0; i < SESSION; i++) {
      await playSoloMatch({ difficulty: "warrior", matchKey: `alpha:${i}` });
    }

    const rows = await ledgerRowCount();
    check("an evening of ordinary solo play reaches the ledger at all",
      rows > 0, `${rows} rows after ${SESSION} solo matches`);

    const contested = await totalContestPoints();
    check("and it moved the contest, not just the ledger",
      contested > 0, `contest total ${contested}`);

    const kinds = await ledgerKinds();
    check("those rows are recorded as solo, not mislabelled as moots",
      kinds.every((k) => k === "solo"), `kinds ${JSON.stringify(kinds)}`);
  }
```

Write `resetSeason`, `playSoloMatch`, `ledgerRowCount`, `totalContestPoints` and
`ledgerKinds` following `warflow.mjs`'s existing helper style. `playSoloMatch`
must go through the real engine and the real match-end subscription — not call
`bankMatch` directly — or the gate tests the bank and not the path.

- [ ] **Step 2: Prove it goes red on the old behaviour**

Temporarily restore the old gate in `engine.mjs`'s `classifyMatch`:

```js
    if (humans.length < 2) return null;   // TEMPORARY — proving the gate
```

then:

```bash
WAR_TEST_DB="$SCRATCH_DB" npm run warflow
```

Expected: **FAIL** on `an evening of ordinary solo play reaches the ledger at
all`, reporting `0 rows after 6 solo matches`. This is the exact production
condition of 7 Sep 2026, reproduced in a harness.

**Remove the temporary line.** Verify with
`grep -n "humans.length < 2" src/game/engine.mjs` printing nothing.

- [ ] **Step 3: Run green**

```bash
WAR_TEST_DB="$SCRATCH_DB" npm run warflow
```

Expected: PASS, all sections.

- [ ] **Step 4: Commit**

```bash
git add tools/warflow.mjs
git commit -m "The gate that would have caught four frozen weeks

79 war checks were green while the production map had never moved. Every one
of them was correct; not one asked the question a player asks, which is
whether an evening of play counted for anything.

This plays a representative alpha session — solo rooms, one human, ordinary
difficulty — and requires the ledger to be non-empty and the contest to have
moved. Shown red first by restoring the old two-human gate, where it reports
0 rows after 6 matches: the production condition of 7 Sep 2026, reproduced.
docs/ONE-CLIENT.md §7.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: The map moves while you watch it

Implements spec §6.2.

**Files:**
- Modify: `src/game/client/factionMap/FactionMap.tsx`
- Modify: `src/app/api/war/route.ts` (only if it needs a cache header)

**Interfaces:**
- Consumes: the existing `POST /api/war` payload
- Produces: `/factions` refreshes on an interval and shows the Moot countdown

- [ ] **Step 1: Read how the page loads the war today**

```bash
grep -n "useEffect\|fetch\|/api/war" src/game/client/factionMap/FactionMap.tsx | head -20
```

Record the existing load function's name and the state setter it calls. The poll
reuses them — do not write a second fetch path.

- [ ] **Step 2: Add the poll**

In `FactionMap.tsx`, beside the existing load effect:

```tsx
  // THE MAP MOVES WHILE YOU WATCH IT.
  //
  // docs/WHAT-THIS-GAME-IS.md §3.1 listed "the map is not live" as an open gap:
  // this screen read the war when it opened and never again. Everything else in
  // P1 makes the map move, and a map that moves where nobody can see it move is
  // not the feature. docs/ONE-CLIENT.md §6.2.
  //
  // Thirty seconds, and only while the tab is visible: a backgrounded phone
  // polling a 20 Hz game server for a number that changes slowly is a battery
  // complaint waiting to be filed.
  useEffect(() => {
    const POLL_MS = 30_000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => { void loadWar(); }, POLL_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => (document.visibilityState === "visible" ? (void loadWar(), start()) : stop());
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [loadWar]);
```

If the existing loader is not a stable `useCallback`, wrap it in one first —
otherwise this effect re-subscribes on every render.

- [ ] **Step 3: Add the Moot countdown**

Add above the map, in the same component:

```tsx
  // THE MOOT'S HOUR, counted down. nextMootAt answers TOMORROW while a window
  // is open, so this never reads zero against a Moot already in progress —
  // inMootWindow is what says "now", and it gets its own line.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const mootOpen = inMootWindow(now);
  const untilMoot = Math.max(0, nextMootAt(now) - now);
  const mootLabel = mootOpen
    ? "The Moot is sitting"
    : `The Moot convenes in ${Math.floor(untilMoot / 3600_000)}h ${Math.floor((untilMoot % 3600_000) / 60_000)}m`;
```

and render `mootLabel` in the map's header, using the existing header component
classes — do not introduce a new colour or a new hue. `docs/SUTTON-HOO.md` and
`globals.css` are the palette; if a token you want does not exist, use the
nearest one that does.

Import from `war.mjs`:

```tsx
import { inMootWindow, nextMootAt } from "@/game/war.mjs";
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npm run lint && npm run csscheck && npm run platformcheck
```

Expected: all clean; `platformcheck` 6/6 (the import is a rules-module import,
not a renderer import, so the law holds).

- [ ] **Step 5: Photograph it**

```bash
npm run warshot
```

Expected: a capture of `/factions` showing the countdown. Check the countdown is
legible and does not collide with the header. If `warshot` does not frame it,
use `npm run uishots` and record which tool you used.

- [ ] **Step 6: Commit**

```bash
git add src/game/client/factionMap/
git commit -m "The map moves while you watch, and says when the Moot sits

WHAT-THIS-GAME-IS §3.1 listed 'the map is not live' as an open gap and it
was: this screen read the war once, on open. Everything else in P1 makes the
map move; a map that moves where nobody can see it move is not the feature.

Thirty seconds, visible tabs only. The countdown reads 'The Moot is sitting'
while one is open rather than counting to zero against a thing already
happening. docs/ONE-CLIENT.md §6.2.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: Web push for the Moot — LAST, and cut-able

Implements spec §6.3. **If this task runs long or blocks, stop and report. The
rest of P1 stands without it.**

**Files:**
- Modify: `public/sw.js`, `src/db/schema.ts`, `src/db/index.ts`
- Create: `src/app/api/moot/subscribe/route.ts`, `src/game/client/mootPush.ts`

**Interfaces:**
- Consumes: `nextMootAt` from `war.mjs` (Task 5)
- Produces: `push_subscriptions` table; `POST /api/moot/subscribe`

- [ ] **Step 1: Add the push listeners, without a fetch handler**

Append to `public/sw.js`:

```js
// THE MOOT'S CALL. Added 7 Sep 2026 (docs/ONE-CLIENT.md §6.3).
//
// NOTE WHAT IS STILL NOT HERE: a fetch handler. The law above stands — the
// browser's own network stack serves everything byte for byte, and no cache in
// this worker can ever serve a stale bundle against a moved wire protocol.
// Push needs a worker; it does not need a cache.
self.addEventListener("push", (event) => {
  let body = "The Moot convenes.";
  try { body = (event.data && event.data.json().body) || body; } catch { /* a push with no body is still a call */ }
  event.waitUntil(self.registration.showNotification("Bretwalda: Blood Moot", {
    body, icon: "/icon-192.png", badge: "/icon-192.png", tag: "moot",
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ("focus" in c) return c.focus();
    return self.clients.openWindow("/");
  }));
});
```

- [ ] **Step 2: Add the subscription table**

In `src/db/schema.ts`:

```ts
/**
 * WHO ASKED TO BE CALLED TO THE MOOT. One row per browser per device — the
 * endpoint IS the identity, which is why it is the unique key and why there is
 * no profile join here: a man may install on two phones and be called on both.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  profileId: integer("profile_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint)]);
```

In `src/db/index.ts`, beside the other `CREATE TABLE IF NOT EXISTS` calls:

```ts
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id serial PRIMARY KEY,
        endpoint text NOT NULL,
        p256dh text NOT NULL,
        auth text NOT NULL,
        profile_id integer,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_idx
        ON push_subscriptions (endpoint)`);
```

- [ ] **Step 3: Write the subscribe route**

Create `src/app/api/moot/subscribe/route.ts`, following the request-validation
style of `src/app/api/war/swear/route.ts` — read that file first and match it.
The route accepts `{ endpoint, keys: { p256dh, auth } }`, validates all three as
non-empty strings, and upserts on `endpoint`. It must degrade to a 200 with
`{ ok: false }` when there is no database, exactly as the profile routes do:
`src/db/index.ts` returns null rather than throwing, and no route may be the
first thing in this app to break that promise.

- [ ] **Step 4: Regenerate the SQL and check the platform laws**

```bash
npx drizzle-kit generate --dialect=postgresql --schema=./src/db/schema.ts --out=/tmp/g
cp /tmp/g/0000_*.sql db/schema.sql
npm run typecheck && npm run lint && npm run platformcheck
```

Expected: 6/6. **If `platformcheck` fails on the new client storage seam**, add
`src/game/client/mootPush.ts` to its named-seam list *in the tool*, in a commit
that says why — that is the documented way to add a seam.

- [ ] **Step 5: Record what is NOT done**

Add to `docs/ONE-CLIENT.md` §6.3 a short "as built" note stating: the VAPID
keypair is the owner's to generate and set in the deployment environment
(`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`); the dispatcher that actually sends
before a Moot is **not built**; and iOS delivers push only to a home-screen
PWA. Do not claim push works — the subscription half works.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "The Moot can call, once the owner sets the keys

Push listeners on the existing worker — and still NO fetch handler, so the
file's law holds: nothing here can ever serve a stale bundle against a moved
wire protocol. Push needs a worker; it does not need a cache.

What works is the subscription half. The dispatcher is not built and the
VAPID keys are the owner's to generate; §6.3 now says so rather than
implying a working notification. iOS delivers push only to a home-screen
PWA, which is a property of the platform and not a defect to fix later.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: Update the ledgers and close the cycle

**Files:**
- Modify: `docs/ONE-CLIENT.md`, `docs/BACKLOG.md`, `docs/HANDOVER.md`, `docs/WHAT-THIS-GAME-IS.md`

- [ ] **Step 1: Run the full battery**

```bash
npm run typecheck && npm run lint && npm run platformcheck \
  && npm run wartest && npm run wartest -- --prove \
  && npm run protocoltest && npm run playtest && npm run weightprobe \
  && npm run solidtest && npm run goretest && npm run touchtest
WAR_TEST_DB="$SCRATCH_DB" npm run warflow
WAR_TEST_DB="$SCRATCH_DB" npm run warrace
```

Record every count. Any regression against the counts in `docs/HANDOVER.md`'s
battery is a stop-and-report, not a thing to explain away.

- [ ] **Step 2: Correct `WHAT-THIS-GAME-IS.md` §3.1**

Two bullets there are now wrong. Edit in place, marked:

- `**The map is not live.**` → mark it closed 7 Sep 2026, with the poll interval.
- Add a new bullet recording that the war banked nothing from solo play until
  7 Sep 2026, and that the "map moved while you were asleep" sentence was
  aspirational rather than true for the first month. **This repository corrects
  its own record; do not quietly fix the map bullet and leave the claim
  standing.**

- [ ] **Step 3: Add the P1 rows to `BACKLOG.md`**

Add rows for the solo bank, the Moot, the live map and the push half, each with
its gate and its count, in the table style the file already uses.

- [ ] **Step 4: Update `HANDOVER.md`**

Update the gate battery's counts to what Step 1 actually printed, and add a
short section stating what landed, what is not built (the push dispatcher), and
that `0.3` / `SOLO_DAILY_CAP` are unvalidated.

- [ ] **Step 5: Commit and push**

```bash
git add docs/
git commit -m "The ledgers say what landed, including the part that is not built

WHAT-THIS-GAME-IS §3.1 claimed the map moved while you were asleep. For the
first month it did not, and that correction goes in the document that made
the claim rather than only in the one that found it out.

Battery counts refreshed against what actually ran. The push dispatcher is
listed as not built, and the two war weights are listed as unvalidated.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push origin main
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §4.2 retire four tools | 1 |
| §4.3 repoint four tools | 2 |
| §4.4 retarget the sink | 3 |
| §4.5 platformcheck 6/6 | every task's verify step |
| §5.0 two sites | 6 (deal) + 7 (classify) |
| §5.1 the classification | 7 |
| §5.2 weight in war.mjs | 4 |
| §5.3 the kind column | 8 |
| §5.4 the daily cap | 9 |
| §5.5 numbers are guesses | 4 (in the code comment), 13 (in HANDOVER) |
| §6.1 schedule as a constant | 5 |
| §6.2 countdown, bonus, live map | 5 (bonus), 11 (countdown + poll) |
| §6.3 push, cut-able | 12 |
| §7 all five gate families | 4, 5, 7 (wartest); 9, 10 (warflow); 10 (the alpha-session gate) |
| §8 not in this cycle | nothing — correctly absent |

**Type consistency:** `bankedPoints(result, kind, inMoot)` and
`bankCap(kind, inMoot)` are defined in Task 4 and used with those exact
signatures in Tasks 7 and 9. `classifyMatch(room, results)` is defined in Task 7
and used in Task 7's checks only. `MatchEndReport.kind` / `.inMoot` are added in
Task 7 and consumed in Task 9. `WarOutcomeKind` gains `"capped"` in Task 9 and is
asserted in Task 9's checks. `soloBankedToday(db, seasonId, profileId)` is
defined and used in Task 9 alone.

**Two traps, both discovered by reading the whole path rather than the changed
line, both carried into the plan as their own steps:** the nulled territory
(Task 6) and the `POINTS.cap` re-clamp (Task 9 Step 1). Each has a red-first
step that reproduces the silent-success failure before fixing it.
