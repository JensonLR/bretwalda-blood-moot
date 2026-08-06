# Judgement — 6 Aug 2026 — `claude/bretwalda-bloot-moot-aaa-9th390` @ `a12695a`

**Verdict: HOLD.** Forty-two commits stay off `main` (`cfb49fc`). This is the
second hold on this branch and it is for the same reason as the first: the head
does not read as a man. Everything else on the branch is shippable and is being
held hostage by one object — see §6 for the way out.

Every number below was taken on this box on this tip. Captures in
`art/shots/judge/` (gitignored, regenerate with the commands in §1).

---

## 1. What was captured, and how

```
node tools/shoot.mjs headturn headturnfight --out art/shots/judge
node tools/silhouette.mjs helm --out art/shots/judge/sil
node tools/armourycard.mjs --phone-only --name judge-armoury    # -> art/ui/
```

| capture | path |
|---|---|
| bare head, portrait, 4 bearings | `art/shots/judge/cards/headturn-{front_0_,three-quarter_35_,profile_90_,back_180_}.png` |
| bare head, fight distance, 4 bearings | `art/shots/judge/cards/headturnfight-*.png` |
| helm ladder, silhouette only | `art/shots/judge/sil/sil-helm.png` (+ ten cards) |
| **armoury, phone, 390×844** | `art/ui/judge-armoury-phone.png` |

### The phone frame settles. The hole is closed.

Two waves reported the 390×844 armoury capture hanging for forty minutes. It
does not hang on this tip. Instrumented poll (`__armouryStats` + tile/img counts
every 3 s, production build, `--use-angle=swiftshader`):

```
t=3s   tiles 10  imgs 0   frames 1   thumbs 0    worstFrame 9386 ms
t=6s   tiles 10  imgs 2   frames 3   thumbs 2
t=9s   tiles 10  imgs 9   frames 10  thumbs 9
t=12s  tiles 10  imgs 10  frames 17  thumbs 10   <- settle() satisfied
```

`armourycard.mjs --phone-only` then ran clean end to end:

```
[card] phone tabs: ["HELMETS","HAIR","HAIR COLOUR","BEARDS","BEARD COLOUR","CLOAKS","ARMOUR FINISH","WAR PAINT"]
[card] phone STAGE: tier=low 8 frames in 2.0 s (4.0 fps) · worst frame 8414 ms · 10 thumbs, worst 1461 ms
[card] phone CARDS: 10 of 10 carry a rendered thumbnail
[card] FINAL: 2 console/page errors across 1 viewport(s)
```

So the earlier non-settle was environmental, not a product defect: `settle()`
waits on `imgs >= tiles`, and the thumbnail forge is fed one job per **frame**.
Anything that starves the frame loop starves the shop. The two ways that happens
on this box are (a) no production build, so the tool falls through to `next dev`
and contends on the per-directory `.next/dev/lock`, and (b) another capture tool
holding the CPU — the very first frame costs **8.4 s** here (texture library +
PMREM bake) and ten thumbnails cost ~1.5 s each. Under contention the 150 s
`settle` budget is genuinely reachable. **Do not run two capture tools at once
on this box**, and check `[card] STAGE:` frames before believing a hang.

Two console errors on the phone load remain unexplained and are the one loose
thread here: `net::ERR_CONNECTION_RESET` and a `404`. Reproduced on both the
tool and a bare probe. Name them or fix them next wave.

---

## 2. The head — FAIL

### The six ratios that are out, and whether they matter

`node tools/headmeasure.mjs` → `6 ratios outside tolerance · 0 of 12 SILHOUETTE
assertions FAILED`.

| ratio | measured | target | out by | does it matter to the eye? |
|---|---|---|---|---|
| `noseProjection` | 33.9–37.4 mm | 29 ± 8 | 0.43 | **Yes.** This is the wedge. The tolerance is nearly touching at the top and the nose is the loudest thing in the profile. |
| `tipBreadth` | 15.2–31.1 mm | 20 ± 7 | 4.05 | **Yes, and it is the worst of the six.** The *spread* is the finding, not the mean: some seeds get a 15 mm blade and some a 31 mm bulb off the same author. A ladder that wide is not art direction, it is an unpinned parameter. |
| `chinBeyondNasion` | 8.3–9.9 mm | 0 ± 9 | 0.93 | Marginal, and it is fighting S3, which passes. Leave it. |
| `jawOverCheek` | 0.769–0.800 | 0.86 ± 0.08 | 0.011 | Rounding. The bizygomatic is 22% over life *by art direction*; this tolerance was written for the old geometry. Retire or rewrite it. |
| `neckOverHead` | 0.811–0.852 | 0.75 ± 0.09 | 0.012 | **No — and neither does the measurement.** See below. |
| `neckOverJaw` | 1.039–1.122 | 1.00 ± 0.12 | 0.002 | **No.** Same reason. |

**The neck ratios are gating geometry the player never sees.** `CLASS` in
`characters.ts:1168` gives the huscarl `gorget: 1.0` — "how much of the throat
the class's neck kit swallows". The huscarl is the class the head sheets are
shot on, and in `headturn-profile_90_.png` and `headturn-back_180_.png` the
throat is a leather collar from jaw to yoke with **no skin neck visible at all**.
Two of the six failing ratios, plus silhouette assertion S5, are spending the
gate's authority on a form that is 100% occluded on the class under test. That
authority belongs on the vault-to-face mass relation, which is what actually
carries the read and which nothing in the gate touches (already noted in
`OPEN-DEFECTS.md`, note 1).

Net: of six out-of-tolerance ratios, **two matter** (`noseProjection`,
`tipBreadth`), two are tolerance drift against deliberate art direction, and two
are measuring an invisible surface.

### The frame, judged harshly

Bare huscarl, `helm_none hair_shaved beard_none wp_none`, ~700×860 at portrait.

- **Does he read as a man in his twenties who fights for a living? No.** He reads
  as a shop mannequin. The vault is a large unbroken egg with a small face on its
  front-lower quarter — `craniumShare` is canon at 0.342 and it is still not the
  number carrying this. At `back_180_` the head is a featureless balloon.
- **Is the domino mask gone?** The **bat** is gone — the previous wave's finding
  about `faceComplexion`'s orbit sum is real and holds up. What replaced it is
  not clean: at `three-quarter_35_` there is a **hard-edged faceted panel over
  the mid-face**, bounded by a crease running from the inner brow diagonally
  across the cheek to the jawline. It is a different mask, drawn by geometry
  rather than by complexion. "The domino mask is SOLVED" overstates it; "the
  complexion sum is solved and a geometric plane break replaced it" is accurate.
- **The nose.** `noseLead` is positive (11.8–14.7 mm) and S1 passes, but in
  `profile_90_` the read is a short upturned pug set high, with the whole
  subnasal mass pushed forward as one block and no philtrum. The measurement and
  the picture disagree, which means S1 is measuring the tip and the eye is
  reading the mass behind it.
- **The chin.** In profile the outline falls from the lip straight back into the
  throat. S3 passes at 1.5–3.5 mm in front of the brow vertical; it does not read
  as a chin because there is no mental fold under it.
- **The ear.** `earStandoff` 12.7–13.6 mm, S6 passes — and in `profile_90_` the
  ear is a **torus with daylight through the middle of it**, pasted flat on the
  skull. The gate was written to catch a sticker with no shadow; it now passes an
  object that has overshot into a ring. Add a rim/lobe continuity assertion or
  the next pass will push it further.
- **Skin.** At portrait the vault and cheek carry a fine regular cross-hatch that
  reads as **woven cloth, not skin** — visible in every panel. VISUAL-BAR axis 2.
- **Eyes** are two dark slots with slash brows (already in `OPEN-DEFECTS.md`).
- At **fight distance** the head is ~30 px and reads as a pale blob: no defect,
  no character. Nothing about the head is *worse* in play. Everything about it is
  wrong in the shop, which is the lens the shop sells through.

**Score against `docs/VISUAL-BAR.md` §2 for the bare-head sheet:** axis 5
character craft **4**, axis 2 texture detail **6**, axis 10 frame cleanliness
**6**. Bar is 8 on every axis. FAIL, and not narrowly.

The branch's own `docs/OPEN-DEFECTS.md` already says "the measurable faults are
fixed and the object still does not read as a man at 400 px. Do not score it a
pass." That is correct and this judgement agrees with it.

---

## 3. The helms — PASS, with a pre-existing shop complaint

- **Skin through metal: none.** `node tools/wearmeasure.mjs` →
  `PASS: 10/10 helmets seated`, `thru 0.0 mm` and `fold 0.0%` on every one of
  80 helmet-on-head builds. `npm run cosmetictest` agrees from the other side:
  `no helmet shears through the head it is worn on (32 heads x every shell)`.
- **Sutton Hoo is unregressed.** Deepest seat in the table (27 mm, float 31 mm),
  face coverage 100%, and it is the most distinct shape in the ladder.
- **Can you tell all ten apart as black shapes?** `sil-helm.png`: five of ten
  read instantly — Bare Head, Nasal (spike), Boar-Crest (animal on the crown),
  Jarl's Crowned (spiked circlet), Sutton Hoo (crest + mask). The other five —
  Iron Spangenhelm 30g, Shadow Hood 120g, Ridge 190g, Spectacle 280g, Wyrm-Crest
  **950g** — are one family of rounded domes. Side by side and labelled, Ridge
  and Spectacle do separate (Ridge has a peaked comb apex, Spectacle a deeper
  brow plate); unlabelled and at a glance, they do not. This is
  `COSMETICS-AUDIT.md §5`'s existing REBUILD/REPRICE list, **not a regression
  from this branch**, and it is not what is holding the merge.

---

## 4. The cosmetic table — three failures, all shop, none harness

`npm run cosmetictest` → 18 assertions, 15 pass, **exit 1**, 26 rendered
captures, 1319 s. The harness reproduces the committed sweep table exactly.

### Every 0.0% adjacent pair — the owner's cut/reprice list

| slot | pair | price of the upper rung | geometry moved |
|---|---|---|---|
| beard | Clean Shaven → **Stubble** | 0g | 0.00% every lens, every bearing |
| cloak | Traveller's → **Blood Red** | **90g** | 0.00% every lens, every bearing |
| cloak | Blood Red → **Sea-Wolf** | **90g** | 0.00% every lens, every bearing |
| cloak | Sea-Wolf → **Gilded War** | **400g** | 0.00% every lens, every bearing |

All four cloaks are pairwise 0.00% — **one mesh, four names**. A player pays
**580 gold** above the 30g Traveller's for three recolours of the same garment;
the 400g Gilded War Cloak is the single worst-value item in the shop. Stubble is
free, so nobody is charged for it, but it is a shop entry that does not exist.

Also failing, and on the list because a player pays for them:

- **Six pairs read at portrait and not at fight distance** (<1% on a 520×320 play
  frame): the four above, plus **Full → Forked Beard (80g, 0.57%)** and
  **Forked → Ringed Braid (120g, 0.87%)**.
- **All four war paints are byte-identical under the Sutton Hoo mask** (0.00%,
  face coverage 100%). Correct behaviour from the mask; a 110g paint invisible
  under a 2400g helm is a shop problem, and the shop should say so at the till.

`COSMETICS-AUDIT.md §5` already proposes the prices. This table is the evidence
for acting on it.

---

## 5. The gate — every final line

```
npm run build            ✓ Compiled successfully in 6.9s
                         ✓ Generating static pages using 3 workers (5/5)        exit=0
npx tsc --noEmit         exit=0
npm run lint             ✖ 11 problems (9 errors, 2 warnings)   (pre-existing in src/, cap 12)
npm run playtest         [playtest] 34/34 controls working                       exit=0
npm run touchtest        [touchtest] 26/27 touch assertions passing              exit=1  <-- FLAKE, see below
                         (re-run 2) [touchtest] 27/27 touch assertions passing   exit=0
                         (re-run 3) [touchtest] 27/27 touch assertions passing   exit=0
node tools/firetest.mjs  [firetest] 7/7 claims proven                            exit=0
npm run profiletest      [profiletest] 22/22 checks passing                      exit=0
npm run soundtest        [soundtest] 22/22 claims proven                         exit=0
node tools/phonesound    [phonesound] 7/7 claims proven                          exit=0
node tools/bindsynctest  [bindsync] 8/8 checks passing                           exit=0  (needs PROFILE_TEST_DB)
node tools/cameratest    [cameratest] 13/13 passed                               exit=0
npm run summaryflow      [flow] 11/11 passed                                     exit=0
npm run cheattest        [cheattest] 40/40 checks passing                        exit=0  (fresh postgres)
node tools/latencytest   JUDDER VERDICT: 17/17 checks pass — PASS                exit=0
node tools/headmeasure   [head] FINAL: 6 ratios outside tolerance · 0 of 12 SILHOUETTE assertions FAILED
node tools/wearmeasure   [wear] PASS: 10/10 helmets seated                       exit=0
npm run cosmetictest     18 assertions, 15 passed                                exit=1  (three shop findings, §4)
```

`bindsynctest` and `cheattest` need a database and had none in this container.
Started one and ran both:

```
service postgresql start
createdb + role bretjudge
PROFILE_TEST_DB=postgres://bretjudge:bretjudge@127.0.0.1:5432/bretjudge
```

### `npm run perf` — the phone cost did NOT rise in draw calls; triangles rose 5.5%

Same instrument on both tips. `tools/perf.mjs`'s draw-call counter is new on
this branch, so `cfb49fc` was measured by copying this branch's `perf.mjs` into a
worktree at `cfb49fc` and running it against main's own build — same tool, two
builds.

| tier | `cfb49fc` draw calls | `a12695a` draw calls | Δ | `cfb49fc` triangles | `a12695a` triangles | Δ |
|---|---|---|---|---|---|---|
| **low (the phone)** | 739 | **727** | **−12** | 307,869 | **324,801** | **+16,932 (+5.5%)** |
| medium | 3,801 | 3,753 | −48 | 1,731,406 | 1,759,096 | +1.6% |
| high | 4,304 | 4,252 | −52 | 2,400,644 | 2,345,922 | −2.3% |

Draw calls fell on every tier. Low-tier triangle count rose 5.5%, which is the
head rebuild's tessellation. That is a real cost paid on the tier phones get, for
a head that does not yet pass. It is not a blowout and it does not block on its
own — but it should not rise again before the head reads. **These are now the
recorded baselines; the fps figures beside them are SwiftShader's and mean
nothing.**

### `touchtest` is flaky, and the flake is a finding

One run in three failed:

```
FAIL  the lock holds facing on a moving target with no thumb on the button side
      — over 35 snapshots the locked man travelled 5.02 units and the camera
      turned 57° to stay on him; worst facing error 160.1°
```

The bar is `worst < 0.5 rad` (28.6°) and 160° is not a near miss — for at least
one sampled frame the warrior was facing away from the man he was locked to. The
assertion at `tools/touchtest.mjs:505` drops rows where
`state === "staggered" | "attacking" | "shoving" | "dead"`, on the stated ground
that a committed man's facing is not the lock's to set. `PlayerState`
(`src/game/types.ts:34`) also contains **`rolling`, `dodging`, `ability` and
`blocking`**, and a dodge-roll goes where the stick points, not where the lock
points. That is the shape of an intermittent 160°.

**Do not just add the states to the exclusion list.** Read the movement code and
establish which states genuinely take facing away from the lock; if `rolling`
and `dodging` do, they earn the same carve-out `attacking` already has and the
comment must say why; if they do not, the lock has a real bug that a player meets
one match in three. Either way the assertion has to stop passing by luck. This is
a gate blocker in its own right — a gate that fails a third of the time is not a
gate.

---

## 6. The next wave, in order

1. **Make `touchtest` deterministic.** Diagnose the 160° facing drop against
   `PlayerState`. Prove which states own facing; carve out the ones that do with
   a comment stating why, or fix the lock. Ten consecutive green runs before it
   is called done. *Blocks the merge on its own.*
2. **The head — take the third option.** Six passes have now tuned an
   anatomically-parameterised head and produced a mannequin, a beak, a muzzle and
   now a plated mannequin. `OPEN-DEFECTS.md` already lays out the choice; this
   judgement recommends **(b): commit to a stylised head with three confident
   planes.** At 40 px in play and 300–400 px in the shop it is the better trade,
   and it is the only option that attacks the vault-to-face mass relation — the
   one thing every pass has left untouched because nothing measures it. Build the
   vault and the facial skeleton as separate masses meeting at a rim.
   Sub-items, in order:
   - kill the woven cross-hatch on the skin (axis 2, visible at portrait);
   - pin `tipBreadth` — a 15–31 mm spread across seeds is an unpinned parameter,
     not variation;
   - the ear has overshot from a sticker to a ring: add a rim/lobe continuity
     assertion before touching `earStandoff` again;
   - the mid-face plane break at three-quarter is the new mask. Name it in
     `OPEN-DEFECTS.md` and stop claiming the domino is solved.
3. **Retire the neck ratios from the head gate**, or move them to a class with
   `gorget: 0.0` (runekeeper or berserker). `neckOverHead` and `neckOverJaw` are
   asserted on a huscarl whose throat is fully covered. Two of six failures
   vanish honestly and the gate stops spending authority on an invisible surface.
4. **The shop, from §4.** Cut or reprice: the three paid cloaks are one mesh
   (−580g of value), Stubble has no geometry, and Full→Forked→Ringed Braid do not
   read in play. Either give the cloaks asymmetric cut and hem per
   `COSMETICS-AUDIT.md §5` REBUILD, or reprice them as the recolours they are.
   `cosmetictest` goes green the moment the shop stops selling them as shapes.
5. **The two phone console errors** (`ERR_CONNECTION_RESET`, `404`). Name them.
6. **Only then re-judge.** When 1 and 2 are done, everything else on this branch
   — the reticle, the face correction, the helm guards, the harness — merges
   with them.

### A note on what is being held

Items 3–5 are not blockers. The reticle work, the helm guard work, the wear
gate, the cosmetic harness and the sweep table are all good, all proven, and all
sitting behind a head. If the head needs another two waves, **split the branch**:
land the harness, the helm work and the reticle on `main` now and keep the head
rebuild on its own branch. Forty-two commits behind one object is a worse risk to
this project than a live game with an unchanged face.
