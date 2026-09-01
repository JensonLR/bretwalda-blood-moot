# Open defects

Findings that are diagnosed but not yet fixed, carried here so they survive
between iterations. Delete an entry when a capture proves it gone — not when a
change is made.

Judged against `docs/VISUAL-BAR.md`. Captures live in `art/shots/`.

---

## THE WINTER CAMP SHIPS — the fourth ground, and the salmon was never the albedo — 24 Aug 2026

The Danelaw's own ground (`danelaw_camp`, backlog 5.7b's last people) is
merged: a Repton-shape winter camp behind a D-shaped earthwork, the frozen
fen dead LEVEL to the horizon, the river reach iced where the D opens, one
beached clinker longship as the only solid on the fighting floor, tents and
stakes on the bank, a tripod and cauldron over the sim's fire. Judged on
`duel` and the new `campwide` crane (`art/look/camp/`); `solidtest` 12/12
with the ship routing clean, `warsay` 32/32 with the deal.

**The look lesson, because the moor's was not enough here.** Three albedo
cuts moved almost nothing: the salmon was (1) the floor's wet+churn sheen
MIRRORING the sunset — the detail map's trampled-mud pattern is pale and the
churn channel is a brightener, so frozen mud went matte and churn dropped to
0.12 — and (2) the warm dusk haze owning the midground that a LEVEL horizon
cannot hide behind hills, which no albedo can fight. The answer to (2) was
not darker sedge but MORE ICE: flood the fen wider and nearer, because fog
over matte sedge reads as sand while fog over a flat specular sheet reads as
water — the one surface the warm band makes MORE itself. The mirror horizon
plus the cold shadowed floor is now the ground's own contrast.

**The process lesson, ledgered against R8.** "Cut 4" was judged an
improvement off captures that contained NO CODE CHANGE: the edit script was
a python heredoc whose escaped apostrophe was a SyntaxError, the build was
chained as a separate statement rather than `&&`, so the unedited tree
rebuilt and reshot — and the eye found the improvement it expected between
two renders of identical code (fire-phase variance). Caught by the COMMIT
DIFF being smaller than the narrative. Edits ride the Edit tool or `&&`
chains with an applied-canary now, and a judged difference wants a measured
number beside it (the matched meanLuma pairs are in the shoot logs).

---

## THE SCRUM GATE WAS MEASURING A ROOM ON THE WRONG GROUND — green for months because every people resolved to the village — 24 Aug 2026

`solidtest`'s engine-scrum claim (eight men jammed on the woodpile, zero
man-ticks inside it) went red the moment the Danelaw got a camp of their own,
and the engine was innocent: the harness `create`s a plain `blood_moot` room,
a plain room DEALS A TERRITORY, and the arena follows that territory's people
(`dealGroundFor`). The room stood up on `danelaw_camp`; the harness teleported
its bodies around the VILLAGE woodpile's coordinates and measured overlap
against the VILLAGE's solids — 9786 of 48000 man-ticks "inside" a prop that
was not in the room, deepest 1124 mm.

The gate had been green since it was written because `GROUND_BY_PEOPLE` used
to answer "the village" for every people the deal could land on — a gate green
because the case is absent, in its purest form yet: the assertion never once
checked WHICH WORLD the room it was asserting about stood in. Fixed twice
over: the scrum room is `friendly` (which pins the arena to the default
ground by the same machinery a real friendly moot uses), and the pin is
CHECKED — a room on any other ground now throws rather than measures.
12/12 again, with the camp's own ship routing clean in the same run.

---

## THE BRITON'S MINT IS DEAD — and the mechanism was the CONE, not the vat, which is why three chroma cuts could not touch it — 24 Aug 2026

The set-aside observation ("neon-mint Briton on the fightcard") is closed, and
the diagnosis cost more than the fix because the first three cuts were aimed at
the wrong lever:

**The mechanism.** `factionDye` sums a surface's own chroma with the vat's and
`HUE_CONE` (8°) snaps the SUM onto the field's hue. The issued kit's warm
literals (wrap 0x8b7c5c oat, C*~0.20) therefore come out of a cool people's vat
with their own chroma REBRANDED green — whatever the row's `sat` says. The
Saxon never sees this (weld sits beside oat, the vectors add along the same
arc); the Danelaw's escape on these surfaces is that his bands are DARK. The
Briton shipped with the palest bands of the four, and pale + rebranded green +
the arena's turf bounce = mint at the ankle. Value is the one lever the row
owns, so his wrap and leather take the Norse's shape (dark), his metal drops
under the Saxon's warm cast (sat 0.09), and the "lighter kit" two-value check
moves to the LINEN — a near-white base with no chroma to rebrand, the only
surface that can stay pale and quiet.

**Measured, both instruments:** rear-shin lit read #7aab79 → #65845b (moss
wool, not glow); vatprobe per-surface means all muted (wrap #56563c at 0°);
factionread §1.1 SWORN unchanged at 2.42 (worst row is a Saxon warden, not
Briton); §1.2/§1.3 standing reds byte-identical (norse–pict 6.16, norse
Bretwalda Gold −34.72° — untouched, owner-level per their own ledgers); and
the §5.1b/5.2b briton collapse count IMPROVES 8 → 6 pairs with the free-refund
on hide cleared (attributed by running the counter on both trees).

**The instrument lesson, twice in one hunt:** a probe that fed `finishKit` the
string "issued" measured a default kit that exists nowhere (the real base is
FINISH_KIT[0x5f6b7a]), and a green-pixel counter drawn over the card counted
the arena's own turf. Both produced confident wrong answers before
`surfacemask`'s per-mesh attribution named the wrap. Captures:
`art/look/fightbriton/`.

---

## THE ROMAN FORT SHIPS — and the floor took five cuts because a grid below vertex Nyquist does not blur, it ALIASES — 24 Aug 2026

The third ground (`roman_fort`, Britons' muster, backlog 5.7b) is merged:
flagged court, five ruined curtain walls standing ON the play disc as the sim's
own `RaisedStone` solids, two coursed piers with rolled drums, garrison fire in
a kerb of reused building stone, and a platform that looks DOWN on low country
— the one thing neither turf ground can do. Judged on two lenses in
`art/look/fort/` (`duel` at ground level, the new `fortwide` crane) and both
agree.

**The lesson worth the five cuts — where a pattern may live:**
- The court is a 1.15 m flag grid with ~7 cm joints. The terrain lattice is
  0.8 m rings with 0.34 jitter. Cuts 3–4 wrote the grid into vertex colour and
  photographed LAVENDER GRAVEL: a signal below Nyquist does not soften, it
  aliases into per-vertex noise, and no palette change can fix a sampling
  failure — that was a measurement answering the wrong question (the swatch,
  not the lattice). The shipped court is a textured DISC riding 5–10 cm proud
  of the terrain (1024² = 31 px/m, so a joint is two texels and stays a LINE),
  its rim dissolving into the same rubble field the terrain shades.
- Same failure, one octave up: merged `BoxGeometry` blocks keep 0-1 UVs PER
  FACE, so the shared granite mapped its whole tile across every 0.9 m block
  — camo speckle, texel density set by block size. `mergeInto(blocks, 0.5)`
  box-projects world UVs at one tile per metre; the walls read as one coursed
  material at every range.
- Scatter moss CUSHIONS are cut entirely (two crane frames paid for it): a
  bush sunk into terrain the disc rides proud of surfaces through the flags as
  a green sliver, and on the apron's broken footing the same sink buries it to
  an edge-on slice. The fort's moss lives in the flag texture and wall joints,
  where it cannot clip.
- The catalog's `rock` (0x6a7078) came back CREAM under the dusk rig's doubled
  warm key — the moor's albedo lesson, re-learned on masonry. Every dressed
  stone wears a fort-owned clone at 0x474d57.

**Instrument note:** `arena`, the wide establishing preset, follows the warrior
at (0, 11) — which on this ground parks the lens INSIDE curtain wall three.
First ground with standing geometry at the follow camera's own radius, so the
wide review gets an aimed lens: `fortwide` (crane over the south-east breach),
registered in `shoot.mjs` EXTRA_PRESETS. In PLAY the walls are the map's stated
sightline breaks (MAPS.md #3): five slabs cover ~27% of the 14.2 m ring, the
moor's standing stones set the precedent that floor-standing occluders are
momentary, and `solidtest` holds 12/12 with the fort's bots routing around
every wall corner.

---

## THE ROSE UNIT SHIPS — grade + wrap settled against clocked readings, and the residue has named owners — 22 Aug 2026

The unit the boardgrade ledger demanded, closed in four probe iterations and
verdicted by the full clocked gate (5969 s):

```
                    baseline            unit             the movement
  7.1 whole man     32/120  +12.956     30/120  +8.501   worst nearly halved
  7.1b per surface  170     +29.83      153     +22.37   -17 rows, worst -7.5
  7.1c value        163     +30.0       159     +30.3    flat (release/metal)
```

**What moved and why:**
- The contrast pow is LUMA-PRESERVING (channels in ratio about a Y pivot).
  It alone took the buff from +29.8 to +16.6 and improved the mail.
- The Danelaw's WRAP is settled: +42.5 -> +0.14 at the fire-facing rear,
  at-or-below floor at 0° and 90°. The route was learned the hard way and
  the vat comment carries it: the rose band is a CORRIDOR (C* between 14.8
  and 0.92 L*), so desaturating made it WORSE by dropping honest madder
  into the pink; the escape is deeper dyestuff AND a darker vat AND a lower
  albedo ceiling for the fire-lit crest tail. Iterations: 42.5 -> 48.6
  (wrong way, learned) -> 23.1 -> 0.14.
- The HIDE followed the leather row only weakly (+9.4 -> +9.2): it straddles
  roseFade's release threshold, so most of its sworn colour is the release
  path's, like the buff.

**What did NOT move, measured so nobody re-litigates it blind:**
- THE BOARD. Two grade stages were made luma-preserving IN TURN and the
  stripes sampled each time: #900030/#a00040 at hue 336-340, to the bucket,
  before and after both. The magenta is not made by the tonemap — it is the
  COOL MOON KEY on a blue-over-green red: FACTION_FIELD.norse 0x7c1420 is
  the Danelaw's identity colour across map, banners and UI, and authoring a
  lit-variant pigment for it is the owner's call. The shader's own comment
  at the filmic carries this ledger.
- The BUFF (+15.9 remains): released from the vat by roseFade (proven: the
  sworn buff was bit-identical across a halving of the leather row's sat),
  its rose is the anisotropic UNDYED cap plus the fire.
- The Danelaw's REAR-BEARING METAL family (Sea Queen's/Blackened/Rough at
  160°): norse.metal.bias plus the bonfire, per the gate's own note.
- 6.0c's 3-of-126 dress drift: unchanged, still unattributed rows (the
  check does not print them — tool note stands).

Captures: art/look/roseunit/. The Danelaw now reads as deep madder under
bright mail from behind; his trousers measured 0.00% at the rear — the
"lower half looks rose" instinct was overcalling legitimate dye.

---

## THE TEN-MINUTE PROBE AGREES WITH THE TWO-HOUR GATE, TO THE SECOND DECIMAL — 22 Aug 2026

`vatprobe` now stages the same fixed world as `factionread` §6
(`tools/lib/vclock.mjs`, extracted verbatim; the two elder copies stay in
place with their lineage). Verified the way the baseline entry prescribed:

- **Repeatable**: two back-to-back runs of `armor_steel norse huscarl` —
  every SWORN cell byte-identical, and only three unsworn cells at 180°
  wobble, worst 0.76 points on the 395 px buff. Against the ±10-30 points
  the unclocked probe carried, the fire's phase was the whole of the noise.
  (The 180° unsworn residue is one surviving unfixed source — small enough
  to iterate under, noted for whoever wants the last decimal.)
- **Agrees with the gate**: the probe's buff@0 row reads **31.19% vs
  1.36% = +29.83** — exactly §7.1b's worst row from the full walk.

The iteration loop for the rose settlement is therefore OPEN: ten-minute
rows that are readings. The target table on the shipped tree, clocked:

```
  buff @ 0°    +29.83     wrap @ 180°  +25.25
  mail @ 180°  +10.36     mail @ 0°     +6.44
  buff @ 90°    +2.94     (wrap @ 0°/90° read NEGATIVE — the unsworn
                           madder wraps are rosier than the sworn)
```

Colour moves next — the luma grade and the buff/wrap retunes as one unit,
tuned in this loop, verdict by the full gate.

---

## THE CLOCKED ROSE BASELINE — the first full §7 walk that ever finished, and what it actually found — 22 Aug 2026

Four attempts and three latent tool crashes deep (the §6 refactor's ghosts:
`dressDrift` deleted under its check, `finish` dropped from the lit rows,
the sixth `masksFor` site left at the old arity — each found hours into a
run, each merged as its own fix), `tools/factionread.mjs` completed its
first end-to-end clocked walk on this tree: 8704 s, 126 captures, verdict
**25/33 with 6 standing deferrals**. These numbers supersede every
vatprobe-era rose figure in this file — vatprobe's small-surface rows carry
±10-30 points of unclocked fire noise (its own entry above); THESE are
readings.

**The rose is real, it is bigger than the ledger believed, and it has a
shape:**

- **7.1 whole man: FAIL — 32 of 120 frames over their matched unsworn
  floor**, worst +12.956 points (norse/huscarl/Sea Queen's Gift@160°:
  14.2% vs 1.2%). The Danelaw at the 160° bearing dominates the top of the
  table across FOUR finishes (Sea Queen's 11.4x, Polished 2.8x, Blackened
  8.0x, Rough Iron 5.7x) — and a NEW name appears: **pict/Blackened Steel
  at 9.2x** (5.46% vs 0.59% @0°), the first time a people off the madder
  arc has led a rose row.
- **7.1b per surface: FAIL — 170 surface-readings over floor**, worst
  **+29.83 points on the BUFF** (norse/Polished Steel@0°: 31.19% vs 1.36%)
  — a frame §7.1 scored +2.65 whole-man, the dilution §7.1b exists to
  catch. The buff leads the per-surface table on multiple finishes
  (+29.33 at Sea Queen's@160°).
- **7.1c value: FAIL — 163 surface-readings lifted on the arc**, worst
  +30.0 L* (briton/Blackened Steel buff@160°).
- Controls all PASS (7.0/7.0b, 6.0, 6.2 repeatability 0.08% == 0.08%);
  6.1 clip PASS; 7.2 off-arc peoples PASS (all 126 surfaces clear).
- **6.0c STAGED: FAIL — 3 of 126 captures wore a different dress** — the
  rebuilt accumulator's first catch is REAL drift in /shot's staging, not
  instrument noise. (Tool note: the check prints the count but not the
  three rows; the accumulator holds them — surface the list next run.)
- Pre-existing albedo standings unchanged: 1.2 DISTINCT (norse vs pict
  ΔC 6.05), 5.1b twins per surface (37 pairs), LADDER_DE reported 22/84.

**What this means for the magenta-board unit:** the story "the old grade
holds the wraps under the band, at or below floor everywhere" was
single-run vatprobe noise. The CURRENT tree fails the lit gates broadly,
led by the Danelaw's buff and rear bearing, before any grade change. The
unit is therefore bigger than grade+wrap: it is the first true rose
settlement, iterated against §7.1b.

**And the iteration instrument comes first.** A 2.5-hour verdict per
attempt is not a loop anybody can tune in. §6.2 proves the clock+seed
staging makes captures repeatable to 0.08%; vatprobe's noise is exactly
the absence of that staging. Port the clocked staging to vatprobe (or a
`--clock` on /shot that both share), verify its buff@0 row reads +29.8
against this baseline, and only then start moving colours.

---

## THE SUTTON HOO TRIO — hair routes out under the closed curtain, and hoodfall PASSES whole — 22 Aug 2026

The last three collapsed pairs (`hoodfall` §1): warden, runekeeper and
berserker in the Sutton Hoo, where `hairFall` still said `return 0` — "a
mask with no mail behind it has no hem to come out from under" — in a
comment WRITTEN BEFORE the ventail curtain was closed on uncoifed heads.
That closing (vHalf = pi, run to `vBot` to meet the collar) created exactly
the free edge the comment denied. Third instance of the same wrong
conclusion in one file; all three are now the same route: gathered inside
the bag, out under its hem.

- `maskHemY` hoisted (the curtain's own `vBot` expression, single source);
- `hairFall` under an uncoifed mask: the coifed window, not zero;
- `hairCeil`: descent pressed to the skin behind the head, released 30 mm
  under the swept hem — the curtain's wall hangs below its table, and the
  release boundary was WALKED DOWN in measured steps (0/18/30 mm: 37/26/26 mm
  proud, 5.7/4.0/3.2%) rather than guessed;
- the emergence swing is the route's own: 85 mm starting at the hem's depth
  fraction, not the aventail's 190 mm at 0.16 — which had swung the gather
  115 mm through the curtain wall;
- plait rods take the nape route on every bag (`masked = style.mask ||
  hooded`).

**hoodfall: PASS — all 120 pairs are two objects**, the first clean sheet
the gate has produced. hairmail 6/6, wearsweep 54/54.

**The ruler's position, stated rather than smoothed:** helmclash §5 reads
77 of 288 against main's 75. The two new rows are warden and runekeeper
`suttonhoo hair=long` at 3.2%/[similar] — rows that were green ONLY because
no hair existed there (a green because the case is absent), and that now
read HALF the red of the huscarl's settled aventail route on the same helm
(5.78%, pre-existing on main). The capture shows why it ships: the warden's
mane emerging under the curtain onto his mail is the picture every
reconstruction draws. The runekeeper's plaits are distinct in geometry but
discreet behind his tall robe collar — nothing ugly, noted as taste.
Captures: art/look/wearsweep/sutton-*.png.

---

## THE SHADOW HOOD ROUTES HAIR OUT UNDER THE DRAPE — and the helm ruler holds byte-parity — 22 Aug 2026

The standing backlog item ("Shadow Hood mantle geometry — route hair out")
and hoodfall's twin findings: every hooded mane ended ~300 mm above the
hood's hem, and both paid hairstyles collapsed into ONE identical object
under the hood (7 pairs). Three lines owned it, each carrying the same
wrong conclusion the Sutton Hoo mask note had already recorded un-learning
("the helm swallows hair like the hood does"):

- `hairFall` returned 0 under a hood. The drape ENDS — `hoodHemY`, its own
  bottom station — and below it there is nothing but back.
- `hairCeil`'s hood branch clamped the fall at EVERY height; it now
  releases below `hoodHemY`, the same `atY` hem convention as the aventail.
- Plait rods were deleted under the hood; they take the masked nape route —
  inside the cloth to shoulder level, out under the drape.

The mane takes the bagged route (squash inside, swing out at the hem,
registry ride below): the hood and the aventail are one mechanism now.
Captures: art/look/wearsweep/hood-*.png — the mane falls from under the
drape over the huscarl's mail from the side, the plaits emerge distinct,
the face is framed within the cowl.

**And the price was driven to zero.** The registry fittings (wearsweep
merge) had moved helmclash §5 from 75 to 85 red combinations — the
runekeeper's beards through the Sutton Hoo's curtain (a pre-existing 21-27 mm
spill tripled to 76), plaits nudged over the bar under the Wyrm-Crest — and
the hood route initially added the hood's own beard rows. Three scopings
return the ruler to EXACTLY main's 75 of 288, with rows improved along the
way (wyrm long 3.61% -> 2.70%):

- the beard's registry seat serves BARE heads only — under any helm, mask
  or hood, the curtain/drape is the outermost thing at the throat and the
  settled constant is the seat it was cut for;
- the ride's unconditional containment serves bare heads and the hood —
  hard helms keep the faded blend their stacks were tuned against;
- under a hard helm `shoulderOut` reads the legacy two-stack list
  byte-for-byte.

**Still open, same file:** hoodfall §1 counts 3 collapsed pairs — the
UNCOIFED Sutton Hoo trio (warden/runekeeper/berserker). Their free edge is
found: on an uncoifed head the ventail curtain closes fully (vHalf = pi)
and runs to its own hem to meet the collar; the route out is below that
hem, the same construction as the hood's. It is the next unit. Also noted
for its own entry: the huscarl's hood BEARD rows (80-102 mm through the
drape front) are pre-existing on main and untouched by any of this.

---

## THE ARMOURY-WIDE HANG SWEEP — every falling cosmetic against what the class actually wears — 21 Aug 2026

The owner, with the huscarl fix fresh: *"I hope a check through the full
armoury items & any ugly overlaps or sticking out elements is on the list."*
It is now a gate: `tools/wearsweep.mjs`, 54/54 — hair (long and plaits) x
four classes x every cloak dye, and every hanging beard x four classes, with
two collapse assertions (armour finish moves no station; cloak dyes share one
topology but are DIFFERENT GARMENTS, 0.43 m apart at the worst coordinate,
so every dye is swept).

**What it caught on first run — the owner's defect class, on other bodies:**

- The berserker's mane terminated DEAD at his fur mantle's top edge — 79.4%
  of hanging vertices inside his trunk. The fitting exempted him as `bare`,
  and the exemption's own comment claimed he "genuinely wears nothing on his
  trunk that hair could lie on". Refuted by his own build: the fur ruff
  registers 55 mm off the spine at line ~13809.
- His braided beard dived through the jerkin at the sternum (28.6%), and the
  runekeeper's plaits were swallowed by the Gilded cloak's rolled band.

**The fix is structural, not another table:** `shoulderOut` now reads the
torso's own WORN REGISTRY — the list every garment already registers itself
in — so a garment cannot be worn and unseen at once. The beard's seat
derives from the same registry (the old constants were huscarl mail carried
everywhere, floored so the armoured classes keep the seat wearmeasure §5
settled). The cloak's collar roll joins the registry early, computed from
cut and skeleton, so plaits ride it. And the ride's 60 mm blend now fades
only the STANDOFF — containment is unconditional, because a partial blend
was preserving 15–18 mm of violation on the ruff's fast-growing crest; at a
coif's hem the new form reduces byte-for-byte to the old one, and `hairmail`
held 6/6 across the change.

**Instrument honesty, three designs deep** (the header of wearsweep.mjs
carries the full account): ray parity is undefined against the pelt's open
sheet (two rays fix it); binary membership convicts fur nesting into fur
(depth fixes it — 8 mm hard armour, 20 mm on the all-fur berserker trunk,
measured against the 24 mm lock cones and the shipped defect's 40+); and the
analytic registry test was tried and thrown out because a garment's swept
cross-section includes the neck opening, which convicts every beard hanging
correctly down an open collar.

Captures: `art/look/wearsweep/` before/after pairs. `wearmeasure` PASS with
its standing ungated-window note; helm-stack gates re-run with the merge.

---

## THE PAIRED PROXY PROBE RAN — and convicted the INSTRUMENT, not the proxy — 21 Aug 2026

The residual entry's prescribed step — "the same paired probe with the shadow
proxy toggled (`castShadow` back to per-mesh on one arm of the pair), on one
build, same session" — has been run: `anim.ts` grew a `?shadowproxy=off`
capture hatch and `vatprobe` a `--noproxy` arm, and both arms ran back to back
on one build (`c8a5b4d`), Danelaw huscarl in Polished Steel.

```
                ARM A (proxy ON)   ARM B (proxy OFF)   prior runs (proxy ON)
  buff @ 0°         +2.0               +32.2            +34.6, +28.5
  buff @ 180°       -2.0               +24.3
  wrap @ 90°       +11.5                +4.2            -3.2, +10.9, +22.2
  wrap @ 180°      +20.9                +9.4            +23.4, +15.2, +39.4
  mail @ 0°         +4.7                +5.3            (stable, all runs)
  mail @ 90°        +1.2                +1.5            (stable, all runs)
```

**The finding is the first column.** Arm A is the SAME shipped configuration
the residual was read on — and buff@0, previously +34.6 and +28.5, now reads
+2.0. A 32-point swing between two runs of ONE configuration cannot be the
proxy, the knees or the grade: it is the instrument. `vatprobe` is unclocked
by design (its own header: the fire is at a different phase in every capture)
and its stated noise model — "treat a point of a per-surface reading as
noise" — is an order of magnitude too kind to the SMALL surfaces: buff is 295
eroded pixels at L* within a point of the band floor, and the fire's phase
alone swings it by ±30 points of rose share. The wraps (781–1492 px) swing by
±10–15 the same way. The mail rows (2976–5195 px) are stable across every run
and agree between arms within ~1.5 points — at the scales this instrument CAN
read, the proxy changes nothing, which is consistent with `shadowcut`'s
union-of-the-same-triangles argument and is the only attribution this probe
is entitled to.

**Standing corrections this leaves:**
- The residual table in the boardgrade entry above is NOT a stable reading —
  its buff/wrap rows are fire-phase samples, not settlements. The mail rows
  stand.
- Per-surface vatprobe rows under ~1500 px carry ±10–30 points of run noise.
  The probe prints numbers; only repetition or a clock makes them readings.
- A verdict on the rose settlement belongs to `factionread` §7.1/§7.1b, the
  clocked walk with asserted repeatability — as every vatprobe header already
  says. Nothing here retires that gate; this entry retires the idea that the
  residual was ever attributed to a mechanism.

---

## THE SETTLEMENT CASCADE RENDERS ON A CADENCE, NOT A METRONOME — one shadow pass off the average frame, every tier — 21 Aug 2026

The lever the shadow-proxy entry left on the table: "dropping the
shadow-casting light count from 4 to 3 on `high` removes a quarter of every
caster's cost at once. That is a look decision about cascades rather than a
geometry one, and it wants its own frame." This is that frame, and the answer
it found is that the fourth light does not have to die — it has to stop
re-drawing a still village at 60 Hz.

**The reading of "4→3" that costs no look.** All four shadow passes on `high`
have merges defending them by name (near cascade: contact edges; settlement
cascade: walls and distant men; sky occlusion: everything meeting everything;
beam: the only fire shadow in the game). Deleting any one of them un-earns a
defended look. But the settlement cascade is PINNED — its frustum never
re-hangs with the camera, so its rasterisation only changes when a caster
inside it moves. It now re-renders every 2nd frame (`shadow.autoUpdate =
false`, `needsUpdate` on a schedule in `trackShadow`), which is 4 maps → 3.5
maps per average frame, with the savings landing on the most expensive map.
Two overrides put a fresh map under every frame that genuinely needs one: any
frame the moon's axis itself moved (a stale map under a fresh axis swims, and
a mood blend is exactly when nobody counts frames), and the first frame after
the rig is built.

**Measured, `tools/framecost.mjs --quality=high --params=farcadence=N`, the
tool's own GL counter, draw ON:**

```
  farcadence=1   calls/frame  p50 1932   p95 1988   (4 GL frames sampled)
  farcadence=2   calls/frame  p50 1808   max 1936   (3 GL frames sampled)
```

The cadence-2 series is BIMODAL — light frames at ~1808, full frames at
~1936 — which is the mechanism photographing itself: the skipped frames are
real, the axis-guard is not silently defeating the schedule. Per skipped
frame that is ~128 draw calls (~6.6%) plus the entire 2048² depth
rasterisation of the 102 m settlement box, which draw-call counts
under-represent (the box holds the ground plane, the huts and the treeline —
the triangle-heavy statics). Same schedule ships on `medium` and `low`,
where the map is 1024²/512² but the device is a phone.

**The risk, and what each instrument can honestly say about it.** A warrior
inside the near box casts into BOTH cascades; his far-map component updates
at half rate while his near-map component updates at full rate, so the
summed penumbra at his own feet could in principle double-edge on alternate
frames at sprint.

- *What this box CAN photograph:* static identity. Solo testgrounds, warrior
  held still, four consecutive rendered frames per cadence — with nothing
  moving, cadence 2 must change no shadow anywhere in the frame.
  PASSED: across consecutive
  cadence-2 rendered frames (0:52 / 1:28 / 2:02 on the session clock — this
  box renders one frame per ~36 sim-seconds, so even the STALE frames carry
  amplified staleness of the idle man's sway) the feet shadow, hut shadows,
  palisade lines and tree shadows are identical frame to frame, and the
  cadence-1 strip shows the same shadow geography. The visible hut and fence
  shadows are substantially the settlement cascade's own product, so the pass
  exercised the lever's actual output. `art/look/cadence/`.
- *What this box CANNOT photograph, said plainly rather than faked:* the
  motion case. SwiftShader renders one frame per ~40 sim-seconds while the
  server sim runs in real time, so a one-rendered-frame-stale map displays
  sim-minutes of caster movement here — hundreds of times the lag any real
  device shows. A "motion look pass" on this box would be a measurement
  answering the wrong question (the signature failure, again). The honest
  claim is the constructive bound: staleness is ≤1 rendered frame by
  construction, which at 60/30/20 fps is 17/33/50 ms — at a 6 m/s sprint,
  10–30 cm of lag on a 5 cm-texel PCF-soft component carrying 42% of the
  key's weight, underneath a full-rate crisp near-map edge. The first real
  device pass should still LOOK at feet during a sprint; if it double-edges,
  the cadence is one `?farcadence=1` away from off.

**Residual worth naming:** cadence alternates the frame's shadow load
(heavy/light) instead of holding it constant. On a GPU pinned exactly at a
vsync boundary an alternating load can flap the interval where a constant
one would not. The delta is ~6% of calls plus one depth pass, small against
typical frame variance, and the average headroom is the point — but if a
real device reports NEW micro-jitter after this merge, suspect the sawtooth
first and test with `?farcadence=1`.

**Sample-size honesty (R4):** the GL figures are a handful of frames each —
SwiftShader manages under one drawn frame a second at `high` — and are
stable because scene content is, not because the sample is large. The
bimodality claim rests on the gap between the modes (128 calls) being far
larger than the run-to-run noise of the full mode (1932 vs 1936), not on
the sample count. Frame-interval claims are deliberately absent: this box's
frame times are SwiftShader and mean nothing (the janktest lesson).

---

## THE LADDER KNEES ARE REVERTED — AND THE GRADE FIX IS HELD BACK TOO; the full attribution — 22 Aug 2026

Three lit probe runs, one paired variable at a time, on the Danelaw huscarl in
Polished Steel (rose share, sworn minus his own unsworn floor):

```
                     knees + old grade    knees + luma grade    NO knees + luma
  buff  @ 0°              +34.6                +28.5                 +3.7
  wrap  @ 90°              -3.2                +18.8                +22.2
  wrap  @ 180°            +23.4                +30.5                +39.4
  mail  @ 180°             +2.0                 +3.9                +16.7
  (merged baseline — no knees, old grade: at or below floor on EVERY surface)
```

**Two independent causes, both real:**

**1. The knees owned `buff`** (and part of the wraps): reverting them takes
buff@0 from +34.6 to +3.7. The two soft knees bought the paid ladder 17 → 11
collapsed surfaces and merged green on gates that read ALBEDO — the rose entry's
own standing lesson, catching its author. C\* and L\* are the two axes of the
rose band; a knee that widens the vat's output range widens it into the band.
**Both knees are reverted** and the ladder honestly returns to ~17 collapsed
(`factionread` 1.1/5.3/5.4 PASS, 5.2b 17, matching the pre-knee state exactly).
The sweep tables stay in `characters.ts`; the knobs are gone.

**2. The luma-preserving grade owns the wraps and the mail sheen.** It repairs
the magenta shield board (`#9b0439` → `#850b36`, green 4 → 11, frame luma
+0.02) and CLEANS the unsworn floors — the per-channel crush had been pushing
undyed browns into the band too. But the same crush has been silently holding
the Danelaw's dyed madder wraps UNDER the band's L\* floor, and every round of
vat work was tuned beneath it: with the crush removed, wrap@180 reads **46%
rose share, +39 over floor**. A board fix that re-litigates three rounds of
rose settlement does not ship on its own. **The grade change is reverted, with
its ledger written at the shader line**: the repair exists, is measured, and
ships as ONE UNIT with a wrap retune, gated by the lit probe on all bearings.

**The board entry therefore stays OPEN**, now with its mechanism fully known:
per-channel contrast crushes the channel a saturated colour has least of; the
fix is a luma-preserving power law plus a madder-wrap albedo retune, taken
together.

### Correction to the merge commit's own claim — R8

The merge message for this branch says the knee revert took buff@0 "+34.6 →
+3.7". **That is wrong for the shipped tree.** The +3.7 reading came from the
`no knees + LUMA grade` run, and the luma grade is exactly what was held back.
The full buff@0 column is: knees+old +34.6 · knees+luma +28.5 · no-knees+luma
+3.7 · **no-knees+old (SHIPS) +28.5** — so buff goes clean only when BOTH the
knee revert and the luma grade are in, which is one more datum for shipping the
grade+retune unit together, and one more reason the residual below matters.

### The confirmation probe, and the residual it found — a NEW open question

The fully reverted tree (no knees, old grade — nominally the 20-Aug
configuration) reads **better than `main` on every row** but not back to the
20-Aug settlement of at-or-below-floor everywhere:

```
  buff @ 0°    +28.5      wrap @ 90°   +10.9
  wrap @ 180°  +15.2      buff @ 90°    +9.6
```

**Nothing on this branch can be the cause — it only reverts.** What separates
this tree from the 20-Aug baseline is everything merged since, and exactly one
of those changes touches rendered pixels: **the per-bone shadow proxy**
(`shadowcut`, 664 → 539 draw calls). Its "visually lossless" verdict was a
MEAN-LUMA claim over regions, and rose share is a THRESHOLD metric — the
Danelaw's wraps sit at L\* 40–41, exactly on the band's L\* 41 floor, where a
fraction of a point of changed micro-shadowing flips whole pixel populations in
or out. Run-to-run capture variance is the other candidate; the 20-Aug numbers
were single runs too.

**Next instrument step, for whoever takes it:** the same paired probe with the
shadow proxy toggled (`castShadow` back to per-mesh on one arm of the pair), on
one build, same session. If the proxy owns the residual, the draw-call win and
the rose settlement have to be reconciled — most likely by keeping the proxy
and re-floors on the wrap band, not by giving back a third of the frame.

---


## THE CLASS-CARD GATE WAS BLIND THREE WAYS, and all three were copies — 21 Aug 2026

`tools/cardgate.mjs` — the pixel gate on the one screen a player reads before
choosing a class — had been failing or vacuous for some time, and nobody knew,
because it is outside the everyday battery. Three separate copies of facts it
did not own:

```
  1. the DISPLAY NAMES.  It located cards by "RUNEKEEPER"/"WARDEN" text and
     died with a timeout the day the owner renamed them WRECCA and WEARD.
     The cards carry `data-cls` now and every locator keys on the id; the
     drawn name is READ for the report, never asserted.

  2. the BAR LABELS.     Its list said ATK where the card draws DMG — stale
     since `statshape.mjs` landed — so every card fell out of the pixel pass
     at `rows.length === 4`, silently. The labels now come from
     `statshape.AXIS_LABEL`, the module the card itself draws from. (And the
     first repair left `LABELS` as a free variable inside a function that is
     STRINGIFIED and evaluated in the page — undefined there, same symptom.
     It is a parameter now, injected by the caller.)

  3. the LEVER NUMBERS.  Mutation B searched the served module for
     `runekeeper 5 -> 5.6, warden 4 -> 5` — and the re-levelling made those
     the REAL values, so both regexes missed and the discrimination claims
     failed with question marks. The from-values are read from the engine's
     table and matched NUMERICALLY (the source spells the engine's `5` as
     `5.0`, which a string-built lookahead rejects).

  4. and a HYDRATION RACE under all of it: the harness clicked "Training"
     600 ms after stylesheets landed, before React attached handlers, so the
     click hit nothing and the card wait timed out on the wrong screen. Each
     step now clicks until its own effect is on screen.
```

**And one finding about the design, measured while repairing the lever.**
`statshape` derives every axis maximum from the roster being drawn — so bumping
BOTH speed leaders rescales the axis and the change nearly vanishes (warden
+4px of 219), and the class already at the maximum can never grow its own bar.
The claims now assert each mutation's sharpest observable: the warden alone
bumped takes the top of the bar; the runekeeper alone bumped visibly shortens
every OTHER speed bar — and the measured shrink lands on the prediction to the
pixel (phone: shrank 30px, predicted 30; desktop: 46 against 46).

**17/17 on both viewports**, with the drawn matrix now printing WEARD and
WRECCA. The mirror in `types.ts` is confirmed field-identical to the engine and
GATED — `cardgate` diffs every numeric field of every class before it opens a
browser, so the drift that put a wrong speed on the chooser cannot recur
silently. Three stale OPEN entries closed with this run's evidence.

---


## THE MATCHMAKING NOW SAYS WHAT THE WAR MEANS BY IT — 21 Aug 2026

The owner: *"how does an 8 player FFA score against the war ... we need everything
to feel & clearly have a purpose. We want players to want to fight for their
kingdom & also fight with or against their friends."* And earlier: a war-specific
queue versus a casual one *"where the cosmetics revert to their original style"*.

**The design settled on, and why it is not two queues.** The game's own factions
page already states the constraint: *"twelve players split four ways is four
empty queues."* Splitting the population again by war/casual would be worse. So
the shape is: ONE population, and the **stake is a property of the room**,
chosen by the host at creation and immutable after — men join a friendly moot or
a war fight knowingly.

**How each shape scores, which was always true and never said** (`POINTS`:
turnout 2 · kill 1 · victory 12, cap 40; in a band, every member of the winning
side is `isWinner`):

```
  HONOUR DUEL   a challenge over the border — the victor carries the day
  BLOOD MOOT    a raid — every sworn man banks his own deeds; the last one
                standing banks the victory
  WAR BAND      shield-walls meet — every man on the winning side banks the
                victory; the war's heaviest blows
```

The mode cards on CREATE now carry those lines. The FFA answer is the raid
model, and it is the right one for a bot-heavy population: individual renown for
your king, victory weighted 6× a kill.

**The friendly moot** is the second card under WHAT IS AT STAKE: no ground
dealt, nothing banked, and `dressFor` strips the livery at every door an
appearance comes through — kits worn as bought, the owner's own words. The sim
itself answers the room at match end with `war_result kind:"friendly"`, no
database anywhere.

**"Fight for this ground"** closes the loop from the map: /factions' new front
panel lists the territories nearest to falling, each with FIGHT HERE →
`/?war=<id>` → CREATE opens with the ground pinned → the engine validates the id
and the room fights THERE, never re-dealt, arena following the ground's people —
a Pictish pin musters on the moor. A forged or stale id degrades to the normal
deal.

**And the anti-farm gate now speaks.** `warReport` refuses rooms with fewer than
two humans — deliberately, and the argument stands: *"Britain would belong to
whoever left a laptop on overnight."* But the refusal was SILENT: a man who
fought bots he added himself saw FOUGHT OVER DEIRA in the lobby, won, and
watched nothing move — the owner's exact sessions. Now the lobby's ground line
adds *"the war watches men, not bots — invite a second warrior to make it
count"* when one free man stands in a war room, and the sim sends
`war_result kind:"practice"` at the end. The gate is right; the silence was the
defect.

**Gated end to end** in `tools/warsay.mjs` — 30/30 — by driving real matches on
the real engine with no handlers attached: a friendly duel fought to the death
arrives as two `friendly` outcomes; one man and his recruit arrives as
`practice`; a pinned Pictish room musters on `pict_moor`; a forged id gets the
normal deal.

**Not built, said plainly:** a public quick-match queue (nothing to queue into
yet — every room is code-joined), and a personal ranked ladder. The seasonal
per-people standing ("2nd of 5 Anglo-Saxons") is the ranking that exists; a
ladder wants a queue population first.

---


## CLOSED 24 Aug 2026 — `summaryflow`'s duel press: the repair below was built exactly as prescribed, and three consecutive runs read 5/5

The overlay now publishes a one-bit mount mark (`__summaryUp`, an effect flag
— no layout cost on a thread that can barely draw), and the press waits on it
with the park window's remainder as its budget; a box that cannot mount the
overlay in time reports the pair NOT RUN, named, the same honesty the
flourish rows have always had. Three consecutive duel-phase runs on this box:
5/5, 5/5, 5/5, with only the pre-existing flourish skip. The entry below is
kept for the diagnosis, which was exact.

## The original entry — `summaryflow`'s duel press fails about one run in three, and the assertion argues with the design — 21 Aug 2026

Six runs on the merged tip, same box, same window:

```
  17/17    16/16, 1 not run    16/16, 1 not run    15/15, 2 not run
  15/16, 1 FAILED              16/16, 1 not run
```

The failure, both lines from the same run:

```
  FAIL  pressed before the rollback, the intent parks
        — pressed at 12ms with state=finished, button shows FIGHT AGAIN
  FAIL  the summary overlay stands over a live canvas — verdict=false, canvas=true
```

`verdict=false` is the summary overlay not being MOUNTED. The harness waits for
`match_end` **on the wire** before it presses — that part is right — and then
presses immediately, deliberately: its own note says *"the park branch only
exists inside the server's ten-second window, and on a software rasteriser the
first summary frame alone costs this box most of it... So the press goes first
and the picture is examined afterwards."*

**So the two assertions want opposite things.** One requires the press to land
before the summary can render; the other requires the summary to be rendered.
On a box that takes 8–25 s to draw its first summary frame, which of them wins is
decided by the load at that instant. That is not a defect in the game and no
amount of waiting fixes it, because waiting is the thing the first assertion
forbids.

**Not attributed to this round's work, and not cleared of it either.** The same
harness read 16/17 with a failure earlier the same day, before any war change
went in, so it is not new. What IS new is that `war_result` adds one React state
update at match end when a database is configured, and on a client drawing under
a frame a second that is not free. Neither was measured against the other, and
saying which would need a paired run on a machine that can draw.

**The repair is the harness's, and it is the same shape as the shove's:** the
press must be timed off a state the client publishes — "the summary is mounted"
— rather than off `Date.now()`, and the window assertion must be allowed to
report NOT RUN when the box cannot draw in time, the way the flourish rows
already do. `docs/BACKLOG.md`'s first priority is exactly this: *"both harnesses
sample after a wall-clock delay; both must instead wait on the client having
received..."*

---


## THE WAR LOOP, CLOSED — and the two pieces of 5.7b that are SPECIFIED, not built — 21 Aug 2026

The owner: *"I'm still not sure how the war map links to the actual gameplay &
results etc. as I've played games and seen no update."*

**The loop was never broken.** A Postgres stood up locally and `tools/warflow.mjs`
runs **28/28** end to end: matches bank, territories flip, standings move, the
replay guard holds, the oath locks. What was missing is that nothing in the game
ever said so — `bankMatch` had six ways to bank nothing behind a
`.catch(() => {})`, and the likeliest of the six (never having sworn) is the one
a player can undo and was never told about.

Closed this round, both ends:

```
  before the fight   the lobby names the ground — FOUGHT OVER / DEIRA / the
                     Norse hold it. It had been on every snapshot since the war
                     landed with nothing rendering it.
  after the fight    war_result carries a reason per man, and the summary shows
                     it — "+14 TO THE DANELAW · CAIT", or a BUTTON reading
                     "THIS COUNTED FOR NOBODY — SWEAR TO A PEOPLE".
  the payoff         when the ground changes hands on a man's own points:
                     "DEIRA HAS FALLEN — the Anglo-Saxons take it from the
                     Norse — your +14 carried it".
```

### What is NOT built, with the seam already found

**1. A second ground.** Sixteen territories share one arena, so Deira looks
exactly like Dyfed and taking ground reads as a number changing rather than as a
campaign. **The seam exists and does not need building**: `world.ts`'s own header
says *"A new ground is a new `GroundDef` in its own module, `registerGround`d,
and a new `GroundSpec` beside the village's. It does not touch this file."*
`GroundBuildContext` already hands a ground instancing, footing, prop scatter,
fire markers and a dispose ledger.

What it costs, honestly: the village's build is 2,600 lines and the pieces a
second ground would want — the runestone at `world.ts:2893`, the banners at
`:2629` — are written INLINE in it rather than as shared builders. So the unit is
"extract three builders, then write a moor", not "write a moor". The natural
first one is Pictish: standing stones instead of a palisade, peat fire instead of
a bonfire, no huts — maximally unlike a Saxon village, so the difference reads at
a glance.

**2. The arena dressed by whoever holds it.** `world.ts:2658` alternates
`bannerRed`/`bannerBlue` on the banner poles. Flying the HOLDER's colours
instead — garnet over a Danelaw territory, green over a British one — is the
cheapest thing on this list that would make one ground feel like sixteen. It
needs the holder plumbed into `GroundBuildContext`, which is now possible
because the territory is known at LOBBY time rather than at match start.

**The plumbing for both is in and gated.** `GROUND_BY_PEOPLE` resolves every
territory to a ground id — all four peoples answer "the village" today, so
nothing a player sees changes — and `warsay` asserts that every people has an
entry, that every id is a ground `GROUNDS` actually has, and that all sixteen
territories resolve to something drawable. Without that last one a ground could
be added to the table, forgotten in the renderer, and ship as a silent fallback
into the village.

---


## THE SHADOW DRAW CALLS — 664 to 539, losslessly; two mechanisms dead and the lossy cull refused — 21 Aug 2026

The instrument said shadows are the largest single item on the sheet. This is the
attempt to spend it, and what ships from it is the measurement rather than a
change — because the obvious cut is not free and the free cut needs building.

### The prize, exactly

`tools/framecost.mjs`, eight-man brawl, one shadow-casting light:

```
                              casters   draw calls
  as it ships                   352        664
  warriors casting nothing       60        437
```

**Warriors alone are 292 of the 352 casters and 227 of the 664 draw calls — a
third of the frame spent drawing men a second time.** And it multiplies: the
harness prints *"THE SHADOW LIGHT COUNT IS THE LARGEST SINGLE MULTIPLIER IN THIS
FILE, and it is 1 on low, 3 on medium and 4 on high"*, so on `high` each caster is
drawn four extra times.

### Three things that do NOT work, each measured before it was abandoned

**1. Culling small casters.** The shadow map is sized for a 1.5 cm texel
(`SHADOW_TARGET_TEXEL`), so anything a few texels across casts nothing
resolvable. There is nothing to cull: **not one of a warrior's 43 meshes is
under 8 cm**, the smallest being a head piece at 8.3. The geometry is already
consolidated — there are no rivets as separate meshes.

**2. Hiding a shadow proxy on another layer.** The plan was to park a cheap
proxy on layer 1, keep it out of the main camera, and let the shadow camera see
it. `three.module.js:9559` in the shadow pass reads

```js
const visible = object.layers.test( camera.layers );
```

— `camera`, the MAIN camera, not `shadowCamera`. An object the camera does not
render is not shadowed either. **Dead.**

**3. Hiding it with `material.visible = false`.** The next idea: keep the proxy
on the default layer but give it an invisible material, on the theory that
`material.visible` gates only the colour list. It gates both — the colour pass at
`:17921` and the shadow pass at `:9594`. **Dead.**

A proxy therefore has to be a real drawn object with `colorWrite:false` and
`depthWrite:false`: one draw call that changes no pixel.

### The lossy cull was BUILT, measured, and refused

Meshes are layered per bone — nine on `rig:torso`, seven per arm, six on the head.
Dropping any whose bounding sphere sits inside a larger SIBLING's (siblings only,
because two meshes on different bones separate when the man moves and a
containment measured in bind pose would be a lie by the first stride) gives
**43 → 28 casters on all four classes**, and measured end to end:

```
                casters   draw calls
  before          352        664
  after           226        583        -12%
```

**It is not free, and the same frame says so.** Same card, same lens, `fightcard`
huscarl turn 40, against a control of the same build captured twice:

```
  region                 before    after     control drift
  the man (torso+kit)     77.32    81.52     +/- 0.03      -> +4.20 BRIGHTER
  ground under him        72.54    74.12     +/- 0.01      -> +1.58
  the shield             100.98   102.80     +/- 0.04      -> +1.82
  background fence        53.86    53.70     +/- 0.05      -> -0.16
```

9.02% of pixels move by more than 8/255 against a control of 0.258% — thirty-five
times the noise. The man goes **four luma points brighter** because his own kit
stops shadowing itself, which is precisely what the line above the traverse
defends: *"a pauldron has to darken the sleeve under it, or layered kit reads as
one painted shape."* Bounding-sphere containment does not imply geometric
containment, so a plate whose sphere is swallowed can still stand proud of the
mesh that swallowed it.

**Twelve percent of the frame is not worth flattening the warrior**, and the
change is reverted. Nothing from it ships.

### AND IT WAS BUILT — the merged per-bone caster ships

```
                              casters   picture   total draws
  as it shipped                 352       403         664
  merged per-bone proxy         129       462         539      -19%
```

63% fewer casters. The proxies cost 59 draws in the picture pass — they are real
drawn objects because both cheaper tricks above are dead — and the net is **125
draw calls off an eight-man frame at ONE shadow light**. On `high`, where the
count is four, every one of the ~34 casters removed per warrior would have been
drawn four more times.

**And it is visually lossless, which took two measurements to establish.**

The first cut carried POSITION ONLY, on the reasoning that a depth pass has no
use for normals. `light.shadow.normalBias` does — it pushes each sample along its
own surface normal to keep a curved surface off its own shadow — and stripped of
them the ground under a man measured **8.57 luma darker** than before: a shadow
that had grown, not one that had gone. With normals carried:

```
  region              before -> after     same-build control
  the man (kit)        77.32 -> 77.34            +/- 0.03
  ground under him     72.54 -> 72.23
  the shield          100.98 -> 101.49
  background fence     53.86 -> 53.88            +/- 0.05
```

The pixel-difference count is **7.91%**, and the control for the same build
captured twice is **7.75%** — the two are indistinguishable, so that figure is
this harness's own pose jitter between runs and not the change. (An earlier
control read 0.258%; that was two runs landing on the same animation phase, and
quoting it as the harness's repeatability would have been wrong.)

Rig-traversing gates unmoved: `cosmetictest` 14/16, `wearmeasure` the same three
nape-guard lines, and `factionread` §0.3 — *a livery moves NO geometry* — still
112 builds with zero coverage difference, which is the gate that would catch a
proxy leaking into the picture.

### What is left, costed, for the next round

**One merged shadow-only caster per BONE.** Siblings share a parent, so their
relative transform is fixed for the life of the rig and merging them is exact —
the union of the same triangles, so the shadow is unchanged pixel for pixel,
including the self-shadowing the cull above lost.

```
  per warrior, 1 shadow light    43 colour + 43 shadow            = 86
                                 43 colour + 8 proxy + 8 shadow   = 59      -27
  per warrior, 4 lights (high)   43 + 172                         = 215
                                 43 + 8 + 32                      = 83     -132
```

At eight men and one light that is **664 → ~448, a third of the frame, for no
visual change at all.**

The cost is memory: the merge duplicates vertex data. A shadow proxy needs
POSITION only — no normals, no UVs — so at ~28,700 triangles a warrior it is
about **1 MB per man, 8 MB for a full moot**, not the 25 MB a full-attribute
merge would take. That is the number to weigh, and it is the whole of the
decision.

**And the cheaper lever the harness itself recommends is untried:** dropping the
shadow-casting light count from 4 to 3 on `high` removes a quarter of every
caster's cost at once. That is a look decision about cascades rather than a
geometry one, and it wants its own frame.

---


## FIXED — `ablationRows` was empty for three reasons, and none of them was the game — 21 Aug 2026

`docs/BACKLOG.md`'s third priority reads: *"`ablationRows` is **empty**. Not
partial: empty. Nothing in this repo can say which effect costs what, so a
performance wave started today is eleven guesses dressed as engineering."* That
has blocked Wave D since it was written. Three separate faults, all in the
harness:

**1. An uncaught rejection killed the run.** `installPatches`'s last
`route.fulfill` was fire-and-forget. When the page navigates while a request is
in flight, Playwright disposes the response and the fulfill rejects — from inside
a handler nobody awaits, so it surfaces as an uncaught promise rejection and
takes the process down:

```
  route.fulfill: Fetch response has been disposed
      at tools/fpstest.mjs:439
  Node.js v22.22.2
```

Every scene after the one that crashed simply never ran. Every exit from the
handler is awaited and guarded now; a route that cannot be fulfilled is a request
the page has already abandoned.

**2. A warrior with no name never raises a room.** `raiseMoot` presses CREATE
BATTLE → mode → 1 ROUND → CREATE ROOM and waits sixty seconds for the server's
`join` to carry a war code back. The landing screen asks for a name first and
this file never gave one, so **every scene** died on
`timed out waiting for the war code` — and with no `baseline` row the ranked
table cannot be built at all, because `out.ablation` sits behind `if (base)`.
`summaryflow` has seeded `bretwalda_name` since it was written; `fpstest` never
did. Seeded in an init script, because `page.tsx:506` reads it on first render
and a keystroke after load is a race.

**3. Every patch was discarded before it could land.** `hits` was read
immediately after `openPage` and any job counting zero was thrown away. At that
moment the browser has fetched the LANDING screen and nothing else — measured,
**thirteen `.js` responses, 1,033,173 bytes, and not one of them contains
`postProcessing:!0`**. The renderer's chunk is lazy and does not arrive until the
canvas mounts, which is after `raiseMoot`. The route is installed for the life of
the page so the patch always *would* have applied; only the accounting was early.
The check moved below the moot.

### What the instrument says, now that it runs

Eleven rows, no misses, tier `low`, eight-man brawl, 6 s a scene. Baseline
**624 draw calls**, 392k triangles, 3514 kB/frame.

```
  what was removed              ms@p50   ms@p99   draws    fbo   kB/frame
  no 3D HUD damage nums           4.20  -212.70       3      0    1428.35
  no grade+vignette               3.80  -680.10      72      0     183.30
  no DoF                          3.30   175.90     -11      0     968.19
  no postfx (whole chain)         2.60  -262.80       4     13    1235.92
  no particles                    2.00  -237.50       1      0    1289.21
  no dynamic torch lights         0.80   183.90      67      0     815.35
  no shadows                      0.70  -396.40     240      2    1375.86
  no props (density 0)           -0.00    43.00      43      0     210.64
  no AO (GTAO alone)             -6.70    61.30      17      0    1340.72
  no audio engine              -414.50   101.90      10      0    1081.01
  no bloom                     -423.60   209.10      52      0    1297.24
```

**READ THE `draws` COLUMN AND NOT THE MILLISECONDS.** The file's own header says
the shares and the draw-call counts are portable and the absolute times are not,
and a six-second sample on a software rasteriser makes that concrete: `no bloom`
at **−423 ms** and `no audio engine` at −414 are noise, not findings — removing a
thing cannot cost four hundred milliseconds. The ms column needs a long run on a
machine with a GPU before any of it is quoted.

**The draws column is a finding, and it agrees with `framecost` independently.**
Shadows are **240 of 624 draw calls** — and `framecost` reaches the same place by
another road: *"352 of 410 visible meshes drawn twice for one shadow-casting
light."* Two instruments, one number, and it is the largest single item on the
sheet by a factor of three.

That is the wave the instrument earns, and it can now be started on evidence
rather than on eleven guesses.

---


## NEGATIVE RESULT — widening the vat's bands does NOT buy the paid ladder — 21 Aug 2026

The clamps are fixed (see below) and **eleven paid surfaces still collapse onto
the free Rough Iron's own**. The obvious next knob is the band WIDTH: inside
`[lo, hi]` `softBand` is the identity, so two finishes 0.30 of lightness apart
that both land in a band 0.10 wide come out at most 0.10 apart. Some of these
bands are very narrow:

```
  band widths (hi - lo)      cloth   wrap   leather   linen
    saxon                     0.10   0.16     0.23     0.16
    norse                     0.20   0.02     0.20     0.07
    briton                    0.10   0.16     0.20     0.16
    pict                      0.14   0.22     0.25     0.34
```

`norse.wrap` is **0.02 wide** — every finish's leg wrap on a Danelaw comes out
the same lightness, which is a twin factory by construction.

**Widened DOWNWARD only** — `lo` lowered, every `hi` left exactly where the
fluorescence work put it, so nothing can get brighter. Measured, and then
attributed by reverting one half at a time:

| what moved | 5.2b | 1.3 | 5.4 rose band |
|---|---|---|---|
| nothing (ships) | 11 | −40.57° | **green, 0 of 196** |
| all five bands | 10 | −105.87° | **RED — 8 of 196** |
| the three non-Danelaw only | 10 | −105.87° | green |

**Both halves are bad trades and neither is taken.**

* The eight rose-band offenders are **entirely the Danelaw's** `wrap` and
  `linen`. Reverting those two alone puts §5.4 back to green — so widening his
  bands is the owner's pink Viking coming back, which is not a thing to trade
  for anything.
* The other three peoples' `cloth` buys **one** surface for **sixty-five
  degrees** of §1.3. The floor-knee change earlier took four surfaces for five
  degrees and that was worth it; this is thirteen times worse per surface.

### So the band is not the lever, and the remaining eleven need a design answer

Three tuning routes are now measured and closed: the three hard clamps (two
taken, one refused), and the band width (refused, both halves). What is left is
`sat` itself, and it is not a number that can be tuned out of the tension — **a
vat strong enough to say "Danelaw" on a tunic is strong enough to say it louder
than the 110 gold that bought the tunic.**

The answer that does not fight itself is to put the paid ladder somewhere the
vat does not reach. `fitting` already demonstrates the shape: it is the §6
control, `dL +0.0` under every livery, and it carries a clean spread across all
seven finishes — `#c3c9d0`, `#dcc164`, `#aab8c0`, `#bfa25c`, `#c79a4a` — because
nothing dyes it. A finish whose identity lives on buckles, rivets, boss and rim
is a finish a livery cannot flatten. That is a shop change with a picture
attached, not a knob, and it is where the next round should start.

---


## THE PAID LADDER, ROUND TWO — three hard clamps in one function, two taken and one refused — 20 Aug 2026

`5.2b`'s own line is the diagnosis and it has been there all along: the worst
paid pair reads **ΔE 3.66 sworn against 11.85 UNSWORN**. The shop has a ladder;
the vat flattens it. `factionDye` had **three** clamps with zero slope, and every
one of them turns a range of inputs into a single output — which is what a twin
is.

| clamp | what piles up on it | taken? |
|---|---|---|
| `softBand`'s floor, `if (x < lo) return lo` | every finish darker than the band | **yes** — 17 → 13 |
| `Math.min(1, hypot(cx, cy))` on chroma | every surface the vat pushes past full chroma | **yes** — 13 → 11 |
| `max(-HUE_CONE, min(HUE_CONE, off))` on hue | every surface whose own hue is outside the cone | **no** — see below |

The ceiling on lightness has used an asymptotic knee — `softCeil` — since it was
written, and the file argues for it twice. The other three ends never got one.

### The chroma ceiling cost NOTHING, which is why it is in

```
                    5.2b   1.1     1.2    1.3
  before             13    2.46   5.97  -40.57
  chroma softened    11    2.46   5.97  -40.57
```

Two paid surfaces off the collapse and **not one other number moves** — because
the surfaces piling up at full chroma are ones whose ORDER was destroyed, not
whose hue was. `softCeil` is reused rather than reimplemented: one definition of
"approach a cap and never reach it", now with two callers.

### The hue cone was built, measured, and REFUSED

```
                    5.2b   1.1                  1.3
  before             11    2.46                -40.57
  cone softened      10    2.32  (bar 2.30)    -49.42
```

One surface, for **two hundredths of margin** on `1.1 SWORN` — the gate that says
swearing has to move a man past a just-noticeable difference. A passing gate left
that close to its bar is a gate that flips on the next seed. Not taken, and the
reason is written into `characters.ts` at the line itself so the next hand does
not spend the afternoon rediscovering it.

### Where the ladder stands

**11 paid surfaces still collapse onto the free Rough Iron's own**, down from 20
when the per-surface gates were first made honest. What is left is not a clamp:
it is `sat` itself — a vat strong enough to say "Danelaw" on a tunic is a vat
strong enough to say it louder than the 110 gold that bought the tunic. That is
the same trade `1.2`/`1.3` are stuck in and it wants a design answer, not another
knee: most likely **the paid ladder living on surfaces the vat does not touch**,
which is what `fitting` already demonstrates — it is the control, it moves for
nobody, and it carries a clean ΔE spread across all seven finishes.

---


## OPEN — the nape-guard flare, round three: the prescribed corner blend was BUILT AND MEASURED NULL, and the peak is not where round two thought — 24 Aug 2026

Round two's prescription ("`withNeck`'s ceiling needs to blend, not cliff")
was implemented twice over and the flare column did not move a tenth:

- The ceiling's hard cut now FADES over 30 mm (kept — it is anatomically
  right and costs nothing) — wyrm 40.5° before and after, to the decimal.
- Printing `flareU/flareV` located the real peak at the guard's FORWARD
  BOTTOM edge (u=0.000, v=0.933) — the SUBMANDIBULAR corner at the side of
  the neck, not the occiput the entry named.
- A muscle-line slope fill (25° off vertical, the trapezius/SCM line) was
  then built for the side-and-rear sector: the wyrm still did not move a
  tenth, and the suttonhoo REGRESSED 23.0° → 52.2° (hard sector edge) → 40.8°
  (tapered edge) — the fill's own boundary becomes the next cliff, and the
  wyrm's peak samples never touch the filled bins at all. REVERTED.

So the corner is not in the radial table. The wyrm's immovable 40.5 under
two independent table changes says its flare pair reads something else —
most likely the MARCH: `skinGap` walks inward along the ring's own wall
normal, and at the guard's bottom rim that normal has a large vertical
component, so the pair may difference two marches that leave the table's
covered latitudes entirely (censoring excludes only the 75 mm cap, not a
short-but-wrong hit). The next round instruments the march itself — print
az/el and the fHere/fNext pair at the peak before touching any surface. The
bar stays 22; the gap column (23.4 vs 26) and the photograph still say the
PLATE is fine.

## Round two, kept for its numbers — the ruler now reads a RUN, and what is left is the skull-to-neck corner — 21 Aug 2026

**The ruler is repaired; the defect is narrowed, not closed.** The flare column
differentiated the plate's standoff across a single 12 mm step, while its own
header says a flare is *"the angle a plate holds over a RUN of it."* It reads a
40 mm run now, in both the shell path and the ring path — one baseline, two
readers — and the widening is arithmetic, not taste: a plate departing at 50°
sustained over even 40 mm would stand tan(50°)×40 = 48 mm off a head it never
leaves by more than 20, so the old reading was self-contradictory on its face.

```
                      12 mm step     40 mm run
  wyrm nape guard        49.8           40.5      still red (bar 22)
  suttonhoo              40.1           23.0      red by ONE degree
```

So ~17° of the Sutton Hoo's reading was the one-step artifact. **What remains is
the corner where the skull becomes the neck**: a hanging plate genuinely stands
off a neck that is ~40 mm narrower than the skull above it — that is what an
aventail IS — and the flare column reads the form receding at that corner as the
plate "leaving". The gap column (23.4 mm against a 26 bar) and the picture
(photographed, no daylight, no wing) both say the plate is fine.

**The lever, pulled:** `clearAt` opened into a real 60 mm wing and the run-based
ruler still catches it — **flare 30.5°, gap 72 mm, hem 72 mm, three red columns
naming it** — where the corner case trips flare alone. A genuine wing cannot
hide from the widened instrument.

**The remaining repair is `withNeck`'s corner**, the place its own note calls
"the one thing about this table that is still an approximation": the ruler's
form table needs the neck's real radius to blend up into the skull base at the
rate the anatomy does, so a plate hanging beside the corner is measured against
the corner and not against a cliff. The bar stays at 22 and is not moved.

### The original investigation — 20 Aug 2026, kept for its numbers

`wearmeasure` section 3, on `main`:

```
  helm         parts   gap mm  flare deg   hem mm   worst part
  ridge            1     13.6        8.9     13.6   -
  spectacle        2     17.7       11.5     19.0   -
  boar             2     17.7       11.5     14.0   -
  crowned          2     17.7       11.5     14.0   -
  wyrm             2     23.4       49.8     25.0   nape guard   <-- FAIL
  suttonhoo        2     21.7       40.1     19.0   nape guard   <-- FAIL
  bars: gap 26 mm, flare 22 deg, hem 26 mm
```

Only the two helmets with `nape: "guard"` fail; every `nape: "flange"` helmet is
under half the bar.

### WHERE IT PEAKS, on every class and both seeds

`helmFitProbe`, printing `flareU`/`flareV` rather than the maximum alone:

```
  wyrm        warden     40.5 / 43.5   at u 0.056        v 0.867   gap 16.7 / 17.3 mm
              runekeeper 41.0 / 41.6   at u 1.000/0.944  v 0.933   gap 20.3 / 20.5
              berserker  45.4 / 49.8   at u 0.972        v 0.867   gap 18.1 / 19.3
  suttonhoo   warden     35.3 / 31.9   at u 0.972        v 0.867   gap 15.5 / 17.2
              berserker  33.3 / 40.1   at u 0.972/1.000  v 0.867   gap 17.6 / 19.1
```

**v is 0.80–0.93 every time and u is at 0.03 or 0.97 every time** — the guard's
front-bottom CORNERS, both sides, on all four classes. (The huscarl reads
`gap 75.0 / standoff 75.0`, the search cap exactly; he is `blind`ed for the coif
and is not gated.)

### THE LEVER IS THE DEPTH, AND IT IS MONOTONIC

The guard's floor is `skullY - R.y * 1.12`; the flange's is `0.45`. Swept
through the same code with nothing else changed:

```
  guard floor 1.12 head-radii  ->  worst flare 49.8   (ships)
              0.90                              45.4
              0.70                              34.9
              0.45                              26.0   (the flange's own depth)
```

So the flare is bought by how far below the skull's BASE the plate reaches —
which is exactly where `hullAt` (the profile the plate is swept on: skull, then
neck, then coif) and `formHull` (`withNeck(formTab)`, what the ruler measures
against) diverge. `withNeck`'s own note calls the ceiling that stops the neck
reaching up into the jaw **"the one thing about this table that is still an
approximation"**.

**Two things it is NOT.** `napeHalf`'s widening coefficient, swept 0.44 → 0.30 →
0.20 and from `v²` to `v`, moves the worst flare between **48.5 and 52.0** — no
lever at all. `clearAt` ramps 13 mm → 15 mm over the whole fall, and 2 mm cannot
make a 50° angle across a 12 mm step.

### AND THE SAME HARNESS'S OTHER COLUMN SAYS THE PLATE IS FINE

`standoff` — how far the metal actually is from the head — reads **15.5 to
20.5 mm against a 26 mm bar** on every gated class, and it does not move as the
flare climbs from 26 to 50. **A plate departing at 50° sustained over its lower
third would be far more than 20 mm off by the hem.** Both readings cannot
describe a wing; what they describe together is a LOCAL swing — the plate close
to the skin at one sample and 17 mm off 12 mm later, across the submandibular
hollow the form table admits is approximate.

**Photographed** at the bearing the corner is on, production build, arena light:
`art/look/nape2/facecard-helmhelm_wyrm-clsberserker-turn140.png` — the berserker,
the class that reads 49.8, in the Wyrm-Crest. The guard hugs the skull, its hem
sits on the neck, and there is no daylight and no wing. `art/look/nape/` is the
huscarl for comparison, guard flush over the coif.

### WHAT IS NOT DONE, AND WHY IT IS NOT A TUNING JOB

Two honest routes, neither taken here:

1. **Repair the hollow in `withNeck`.** It is the cause. Filling it is what the
   "phantom cylinder" got wrong in round eight, so it needs its own unit.
2. **Make the flare ruler measure a RUN.** Its own header says *"A flare is a
   thing you can see, and what you see is the angle a plate holds over a run of
   it"* — and then differentiates across a single 12 mm step. A sustained
   departure and a one-step swing are different things and this column cannot
   tell them apart.

**Moving the bar from 22 is not on the list.** It is the one repair that would
turn the column green without learning anything, and this file's own rule is that
a bar tuned rather than met is worse than a hole.

---


## CLOSED 24 Aug 2026 — the Shadow Hood swallow: the hood-route rebuild WAS the geometry this entry prescribed, and the gate has been green since

`cosmetictest --no-render` today: **"every paid hairstyle still reads under
every helm, the hood included — all clear."** The 22 Aug bagged-route rebuild
(hoodroute, ledgered above: the mane squashes inside the cloth, swings out at
`hoodHemY` — the drape's own hem — and rides the registry below; plaits take
the masked nape route) is exactly the "geometry rather than a cull" this
entry demanded, built against the constraint it stated: `wearmeasure`'s
through-check holds 0.0 mm where the culls' round put 89.6 mm of hair through
the cloth, and `hoodfall` reads its first clean sheet, 120/120 pairs two
objects. Three FREE hairstyles remain swallowed, ungated on the harness's own
reasoning — nobody paid for them. The entry below is kept for the mantle
anatomy, which is what made the right fix findable.

## The original entry — the paid hair under the Shadow Hood is NOT a cull, it is the MANTLE — 20 Aug 2026

`cosmetictest --no-render` on `main`:

```
  FAIL  every paid hairstyle still reads under every helm, the hood included
        SWALLOWED  Long Mane (40g) under Shadow Hood — 0.97% (bar 1.00%)
        SWALLOWED  Braided War-locks (100g) under Shadow Hood — 0.97%
```

Both paid rungs read **0.97% against a 1.00% bar, and both the same to two
places** — what survives is the fringe they share, not the mass that tells them
apart. The owner's ruling is already quoted in the harness: *"long hair
dissappears fully even if it should be visible at the below the helmet"*.

### Three culls found and removed, and the gate went GREEN — and it was still wrong

```
  characters.ts  hairCeil    the `hooded` branch had NO rim test, while the
                             `helmed` branch beside it has always had one. Below
                             the cowl `clamp01` pins the ramp at 0 and
                             `hoodLift(u,0)` still returns a finite number, so a
                             mane a foot below any cloth was capped at 22 mm.
                 hairFall    `if (hooded) return 0` — no falling mass at ANY
                             bearing.
                 the plaits  `if (hooded || (style.mask && !coifed)) continue`,
                             with every sentence of argument around it about a
                             MASK and none about a hood.
```

Removing all three took the gate to **PASS, all clear, `cosmetictest` 15/16**.

**And it is reverted, because `wearmeasure` caught what it bought:**

```
  [wear] hood  long   89.6 mm through   66.67% of the shell   at -126/-61 deg   <-- FAIL
```

Against `0.0 mm / 0.00%` on `main`. **A mane through the cloth is a worse defect
than a mane under it**, and the gate that was green would have shipped it.

### What the cause actually is, measured

The hood is not a cowl. It is **four pieces**, and the one that matters is the
last:

```
  cowl     helmWear, v0 = hoodRim(u)                     rim 56 mm above ...
  mantle   helmWear, v0 = hoodRim(u), v1 = 0.9
  point    a shell behind the nape
  DRAPE    rings at skullY - R.y*1.45, -2.10, and a hem at
           skullY - R.y*2.95 with a half-width of R.x*2.02
```

The drape's hem is **below the shoulder and more than twice the head's own
half-breadth**. A mane hanging inside that is not being culled by a bug — **it
is inside a mantle, and it would be invisible on a real man too.** `hairCeil`'s
own header admits the shape of this: *"at the nape all three overlap and the
nearest of the three is the one the hair has to clear, which no single lift
function knows."*

### So the next round's move, and it is geometry rather than a cull

Hair reads under a hood because it comes out of the **FACE OPENING** — round the
temples and down the front — not because it escapes at the nape. The work is to
root the mane's forward courses and the war-locks' plaits in front of the cowl's
rim so they hang OUTSIDE the cloth, and it has a hard constraint to be measured
against: anything routed behind `hoodRim(u)` must clear a drape whose hem is at
`skullY - R.y*2.95` and whose half-width is `R.x*2.02`.

**Do not reach for the three culls again.** They are the obvious move, they turn
the gate green, and they put 89.6 mm of hair through the cloth.

---

## THE REPLAY ROUND, LANDED — 20 Aug 2026

The owner's four reports from a played build, and where each one ended up.

| the report | what it was | where |
|---|---|---|
| *"the whole vote for mercy or kill … is what's causing the bodies to freeze … it's every player at low health, not the final 1v1 … I imagine it wasn't even a thing for Anglo Saxons and would be more Roman"* | `goDown` parked the floor clock for `MERCY.window` = 2.5 s on **any** man reaching 0 hp, mid-round, and left him `knocked` and upright throughout | MERCY OR FINISH removed entire, `docs/MERCY-REMOVED.md` |
| *"the bodies now also randomly lean back after certain actions but it's very dramatic like back bending over backwards … or flopping quickly down & up"* | one clock served six animations | one clock per MOVE |
| *"the dead bodies are still sometimes freezing partially raised, like there's no gravity to them"* | `topple()` read three Euler angles as an axis-and-angle, so a man who lost a limb never reached the ground — and the ruler shared the same false premise (`hypot(prx, prz)`) | both repaired; `gravitytest` §2 0/10 stop short, §4 0/24 topple against the blow |
| *"the final kill camera would be better as a slow mo replay before the next round … & also before a match ends too (Skippable … just take them to the lobby)"* | did not exist | `src/game/replay.mjs`, 57.6 KB ring, half speed, 4.0 s inside a 5.0 s break, SKIP at match end only |

Two defects the round found in its own work and closed rather than filed:

* **The replay cut away 0.09 s before a burnt man hit the turf.** Carried as a
  deferral for two rounds — *"freezetest measures a body reaching the ground
  between 0.52 s and 1.17 s"*. That range averaged two different deaths. Steel
  lands by 0.82 s and always fitted; the FIRE lands at 1.17 s and was being given
  0.92 s of run-up derived from the slowest SWING, for a stroke it never had. The
  derivation now inverts per cause and `replaytest` §3 gates it. See
  `docs/REPLAY.md` §3.
* **The 3D name plates were STALE, and read backwards.** `stage.hud.update` was
  called on the summary branch and the fight path and nowhere else, so plates
  kept the last fighting frame's transform through the death hold, the round
  beat, the replay and the lobby orbit; seen from behind a `DoubleSide` plate is
  the name reversed. Pre-existing on `main`; the replay is simply the longest the
  camera has ever moved while the HUD was not looking. Ticked now on the
  non-fight path, suppressed in the lobby, and a replayed man's bar reads the
  RECORDED health. Photographed: `.replay/shots/held-replay-1.png`.

**The battery on the merged tip.** `replaytest` GREEN with no deferrals (first
time), `deathcamtest` 45/45, `protocoltest` 81/81, `playtest` 37/37,
`summaryflow` **15/15 with 2 not run — against a `main` control of 14/14 with 3
not run, taken on the same box in the same window**, `gravitytest` PASS with the
one owner's-call deferral (`ability -> rolling` 12.3°/frame against a 12° bar),
`tsc` clean.

**One thing this branch is measurably worse at, recorded rather than buried.**
`hudspace --secs=25 --quality=high`, alternating paired runs:

```
                 num/num    name/name   num/name   num/bar
  main   r1       5.47%       2.47%       0.00%     0.00%
         r2       3.90%       1.59%       0.00%     0.00%
  mw5    r1       3.15%       1.83%       0.10%     0.42%
         r2      17.22%       2.93%       0.00%     0.45%
```

`name/name` and `num/num` overlap completely — no signal either way, and `num/num`
is plainly load-bound. `num/bar` is the one consistent column: **0.00% on main
twice, 0.4% on this branch twice.** That is ANY ink contact between a damage
number and a health bar; more-than-a-quarter-buried is 0.00% on both. The cause is
this branch's pose timing moving bodies slightly differently so numbers spawn at
slightly different places. Not enough to hold the merge, and not something to
discover later from a screenshot.
## CLOSED, with the capture — the vat lifted TUNIC and TROUSER off the field's own value, on every people — 20 Aug 2026

**This entry replaces one written earlier in the same session that said "the
value band is NOT the lever". That entry was measured with the wrong ruler and
is corrected here rather than left standing — R8, on myself.**

### The wrong ruler, and why it read a false negative

The first three passes were scored on the **huscarl** card. A huscarl carries a
shield, and the Saxon's board is gold — which §4.1 *requires*, at ΔE 33.5 from
the other three peoples. So the statistic was dominated by the one surface on the
man that is supposed to shout, and it read "unmoved" while the cloth underneath
was changing. The **weard** carries no shield and is the ruler for cloth.

### The surface, named in one second with no browser

`finishKit` and `kitFor` are the shipped resolvers. Every surface, every finish,
post-vat, sorted by L\*, takes a second — and it is the same surface for every
people:

```
  saxon    trouser  Crimson Warplate  #bfa400  L* 67.7  C* 70.8   lifted +42.9
  saxon    tunic    Rough Iron        #bfa600  L* 68.3  C* 71.3   lifted +28.8
  saxon    trouser  Blackened Steel   #b2a44d  L* 66.9  C* 46.6   lifted +48.3
  briton   trouser  Sea Queen's Gift  #4bc0a1  L* 70.7  C* 40.8   lifted +44.4
  briton   tunic    Sea Queen's Gift  #28c8a3  L* 72.5  C* 48.8   lifted +39.5
```

Six of the Saxon's twenty brightest surfaces were tunic and trouser at **chroma
70**, lifted by the vat as much as **forty-eight points of L\***. `wrap` — the
band three passes were spent cutting — sits ABOVE them at L\* 75.7 with
`dL −1.3`: the vat is not lifting it at all, the shop's own Bretwalda Gold kit is.

```
  saxon.cloth    sat 0.66 -> 0.50   lo 0.26 -> 0.12   hi 0.66 -> 0.22
  briton.cloth   sat 0.50 -> 0.42   lo 0.30 -> 0.12   hi 0.72 -> 0.22
  pict.cloth                        lo 0.16 -> 0.12   hi 0.54 -> 0.26
  norse.cloth                                         hi 0.34 -> 0.28
```

### On the frame, on the man with no shield

`art/look/v2/faction-warden.png` against `art/look/calm/faction-warden.png`,
same lens, same light, every pixel of each people's front card:

```
                  saturated + bright        pale-or-saturated + bright
    people        before     after           before      after
    saxon          3070       1203            3503        1580    -55%
    briton          166        167            1880         622    -67%
    norse           225        233             344         344      --
    pict            186        189             275         274      --
```

Both outliers cut by more than half; the two peoples that were never garish do
not move at all, which is what says the change went where it was aimed. The
Briton goes mint to sage, the Saxon highlighter to weld, and `#ffd300` — a
channel pinned at 255 — is gone from the Saxon's leg wraps.

### What this did to the PAID LADDER, and it is the lead for the next round

`5.2b NO REFUND PER SURFACE` moved 20 -> 19 -> 16 -> 17 across the passes, and
its own line says why it responds to `sat` at all:

```
  the worst is 3.66 (norse: Bronze Scales vs Bretwalda Gold),
  against 11.85 for the same pair UNSWORN
```

The shop has an ΔE 11.85 ladder on that pair and **swearing collapses it to
3.66**. The vat is not TINTING a finish, it is REPLACING it: a high `sat`
overwrites whatever the player bought. `sat` is the lever, demonstrated on one
surface of one people. That is the next round's work, and it now has a proven
knob rather than a theory.

---

## OPEN — the Danelaw's rose is SETTLED; §1 is not, and the cause is now proven rather than argued — 20 Aug 2026

**Row 9 of the table below is shipped.** `norse.wrap` `lo 0.16 -> 0.10, hi 0.42 -> 0.12`
and `norse.linen` `lo 0.24 -> 0.05, hi 0.50 -> 0.12` — `FACTIONS.md` §2's *"darker
wools"* taken literally, which is what §10.3's own diagnosis pointed at and what the
round before it built a fade instead of doing. Measured on this tree, `factionread`:

| | shipped before | row 9 (ships) |
|---|---|---|
| 1.1 SWORN | **FAIL** 2.30 against a bar of 2.3 | **PASS** (worst 2.41, and it is a Saxon warden, not the Dane) |
| 1.2 DISTINCT | FAIL 5.97 | FAIL **6.59** |
| 1.3 PEOPLE | FAIL **−65.38°** | FAIL **−35.65°** |
| 5.3 near-neutral on the arc | PASS | **PASS**, all 196 |
| 5.4 vat puts a surface IN the band | **FAIL** 1 of 196 (Sea Queen's Gift wrap) | **PASS**, all 196 |

**The owner's defect — the pink Viking — is closed on this instrument.** Both band
gates are green on all 196 dyed surfaces. `wrap.hi` is `0.12` and not row 9's `0.14`
for exactly one reason, which the previous round had already isolated and could not
finish: at `0.14` the Sea Queen's Gift leg wrap comes out `#7f5a61`, L\* 42.3 — **1.3
points over the band's own L\* 41 floor**, in the band, and §5.4 names it. At `0.12`
it drops under the floor, where the red arc still has its dark names, and clears.

### WHY §1.2 AND §1.3 CANNOT BE TUNED OUT, AND IT IS ONE MEASUREMENT

Four configurations were run through the shipped `factionread`, each changing one
thing from row 9. Every one of them holds 5.3 and 5.4 green:

| what changed | 1.2 | 1.3 |
|---|---|---|
| row 9 as shipped | 6.59 | −35.65° |
| `metal.bias` 1.16 → 1.00 (dimmer mail) | — | −33.47° |
| + `cloth/wrap/linen/leather` sat raised hard (0.74/0.48/0.34/0.56 → 0.85/0.75/0.70/0.70) | 7.83 | −33.05° |
| **`metal.sat` 0.07 → 1.00 — the mail carrying the FULL garnet hue** | — | **−32.84°** |

**Read the last row.** Turning the Danelaw's mail all the way up to his own field's
hue — fourteen times the shipped saturation, the single largest thing that can be
done to the largest surface he owns — moves §1.3 by **0.2 degrees**. The knob is
disconnected, and it is disconnected *by the fix that stopped him being pink*: the
anisotropic cap hands the mail back UNDYED, so `metal.sat` has nothing to act on.

That is the trade stated as a measurement instead of an argument:

> A cloakless huscarl in Polished Steel is mostly mail. His mean hue can only be
> made to read garnet by warming the mail. A warm near-neutral mail is precisely
> the surface §5.3 exists to forbid, because it is the one the bonfire finishes
> dyeing pink. **§1.3 and §5.3 are asking the same surface for opposite things**,
> and no setting of this vat answers both.

### WHAT IS NOT YET KNOWN, AND IT IS THE NEXT INSTRUMENT AND NOT A TUNING PASS

`factionread` §1 measures the man **WITHOUT HIS SHIELD** — its own header says so
under "WHAT THIS FILE DOES NOT MEASURE", and calls the body-only reading *"the
CONSERVATIVE one: the bar is cleared by the man without his shield"*. That framing
is right for a PASS and it is **not right for a FAIL**. The failing loadout is
`huscarl | Polished Steel | No Cloak` at bearing **0°** — the front — and a huscarl
always carries a board, which §4.1 measures at **ΔE 33.5** between peoples and which
is the largest flat colour he holds. So the man §1 is failing on is not a man the
game ever draws.

**Nothing here claims the failure is therefore false.** It claims the reading does
not yet answer the question, and names what would: a posed capture with the board
mounted, under light, which is `§6`/`vatprobe`'s path and not this file's. That is
where the next round starts, and it is an instrument job, not a knob job.

### AND THE PAID LADDER IS NOW VISIBLE, WHICH IS WHY IT IS RED

`5.1b NO TWINS PER SURFACE` and `5.2b NO REFUND PER SURFACE` are **FAIL** — *"20 paid
surfaces collapse onto the FREE Rough Iron's own"*, and Saxon tunic reads Rough Iron
(0g) against Bronze Scales (110g) at ΔE 1.24, `#bfa600` vs `#bfa400`. These are not
new defects and this configuration did not cause them: the old §5.1/§5.2 averaged six
surfaces through `kitDE`, and §5.0b is the control that proves the mean is blind —
**a byte-identical byrnie, ΔE 0.00, reads ΔE 18.77 through the kit mean.** The gate
titled "THE PAID LADDER SURVIVES SWEARING" could not see the thing it was named for.
The per-surface gates are the fix to the ruler; the twenty surfaces are the next
round's work.

---

## SUPERSEDED — the eight-configuration table, kept for its numbers — 20 Aug 2026

**This entry replaces two CLOSED ones below it.** Both were marked closed by the
round that made the change, against this file's own rule — *"Delete an entry
when a capture proves it gone, not when a change is made"* — and the round's own
message says the after-set had not finished. One of the two claims is false on
the tree it shipped, and `tools/factionread.mjs` says so out loud on every run:

```
node tools/factionread.mjs   @ origin/factionland3 (cc4008e), twice, identical
  FAIL 1.2 DISTINCT  worst ΔC 6.47 (ΔE 7.56) — huscarl|Polished Steel|No Cloak|0: norse vs pict
  FAIL 1.3 PEOPLE    worst norse/huscarl/Polished Steel/No Cloak at 160° — -53.74° NEARER THE PICT
  FAIL 5.3 NO NEAR-NEUTRAL ON THE ARC  1 of 196: norse Crimson Warplate wrap #a08177, C* 14.3
```

The same file on `origin/factionland2`: **PASS 1.2 at 17.88, PASS 1.3 at
+3.47°.** The §1 code is byte-identical between the two trees. One instrument,
one bar, two `characters.ts`. And §5.3 was added by the last commit of that
branch, on a tree that fails it.

`docs/FACTIONS.md` §10.3 asserts *"After the cap all four peoples read correctly
with and without cloak and board"*. It does not reproduce.

### THE TRADE, AND IT IS STRUCTURAL RATHER THAN A TUNING MISS

`factionread` §1's signature is the warrior's **area-weighted mean albedo,
averaged in LINEAR light**. `FACTIONS.md` §2 gives the Danelaw *"more metal,
darker wools"*, and `norse.metal` implements it with `bias 1.16` over a floor of
`lo 0.24` — so his byrnie is deliberately the brightest surface on him, and in a
linear mean the brightest surface is most of the answer. **The Danelaw's byrnie
IS his identity vote on this ruler**, and every other surface he owns is a
rounding error beside it.

That collides head-on with the owner's defect. Both ends are measured, by me, on
this box:

* **A byrnie the vat still holds is PINK.** `origin/factionland2`, production
  build, settled `fightcard` captures of the Danelaw huscarl in Polished Steel,
  graded with `tools/lib/roseband.mjs` over the man's own pixels, against the
  SAME man in the SAME kit sworn to nobody on the same mark:

  | bearing | sworn | modal | unsworn | modal | delta |
  |---|---|---|---|---|---|
  | 0° | **1.574 %** | `#f87868` | 0.202 % | `#c89090` | **+1.373, 7.8x** |
  | 90° | **2.964 %** | `#f88070` | 0.281 % | `#a05838` | **+2.683, 10.5x** |

  `#f87868` is salmon. §5.3's premise — a warm near-neutral on the arc is a
  surface the bonfire finishes dyeing — is confirmed on a frame, not relayed.
  **I did not capture the 180° pair on that tree**; the run was stopped to free
  the box for the after-set, and a number I did not see printed is not reported.

  The same three, on THIS tree, same build path, same lens, same control:

  | bearing | sworn | modal | unsworn | modal | delta | vs the tree above |
  |---|---|---|---|---|---|---|
  | 0° | 0.584 % | `#a07060` | 0.193 % | `#c88880` | +0.391, 3.0x | **1.574 → 0.584, −63 %** |
  | 90° | 0.362 % | `#886860` | 0.264 % | `#a05838` | **+0.097, 1.4x — inside the noise floor** | **2.964 → 0.362, −88 %** |
  | 180° | 1.147 % | `#b08070` | 0.460 % | `#886068` | +0.687, 2.5x | not measured on that tree |

  The profile is the bearing the owner's rose was reported at, and at the
  profile the Danelaw is now within `vatprobe`'s own measured noise of the man
  who swore to nobody. The modal colour goes salmon → dark warm grey at every
  bearing. **It is not zero**: the front and the back still read 2.5-3x the
  matched floor, and that residue is the bonfire on the brightest mail on the
  roster, which is the standing reading below and is `norse.metal.bias`'s to
  answer, not a fixer's.

  And on **Crimson Warplate**, 130 gold — the finish an adversary found the
  previous round's new rose byrnie on, `#9c6d6b`, 1.5° off the garnet — on THIS
  tree, against the same man in the same 130-gold kit sworn to nobody:

  | bearing | `cc4008e` sworn | over its floor | THIS sworn | over its floor |
  |---|---|---|---|---|
  | 0° | 1.387 % `#d89880` | +0.574 | 0.690 % `#d88868` | **−0.164 — BELOW its own floor** |
  | 90° | 2.603 % `#b86060` | +1.463 | 1.212 % `#d89070` | **+0.080 — noise** |
  | 180° | 3.148 % `#c86868` | **+2.177, 3.2x** | 1.088 % `#e8b098` | **+0.058 — noise** |

  Both trees' floors are their own unsworn man in the same 130-gold kit, and he
  reads 0.81-1.14 % rose with no livery on him at all, because the shop sells
  him madder trousers and `FINISH_KIT`'s own "pale rose-grey" leg wraps. That is
  what a matched floor is for and why a single global bar could not have graded
  this finish at all. **At the back — the worst bearing, and the one the round
  before last's after-set did not contain — the previous tree put its Dane 3.2x
  over his own floor and this one puts him inside the noise.**

* **A byrnie the vat has let go of reads PICT.** Bare steel is cool, woad is
  cool, and the byrnie is most of the man. Every configuration that clears the
  band fails §1.2 and §1.3, and every configuration that passes §1 puts the
  Danelaw back in the band.

### THE EIGHT CONFIGURATIONS, ALL RUN THROUGH THE SHIPPED `factionread`

`rose` and `near` are `tools/lib/roseband.mjs` over the 196 dyed surfaces of the
four peoples: members of the band, and surfaces PALE and ON the arc but under
its C\* 14.8 floor, which is the region §5.3 gates and the fire lights up.
`mail`/`kit` are the worst finish pair's ΔE, byrnie-only and over the six dyed
surfaces, on the Danelaw.

| # | what the vat lets go TO | §1.2 | §1.3 | rose | near | norse mail | norse kit |
|---|---|---|---|---|---|---|---|
| 1 | nothing — no fade (`factionland2`) | **17.88** | **+3.47°** | 10 | 3 | 0.52 | 5.58 |
| 2 | grey, along the cone (`7aa306d`) | **11.04** | **+3.47°** | 0 | 19 | 0.00 | 2.55 |
| 3 | the surface, capped isotropically (`factionland3`) | 6.47 | −53.74° | 1 | 1 | 1.92 | 2.79 |
| 4 | the surface, uncapped | 6.47 | −59.48° | 1 | 0 | 2.02 | 5.44 |
| 5 | 4 + the vat's load never cancelled | 7.59 | −57.02° | 1 | 0 | 2.02 | 5.44 |
| 6 | 5 + norse cloth/leather floors lifted | 9.16 | −44.56° | 0 | 0 | — | 4.04 |
| 7 | 4 + a soft floor under every value band | 5.87 | −77.60° | 0 | 0 | **13.78** | **7.59** |
| 8 | **the surface, capped ACROSS the vat's hue (this tree)** | 5.97 | −65.38° | **0** | **0** | 1.53 | 4.26 |
| 9 | 8 + `norse.wrap` `[0.10,0.14]`, `norse.linen` `[0.05,0.12]` | **7.36** | **−24.56°** | 1 | 0 | 1.92 | — |

Rows 1 and 2 are the only green §1 in the table and both are RED on the owner's
defect — row 1 is the frames above, row 2 puts nineteen surfaces in the region
the fire dyes. Rows 3–8 are green on the defect and red on §1. **There is no
setting of this vat that is green on both.**

The knob is continuous and it is `ROSE_FADE`. On row 8's shape, holding
everything else, run three times through the shipped `factionread`:

| `ROSE_FADE` | §1.2 | §1.3 | Crimson Warplate leg wraps |
|---|---|---|---|
| 0.06 | 6.47 | −53.74° | `#a47f71` C\* 17.9 — **in the band** |
| 0.05 | 6.39 | −57.11° | `#a28173` C\* 16.3 — **in the band** |
| 0.04 (ships) | 5.97 | −65.38° | `#a18375` C\* 15.1 — clear |

**More dye left on the byrnie is more identity and more pink, point for point.**
The anisotropic cap itself changes §1 by nothing at all — row 8 at 0.06 reads
exactly row 3's 6.47 / −53.74°, because the surfaces it stops bleaching are the
ones whose own hue is already the Danelaw's, and those never voted against him.
What it buys is the band and the ladder.

### ROW 9 IS THE LEAD, AND IT IS THE ONE THIS ROUND DID NOT FINISH

Row 9 is the only configuration in the table that is green on the owner's
surfaces AND materially better than `factionland3` on BOTH §1 readings — §1.2
6.47 → 7.36 and §1.3 −53.74° → **−24.56°**, which is half the remaining gap. It
gets there by taking the Danelaw's **linen and leg-wrap value bands down to
where his own field lives**, so those two large, pale surfaces come out dark
madder instead of being let go to flax and greige — and the vote they carry is
the vote the byrnie stopped carrying. It is `FACTIONS.md` §2's "darker wools"
taken literally, and §10.3's own diagnosis pointed straight at it: *"every one
of the four vats is allowed to lift a surface far above its own field's
value — the Danelaw's `metal` band tops out at 0.68 and his `linen` at 0.50 —
and on the red arc that is what makes a Viking pink."* The round that wrote that
sentence built a fade instead of following it.

What stops it shipping today is one surface: Sea Queen's Gift leg wraps come out
`#7f5a61`, L\* 42.3, C\* 16.5, 19.4° off the garnet — inside the band, a hair
over its L\* 41 floor. It wants one more tuning pass on the wrap band and a
graded capture set, and it is where the next round should start.

> **This row was nearly mis-reported as row 8's.** The worktree the 7.36 /
> −24.56° reading came from also carried these two band edits, left over from an
> experiment that had not been reverted, and the number was written into
> `characters.ts` and `FACTIONS.md` §10.4 as the anisotropic cap's. It was
> caught by diffing the measured tree against the file it was attributed to.
> `docs/PROCESS.md` R8 — the failure this round is here to stop, committed by
> this round, and corrected in the same session.

### AND §1.1 IS THE SAME MAN A THIRD TIME

On this tree §1.1 SWORN also goes red, at **2.30 against a bar of 2.3** — a
floating-point hair, on `huscarl|Polished Steel|No Cloak|0 -> norse`, which is
the same loadout §1.2 and §1.3 both name. Three readings, one man, one cause:
his byrnie. Swearing to the Danelaw barely moves a man in Polished Steel any
more, because what the vat used to do to that byrnie was the move.

### WHAT IS ACTUALLY BLOCKED, AND WHOSE CALL IT IS

Not a fixer's. Three of the four numbers involved are the owner's design:

* `norse.metal.bias 1.16` and `lo 0.24` — *"near-white steel over the darkest
  wools"*. This is what makes the byrnie dominate a linear mean. Row 7 shows
  what softening the floor buys — **every mail ladder in the shop repaired at
  once**, saxon 0.00 → 5.17, norse 0.52 → 13.78, briton 0.34 → 4.77, pict 2.47 →
  5.94 — and what it costs: §1.3 −77.60°.
* the arena's **bonfire**, which is what turns a warm near-neutral pink and is
  `R11` stage 4's neighbour rather than its subject. Not to be relit to fix a
  material.
* `FACTIONS.md` §2's *"more metal, darker wools"* itself. A Danelaw whose
  identity lived in his WOOL instead of his mail would have neither problem, and
  that is a design change and not a constant.

### WHAT A LATER ROUND MUST NOT RE-DERIVE

* **A vat's `sat` is not the lever.** Four briefs said it was. Emptying three
  vats made the rose worse; see the entry below.
* **`ROSE_LIT` 0.44 is bounded on both sides by the shop's own leg wraps** —
  Rough Iron's land at 0.4366 and must stay russet, Crimson Warplate's at 0.5510
  and must let go. That gap of 0.114 is what fixes `ROSE_FADE` at 0.04.
* **The cap on what a vat hands back must be ANISOTROPIC.** Capping the
  magnitude turned Crimson Warplate's blood-red byrnie `0x7a2f2a` into `#9c6d6b`
  — 1.5° off the garnet, L\* 50.8, C\* 20.3 — which is the only band member the
  previous tree had left, on a 130-gold finish, and which `roseband`'s own
  `MUST_CLEAR` list carries as a surface that ships CORRECT. What threatens a
  people is chroma pulling AWAY from its field; chroma pointing AT it never can.
* **§1's failing man has no cloak and no shield, and §1 removes his board by
  its own documented deferral.** That is the conservative reading and it is
  still the gate. A huscarl in play carries a flat garnet board.

---

## OPEN — the brightness ceiling bounds ONE channel and not the distance between three, and the Saxon's leg wraps are where it shows — 20 Aug 2026

Reported off a capture: the Saxon's leg wraps render **`#fdd701`** — L\* 86.8,
C\* 86.9, **blue channel at 1** — with 558 clipped pixels on the man at the back
bearing and 540 in profile. Highlighter yellow, not weld.

**It is a material and it is measurable in albedo, and here it is.** The rule
`characters.ts` enforces is *"a livery may not make a thing brighter in any one
CHANNEL than the brightest thing of that kind the shop already sells"*, and
`underMaxChannel` implements it by scaling the colour down in linear light —
which divides all three channels by the same number and therefore **moves
neither the hue nor the saturation, only the exposure**. That sentence is in the
code as a virtue. It is also the hole: a colour twice as saturated at the same
peak passes the ceiling untouched.

The shop's own brightest kit surface, which is what sets the bar:

| | rgb | max | min | **spread** | C\* |
|---|---|---|---|---|---|
| `0xd2bd7c` Bretwalda Gold leg wraps, UNSWORN | 210, 189, 124 | 210 | 124 | **86** | 35.6 |
| saxon, Bretwalda Gold | 210, 187, **38** | 210 | 38 | **172 — 2.0x** | **71.2** |
| saxon, Bronze Scales | 210, 183, **60** | 210 | 60 | **150 — 1.7x** | 62.9 |
| saxon, Rough Iron | 210, 187, **70** | 210 | 70 | **140 — 1.6x** | 60.2 |
| saxon, Crimson Warplate | 210, 187, 94 | 210 | 94 | 116 — 1.3x | 49.5 |

Every one of them is AT the ceiling on its top channel and none of them is
anywhere near it on its bottom one. Put a warm key on that and the two high
channels go to full scale while the low one is crushed: `#fdd701` is
`(253, 215, 1)`, which is `(210, 187, 70)` with the top two saturated and the
bottom one gone. **A channel at full scale has no fold shading, no weave and no
form left in it — and so has a channel at 1.** The shop's own wrap keeps 124 of
blue and therefore keeps its folds.

### WHY IT IS NOT FIXED HERE

The bound that closes it is a second ceiling on the same table — no wider a
spread between a livery's brightest and darkest channel than the shop's own
brightest surface of that kind has — and it is one line beside
`underMaxChannel`. What stops it this round is scope, stated rather than
skipped: it moves the **Saxon, the Briton and the Pict**, all three of which are
byte-identical across everything above, and every reading in this file and in
`FACTIONS.md` §10.4 would have to be re-taken behind it — §1's whole sweep, §5's
ladder, and §6's clip counter, which is the only instrument that can say whether
the new bound actually buys the folds back. That is a round's work and it is a
round that starts with `factionread`'s §6 sweeping the shop, which it now does.

**Inherited, not this round's.** Byte-identical on `factionland2`, on
`factionland3` and here — `factionWorn` never reaches a surface off the red arc,
so no fade this branch shipped can have touched a Saxon.

---

## OPEN — the Danelaw's shield board renders `#a7043d` and the material is `--garnet` exactly — 20 Aug 2026

Reported off a capture: the board reads **`#a7043d`, C\* 61.8** — hot magenta.

**The albedo is not the defect and that is the whole entry.** `shieldBoard`
returns `wornField(FACTION_FIELD.norse)`, and for the Danelaw that resolves to
`#7c1420` **unchanged** — L\* 26.4, C\* 48.7, hue 26.5° — because `wornField`'s
cloak ceiling does not bite on a colour that dark. `#7c1420` is `--garnet` in
`globals.css`, it is what `factionMap/territories.ts` paints the island with,
and `characters.ts` says in as many words that it *"is NOT changed and must not
be"* — the whole point of the feature is that the map and the man are the same
four colours.

So the 124 → 167 on red, 20 → 4 on green and 32 → 61 on blue happen downstream
of every material this stage owns. `--garnet` is the most saturated dark colour
in the game: 1.84 points of chroma for every point of value, which is the ratio
`tools/lib/roseband.mjs` takes its own ceiling from. A grade that meters each
frame and stretches contrast about that frame's own pivot — `adaptBand` in
`postfx.ts`, which `src/app/shot/page.tsx` already warns about in its own header
— has the least headroom exactly there, and green is the channel with the least
of it.

**`docs/PROCESS.md` R11 stage 4 is materials and shadows, and cuts both ways: a
material must not be fixed by relighting the scene, and a grade must not be
fixed by repainting a kingdom.** What this needs is a reading of `postfx.ts`
against the four fields, which is a different stage and a different file. The
number is here so a later round can tell a regression from the standing state.

---

## REOPENED (was CLOSED without a capture) — the Danelaw's rose, fourth round: the vat was BLEACHING the steel — 20 Aug 2026

> **The diagnosis in this entry is correct and stands. The verdict does not.** It
> was marked CLOSED on the day the change was made, and the round's own message
> says the after-set had not finished; the tree it closed on FAILS `factionread`
> §1.2, §1.3 and §5.3, and §5.3 is the gate the same round added. The entry
> above carries the readings. Keep the mechanism, drop the word CLOSED.

The entry below this one closed the same defect on 20 Aug and left a residue it
called inseparable: *"the residue is the fire on bright iron... The next round
that wants it green must argue about the BONFIRE or about `norse.metal.bias`,
and both of those are the owner's decisions and not a fixer's."*

**That was wrong and it cost a round.** The full write-up is `docs/FACTIONS.md`
§10.3. What belongs here is the part a later round needs.

### The mechanism was right and the question about it was wrong

§10.2 established that a warm key ADDS on a warm-neutral and CANCELS on a cool
one, then asked why the Danelaw's mail was *neutral* and concluded that being
neutral was inseparable from "more metal". The question it never asked was why
the mail had **stopped being cool**. Every steel in the shop is cool — Rough
Iron `#5f6b7a` is C\* 9.9 at hue 264°, Sea Queen's Gift `#2f4a6a` is C\* 21.7 at
hue 270° — and both came out of the vat near-neutral and aimed at the garnet.

`factionDye` was applying the rose fade to the MAGNITUDE of the chroma sum. That
sum is the surface's own chroma plus the vat's, so scaling it toward zero threw
away the steel's blue along with the dye and left a remnant pointing wherever
`HUE_CONE` had clamped it. **A vat that "lets go" by moving toward grey is not
letting go, it is bleaching**, and a bleached near-neutral on the red arc is
precisely what a bonfire finishes dyeing.

### The two sentences worth keeping

**Letting go is a move back to the SURFACE, not a move toward GREY.**

**And what it lets go to is the surface UNDYED, not the surface.** Letting go all
the way hands the whole identity vote back to whatever the man bought: uncapped,
a cloakless Dane in Bronze Scales or Bretwalda Gold read SAXON and one in Sea
Queen's Gift read PICT. The cap is `UNDYED_SAT`, off the shipped linen shirt.

### What a later round must not re-derive

* **A vat's `sat` is not the lever.** Three briefs said it was. §10.2 proved it
  by emptying three vats and making the rose worse.
* **`ROSE_LIT` 0.44 and `ROSE_TAPER` 0.04 are load-bearing** and the captures
  that fixed them are in §10.2. Do not move them for this defect.
* **The cloak and the board never enter the vat.** `cloakFor` and `shieldBoard`
  both return `wornField(field)`, so a huscarl's identity survives things a
  berserker's does not. Shoot a cloakless berserker before believing an
  identity number.
* **§5.3 is the cheap gate and it is the one that was missing.** No vat may
  leave a surface pale, under the rose band's own C\* 14.8 floor, and on the
  garnet's arc. Thirteen surfaces were in that region on the tree §10.2 shipped
  and all thirteen were the Danelaw's byrnies, leg wraps and sleeves.

### The blindness this round actually closed

`factionread` §7 grades a GRADED render and that is the right instrument for a
verdict, but it costs most of an hour and three rounds of this defect were spent
paying it. §5.3 answers the same question in albedo, in a second, with no
browser, because the failure has an albedo signature: **a near-neutral pointed at
the red arc.** The band could not see it — the band is *required* to clear
anything under its own chroma floor, and its floor is an albedo number in a lit
scene. §5.3 gates exactly the region the band must clear and the fire then
lights up.

---

## REOPENED (was CLOSED without a capture) — the Danelaw read ROSE at the sleeves and the byrnie — 20 Aug 2026

> **The albedo half of this is genuinely gone** — the owner's `#b9746a` sleeve
> resolves to `#a89c86`, undyed flax, and no dyed surface of any people is in
> the band. What is not gone is what the entry's own last section already says
> is left, and it now has a matched frame behind it rather than a reading of
> one man: see the top of this file.

The owner, off his own capture: *"THE DANELAW READS ROSE AT THE SLEEVES AND THE
BYRNIE"*, `#b9746a`, and *"A Viking in dusty pink is not the Danelaw at any
delta-E."*

**Fixed, and the whole write-up is `docs/FACTIONS.md` §10.2.** What belongs here
is the part the next round needs and would otherwise re-derive.

### Why it survived a green 15/15 and then a green 21/21

`tools/factionread.mjs` gates ΔC — how far the four peoples are APART. Rose is a
long way from weld, from moss and from woad, so a pink Dane clears §1
comfortably, and did, twice. **The question that gate cannot ask is whether the
Dane is the RIGHT colour, and the right colour is not a distance from anybody
else — it is a place on the wheel.** The file also carried this on its own
verdict line the whole time: *"§0-§5 have no light and no grade — albedo only;
§6 is the only lit section and it measures CLIPPING, not colour."* That is
`PROCESS.md` failure mode 2 — a harness that knows what it cannot see, prints
it, and goes green anyway — and the cost was two rounds.

### Two rounds moved the wrong constant, and the lever is what proved it

Round one took the `-0.024` hue shift out of the `norse` livery. Round two took
`metal.sat` from 0.18 to 0.07. The brief for round three said to look at the
`wrap` and `metal` vats. **`wrap`, `metal` AND `linen` were set to `sat: 0.00`
— no dyestuff in any of the three — and the rose count DOUBLED, 3 dyed surfaces
to 6. Emptying a vat leaves the surface's own chroma as all there is, and
`HUE_CONE` turns that onto the garnet at exactly the weak magnitude that reads
pink. The sleeve leaves the band only by going greige at `#a78a86`, which is the
vat doing nothing.** A vat's `sat` is not the lever
and three briefs in a row said it was. `PROCESS.md` R1 is the only reason that
took twenty minutes instead of a round.

### The one sentence to keep

Red is the only arc on the circle whose pale form has a name of its own. Pale
woad is pale blue, pale moss is pale green, pale weld is pale yellow — the word
survives the value. **Pale garnet is pink.** `--garnet` is a dark stone at L\*
26.4, and every vat is free to lift a surface far above its own field's value;
for the other three that is right and free, and on the red arc it makes a
Viking pink. So above `ROSE_LIT` the vat lets go.

### What now exists that did not

* `tools/lib/roseband.mjs` — the band, with every bound taken off a colour this
  game already ships, and a `calibrate()` that runs on every use and must flag
  the five reported roses while clearing ten shipped-correct surfaces.
* `factionread` §7 — the gate, on graded captures, over the warrior's own mask,
  barred by the worst frame of a people **not** on the red arc.
* `tools/roselook.mjs` — the same band over a directory of PNGs in a second.

### WHAT IS LEFT IS THE BONFIRE, AND §7.1 IS RED ABOUT IT

The material is exhausted. The Danelaw's byrnie is `#898384` in albedo — C\* 2,
which is bare iron — and his sleeves `#9b9695`, C\* 2, which is undyed flax.
There is no dye left on either to take away.

They still read warm on the screen, and this is the measurement that says why.
Same pixel, same frame, huscarl at 180°:

| | albedo | rendered |
|---|---|---|
| unsworn byrnie | C\* 9.9, **cool** blue, L\* 44.7 | C\* 6.5 |
| Danelaw byrnie | C\* 2, neutral, L\* 55.1 | C\* 15.6–17.4 |

Two things are doing it and neither is a dye. **The arena's key light is a
bonfire**, so a warm light on a neutral surface adds while the same light on a
cool one cancels — and **the Danelaw's mail is deliberately the brightest on the
roster** (`metal.bias` 1.16, band `lo` 0.24), because "near-white steel over the
darkest wools" is what `FACTIONS.md` §2 says the Danelaw *is*. A brighter
surface returns more of the key, so it returns more of the key's colour.

**AND THE CLASS SPLIT PROVES IT.** Share of the frame in the band, Danelaw,
after the fix, against the unsworn floor of 0.162–0.273%:

| class | byrnie? | @0° | @90° | @180° |
|---|---|---|---|---|
| huscarl | yes | 0.631% | 0.878% | **1.706%** |
| warden | yes | 1.168% | 0.431% | 1.026% |
| runekeeper | **no** | 0.160% | 0.151% | 0.139% |
| berserker | **no** | 0.107% | 0.090% | 0.087% |

The two classes that wear no mail are **at or below the unsworn man**. The
livery adds nothing to the band on a man without a byrnie. Every point of the
excess is on the two classes that have one, and their mail is neutral in albedo.

So the residue is the fire on bright iron, and it is inseparable from the
identity. Removing it means either darkening the byrnie — undoing "more metal" —
or relighting the scene, and `PROCESS.md` R11 stage 4 is explicit that a
material is not fixed at stage 6.

**`factionread` §7.1 is therefore RED and should be**, at roughly 1.7% of the
frame against an unsworn floor of 0.16–0.28%. `docs/GATES.md`: *"a red gate with
a written defect behind it is the correct state"*. What it is red about has
changed completely — it is no longer a pink Viking, it is a warm-lit one — and
the frames beside it show the difference. The next round that wants it green
must argue about the **bonfire** or about **`norse.metal.bias`**, and both of
those are the owner's decisions and not a fixer's.

### AND THE BAND'S CHROMA FLOOR IS AN ALBEDO NUMBER IN A LIT SPACE

`tools/lib/roseband.mjs` takes C\* 14.8 off `0xc2b69c`, the undyed linen shirt.
That is measured with no light on it. Every lit near-neutral in this scene sits
above it, which is why §7 needs the unsworn control at all and why
`tools/roselook.mjs` refuses to be a gate. The band is right about which pixels
are *pale and on the red arc*; it is not, and does not claim to be, a statement
that those pixels were dyed.

---

## THE JANK ROUNDS, LANDED — 19 Aug 2026

Five rounds ran on the owner's *"the game currently feels visually buggy /
laggy / jolty / jumpy when playing"*. This is the round that merged them onto
`main` and stopped cleanly on the parts that are not finished. What is written
here is the record the next round needs so that it does not re-derive any of it.

### R9 — the whole battery on the final build, and main's own gates after the merge

`node tools/janktest.mjs --secs=25`, every phase, on the merged and fixed tree:

```
  SERVER PACING     CLEAN — snapshot interval p99 51.50 ms, worst 54.72 against a 50 ms target
  WIRE EPOCH        COUNTS PACKETS — 501 advances against 501 snapshots under
                    flourishes, +0 phantom; control 1, inside the tightened +/-2
  THE MOTIONLESS MAN  12 holds, drift p50 0.01 m, worst 0.17 m, over 0.25 m: 0 (0.0%)
  EXTRAPOLATION     6.9% of warrior-frames, ahead p50 23.6 ms, worst 108.0 (cap 220)
  BUFFER STALLS     31 warrior-frames (0.3%)
  BUFFER RESETS     7 total, 7 a real respawn, 0 unexplained
  BUFFER            74.72 ms fixed + 24.91 measured jitter = 99.62 vs arrival p99 83.70
                    -> the buffer covers the jitter
  DECOMPOSITION     2.11% at 60 Hz = 1.09 interval + 1.54 wire, CLIENT -0.52
```

**`main`'s own work still passes after the merge**, which is the thing a merge can
break and nothing else here would have caught: `freezetest` green — a calm man's
crown travels 24.3 mm in half a second against a walking man's 136.1, which is
the fix `main` landed and this branch's `anim.ts` changes sit beside;
`deathcamtest` **43/43**.

`spectatetest` reads **12/14**, and **a clean `origin/main` worktree reads 12/14
with the same two failures** — the control was taken rather than assumed. Both
failures name this box in their own text: the run rendered at **1.14 fps** here
and **1.17 fps** on `main`, so the death camera's 3.35 s hold spanned 58.6 s
(57.1 s on `main`) of wall clock and never released inside the round, leaving no
spectate frame with a living man to measure against. Pre-existing and
rasteriser-bound; not a merge regression.

### THE BLOB — the solver was applying HALF of every answer it worked out

Four rounds tuned the spawn fan and the de-overlap easing and could not make
number-across-number go away. The reason was three lines under a comment warning
against exactly it.

**The defect, and it is arithmetic.** `hud3d.ts`, the damage-number layout pass.
`n.sy` is projected from `n.mesh.position`, which the integrate pass has ALREADY
offset by last frame's `n.push` — deliberately, and the comment there says why.
So `settle(...) - n.sy` is a **delta**: what is still needed on top of the offset
the number is already holding. `n.push` is the **offset itself**. The line read

```
  n.push += (want - n.push) * ease(dt, want - n.push, n.hy);
  n.sy   += n.push;
```

which drives `n.push` toward `want` as if `want` were the absolute answer. Solve
its fixed point: it stops moving when `want === n.push`, and `want` is
(total needed − already applied), so **it comes to rest at exactly half the
clearance it asked for**. Every damage number in the game settled half-way out of
every collision it solved. The second line is the same confusion again, adding
the whole offset to a coordinate that already contained it, so every number
placed afterwards settled against a phantom.

The plates never had this — `plate.sy` is projected from the UN-pushed anchor, so
there the same shape is correct — which is exactly why nameplate-across-nameplate
closed to 0.02% in an earlier round while number-across-number would not move.

**Two smaller things went with it.**

* **The layout box now includes the SPIN.** The line it replaces claimed "a
  quarter radian on a glyph this size moves its corner by well under a hundredth
  of the screen". A damage number is WIDER than it is tall — about 1.26
  half-widths per half-height at `high` — so rolling it by the shipped quarter
  radian grows its axis-aligned box by `|sin| x w` vertically, about **28% of a
  half-height**, against a `PUSH_PAD_Y` that pays for a fifth of it. The solver
  was clearing a box a quarter shorter than the one three.js draws.
* **`LEGIBLE_AT_ONCE = 6`.** `damageNumberBudget` (12/24/48) is a MEMORY budget
  and was doing duty as a legibility one. The frame that opened this round
  carried **fourteen** numbers. The cap is a hard ceiling and it holds — worst
  up-at-once 9/16/12/9 on the baseline against 6/6/6/6 here. **On its own it did
  NOT move the overlap statistic** (a separate 3-run pair, ink >50%: baseline
  12.44/3.91/3.67 against 4.50/12.00/3.17), and that is recorded because the
  next person will otherwise assume it did. It is kept because fourteen floating
  numbers is not a readable screen at any burial threshold.

**And the ruler was reading the wrong threshold.** `hudspace` headlined "more
than HALF buried" for four rounds. Half of a two-glyph number is a WHOLE GLYPH —
by the time that column moves the damage is long done, and both interlocks in the
frame that reopened this were far under it. There is an **INK TOUCHING INK** column
now: any overlap at all, which is what makes two glyphs read as one number. It
can only make every branch look worse, which is the only kind of column worth
adding.

**Measured. `tools/hudspace.mjs --secs=60 --quality=high`, one ruler copied onto
both trees, four runs an arm, ALTERNATING in one window. Baseline is this
branch's own merge commit `14bc361` (= `origin/jank3` + `origin/main`).**

```
                   pair-frames   TOUCHING     >25% buried   >50% buried   worst up-at-once
  baseline  r1        1367        25.46%        12.66%         5.78%             9
            r2        1226        40.62%        26.43%        16.31%            16
            r3        1421        20.06%         6.54%         2.32%            12
            r4        1095        28.31%        16.89%        11.42%             9
  this tree r1        1199         8.76%         1.17%         1.08%             6
            r2        1446        13.28%         4.98%         3.87%             6
            r3        1289        10.63%         1.01%         0.62%             6
            r4        1449         9.59%         0.69%         0.28%             6
  POOLED    base      5109        28.21%        15.17%         8.55%
            this      5383        10.64%         2.02%         1.50%
```

**The arms do not touch on TOUCHING (worst branch run 13.28% against best
baseline run 20.06%) or on >25% (4.98% against 6.54%).** On >50% one pair
overlaps — branch r2 3.87% against baseline r3 2.32% — so the pooled 8.55% ->
1.50% is the claimable figure there and the per-run separation is not.

**Nothing was bought by throwing numbers further from the body.** Furthest number
from the nearest warrior, worst per run: baseline 1.57 / **3.53** / 1.87 / 1.63 m
against 1.83 / 1.79 / 1.80 / 2.23 m here — the branch's worst four are tighter
than the baseline's worst one, and neither arm put a number over 3 m on more than
that single baseline run.

**R5 — fourteen frames of the fixed build, at `high`, read one at a time.**
Last round reported "read h004/h009, clean" about a set that had a "139" printed
straight through a "116" in it, and the ruler had silently dropped ten of
fourteen screenshots. Both are fixed: `hudspace` prints every lost frame and
exits non-zero, and this run wrote **14 of 14**.

* BEFORE, on the merge commit, `h006.png`: "92" and "72" with their strokes
  crossing at (110-178, 282-325), and "66" with a third number reading as one
  impossible "667" at (195-247, 358-388) — **fourteen** numbers alive in one
  frame. The owner's "337" verbatim.
* AFTER, all fourteen: **not one pair of damage numbers printed through each
  other.** `h009` carries "28 / 74 / 60 / 106 / 32" and eight nameplates; `h013`
  seven nameplates and "41 / 21 / 8"; `h012` five plates and "108 / 63 / 9x";
  `h004` "12 / 23 / 107 / 80". Every one legible.

### OPEN — two nameplates ABUT sideways and read as one run-on name

Seen by eye in `h009` of that same set, and it is a new finding rather than a
regression: **"Godwine the Ste." and "Leofgar the Wary" sit at the same height
with their glyphs touching**, so they read as `Godwine the Ste.Leofgar the Wary`.
Their health bars below are plainly separate.

The mechanism is in `settle`: it moves along **y only**, and only acts when two
boxes overlap in x AND y. Two plates side by side at the same height do not
overlap — they touch — so nothing fires. `PUSH_PAD_X` is **0.004 NDC**, about
three pixels at 720p, which is the whole of the horizontal margin between two
names. This is the `name/name` INK TOUCHING column, 1.73-3.78% of pair-frames on
both arms of the battery above.

**Not fixed here, and the reason is that the obvious fix has a cost nobody has
measured.** Widening `PUSH_PAD_X` for names makes more plates count as colliding,
which pushes more of them vertically, which drives more of them into the
compaction branch and then into `COMPACT_MAX_PUSH` — where a plate is hidden
outright (see the disclosure below). That is a trade between two kinds of lost
information and it wants its own measurement, not a constant nudged at the end
of a landing round.

### OPEN — damage numbers are drawn BEHIND warriors, on a layer meant to prevent it

Also seen by eye: `h007` has a "2x" more than half behind a cloak, `h003` a "2x"
behind a shield boss, `h000` a "10x" behind a helmet. A damage number is put on
`LAYER_UNOCCLUDED` precisely so this cannot happen, so either that layer is not
doing what its name says for these meshes or the numbers are being sorted behind
them. **Nothing in this repository measures it** — `hudspace` reads rectangles
and cannot see what is in front of what — so there is no figure to put here, only
three frames.

### STOP CHASING THE JOLT. Here is the arithmetic that ends it — CLOSED AS A CHASE

Three rounds aimed at one figure: *"the unexplained share of DRAWN 60 Hz samples
changing speed by more than 8x the median"*, about 2.4%. It is three things added
together and only one of them is the client's.

`tools/janktest.mjs` §3 runs the identical test on three tracks and now prints
the subtraction. Six runs on this branch, `--phases=motion --secs=25`, three with
the jitter term and three with `--lever=1.5` (which reproduces the delay
expression `origin/main` and `jank2` ship):

```
                       DRAWN 60 Hz   = differencing interval + wire + CLIENT
  with jitter    r1       2.56%           1.56        1.24       -0.24
                 r2       2.01%           1.04        1.49       -0.52
                 r3       1.87%           1.38        0.40       +0.09
  without        r1       1.63%           0.75        0.53       +0.35
                 r2       1.74%           0.81        0.99       -0.06
                 r3       2.17%           1.20        0.91       +0.06
```

**The client's share is within half a point of ZERO in all six runs, and
negative in three.** The drawn track, decimated to the 20 Hz it was handed, is no
rougher than the wire it was asked to draw. Most of the headline is the
DIFFERENCING INTERVAL — differencing at 60 Hz instead of 20 Hz, which is a
property of the statistic and not of the screen — and the rest was asked for by
the server.

**And the figure does not move with the treatment.** 2.56 / 2.01 / 1.87 with the
jitter term against 1.63 / 1.74 / 2.17 without it, on ONE binary: fully
overlapping, the treated arm no better. Any future claim of the form "this change
reduced the jolt figure" needs a paired lever and non-overlapping arms, and this
figure has never produced them for anybody.

**Two rulers that manufactured the appearance of progress are fixed** (commit
`3bca635`): the wire CONTROL was normalised by the man's median DRAWN speed, so
it moved with any treatment — an exogenous column normalised by the wire's own
median is printed beside it now; and the verdict line asserted "THE JOLT IS
FRAME PACING, and no change to `anim.ts` can move it" off a comparison of the
same positions on two clocks, which is circular and now says so in its own
output.

### The jitter-sized buffer PAYS, but not for the reason it was landed for — KEPT

`anim.ts:JITTER_DELAY_PACKETS` adds `min(netJit, 0.5 x netInterval)` to a remote
man's render delay. It was landed as a jolt fix and **that claim is withdrawn** —
see above, the jolt figure does not move.

It was re-tested on a **non-circular** measure against a **same-binary** lever:
remote EXTRAPOLATION, the share of warrior-frames where render time ran past the
newest snapshot and the client had to invent a position from velocity. Three runs
a side, one build, `--lever=1.5` reproducing the old expression:

```
                        extrapolation   buffer stalls   render delay   floor: motionless-man drift
  + jitter term          10.2  10.6  9.6    0.3 0.3 0.2%    99.5 ms     p50 0.01 0.01 0.01, over 0.25 m 0/0/0
  flat 1.5 x interval    17.8  14.2 13.5    0.2 0.1 0.2%    74.5 ms     p50 0.01 0.01 0.02, over 0.25 m 0/0/0
```

**The arms do not overlap: every run with the term is below every run without
it.** Invented motion is cut by about a third. The cost is stated: **25 ms of
extra render delay for a REMOTE man**, and a tenth of a point of buffer stalls.

**The floor cost claimed last round does NOT reproduce.** That round reported the
motionless-man median moving 0.00-0.01 -> 0.05-0.06 m and called it "the 25 ms
arriving where arithmetic says it should". On a paired same-binary lever the
median is **0.01 m on both arms** and neither arm puts a single hold over 0.25 m.
An adversary said this was run variance and he was right.

So it stays, with the claim rewritten to what was actually shown.

### `playtest`'s input-rate check is LOAD-SENSITIVE, and the branch does not drop it — SETTLED

The accusation: `jank2` read `[playtest] 36/37 controls working` twice, a
different check each time, while `jank` and `main` read 37/37. Those controls
were taken at a **different machine load**, so they were never a comparison.

Settled properly. This branch and a clean `origin/main` worktree, both freshly
built, run **alternately in one window**, three runs each. Every run, verbatim:

```
  18:57 UTC  jankland  37/37 controls working    input 63 msgs/sec
  19:01      main      37/37                     input 62
  19:05      jankland  37/37                     input 63
  19:09      main      37/37                     input 61
  19:13      jankland  37/37                     input 62
  19:17      main      37/37                     input 63
```

Six runs, six greens, no `FAIL` line anywhere, and the input rate sits inside
61-63 on both arms with the branch on the high side of it. **The 36/37 is not
reproduced and there is nothing here to attribute to the branch.**

**And the check that would fail first is a wall-clock rate.** `tools/playtest.mjs`
counts input messages over one real second and fails under 45; on a box with no
GPU that is a reading of the render loop, and the render loop's rate moves with
whatever else is on the machine. While these runs were being taken this box was
carrying **four stale `node custom-server.mjs` processes** from earlier sessions
on four cores, load average 2.8 — which is exactly the kind of thing one run
against a remembered control cannot see. The check now says LOAD-SENSITIVE in
its own output, and says that one low reading is a reading about the box.

**R10 — the brief and the tree disagree.** The brief said this entry was already
in this file. It was not; `grep 36/37 docs/` was empty on every jank branch. It
is here now.

**And the named suspect does not exist.** The brief named "the per-frame
four-corner quad projection `hud3d.ts` gained". `hud3d.ts` has **three**
`.project()` call sites in total — `:1816` one per plate, `:2050` and `:2134`
one each per damage number — against `main`'s one, and the damage-number
population is now capped at six. The four-corner projection is in
`tools/hudspace.mjs`, which is the RULER and never runs in the game.

### The branch HIDES a plate main would have drawn, and no report said so — DISCLOSED

An adversary found this and was right to call it undisclosed. `hud3d.ts` gained
two `p.group.visible = false` sites `main` does not have:

* `:1881` — a plate in a stack too deep to solve has already given up its NAME
  and been re-placed on its bar alone; if even that needs more than
  `COMPACT_MAX_PUSH` (half the screen), the bar is hidden too. The man's name
  AND his health bar are gone, for a warrior who is on screen.
* `:1908` — the edge fade is re-asked after the push, so a plate shoved off the
  top of the frame is hidden. That one is plainly right.

Measured by the adversary at `quality=high`: health bars drawn per frame,
`main` 3.686 against this branch's 3.362. Removing only `main`'s 5.11%
off-screen bars predicts 3.498, so of the order of **4% of ON-SCREEN bars are
additionally gone**. That residual is inside one run's noise and cannot be
sized from it; the code path is not in doubt.

**It is kept, and the argument is in the source at that line**: past
`COMPACT_MAX_PUSH` the only alternative is a bar printed through another bar,
and a bar printed through another bar is not information. But it is a real
choice about what the player is shown, it belongs to the owner, and it should
never have been landed without being written down. It is written down now.

**Damage numbers are NOT culled this way, and the same adversary said so in the
branch's favour**: numbers up at once went 2.30 to 2.14 mean and p95 5 to 4 over
that pair of runs, so the number-overlap win of earlier rounds was not bought by
hiding numbers.

### Left NOT done, on purpose, so nobody reads it as done

* **Not one draw call was removed.** The analysis is real and is costed in
  `docs/BACKLOG.md` — the briefed 614 is the `low` preset, `high` is 4,204 calls
  and 3.4M triangles, warriors are 72-79% of visible meshes at 26-33 MATERIALS
  each, and the merge floor is the material count, 417 -> 229, about **22%** of
  the high tier. R12 stage 6 is refused in writing there, with both easy levers
  named. It is a backlog item with a number on it, not a fix.
* **The two nameplate collisions above are open**, with their frames.
* **`tools/latencytest.mjs input` still does not exist**, so input latency — the
  other half of LAGGY — is measured by nothing in this repository. That is
  already on `janktest`'s verdict line and in `docs/PERFORMANCE.md`; it has not
  moved this round.
* **Worktrees other rounds left behind** are still on disk under
  `.claude/worktrees/` (`adv3-*`, `av-*`, `j3-*`, `hn-*`, `advx-*`). They are not
  this round's to delete, but four stale `node custom-server.mjs` processes from
  them were running on four cores while these measurements started and were
  killed before the decisive ones. Whoever tidies them should also check `ps`.


## OPEN, AND PRE-EXISTING ON `origin/main` — loose hair commas on the bare cheek under an open-faced helm

> **CLOSED 1 Sep 2026, on this entry's own repro.** Shot exactly as the
> adversary specified — `facecard, cls=warden, helm=helm_ridge, hair=hair_short,
> beard=none, turn=-90` — and the cheek between the mouth-corner and the ear is
> clean: `art/shots/commas/`. No isolated fragments, and nothing straddling the
> ear's front rim. What remains in front of the ear is an ATTACHED hairline
> tuft under the helm's rim, which is the thing the cull was always meant to
> keep. The two changes that did it are 5.13's: the `- 0.16` fudge that had the
> ceiling reading an analytic mail surface where the coif draws none, and the
> `HAIR_NAPE_FREE` guard on the cull itself.


15 Aug 2026, round ten. An adversary shot
`/shot?preset=facecard&cls=warden&helm=helm_ridge&hair=hair_short&turn=-90` on
`helm9` and found five isolated dark hair fragments standing on bare cheek skin
between the mouth-corner and the ear, plus a sixth straddling the ear's front
rim. His controls: `hair_shaved + beard_none` removes them, so they are hair;
`hair_short + beard_none` leaves them, so they are not the beard; `helm_none +
hair_short` shows the same coils ATTACHED, as a hairline fringe hanging off the
mass.

**THE FIRST QUESTION NOBODY HAD ASKED IS WHETHER THIS IS ON `origin/main`, AND
IT IS.** Settled before anything else was touched, because it decides whether
nine rounds of work is shipping or is blocked on a regression.

Same build, same preset, same bearing, on a clean `origin/main` worktree at
`b30a79c` and on this branch at `2a5e8f9`, each from its own `npm run build`:

    npm run shots -- facecard --cls warden --helm helm_ridge \
      --hair hair_short --turn -90 --out <dir>

Both frames show the same fragments, in the same places, at the same sizes. In
the cheek window x 300-505 / y 320-430 of the 700x860 capture, dark-hair pixels
on skin group into six islands of >= 25 px on each tree, matching island for
island: 11475 / 943 / 315 / 297 / 197 / 25 px on `main` against 11499 / 946 /
315 / 296 / 199 / 25 px here — 13283 hair pixels against 13315, a difference of
0.2%.

And off the built mesh rather than off the frame. `flanksweep` — horizontal rays
at 1 degree x 1 mm over az 25-130, y 100-190 mm, comparing the `hair_short` build
against the `hair_shaved` build so hair is named by the adversary's own control
rather than by a tint (the brows are drawn in `hairColor`, so the hair tint is
present on a shaved head and a tint split cannot see the hair at all):

| loose island, not joined to the hair mass | `origin/main` | this branch |
|---|---|---|
| az 43-53, y 169-190 | 156 cells | **156 cells** |
| az 100-106, y 151-166 | 73 cells | **73 cells** |
| az 91-109 / 91-106, y 100-147 | 473 cells | **398 cells** |
| **loose cells, total** | **702** | **627** |

Three loose islands on each tree. The two on the cheek are identical cell for
cell. The third — the one at the rear of the window, against the flange — is
SMALLER here by 75 cells, which is round nine's nape clamp reaching the front
edge of its own arc.

**So this is a pre-existing defect that rounds eight and nine failed to fix, not
one they caused. It does not block this branch.** It is fixed below on its own
merits.

---

## CLOSED — the chin reached down and thinned the beard, and the gate that caught it was reported green

13 Aug 2026, round two. This one is about a claim, not a mesh, and the claim was
mine.

`docs/COSMETICS-AUDIT.md` said `beardvolume` was **16/16**. It was **14/16, exit
code 1**, and had been since the commit that said otherwise:

```
huscarl      forked   med 3.9   <-- MEDIAN UNDER 4 mm
warden       forked   med 3.8   <-- MEDIAN UNDER 4 mm
```

Reproducible to the decimal — seed 13 is hardcoded, the ray grid is a fixed
14 x 36, there is no `Math.random` in the path. Not a draw, not a flake.

### How a true number became a false one without being edited

That commit did four things at once and two of them met inside the beard.

* It re-dialled the **Close Crop** and the **Ringed Braid** against the reading
  and measured 16/16. **That measurement was correct when it was taken.**
* It also widened the chin's **mental pad** — `C_W` and `C_MASK` — to answer
  *"chin is a little pointy"*. That edit is four hunks earlier in the same file
  and `beardvolume` was never run again after it.

**The chin is upstream of the beard and nothing said so.** `beardShell` builds
its inner sheet by displacing the outer one along `faceNormalTrue` at the
JAWLINE latitude — `lat(-0.945)` at the midline, which is on the mental pad's
under-turn. Holding the pad's breadth to the lower border spends the whole
collapse in the last eighth of the field, so the surface turns under harder
there, its normal points more steeply DOWN and less far OUT, and less of the
displacement crosses the wall. The beard thins with no `wall` touched.

Isolated by reverting the two chin curves and nothing else, on the tree AS THE
DEFECT WAS FOUND — before the Forked Beard's own dial moved. The huscarl's
median crossing, in mm:

| | old chin | new chin |
|---|---|---|
| Close Crop | 4.7 | 5.1 |
| Full Beard | 6.0 | 5.6 |
| **Forked Beard** | **4.4** | **3.9** |
| Ringed Braid | 4.2 | 4.5 |

Two gained, two lost. The Forked Beard lost the most **and was the only cut of
the four not re-dialled in that commit — precisely because it had been passing
when the beard work was done.** Every ingredient of this failure is ordinary.

### The chin stays; the dial moves

The chin answers an owner report, `headmeasure` is clean on it, nothing above
215 mm moves. So `forked.wall` goes 0.0058 -> 0.0082, chosen so the reading
lands in the **Full Beard's own band** — 5.2-6.5 mm against 5.3-5.8 — rather
than chosen to clear 4. The fork splits one mass into two tines, so each tine is
half the width of the Full's fall while hanging a quarter further; a tine that
reads as a rope needs the depth the Full has. **The 4 mm bar did not move.**
16/16, exit 0, quoted from a run.

### And the fork itself had never been measured by anything

The second half, and the worse half. `beardvolume` gates on how much beard there
is and has no opinion on its shape, so the one cut whose identity is a
silhouette could lose that silhouette with every number staying green — and
worse than green: **filling the notch in ADDS mass.** Deleting the fork on
purpose and running the old gate takes the crossings sampled from 250-262 to
324-336 and raises three of the four medians. The mass gate would have
applauded it.

`FORK_MM` is the answer: the hem's own azimuth profile, midline against the tine
bearings, read off the built mesh so a hem solve or a skull edit is caught the
same as a flattened `reach`. Unforked cuts read NEGATIVE — −6.5 Close Crop,
−11.3 to −3.1 Full, −12.3 Ringed Braid — so 40 mm is over three times the
furthest an unforked hem wanders on its own. **Shown failing first, twice:** a
flat `reach` reads −12.9 mm, and a `reach` that still has two maxima in the
source with its trough lifted to 0.90 reads 16.4 mm. Both red. The real cut
reads 73.8-74.4 mm.

**Both breaks were re-run independently rather than taken from the report**, and
they reproduce to the decimal: −12.9 mm on all four classes flat, 16.4/16.4/16.7/
16.1 mm with the trough lifted. Note what the mass column does in the second one
— medians 4.9 to 5.6, **every one of them still over the 4 mm bar**. That is the
gate earning its existence: a fork deleted while the mass reads healthy is
exactly the defect no number here could see. The absent-case guard was exercised
too, by taking `forked` out of `BEARD_VALUES`: the run goes to `2/3 rows pass —
WITH THE FORK UNMEASURED` and **exits FAIL**, so retiring the style cannot buy a
clean sheet.

**And running it red found a defect in the verdict line itself.** With the fork
broken and nothing else, the last line of the harness read:

```
12/16 rows pass — INCLUDING the fork, worst notch -12.9 mm against 40
```

"INCLUDING the fork" was unconditional on the style being present, so on the one
run where the fork was the only thing that failed, the sentence a reader takes
the verdict from said the opposite of what happened. The count was right and the
sentence over it was false — this project's signature defect, in the gate written
to stop it. Fixed: the clause now reads `AND THE FORK IS WHAT FAILED` when any
fork row is red. It was only findable by reading the harness's own failing
output, which is the argument for R2 that "shown failing" has to mean *read*
while failing, not merely *seen non-zero*.

### The render, and it says something the numbers did not

`art/shots/r2-forked/`, three-quarter and profile, before and after, shot from
clean trees either side of the change rather than from one run straddling it.

* **The notch is open at three-quarter, in both builds.** Two tines with clear
  sky between them, which is what the 74.1 mm says, and it is why the fork gate
  had to be independent of the mass gate.
* **Neither panel shows the mass change, and the three-quarter barely shows it
  either.** The wall is radial, so it adds beard in DEPTH; the face card sees an
  outline. Measured on the frames rather than described — beard run-length per
  scanline over the mail, x 420-640, y 545-700, 0.82 mm per pixel — the tines
  gained **0.67 px per scanline: +0.55 mm, +1.2%.** A 41% change in the dial is
  a sub-pixel change in the silhouette from every bearing this cut is shot at.

  #### This paragraph said the opposite, and the correction is the point

  Kept visible rather than quietly edited, because it is the same failure the
  round above it was refuted for. The first version of these bullets read:

  > Before, the two tines are flat blades with knife edges. After, each is a
  > rope with a belly and a highlight down it.

  **That is not what the frames show.** They differ by 0.4% of pixels above a
  delta of 8, the difference is concentrated in the tine band, and both builds
  read as flat blades with knife edges — the after tine is marginally broader
  and that is all. The sentence was written from the number that had moved
  (3.9 → 5.3 mm) and not from the two pictures, which is precisely the habit
  `docs/PROCESS.md` R5 exists to stop. A false claim about a render is the same
  defect as a false number and it is committed the same way.

  **And it carries a real lesson, which is why it is worth the space.** The
  render is NOT a check on this cut's mass gate and cannot be made into one:
  `wall` is depth, the face card measures outline, and the two barely meet. What
  the render is a check on here is the FORK and the MATERIAL. Look at those on
  the cards; take the mass from `beardvolume`.
* **The profile is nearly identical before and after, and that is correct** for
  the same reason — side-on, the wall is edge-on to the lens.
* **The growth-line fade was checked and it holds.** It looked at first like a
  pale sawtooth rim had been traded for the hard brown edge. Measured — brightest
  pixel in the transition band against the skin beside it, on all three builds —
  it is 124.5-125.5 against a skin median of 127-138 on every one of them,
  including the build from before the fade existed. The bright streak is a lock
  catching the key light and it is in all three frames.
  `art/shots/r2-forked/growthline-a448-roundone-now.png` stacks them; the edge
  really did soften. **Reported because a defect that was looked for and not
  found is worth as much as one that was.** Re-checked independently in hue as
  well as value, because a luma test cannot see a colour cast: the transition
  band reads hue 22-26°, saturation 79-89%, against skin at hue 21°, saturation
  79% — the same hue as the complexion, which is what the fade was built to do.

### OPEN — the beard reads as carved wood at portrait range

Found by opening the cards and not by any number, and left open rather than
dialled at the end of a round that was about the fork.

`art/shots/r2-forked/after-profile/` and `after-quarter/`, at 3-4x. The beard's
substance is right — it is `M.tinted("hair", …)` at 3 repeats since the wool
was taken out, and that fix holds. But over the doubly-curved chin the lock
pattern closes into **concentric loops**, and at portrait range the chin mass
reads as the end grain of a plank rather than as hanks of hair. The tines make
it worse: they are glossy, hard-edged and taper to points, so they read as two
polished wooden tusks.

Nothing in the repository can see this. `beardvolume` measures depth, the fork
gate measures the hem's outline, and a mesh that reads as timber passes both by
a wide margin — which is the same shape of hole the fork gate was written to
close, one property along.

**The dial to move first is named in the code**: the comment over the beard
material says its `repeat: 3` "is the number that decides whether a beard reads
as a mass with locks in it or as a slab, so it is the one to move first if the
cards say the beard is still flat." The cards do not say flat. They say
**wooden**, and that is a different defect from the one that comment
anticipated — the loops come from the UV compressing over the chin's curvature,
so a repeat change alone may only make the grain finer rather than straighter.
Worth a probe that measures strand DIRECTION coherence over the beard patch
before anything is dialled; this repository has been bitten four times by
fixing hair geometry when the wrong property was being measured.

---

## CLOSED — the death that ends a MATCH is now a slow-motion replay everyone watches (`src/game/replay.mjs`, 20 Aug 2026; `replaytest` §4 holds 240 frames at match end, photographed in `art/defects/nameplate-live-during-replay.png`)

13 Aug 2026. The owner: *"death camera only shows when you die last, everyone
should see death camera for final death winner & all losers."*

The round-end beat landed (`createRoundCamera` in `src/game/deathcam.mjs`,
`tools/deathcamtest.mjs` 41/41, `docs/BACKLOG.md` 2.6): when the last man falls
in a round, **everybody watches the blow** — winner and losers — for 2.20 s
inside the 5 s break the server already takes, so nothing waits on it.

**What is not covered is the round that ENDS THE MATCH**, which in a best-of-3
is one round in three and in a single-round match is the only one. `endRound`
sets `state = "finished"` and calls `endMatch` on the same tick — there is no
break to play the beat in — and `render/summary.ts` takes the lens for the
victor's portrait while `page.tsx` lays the results panel over it.

**Why it was not fixed here, said plainly rather than left implied.** Holding
the summary back for two seconds is a change to the match-summary FLOW —
`src/app/page.tsx` gates `MatchSummary` on `matchResults`, and
`tools/summaryflow.mjs` gates that flow — and neither file belongs to the unit
that built the camera. A camera unit that reached into the summary screen to buy
itself two seconds would be exactly the kind of unscoped edit `docs/PROCESS.md`
E6 exists to prevent.

**What it costs today:** the last round of a match ends on the victor's portrait
rather than on the killing blow. That is *a* beat and not *the* beat, and the
deferral rides `deathcamtest`'s own verdict line so it cannot go quiet.

**What would close it:** the beat is already skippable, already bounded, and
already refuses to arm for a man inside his own death hold. Whoever owns
`page.tsx` needs to delay `setMatchResults` — or gate the panel on a "the beat
has finished" flag `GameCanvas` already knows — by `ROUND_HOLD.total`, and
`summaryflow` needs to expect it.
---

## CLOSED — the mane under a helmet, and it was two ramps pointing at each other

> "Long mane with huscarl when wearing a helmet causes 2 side front long strands
> of hair to appear, on the rest of the characters with the same hair there's
> just bald sides & nothing at the back on any, just the helmet."

Two sentences, two faults, and **`cosmetictest` was green through both of them —
this is the thirteenth instance of this repository's signature failure and the
cleanest one yet.** §3 measures the SILHOUETTE AREA a hairstyle adds against
Shaved, through one camera, at one bearing. Two long strands hanging beside a
face are a *lot* of area: Long Mane read **11.09%** under the Iron Spangenhelm
against a 1% bar, the **highest reading of any helm on the sheet**, on the exact
frame the owner was pointing at. Area is not distribution. A number that says
"there is hair" cannot say "the hair is only in one place".

### The ruler — `tools/manespread.mjs`

The style is built twice at one seed, bare-headed and helmed, and the hair's
vertices are binned by AZIMUTH about the head's axis. Per bearing: how far the
hair HANGS, against the bare-headed build as a fixed reference. Two assertions,
neither a tuned threshold:

* **a garment may not drag a style's own lowest point round toward the face.**
  The reference is the STYLE'S bare-headed bearing, and that matters — the first
  cut of this asserted "the lowest hair is behind 90 degrees", which is true of
  the Long Mane and *false of the war-locks*, whose plaits legitimately hang
  beside the face at 48°. A bar that reads like anatomy and fails a correct
  build is the failure this file is about.
* **an open helm must leave half the nape's hang.**

```
[mane] class        hair     helm         deepest hair   (bare)   front add   nape kept
[mane] huscarl      long     iron           373 mm at  48  115 deg      266 mm        56%   <-- FAIL
[mane] huscarl      long     wyrm           481 mm at  48  115 deg      373 mm        46%   <-- FAIL
[mane] warden       long     ridge          249 mm at  98  115 deg       89 mm        46%   <-- FAIL
[mane] berserker    long     crowned        260 mm at  98  115 deg       89 mm        48%   <-- FAIL
```

**19 of 72 rows red on the tip this branch starts from; 72/72 after.** 266 mm of
hair hanging at 48° off dead ahead where the same style bare-headed has none, is
the two strands, in millimetres.

**Its own nape statistic was wrong first, and that is worth keeping.** It began
as a per-bin MEDIAN and read **0% — "nothing at the back"** — on builds whose
plaits are plainly there at 115%. Two 24 mm ropes miss two bins in three at
5.6° a bin, so the median landed on an empty bin and reported the SAMPLING GRID.
A sector maximum is the honest reader.

### Fault 1 — `maneMass` multiplied two ramps facing opposite ways

`hairFall`'s coif branch kept the mane IN FRONT of the mail's face opening
(full to 1.06 rad, gone by 1.44). The mane's own `maneFrontDead`/`maneFrontFull`
window killed it in front (dead at 0.72, full at 1.02). What survives a product
of those two is their overlap — a band about **0.04 rad wide at 1.03 rad off
dead ahead**, which on a coifed huscarl is the cheekbone.

The comment eight lines above it **names the disease exactly** — *"Two ramps
multiplied together taper a mass twice and that is how a fall ends up at 6% of
itself while both of its authors think they left it alone"* — and then applies
the cure to the MASK rung only. It is the same bag of mail on both: the
huscarl's aventail closes his whole nape whether or not the helm in front of it
has a face, and a man does not pull a curtain of hair out through the opening he
has to see through. `baggedFall` is `coifed` now and the coifed rung takes the
route the Sutton Hoo already proved — inside the rings, out under the hem.

The **plaits are not moved with it**, deliberately. A war-lock is 24 mm of rope
rooted at 1.34 rad in front of the rim, and a rope hanging out of the face
opening of a mail coif is the right picture. A curtain doing the same thing is
two bars framing a face.

### Fault 2 — the nape fall's rule was written twice, and the copy culled

`hairFall` carried

```ts
if (helmed && style.nape !== "none")
  return 1 - smooth(Math.PI - 1.74, Math.PI - 1.40, awayFromFace(u));
```

— "a nape fall owns everything behind 1.40 rad from the nape". The real rule is
in `hairCeil` twenty lines up and has been since `atY`: under a nape plate the
hair's ceiling goes NEGATIVE (the shell is put inside the skin, invisible,
continuous with the hair either side of it) and it **stops at `napeHemY`, the
plate's own free lower edge**. That rule COMPRESSES. The copy in `hairFall` had
no height in it at all and scaled the whole fall to zero, deleting the 200-400 mm
of mane that hangs BELOW the metal. A flange ends 0.45 head-radii under the
skull's centre and a guard 1.12.

This is the identical fault `cheekHem` fixed on nine rungs and `coifHemY` fixed
on the Sutton Hoo, **found for the third time on the third garment with a hem**.
Deleted.

### Fault 3 — caused by fixing 2, and measured rather than argued

At the 19% of mass the nape fix leaves at the Wyrm-Crest's deep guard,
`hairFitProbe` read **2.9-3.1 mm of berserker mane outside the plate on
0.80-0.94% of covered vertices, at 81° / −34°** — the guard's rear edge exactly.
Two corrections, both of them ones this file had already made elsewhere and
never applied here:

* the skin's proudness comes off the cheek clamp the way it already comes off
  the band's (a plate is raised on the LOW-PASSED form and the skin stands up to
  16 mm proud of it, so a flat liner puts hair outside the metal where the head
  is lumpy);
* `CHEEK_LINER` is **3 mm** where the bowl's is 5. A hinged plate strapped
  against a jaw is not a padded cap on a crown.

0.00% through, and `shown` and `kept` do not move by a tenth of a point at
either value — the two extra millimetres were buying nothing that could be seen
from any bearing and paying for it in fit.

### And one ungated count moved, which belongs on the verdict line and not in a footnote

`wearmeasure` §10 reported **6** ungated flank windows on the tip this branch
starts from and reports **7** here. The seven are the same seven this file's own
table has carried since 8 Aug — huscarl spectacle / boar / crowned / wyrm and
berserker spectacle / crowned / wyrm, at 1.6% to 6.7% of the flank and 37 to
165 mm off the ear. Nothing new appeared; a window that had fallen under the
harness's own reporting floor is over it again, because there is hair beside the
guard's rear edge on rungs where there was none. **It is still not gated**, for
the reason the harness's own comment gives and this file endorses — an opening
in the flank is shaped by three owners at once and the one thing worse than a
hole is a bar that gets tuned instead of met — and the count rides the PASS line
in both places, which is the whole of R4.

### What it costs, stated rather than buried

Long Mane's silhouette on the coifed huscarl at the shop's own three-quarter
lens: **11.09% → 6.37%** under the Iron Spangenhelm, 8.16% → 5.02% under the
Spectacle, 2.94% → 1.50% under the Wyrm-Crest. The area that went is the two
strands. What is there instead hangs down his back, which is where a mane is,
and 6.37% is six times the bar and three times what this rung read before the
head stack.

### And `tools/shoot.mjs` gained a row that should always have existed

The `hair` sheet had a bare row, a back row and the Sutton Hoo mask — the hardest
case — and **nothing between them**. A hairstyle under an ORDINARY helmet, which
is nine of the ten rungs, had never been captured, so there was no frame in
`art/` that could have shown this. A row for the ordinary case is worth more than
a row for the extreme one.

---

## THE RENDER — 13 Aug 2026, and it is ONE frame, which is stated because it matters

```
node tools/shoot.mjs facecard --hair hair_long --helm helm_iron \
     --beard beard_full --turn -35 --out art/look/unitcards
```

A coifed huscarl at the shop's own three-quarter, under an open helm, with the
Long Mane and the Full beard — **which is the exact dress the owner reported**,
and the bearing the shop photographs from. `art/look/` is gitignored, so the
path is regenerable rather than committed. A single card is about two minutes on
this box; the reason there is one and not a sheet is written at the bottom of
this entry.

**What the frame settles.** There is no curtain of hair beside the cheek and no
vertical bar at the temple: the two strands are gone from the picture as well as
from the numbers. The beard's upper boundary on the cheek reads as individual
locks thinning out into skin — there is no brownish hard-edged patch below the
outer eye corner, which is the whole of the 12 Aug entry. The eye's outer corner
sits very nearly level with the inner one and the lid covers the top of the iris.

**What the frame shows that the numbers did not, and it is NOT the beard.** A
run of pale grey-violet ZIGZAG RIBBONS lies on the skin at the temple and in
front of the ear, between the face and the hair. They are the colour of MAIL,
not of hair — they match the hauberk in the same frame — so they are the coif's
front rim at the face opening, drawn as a row of disconnected wavy strips
rather than as one continuous curtain. The 12 Aug entry's "smaller angular mark
at the temple" is almost certainly this and not the beard, which means that half
of that entry was attributed to the wrong garment.

**It is NOT established that this is new.** The coif was not touched by this
work — `coifLevels`, `coifRim` and `coifSquash` are all unchanged — but the only
honest way to say so is an A/B from the previous tip through the same lens, and
that render did not complete. Logged as OPEN and unattributed rather than
claimed either way.

**And the moustache is confirmed at the same lens.** There is a clear band of
bare skin between the bottom of the moustache and the upper lip, and the
moustache reads as a separate dark blob rather than as the top of the beard.
That is the owner's *"lips need improvement & that means also looking at
moustache part of beard placement"*, seen. It is written up under the face
entry below, with the two numbers that control it, and it is NOT fixed.

**Why one frame and not the sheet, said plainly.** `tools/shoot.mjs hair beards`
was started twice and abandoned twice: the first run was invalidated by edits
landing under it, and the second was starved — a panel that takes two minutes
alone took eight while `cosmetictest` and `wearmeasure` were running on the same
box. **Do not run a capture and a harness at the same time on this machine.**
The single-card path (`facecard` with `--helm/--hair/--beard/--turn`) is the one
to iterate on; the sheet is for the verdict.

---

## THE FACE — 13 Aug 2026: two of the four moved, one was already closed, one is untouched

> "The eyes on the character look a little bit asian (Chinese / Japanese Asian),
> chin is a little pointy, lips need improvement & that means also looking at
> moustache part of beard placement. Near the lips."

Written out in full because three of these are separate features and the fourth
is a different unit of work from the other three.

### CLOSED — the eyes, and it is a rotation and a shape, not a narrowing

**The canthal tilt was 8.3 degrees.** `tilt: side * 0.0022` of rise over a
`wA` of 0.0150 is `atan(0.1467)`. That number is not neutral: published means for
the inclination of the intercanthal axis put a European male at about **4
degrees** and an East Asian male at **8 to 10**. The build was sitting squarely
in the second range, on the single loudest cue the feature carries — a canthal
tilt survives distance, it survives the head turning, and it is read before the
lid, the fold or the corner resolve. **0.0011 is 4.2 degrees.**

Nothing was narrowed, shrunk or rounded to get there, and `eyeclip` is what keeps
that honest rather than a promise: `irisAcross` is nailed shut at 12.200 mm and
`discOverMm` — the anti-shrink bar, how far the iris reaches past its own
aperture with occlusion ignored — reads 0.95-3.39 mm against a 0.15 floor.

**And the fissure was ONE curve serving both lids and both corners.** A human's
is asymmetric twice over and both are cheap:

* the highest point of the UPPER margin lies about a third of the way in from
  the **medial** canthus; the lowest point of the LOWER margin about a third in
  from the **lateral** one. Drawn symmetric, an eye is its own reflection about
  its vertical, which is a leaf;
* the **medial canthus is a blunt pocket** — it holds the caruncle and the
  lacrimal lake — while the lateral one really does close to a corner. Two
  identical points read as drawn-on, and a medial canthus tapered to a point is
  *specifically* the silhouette an epicanthic fold produces. The symmetric
  version was reinforcing the reported read from the other end of the slit.

The old note on the exponent claimed 0.80 "closes to a point the way a real
fissure does" and that 0.62 would leave the aperture "62% of its full height a
third of the way from the canthus". The scout measured **62% at 0.80** — the
comment was describing the value it replaced. R7, again.

**A vertical asymmetry was tried and REJECTED ON THE RULER, recorded so it is not
tried again.** Giving the upper margin 10% more rise than the lower's fall shifts
the whole slit up by a tenth of `hA`; `discOverMm` fell from 3.06-5.18 mm to
0.22-2.83 and on the widest seeds there was no iris left above the margin at all
for `coverMm` to measure the lid's grip on. More aperture above the iris is the
startled read the palpebral-fissure block spent passes removing. The asymmetry
that belongs in a human eye is WHERE THE PEAK IS.

`eyeclip --seeds 6`: **0 of 12 LID assertions failed.**

### ALREADY CLOSED, BY MEASUREMENT — "the pupils overlap the upper eyelids"

Carried into this unit as still open. It is not. On 24 heads at the portrait
lens, `eyeclip` reads `visAbove` **0** and `worstVisibleMm` **−0.23 to −0.06** —
no disc vertex is above the upper margin anywhere. The `LID_HUG_ARC` fix closed
it and nothing in this pass was needed. Reported rather than re-fixed, because
re-fixing a closed defect is how a build acquires a second mechanism for the same
rule.

### CLOSED — the chin was a cone

`C_W` ran `62 · 50 · 43 · 30 · 17 · 8 · 0` below the gonion and `C_MASK` ran
`101 · 95 · 80 · 54 · 0` beside it. **Two curves collapsing on the same pole is a
cone with its apex at the menton**, and a cone under a lip block is exactly the
read: the mandible has no width of its own, it is just where the head runs out.

A man's chin is a mental protuberance — a squarish pad with a tubercle at each
corner — whose breadth is held nearly to the lower border before the border turns
under. So the pad is broad at pogonion and stays broad for the 25 mm below it,
and the collapse is spent in the last eighth of the field, which is the UNDERSIDE
of the jaw and is covered by the submandibular mass, the beard and the throat on
every warrior in the shop.

Measured on the BUILT MESH — half-width against depth below the crown, huscarl
seed 13, bare and shaved:

```
mm below crown    before    after
   215 mm          70.6      70.3     <- nothing above here moves
   225 mm          60.4      64.5
   235 mm          46.4      52.6
   245 mm          32.0      41.7
   250 mm          24.3      33.2
   255 mm          17.0      22.7
```

The gonion, the cheek and the zygoma are untouched, which is the point of
measuring it this way rather than trusting the table. `headmeasure`: **0 of 18
ratios outside tolerance, 0 of 15 silhouette and 0 of 8 gaze assertions failed.**

### OPEN, AND DELIBERATELY NOT ATTEMPTED — the lips and the moustache

*"lips need improvement & that means also looking at moustache part of beard
placement. Near the lips."*

Not touched, and the reason is the discipline rather than the difficulty. The
lips are relief in `faceSurface` and the moustache is `beardShell`'s `mouth`
band — `smooth(Y_LIP + 0.056, Y_LIP + 0.024, y) * smooth(Y_LIP - 0.082,
Y_LIP - 0.046, y)`, which holds the hair off a 16 mm band centred just below the
lip line. **Neither has a ruler.** Every instrument this repository owns for the
mouth measures a POSITION (`lipBeyondEline`, `keelAtMouth`, `noseBeyondLip`) and
all of them are inside tolerance on this build, so the thing the owner is looking
at is a shape none of them can see — which is the state the beard was in before
`beardvolume` and the hair was in before `hairmap`.

What is known and should be inherited rather than rediscovered:

* the moustache's lower edge sits **2.8 to 6.6 mm above the lip line**
  (`Y_LIP + 0.024` to `+0.056`, at ~117 mm per unit of field). A real moustache
  overhangs the vermilion; a gap of skin between hair and lip is a trimmed
  moustache on every warrior in the shop, including the "Full" rung;
* the `mouth` band is **symmetric about a point 10 mm below `Y_LIP`**, so the
  hole it cuts is as generous below the lower lip as above the upper one. In
  life a beard grows right up to the lower vermilion and there is no gap there
  at all;
* both numbers are in FIELD-Y. Anyone moving them should read the note over
  `GROW_RAMP` first — this file has now made the field-y-for-millimetres mistake
  three times.

The honest next move is a probe that measures the gap between the beard's own
emitted hair and the lip relief, in millimetres, above and below — and then one
render. Doing it the other way round is what produced the beard that "measured
fine and looked like carved wood grain".

---

## STILL OPEN after 13 Aug — the two this unit measured and did not fix

> **SPLIT 31 Aug 2026 — one of the two is closed and the other has moved.**
> **(1) The Shadow Hood swallowing the mane is FIXED.** The `hoodHemY` this
> section says "does not exist" is defined at `characters.ts:15963`, and
> `hairFall` returns 1 under a hood where it returned 0. `hoodfall` produces a
> clean sheet with all 120 paid pairs distinct.
> **(2) The Wyrm's cheek-guard reshape is still open**, re-measured on HEAD at
> 23.4/50.5/53.1 and unmoved in a week — it is tracked as backlog 5.16 now, with
> an attempt and its costs recorded below.
>
> **THE LEVER NOT YET TRIED, so the next pass does not repeat mine.** I walked
> `cheekIn` — where the guard STARTS — and it works on the face and fails on the
> berserker's braids. What nobody has tried is reshaping the hem's CURVE rather
> than scaling it: the recorded "inert" result moved the 0.34 ADDEND, which is a
> scale, and the prescription at line 3616 asks for three phases — deep at the
> front beside the mouth, sweeping UP over the mandible's angle in the middle,
> short at the back. That removes plate from the mid-arc without moving the
> front edge. It may well hit the same braids, which sit at az 51-64 deg; that
> is worth finding out rather than assuming.


> **Round two leaves both of these exactly where round one left them, and says
> so here rather than by omission.** Neither was touched, neither was
> re-measured, and no number below has moved. They are named again in the round
> two commit message for the same reason. The work of round two was the Forked
> Beard and the false 16/16; these two need a `hoodHemY` that does not exist and
> a cheek-guard reshape whose seven levers are already recorded as inert, and
> neither is an afternoon.
>
> **The second pass of round two leaves them too**, having re-measured item 2
> rather than repeating its number — see the correction inside it. That pass
> went to verifying the fork gate by breaking it, and to the two false claims
> about renders recorded above.


**1. The Shadow Hood still swallows the mane.** `cosmetictest` is **15/16** and
the one red cell is unchanged: Long Mane 0.97% and Braided War-locks 0.97% under
the Shadow Hood against a 1.00% bar, with Warrior Crop at 0.37%. `hairFall`
returns 0 outright when `hooded`, so there is no fall under a cowl at all and
what reads is the scalp shell. The ruling in this file stands — *"a cowl covers
the crown, it does not swallow a mane that hangs past the shoulder"* — and the
route that would satisfy it is the one the aventail now uses on two rungs
instead of one: a cowl has a lower edge where it lands on the shoulders, and
hair gathered inside it comes out under that edge. **The hood has no `hoodHemY`.**
`hoodRim` and `hoodCrown` are hoisted for the hair to read and neither of them is
a hem. That is the missing definition, and it is the same missing definition
`cheekHem` and `coifHemY` each turned out to be.

`tools/manespread.mjs` reports the hood on every row and gates nothing on it, on
the verdict line, for exactly the reason it does the same for the Sutton Hoo.

**2. The Wyrm-Crest's deep cheek guard is untouched.** `facecover` spread 28.8
against the Spectacle's 4.2. **Re-run rather than quoted** — and the honest
figure is a range, not that pair: the Wyrm spreads **28.8-29.7** across the four
classes and the Spectacle **1.9-4.2**, so "28.8 against 4.2" was the narrowest
Wyrm set against the widest Spectacle. The gap is real and slightly wider than
advertised. Worth recording alongside it: the **Shadow Hood spreads 30.9-32.0**,
wider than the Wyrm on every class, and `facecover` flags spread as
*measurement only, not a bar* — so nothing here is a red gate, and the hood's
number belongs next to item 1 as well as this one.
The seven levers this file records as inert or
partial were not pulled again, and nothing was added to that table. The one thing
this unit learned that bears on it is negative and worth having: `CHEEK_LINER`
went from 5 mm to 3 mm on the evidence that the deep guard leaves the hair under
it only 1.5-3.1 mm of room at its rear edge — so **the plate really is that
close to the jaw there**, and a reshape that "sits behind the jawline rather than
out on the cheek" is starting from tighter than the earlier note assumes.

---

## CLOSED — the beard's cheek boundary, and the comment was the bug

Supersedes the entry at the bottom of this file (12 Aug). The diagnosis there was
right about everything except the size of the number.

`dens` feathered the growth line with `smooth(0, 0.038, topY(u) - y)` under a
note that read **"feathered in below the growth line over 38 mm"**. It is
FIELD-Y and not metres. One unit of that field is about 117 mm on this head, so
the ramp was **4.5 mm** — and that is the *identical* unit mistake the tuck's own
note records and corrects for itself twenty lines further down (*"0.060 IS IN
FIELD-Y AND NOT IN METRES … about 7 mm of drop"*). A 4.5 mm ramp is a step. It
always was one; what changed is that the `hair` substance made it visible.

`GROW_RAMP` is 0.095, which is 11 mm — inside the 8-12 mm the old entry asks
for. **No `cut.skin` was lowered**, which that entry is explicit about: it
deletes the cheek hair instead of blending it and a beard that starts at the
jawline is a chinstrap.

**AND THE RAMP ALONE CANNOT CLOSE IT, which the old entry did not say.** The
beard is a shell and its visible edge is the curve where that shell crosses the
skin — an iso-line of `lift` — and a crossing is a crossing however gently the
two surfaces approach it. On one side of that line the pixel is skin and on the
other it is hair. Widening the ramp moves the line and softens the mass behind
it; it does not stop the line being a line.

So `patch` takes an optional per-vertex `tint`, written in the sheet's own
(u, v) — the one place that still knows what parameter a vertex came from — and
`BeardCut.fade` converges the hair's albedo on **the tone the skin beside it
already carries**, not on bare complexion. `faceComplexion` runs its stubble term
under a full beard at 0.42 and under the Close Crop at 0.80 precisely so "its own
rim lands on skin that is already going dark"; converging on the wrong one of
those two swaps a dark edge for a pale one.

**`BEARD_FADE_CAP` is the honest limit and it is a real residual.** Raven Black
is `0x1c1712` — 0.011 of linear red against a mid complexion's 0.21 — so the
exact ratio is **eleven**, and a vertex colour multiplies the substance's MAP as
well as its colour. Eleven times the `hair` tap does not lighten a lock, it
detonates it: what would draw at the cheekbone is a band of pale stripes where a
dark patch used to be. Capped at 3.5 on the largest channel (scaled, not clamped
per channel, which would rotate the hue). Every brown, blond, red, grey and white
in the shop is under the cap and converges exactly. **Raven Black gets 3.5 of its
11 and is the one rung where a residual step is expected.**
## CLOSED — every class card drew its best stat at the rail (fixed by `statshape.mjs`; verified 21 Aug 2026, `cardgate` 17/17)

Found 2026-08-13 by `tools/classmatrix.mjs`, which reads the drawn width of every
stat bar out of a browser capture rather than out of the source. Red on both
platforms, at 390 px and at 1440 px.

**What is drawn today.** The percentages below are runs of coloured pixels in a
PNG, not inline styles:

```
                     HP      SPD      ATK      DEF
    HUSCARL        100.0%    70.3%    64.6%   100.0%
    WARDEN          80.0%    80.0%    71.4%    74.9%
    RUNEKEEPER      60.0%   100.0%    50.3%    50.3%
    BERSERKER       73.1%    84.0%   100.0%    37.7%
```

Every column has a class at exactly 100%. That is not a coincidence and it is not
harmless: `page.tsx` gives `StatBar` a hard-coded ceiling per bar — `max={150}`,
`max={100}`, `max={84}`, `max={80}` — and each of those happens to equal the
current maximum of the four classes, while `StatBar` finishes with
`Math.min(100, (value / max) * 100)`. **The top of every bar is a wall, and today
every leader is standing against it.**

**The consequence, measured rather than argued.** `classmatrix` rewrites the
served module in flight so the runekeeper's `moveSpeed` goes 5.0 → 5.6 and the
warden's 4.0 → 5.0, then re-photographs the cards:

```
5a CONTROL — the injected 4.0 -> 5.0 reached the glass: warden SPD 280px -> 350px of 350
5b THE LEVER — a runekeeper made 12% faster draws a longer speed bar
   FAIL: runekeeper SPD 350px -> 350px (moved 0px, needed 21px at the warden's own rate)
5c a 5.6 and a 5.0 do not draw the same bar
   FAIL: both draw 350px of 350 — the identical full bar this gate exists to catch
```

That is the original defect reproduced on glass: two different speeds, one
identical full bar. The control on the same capture proves the injection landed,
so "the bar did not move" is a fact about the drawing and not about the fixture.

**The fix belongs in `src/app/page.tsx` and is not this unit's to make:** derive
each ceiling from the roster (the maximum of the four classes for that stat) and
give `StatBar` a fraction, so there is no literal to clamp against. When that
lands, claims 5b and 5c go green with no change to the harness.

---

## CLOSED — the card's stats mirror disagreed with the engine (resynced during the re-levelling; now GATED — `cardgate` diffs every field and fails on drift, 21 Aug 2026)

Same run, claim 7. `src/game/types.ts` holds a `WARRIOR_STATS` table that
`page.tsx` draws from; `src/game/engine.mjs` holds the table that decides fights.
They differ, on the stat a player is most likely to choose a class for:

```
huscarl.moveSpeed    card 3.5  vs engine 4.0
warden.moveSpeed     card 4.0  vs engine 4.5
runekeeper.moveSpeed card 5.0  vs engine 5.5
berserker.moveSpeed  card 4.2  vs engine 4.7
```

`types.ts` already knows: its own comment says "the other columns still disagree
with the engine (huscarl 3.5 move here against 4.0 there). That is an older
display bug". It has been an older display bug for long enough to be documented
instead of fixed, which is failure mode 3 in `PROCESS.md` — the mirrored
definition — sitting in the one screen a player reads before committing.

**It is worse than a stale number.** If the card were simply fed the engine's
table today, the runekeeper's 5.5 would come out as `5.5 × 20 = 110` against a
ceiling of 100 and be clamped — so the two defects are one defect: a second copy
of the numbers, drawn against a wall. Fixing the mirror without deriving the
ceilings would put a visibly wrong bar on the card.

Held open rather than half-fixed: this unit owns `tools/` and no `src/` file.
`node tools/classmatrix.mjs` prints both, on both platforms, in about four
minutes.

---

## OPEN — `goretest` on the gore branch still gates two statistics that cannot discriminate

> **CLOSED ON THIS TREE — 1 Sep 2026 — and the harness that was supposed to
> settle it could not even RUN.** Neither statistic below is gating anything
> here, and the fixture holding the evidence had bit-rotted.
>
> **`tools/gorestat.mjs` hard-stopped on every invocation.** Its speed-law regex
> wanted `(0.30 + pulse * 0.95)` and `vfx.ts` reads `(0.30 + 0.95 * pulse)` —
> an operand reorder, not a behaviour change. The hard stop did its job (it
> refused to run rather than quietly build six copies of one surface), but the
> harness then sat unrunnable, which is how this entry came to cite a verdict
> nobody could reproduce. Fixed to accept either order.
>
> **STATISTIC 1 IS NOT GATED HERE, AND IT IS NOT `1 - min/max` EITHER.** The
> table below indicts `1 - min/max`. `goretest.mjs` on this tree uses a THIRD
> implementation — one Fourier bin at the renderer's own beat, `2|X(9.2)|/N`
> over the mean — and it does not gate it: *"the number is PRINTED and the claim
> is retired rather than left as a gate that cannot see"*. A metric retired on
> evidence about a different metric is the fault this project keeps finding, so
> the shipped one is now measured too. `gorestat` grew a column for it:
>
> ```
>     floor    NEW depth  predicted  SHIPPED fft  ship spread  OLD 1-min/max
>     0.85        16.7%      14.1%        29.7%       27-32%          84.5%
>     0.6         38.7%      38.3%        39.0%       37-42%          85.3%
>     0.42        55.3%      56.2%        54.3%       52-58%          87.7%
>     0.3         67.6%      68.4%        71.0%       68-75%          87.9%
>     0.18        79.6%      80.9%        96.2%      93-100%          89.8%
>     0.05        94.2%      94.6%       100.0%     100-100%          91.1%
> ```
>
> **The shipped statistic is a real ruler**: 70.3 points of range across the
> ladder against the old one's 6.6, strictly ordered, and its bar of 0.60 CAN be
> failed — the shallowest rung scores 29.7%. What it cannot do is resolve the
> jet this tree actually ships, and that is the honest reason to report rather
> than gate: the shipped floor is **0.88, the owner's hose**, about 12% of
> oscillation, and at that depth the metric sits on its own ~27% noise floor.
> **Two independent instruments agree to a point**: `goretest` reads 29% on the
> shipped jet, `gorestat`'s ladder reads 29.7% at its nearest rung (0.85).
> `goretest`'s note was right and is now measured rather than asserted.
>
> **STATISTIC 2 IS STILL GATED AND NO LONGER MARGINAL.** The entry has it firing
> on an unchanged tree in 84.5 / 90.9 / 91.1% of draws at 2.0 m. Today it reads
> **3.8 / 3.5 / 3.0 marks against a bar of 1** at 120/60/30 fps — three to four
> times the margin, because the pour was tripled when the owner asked for a hose.
> A flakiness measured before that change does not describe this tree.


The replacements are built and proven in `tools/gorestat.mjs`; the branch that
carries `vfx.probe()` (`unit-gore-camera`) has not adopted them, so until it does
the blood is still gated by two rulers that do not measure what they claim.

**1. `pulseDepth`, `1 - min/max` of the droplets in the air.** Measured on the
real emitter across six pulse floors built into the emitted module:

```
    floor     NEW depth  predicted  OLD 1-min/max    OLD spread
    0.85         17.6%      14.1%          96.6%       92–100%
    0.6          40.2%      38.3%          97.0%       92–100%
    0.42         56.2%      56.2%          97.4%       90–100%
    0.3          67.3%      68.4%          98.0%       93–100%
    0.18         79.2%      80.9%          98.3%       94–100%
    0.05         94.4%      94.6%          99.5%       95–100%
```

Three facts, each of which alone retires it:

* **Its bar cannot be failed.** The gate is `pulseDepth >= 0.6`. A spray with a
  true depth of 14% — all but a hose, and the thing the claim exists to forbid —
  scores 96.6%.
* **Its range is inside its own noise.** Six floors spanning eighty points of
  real depth move it 3.0 points in total, while a single floor's own wounds
  scatter over 9.7. It was read one wound at a time, so the ranking was decided
  by which wound came up: the shallower of the two real surfaces out-scores the
  deeper one in 67% of 60×60 head-to-head wounds.
* **It answers the throw, not the heartbeat.** Its separating power is 34% on the
  two real surfaces (whose pulses differ) against 49% on a null pair with
  *identical* pulses and a faster throw. It is reading the throw.

**2. "Blood lands on the man standing next to him, at every frame rate."** Gated
on the mean of six wounds reaching one mark. Resampled from a pool of 240 real
wounds a cell, that statistic fires on an unchanged tree in **84.5%, 90.9% and
91.1% of draws** at 2.0 m (120, 60 and 30 fps) and in 0.0–0.1% at 1.2 m — the
adversary's "one run in nine" was the same coin seen from the branch's stronger
spray. The bar sat on the mode of a six-sample mean.

**The adoption is small and is `tools/`-only.** `gorestat.mjs` computes both
replacements from things `goretest` already has — a census, a frame loop, and its
own transpile step — and needs no `src/` change on either branch. The pulse claim
becomes the phase-folded emission depth against the depth known in closed form;
the bystander claim becomes the per-wound probability at a fixed sample, with the
2.0 m level deferred on the verdict line and the frame-rate RATIO gated in its
place.

**One measured note for whoever owns the spray**, offered as data and not as a
verdict: on this tree the blood reaches a man 2.0 m away on fewer than half of
all wounds (`120fps 46%, 60fps 43%, 30fps 39%`, 240 wounds a cell), against
95–98% at 1.2 m.
`gorestat` deliberately does not gate that level — how far the spray carries is
what the spray work is for, and a bar invented by a harness is a number nobody
chose.

---

## CLOSED — a corpse was shown three buttons that did nothing

The entry this replaces called it "an intermittent gate". The intermittency was
real and so was the cause named there — two sources of truth for one question —
but it was not only a harness problem. It was a live UX defect.

**What happened.** `MatchSummary` mounted the flourish row off the WIRE's
`players[me].state`. That panel stays mounted through the server's ten-second
rollback into the lobby, and the rollback resets every man to idle — so a man
the stage had laid down got his row back the moment the room reset, three
buttons that `render/summary.ts` then refused on every press. To the player
holding the phone, a vetoed press and a broken game look identical.

It read as intermittent because whether the local man was standing depended on
which side won, which varies run to run.

**The fix is that the button now asks what the stage answers.** `GameCanvas`
already held `summaryRef.current.canPerform` — the function that decides whether
a flourish is honoured — and now pushes that answer up on change; `page.tsx`
gates the row on it as well as on the wire's state. One source of truth.

```
before: NOTE war band: after the rollback the row is OFFERED to a man the stage left DEAD
after:  NOTE war band: after the rollback the row is gone   to a man the stage left DEAD
        PASS war band: a man lying dead does not perform — the row was not offered at all
```

**And a test had to change with it, which is worth recording.** `vetoCheck`
asserted `pressed && refused`: it PRESSED the row as a corpse and required the
stage's refusal counter to move. That was right while the button was always
there. It became wrong the moment the button correctly went away — the check
failed with `pressed=false` on the build that had just fixed the defect, because
it was measuring the old implementation rather than the rule. The rule is "no
corpse performs", and it now accepts either route: not offered (stronger) or
pressed-and-refused. What was not relaxed is the part that matters — no corpse
may be performing, on either route.

---


## OPEN — the beards are flat sheets, and the hood swallows a mane

> **HALF CLOSED, AND THE OTHER HALF IS NOW A MEASUREMENT RATHER THAN A
> COMPLAINT — 1 Sep 2026.**
>
> **THE HOOD IS FIXED.** `hoodHemY` exists at `characters.ts` and `hairFall`
> returns 1 under a hood where it returned 0; `hoodfall` produces a clean sheet
> with all 120 paid pairs distinct.
>
> **THE FLAT SHEET IS REAL AND IT IS A PROFILE DEFECT.** At three-quarter every
> beard reads correctly — `art/shots/beards/cards/beards-3._Full_Beard_40g_3_4.png`
> is a beard with volume, a moustache and a jawline. Edge-on it is a blade
> hanging off a bare chin (`..._profile.png`), which is the owner's *"really
> sharp & thin / folded in areas ... or just a hole in it"* exactly. The 120g
> Ringed Braid is the same. Nothing in the shipped gates can see it: `wearmeasure`
> §7 asks for one connected component and 2 mm of clearance, both of which a
> sheet satisfies perfectly.
>
> **THE LEVER IS `skin`, AND FOUR OTHERS ARE INERT.** `skin` is how far the face
> leg stands off the skin — the beard's depth — and the full beard's is 19 mm,
> which is a shave. At **32 mm the profile reads as a beard**
> (`art/shots/bd-skin/facecard-beardbeard_full-turn-90.png` against
> `art/shots/beards/cards/beards-3._Full_Beard_40g_profile.png`) and three-quarter
> does not become a bush (`art/shots/bd-skin-q/`). The four that do nothing,
> measured, so nobody spends them again:
> * `cut.mass` carried from 0.90 rad out to 1.16 — it is applied in the FALL
>   branch alone, below the jawline, so it cannot reach the face.
> * the `side` thinning's strength.
> * a height-weighted `side` (thin the cheek, keep the jaw) — right in principle
>   and invisible at 19 mm of depth.
> * `uEdge` 1.20 -> 1.45. The beard's azimuth was never what was missing.
>
> **WHAT BLOCKS IT, NAMED.** `beardShell` is handed a SKULL and nothing else, so
> a beard is built in complete ignorance of what the man is wearing — hair has
> `hairCeil` reading the whole head stack and the beard has no equivalent. At
> 19 mm that was survivable because the Wyrm's guard covered the jaw. It stops
> being survivable now that the guard has been walked back to free the face
> (5.16): at 32 mm, helmclash §5 goes red on **five Wyrm rungs, `hair=shaved`
> among them**, at 3.1-3.7% of beard 9-17 mm outside the plate at az 52 deg,
> which is the guard's own new leading edge.
>
> A ceiling was built and it is necessary but NOT sufficient, and the numbers are
> the useful part. Clamping the face leg alone: 3.06% -> 2.06% — two thirds of
> the breach is the hanging mass, whose standoff is `o` and not `lift`. Clamping
> the fall as well: 2.49%. Subtracting the skin's proudness the way the hair's
> own cheek liner does: 2.39%, against a 2.0% bar, **and the total red-row count
> rises from 5 to 8**. So the next attempt needs the beard fitted against the
> guard's real surface rather than against an analytic hem, and it should be
> judged on `cosmetictest` as well as helmclash — a beard crushed to fit is the
> same failure as a hairstyle deleted to fit, and §5 cannot see either.


Reported 2026-08-08 with four screenshots: *"all beards have a similar defect &
issue where it looks to be really sharp & thin / folded in areas, overlapping
into the neck or just a hole in it ... the design & display of the beards is
really broken & poor, the hair & helmets also have similar issues"*, and
*"across the 4 fighting types the hair designs break with helmets on ... long
hair dissappears fully even if it should be visible at the below the helmet ...
the sides of helmets are missing too with leaves bald spots or ears exposed"*.

### 1. The hood swallowed a mane, and the gate was told to allow it

`cosmetictest` §3 carried an explicit CARVE-OUT for the Shadow Hood, with this
reasoning:

> *"a hood is a bag for a head, and swallowing what is under it is what its 120
> gold buys ... whether a draped cowl should hide a mane or let it spill out the
> front is a design call, and a harness that decided it by fiat would be
> inventing a defect."*

That was the right instinct and it is why the harness read green while the owner
read broken: it declined to rule, and reported instead. **The ruling has now been
made** — a cowl covers the crown, it does not swallow a mane that hangs past the
shoulder — so the exemption is gone and the numbers are an assertion:

```
SWALLOWED  Long Mane (40g)          under Shadow Hood — 0.97% (helm covers 37% of the face)
SWALLOWED  Braided War-locks (100g) under Shadow Hood — 0.97%
           Warrior Crop  reads 0.37% under the Shadow Hood
[cos] 15/16
```

A 40-gold and a 100-gold item, both under 1% under a 120-gold helm. `art/look/rep1.png`
shows why: the mane is entirely INSIDE the cowl, with a few millimetres of
hairline showing at the brow and nothing at all below the shoulder.

#### MEASURED 13 Aug 2026 — `node tools/hoodfall.mjs`, and it says the known fix is not available

The cause on record is `hairFall`'s first line, `if (hooded) return 0` — no
falling mass under a cowl at all. That is true and it is **half of it**. The
half nobody had measured is that **the hood is longer than the hair**, so
restoring the fall on its own would put ~2600 vertices inside the cloth and
still show nothing.

`hoodfall` §2 fingerprints the hair meshes in world space, per class, with and
without the cowl, against the hood's own lowest ring:

```
class        hair      bare reach   hooded reach   verts bare/hooded   hood hem   clearance
huscarl      long           1.446          1.756     4444/1804        1.464       18 mm
huscarl      braids         1.479          1.756     6226/1804        1.464      -16 mm
runekeeper   long           1.336          1.650     4444/1804        1.376       40 mm
runekeeper   braids         1.369          1.650     6226/1804        1.376        7 mm
berserker    long           1.555          1.862     4444/1804        1.551       -4 mm
berserker    braids         1.589          1.862     6226/1804        1.551      -38 mm
```

*Clearance* is how far a FREE fall — no helmet at all — reaches below the point
the Shadow Hood's shoulder drape stops. **Four of the eight falls do not clear
it, and the best case in the whole game is 40 mm, which is 5 px at the play
lens.** A cowl on a berserker hangs 38 mm BELOW where his own war-locks end.

So this is a reshape and not a revert, and it is the same shape of answer the
Wyrm's cheek guard needs further down this file. The fix has to make ROOM as
well as mass, and there are two places it could come from:

1. **The temple window.** The cowl's fall sweeps ±2.30 rad about the nape, so
   everything within 0.84 rad of dead ahead is open air below the rim. The face
   takes the first ~0.55 rad of that; the band between 0.55 and 0.84 is cloth-
   free and is exactly where locks escaping a hood belong. `hairCeil`'s hooded
   branch would have to open there too — it currently caps standoff at 22 mm at
   every (u, v), including where there is no cloth, because
   `clamp01((v - rim)/(crown - rim))` clamps to the rim's own lift below the rim
   rather than to infinity.
2. **Past the mantle's hem**, which is the route the Sutton Hoo already takes —
   `coifSquash` down to the rings and `shoulderRide` out onto the garment below
   them. For a hood that means a `hoodSquash`/`hoodRide` pair against the
   drape's superellipse, and a fall lengthened enough to be worth drawing.

Neither is a constant to move, which is presumably why the pass that found the
cause left it.

### 1b. NEW — the Sutton Hoo has the same collapse, on three of the four classes

`hoodfall` §1 asks a different question from `cosmetictest` §3: not "do these
two silhouettes differ through a lens" but **"are these two builds the same
object"** — every world-space vertex, rounded to a micron and digested. There is
no threshold in it and so nothing to tune.

```
ONE OBJECT   huscarl     hood       long == braids   (1804 verts, identical to the micron)
ONE OBJECT   warden      hood       long == braids   (1804 verts, identical to the micron)
ONE OBJECT   warden      suttonhoo  long == braids   (1144 verts, identical to the micron)
ONE OBJECT   runekeeper  hood       long == braids   (1804 verts, identical to the micron)
ONE OBJECT   runekeeper  suttonhoo  long == braids   (1144 verts, identical to the micron)
ONE OBJECT   berserker   hood       long == braids   (1804 verts, identical to the micron)
ONE OBJECT   berserker   suttonhoo  long == braids   (1144 verts, identical to the micron)
```

The Long Mane (40 g) and the Braided War-locks (100 g) are not merely hard to
tell apart under those two helms — they are **the same mesh**.

**AND HERE IS WHY NOTHING SAW THE SUTTON HOO HALF OF IT.** `cosmetictest` §3
carries this check:

> "no two PAID hairstyles are the same shape as each other under any helm **but
> the hood**"

The hood is excluded, which is the carve-out `docs/PROCESS.md` names as failure
mode 2 and which is still open. The Sutton Hoo is *inside* that check's scope
and the check is green anyway — because `cosmetictest` builds one rig,
`RIG = { cls: "huscarl" }` at line 233, and **the huscarl is the single
class/helm pair in the table above that does NOT collapse.** The bishop's
mantle is the reason: it is the one shoulder garment the gather has to ride out
over, and riding it is what keeps the plait and the mane apart. The other three
classes have no mantle and both rungs squash to the same aventail shape.

A gate green because the case is absent. The case is four classes; the gate
looks at one.

### 2. The beard is a SHEET, not a mass — MEASURED

`npm run beardvolume` fires rays through the beard and reports the gap where
each crosses it. Measured on the HANGING FALL only, because hair lying on a
cheek is legitimately thin — `BeardCut.skin` is literally "how thickly the hair
lies on the face at the jaw" — while the fall hangs in air with nothing behind
it and has to have body:

```
class        beard       rays     p10      med      p90   under 4mm
huscarl      short        398     1.3      3.8      7.8       55%
huscarl      full         366     1.4      6.0     12.1       32%
huscarl      forked       250     0.9      4.4      9.9       43%
huscarl      braided      304     0.2      3.1      6.8       68%
```

```
class        beard       rays     p10      med      p90
huscarl      short        398     1.3      3.8      7.8
huscarl      full         366     1.4      6.0     12.1
huscarl      forked       250     0.9      4.4      9.9
huscarl      braided      304     0.2      3.1      6.8
```

**Read the MEDIAN, not the tenth percentile, and the first version of this entry
had that wrong.** p10 looked like the right statistic — "a tenth of the beard is
paper-thin" describes what the owner is looking at — and it is INERT. Doubling
`cut.thick` on all four styles moved every median as expected (3.8→6.9, 6.0→8.3,
4.4→6.5, 3.1→5.4) and left p10 almost exactly where it was (1.3→1.9, 1.4→1.8,
braided did not move off 0.2 at all).

A statistic that does not respond to the only lever controlling it is not
measuring that lever. **The thin tenth is the hem and the edges**, where the
section wraps from the outer wall to the inner one and the two meet by
construction. That is legitimate taper — a beard IS thin where it ends — and
gating on it would demand a beard with a blunt cut edge.

**So what is actually true:** the mesh is built to its own specification. The
median tracks `cut.thick` (declared 4.0 to 6.8 mm) almost exactly. The question
the owner's screenshots raise is therefore not "is the mesh wrong" but **"is a
4-7 mm shell on a 150 mm head enough to read as a mass"** — and that is a look
question wanting an eye on a render, not a threshold picked in a harness. Two of
the four styles do not even reach the thickness they declare.

**Why nothing caught it.** `beardcount` welds triangles and counts islands — a
sheet is one island. `beardseat` measures how deep the beard sits inside the
neck and the collar — a sheet intersects nothing. `wearmeasure` §5 folds in the
same two questions. All three are about POSITION and none about VOLUME.

**The fix** is in `beardShell`'s section: the fall's outer and inner walls run
too close together. `prof` is the section and `thick` the wall gap; giving the
fall real depth is the change, and `beardvolume` confirms it in about fifteen
seconds a style.

### 3. A stray flat tab on the hood

`art/look/rep1.png` panel 3 shows a hard-edged rectangular quad projecting from
the back of the hood at ear height, unattached to the silhouette. Not yet
diagnosed.

### 4. Helm sides: seven ungated windows, and the harness knew

`wearmeasure` §10 measures these and **deliberately does not gate them**:

```
huscarl/spectacle:  a window 5.2% of the flank sits  65 mm off the ear — the ear is not inside it
huscarl/boar:       a window 4.6% of the flank sits  63 mm off the ear — the ear is not inside it
huscarl/crowned:    a window 6.5% of the flank sits  38 mm off the ear — the ear is not inside it
huscarl/wyrm:       a window 2.0% of the flank sits 120 mm off the ear — the ear is not inside it
berserker/spectacle: 1.5% of the flank, 163 mm off the ear
berserker/crowned:   2.5% of the flank, 107 mm off the ear
berserker/wyrm:      2.2% of the flank,  89 mm off the ear
```

A hole in the side of the helmet that **frames nothing** — the ear is not in it.
That is the owner's *"the sides of helmets are missing too with leaves bald
spots or ears exposed & looks wrong"*, measured, in a harness that was calling
itself green.

Its own comment gives the reason and the reason is good: *"an opening in the
flank is shaped by the guard's rear edge, the fall's leading edge AND the
hairline ... a bar here is a bar on three owners at once, and the one thing
worse than a hole is a bar that gets tuned instead of met ... that is the next
pass."* Declining to rule was right; **printing `PASS: the openings` with the
count in a note above it was not.** The verdict line now carries the count, so a
green run reads "with 7 ungated windows" rather than as a clean sheet. The bar
is still not invented, because inventing it here is the failure the comment
warns about.

## THE PATTERN ACROSS ALL FOUR REPORTS

Every one of the owner's 2026-08-08 complaints was a thing the gate already knew
about and had chosen not to fail on:

| report | harness | why it was green |
|---|---|---|
| long hair vanishes under the hood | cosmetictest §3 | explicit carve-out; the hood was exempt by name |
| helm sides leave bald spots | wearmeasure §10 | measured, reported as a note, deliberately not gated |
| beards are sharp and thin | beardcount / beardseat | neither asks about VOLUME — a sheet is one island and intersects nothing |
| the face seam | facelook / cosmetictest | coverage measured, but never "what is in front of the face" |

Two deliberate deferrals, one unmeasured property, one unasked question. **None
was a bad measurement.** The lesson is not "measure harder" — it is that a
harness written by whoever is fixing the defect encodes THAT PERSON'S idea of
done, and every deferral it makes is invisible to the person who actually
decides. Deferrals now ride on the verdict line in both places they were found.

---

## OPEN — the Wyrm's DEEP cheek guard takes half the face at three-quarter

> **CLOSED 31 Aug 2026 at `cheekIn` 0.85.** `cheekHemAt` and `deepTop` normalised
> their ramp over the guard's OWN span, so `cheekIn` was never the edge control
> it reads as — narrowing the span dropped the hem 0.117 rad at 1.12 rad, onto
> the berserker's war-locks, which is the whole of the 19.7 mm that got the first
> attempt reverted as "plate and hair competing for the same arc". They were not
> competing; one constant was moving two things. Ramp anchored to the arc it was
> tuned on (a no-op on the shipped build by construction), and the face goes
> **23.4/50.5/53.1% taken -> 4.6/22.4/24.3%, spread 29.7 -> 19.7**, with hair at
> 0.0 mm through on every helm x hair x class x seed and helmclash §5's red-row
> set byte-identical to shipped. `art/look/wyrm-before.png` / `wyrm-after.png`.


`npm run facecover` measures, per bearing, how much lens-facing face skin the
helm takes — the head rendered twice, bare and helmed, differenced. Face means
below the brow and within 70 degrees of facing the lens, so the side of the
skull leaves the sample as the man turns instead of entering it.

```
helm         0deg   -35deg    35deg
iron         0.2%    1.7%     2.1%
nasal        6.4%    5.3%     5.6%
spectacle   25.2%   29.4%    29.4%      <- short cheek guard
wyrm        24.3%   50.9%    53.1%      <- DEEP cheek guard
suttonhoo   89.3%   94.7%    94.8%      <- a mask, and that is the product
hood         3.1%   31.4%    34.2%
```

**Confirmed by swapping the flag, not by argument:** set the Wyrm's `cheek` to
`"short"` and it reads **25.2 / 29.4** — spectacle's numbers exactly. Set its
`bowl` to `"round"` and nothing changes. The deep guard is the whole of the
difference, and it costs 21 points of face at the bearing the shop uses.

The id buffer names the surface directly: **95% of the loss is
`rig:head · 6e767f`**, the helm's iron. The Hood's is 100% `· 2a2521`, its cloth.

### Every lever tried, and what it moved

Measured at 0 / -35 / 35 deg. Baseline `24.3 / 50.9 / 53.1`, spread 28.8.
Spectacle, the shape to aim at, is `25.2 / 29.4 / 29.4`, spread 4.2.

| change | reading | spread |
|---|---|---|
| `cheek: "short"` (whole style) | 25.2 / 29.4 / 29.4 | **4.2** |
| `bowl: "round"` | 24.3 / 50.9 / — | 26.6 |
| `nape: "flange"` | 24.3 / 50.9 / — | 26.6 |
| `cheekIn` 0.56 → 0.88 | 12.3 / 32.2 / 35.1 | 22.8 |
| `cheekOut` 1.45 → 1.10 | 30.6 / 52.1 / 55.3 | 24.7 |
| `deepHem` addend 0.34 → 0.12 | 24.3 / 50.9 / 53.3 | 29.0 |
| `deepHem` base `Y_CHIN+0.05` → `Y_LIP+0.02` | 23.2 / 43.7 / 45.6 | 22.4 |

**No single constant is the fix.** The bowl, the nape and the hem's addend do
nothing at all. Moving the inner edge back drops the FRONT and leaves the side.
Widening or narrowing the outer edge makes it slightly worse. Raising the hem to
the short guard's height buys seven points and costs the guard its depth, which
is the thing the rung is sold on.

Only replacing the whole style fixes it — which says the coverage is distributed
across coupled terms rather than sitting in one. **So this is a reshape, not a
retune**, and the file's own audit already named the shape of the answer: *"a
rectangle in parameter space is not a cheek guard; it is a billboard."* The
guard has to be cut to the jaw it covers — deep at the front beside the mouth,
sweeping up to clear the mandible's angle, finishing short at the back — while
sitting BEHIND the jawline rather than out on the cheek.

### The trap that cost three of those sweeps — REMOVED 13 Aug 2026

`cheekIn`, `cheekOut` and `cheekHemAt` at the top of the file look like the
guard's geometry. `cheekHemAt` was a DUPLICATE of `deepHem` inside the builder,
and it was the copy the earlier pass swept first — which is why the hem appeared
to do nothing twice. The file records having made this mirrored-definition
mistake three times before; that was the fourth.

**The copy is gone.** `guardIn` and `guardOut` were literally `cheekIn` and
`cheekOut` two lines above `deepHem`, and `deepHem`'s body was `cheekHemAt`'s
`deep` branch character for character, so `deepHem` is now `cheekHemAt(|u|)` and
there is one definition. `Math.abs(u)` against `awayFromFace(u)` was the only
difference between them and it is not one inside the guard's own arc, where
`sideArc` bounds `|u|` by `cheekOut` ≤ 1.62 rad.

**Proven, not argued.** Every class × every helm × every hair rung — 160 rigs —
was fingerprinted by digesting every world-space vertex to the micron, before
and after. All 160 hashes are identical: the collapse moves no geometry at all.
And the lever was pulled to prove the surviving definition is now the live one:
`0.34 → 0.12` inside `cheekHemAt` moves 32 of the 160 rigs, which is exactly the
two `deep` rungs (Wyrm-Crest, Sutton Hoo) on four classes at four hair rungs.
Before the collapse that same edit moved the hair's ceiling and left the plate
where it was.

**This does not fix the Wyrm.** The verdict above stands — it is a reshape, and
the guard still has to be cut to the jaw it covers. What has changed is that the
reshape now costs one edit instead of three sweeps and a wrong conclusion.

### And the comment above `cheekOut` was asserting a fix that is not in the build

`docs/PROCESS.md` failure mode 3 names this pair verbatim, and it was still
live: the comment opened *"1.52 rad on the short guards, not 1.10"* and argued at
length for 1.52, and the line under it read `: 1.10`. It also claimed *"it is
THIS constant that moves, not a copy of it inside the guard"*, which was false
when it was written — `deepHem`, seven hundred lines down, was that copy.

Rewritten to say what is true: **1.52 was tried and reverted, the short guards
are at 1.10, and the flank window it was meant to close is still open** —
`wearmeasure` §10 reports it today at 5.2% of the flank 62 mm off the ear on
huscarl/spectacle, 4.6% at 63 mm on huscarl/boar and 6.7% at 37 mm on
huscarl/crowned, six windows riding the PASS line as a deferral.

**The Hood is not yet judged.** 3.1% to 34.2% is the same signature, but a hood
draping round a face at three-quarter may simply be what a hood does. It needs a
look before it is called a fault.

---

---|
| by PART — "no body kit inside the face bounds" | reported 0.00%: a coif rides the head, so `rig:head` carries skin, mask, mail and gold alike |
| by COLOUR — match pixels to the `--ids` legend | reported 0.00%: the colour buffer holds material colour TIMES THE LIGHT, so the flat legend colour never appears in it |
| by AMOUNT, whole head | every helm 44-95%: a helm is entitled to the scalp, so a bar fails a helmet for being a helmet |
| **by SPREAD, face only** | **works** — masks are flat-high, bowls flat-low, only a fall changes with bearing |

Two things made it possible: `render()` keeping a per-pixel **`idbuf`** so which
part owns a pixel is a fact rather than an inference, and cutting the count at
the brow so the scalp stops drowning the signal.

**Still unexplained from the same screenshots:** a dark blade hanging from the
jaw on a warrior whose beard slot reads Clean Shaven, and the helm standing off
the skull in profile.

---

---|
| `art/look/slab-ids.png` (`--ids`) | the falls carry ONE torso material, so they are swept into the body mesh rather than the helm |
| `art/look/nocloak2.png` (`cloak: "none"`) | the cloak is genuinely off — its brown edge is gone from the rear panel — and **the falls remain** |
| `art/look/boar.png` | the same falls under a crested helm, so they are not that helm's nape flange either |

They also survive `hairStyle: "shaved"`, so they are not hair.

**Careful with `--dress`:** it takes appearance FIELD names and FIELD values, not
shop slot ids. `{"cloak":"cloak_none"}` is silently a no-op and the first attempt
at the control render was worthless because of it; the value is `"none"`. The
tell that it worked is the cloak's brown edge disappearing from panel 4.

**Ruled out earlier and recorded so nobody repeats it:** inverted normals
(`tools/faceseam.mjs` — the backlit triangles are symmetric scatter, x-sd/y-sd
0.89, not a band) and a mirrored transform (no negative-determinant world
matrix).

**The fix has two halves, and the second is HARDER THAN IT LOOKS.**

*The geometry:* the falls are too broad and hang too far forward. A real aventail
hangs BEHIND the jaw rather than beside the cheekbone.

*The assertion:* nothing asks "does any kit cross the face at the bearing the
shop photographs the warrior from". The obvious version of that check was written
and **thrown away, because it could not see the defect** — recorded here so it is
not written a second time:

> Rule attempted: *within the face's own on-screen bounds, no `rig:torso`
> surface may win the depth test.* A helm covering a face is legitimate (that is
> what a mask IS); body kit covering it never is, so draw the line on the part.
>
> It reported **0.00% and PASS** on the very warrior whose cheek is covered. The
> reason is in the ID legend: **the aventail is `rig:head`.** A coif rides the
> head, so it is parented to it, and every helm material is on `rig:head` too —
> `rig:head · 6e767f`, `· b6bfca`, `· bfa25c` are all steel and gold. There is no
> part boundary between "the mask that may cover your face" and "the mail that
> may not".

**So the discriminator has to be something other than the part**, and the easy
candidates each fail on a real garment:

- *No metal over skin inside the face bounds* — fails every masked helm, correctly.
- *Skin, then metal, then skin across a scanline* — fails the NASAL, which is
  exactly that pattern and is right.
- *Left/right asymmetry of skin coverage* — a three-quarter bearing is
  legitimately asymmetric, so the signal is buried in perspective.

**BUILT, AND THE HYPOTHESIS IS DISPROVEN.** `facelook --cover` renders the same
head twice at each bearing, bare-headed and helmed, and counts the skin that
went. It needed a real per-pixel id buffer to work at all — see below — and with
one, it measures:

```
helm         0deg   -35deg    35deg     spread
nasal       44.0%    42.8%    42.9%       1.2%
boar        63.0%    60.2%    60.2%       2.9%
suttonhoo   95.0%    97.3%    97.4%       2.3%
```

The design predicted a fall would spike at three-quarter and stay low from the
front, so that SPREAD would be the discriminator. **Every helm is flat.** The
falls take their share from every bearing, not only from the shop's, so spread
separates nothing and that idea is dead.

The table also shows why these numbers cannot be gated as they stand: they count
skin on the whole HEAD — scalp, ears, occiput — and a helm is entitled to all of
those. A bar here would fail a helmet for being a helmet.

**The next move, and it is now small:** restrict the count to the face proper —
below the brow and facing the lens — and the same differential becomes a gate.
The instrument is done; only the region is wrong.

**THE INSTRUMENT IS THE REAL DELIVERABLE.** Two attempts at this assertion
returned 0.00% on the defect and both failed for one reason: the rasteriser's
colour buffer holds the material colour TIMES THE LIGHT, so even under `--ids`
the flat legend colour never appears in it and matching pixels against the
legend finds nothing. `render()` now keeps an `idbuf` written where the depth
test is won, so which part owns a pixel is a fact rather than an inference. Any
future per-pixel assertion about who covers what depends on that and could not
have been written without it.

**Still unexplained from the same screenshots:** a dark blade hanging from the
jaw on a warrior whose beard slot reads Clean Shaven, and the helm standing off
the skull in profile.

---



## CLOSED — the Sutton Hoo's hair, and it was never the cloak

`npm run cosmetictest -- --no-render` is **16/16**. Long Mane reads **1.42%** and
Braided War-locks **1.31%** under the Sutton Hoo against a 1.00% bar, with
`wearmeasure` §10 still PASS at 0.27% (bar 0.35%) and `hairFitProbe` reading
**0.0 mm** of hair outside the metal on every Sutton Hoo row. `cheekIn` was not
touched.

**The entry this replaces named the wrong garment, and one measurement settles
it.** It said the gather was "buried in the cloak", quoted the cloak collar's
top edge at y 1.514 against the mail hem at 1.505, and concluded "the work is on
the cloak collar, not the hair". The check that was never run is what the gate
actually stages:

```
[cos] audit dress, read from /shot's own DRESS_IDS: ... cloak=cloak_none ...
```

`src/app/shot/page.tsx` says so in its own comment — *"Bare-headed and cloakless
on purpose"*. §3 builds a man with **no cloak on**. Sweeping the whole slot
through the gate's own rasteriser and lens:

```
[cloakprobe] cloak    hair      SIL%   (bar 1.00%)  — helm suttonhoo, huscarl s13, portrait -35
[cloakprobe] none     long       0.62
[cloakprobe] red      long       0.61
[cloakprobe] gold     long       0.61
```

Deleting or changing the cloak moves the failing number by **0.01 points**. The
cloak collar could not have fixed this and nothing on it was changed. The 9 mm
was read off a *render*, which is shot with a cloak; the gate is not.

### What was actually eating it, in two layers of the man's own mail

**1. The gather fell inside the hauberk.** `coifSquash` stops at the aventail's
lowest ring on the reasoning *"below the lowest ring there is no mail at all"*.
True of the aventail, false of the man — below it is the bishop's mantle. Every
one of Long Mane's below-hem vertices sat a mean **100 mm** and a worst **137 mm**
inside the torso's outer mail wall, and at the shop's lens **all 2804** of its
below-hem pixels were occluded by `rig:torso`. The route was described as going
"round the bottom of" the metal. It went round the bottom of the aventail and
straight into the hauberk.

**2. The aventail's "free hem" is not free.** `coifLevels` cuts the mail against
multiples of the SKULL's radii and it lands on a BODY. Per-azimuth, at the
bearings the masked fall occupies:

```
[prof] y=1.505 (the hem)   az -173  -158  -143  -128  -113
[prof]  aventail             169   174   183   191   194
[prof]  torso mail           177   184   197   212   222
[prof]  aventail - torso      -9    -9   -14   -21   -28
```

The hem the whole rung was built on is 9 to 28 mm **inside** the mantle. Mail
buried in mail looks exactly like mail, so nothing showed it.

### What changed

- `spine`, `at`, `layer`, `collar`, `ramp` and the two mail station lists are
  **hoisted out of the `emit("torso")` closure** so the head stack can read what
  the man is wearing below his collar. Outside the closure and not inside it,
  because `emit` caches merged geometry once materials are present — a second
  huscarl never runs the closure, so anything read from inside it would be right
  in every probe and absent in the game.
- The aventail's lower rings clear the mantle **rearward only** (`hd` deepened,
  `z` walked back by the same amount), so the arc the hair comes out of gets a
  real free edge and nothing in front of the ears moves.
- `MASK_SWING`: under a mask the fall's **section** swings out as it descends,
  so the gather lies on the mail instead of inside it.
- `shoulderRide`: the last few millimetres onto the stack's own superellipse,
  faded in over the 35 mm below the hem. **The gather rides; the ropes hang** —
  applied to the plaits it measured 84.7 mm of braids outside the helm.

**The lesson is the one the file keeps re-learning, and this time it cost the
route.** The travel was first written into `fit`, which moves finished points.
The profile has ten stations and only two fall below the hem, so an 85 mm
correction landed on a single quad and the gather came out as a fan of blades
standing through the mail — `art/look/hairfall-diag.png`. Fixing the curve it was
projected onto (`shell` sweeps a superellipse, not an ellipse) was a real bug
and changed the picture not at all (`-diag2.png`). Putting the same travel in the
SECTION, where the sweep interpolates it across every row, is what made one
curtain instead of ten fragments.

### What is honestly still weak, and it is the same bearing as before

**At the shop's own lens the gain is not the gather.** Of the 956 visible hair
pixels on the fixed build, every one is at y 1.55–1.83; **none** is below the
mail hem at 1.505. The three-quarter portrait looks at the man's front-left and
his own shoulder and arm stand in front of the nape, so the below-hem gather —
which is real, is now outside the mail, and reads as a curtain at −90° and 180°
— pays nothing at −35°. What the extra silhouette is, is hair filling the gap
where the aventail's rim opens past the cheek guard's rear edge as it descends.
That is a genuine opening and it costs 0.0 mm through metal, but it is the same
"hair in the helmet's own side slot" the previous entry flagged as weak.

Anyone raising this bar again should know that the below-hem route cannot pay at
−35° for a reason no amount of cloak, mantle or hem work will change: at that
bearing the gather is behind the man.

---

## CLOSED — the head stack's hair regression: ten rungs of ten

Supersedes the entry at the bottom of this file. `npm run cosmetictest --
--no-render` went from **8 swallowed to 2** and then to **0**; the last two were
both cells of the Sutton Hoo and they are written up under their own heading
below. The gate is green.

Silhouette against Shaved, huscarl, portrait lens at -35 deg — which is the
number the shop is judged on:

| helm | Warrior Crop 0g | Long Mane 40g | Braided War-locks 100g |
|---|---|---|---|
| Bare Head | 13.00 -> 13.00 | 21.00 -> 21.00 | 23.04 -> 22.76 |
| Iron Spangen 30g | 1.10 -> 1.10 | **2.26 -> 10.22** | **2.26 -> 9.18** |
| Nasal 110g | 1.07 -> 1.07 | **2.20 -> 9.91** | **2.20 -> 8.90** |
| Shadow Hood 120g | 0.38 -> 0.38 | 1.00 -> 1.00 | 1.00 -> 1.00 |
| Ridge 190g | 1.05 -> 1.05 | **1.98 -> 9.71** | **1.98 -> 8.70** |
| Spectacle 280g | 0.56 -> 0.60 | **1.19 -> 7.70** | **1.19 -> 7.31** |
| Boar-Crest 380g | 0.53 -> 0.57 | **0.95 -> 7.36** | **0.95 -> 7.04** |
| Jarl's Crowned 570g | 0.53 -> 0.57 | **0.95 -> 7.36** | **0.95 -> 7.05** |
| Wyrm-Crest 950g | 0.21 -> 0.21 | **0.31 -> 3.43** | **0.31 -> 4.48** |
| **Sutton Hoo 2400g** | 0.00 -> 0.00 | **0.05 -> 1.56** | **0.05 -> 1.44** |

The two paid styles are no longer identical to each other on any rung. The bar
is 1%, and "not identical to each other" is now an ASSERTION rather than an
observation — see the note on it below.

### What moved, and it is three constants that were all facing the wrong way

Every one of the three rules that deleted the hair was a CONSTANT standing where
the metal is a curve, so each of them culled a region much larger than the piece
it was written for.

- **`hairCeil`'s cheek-guard clamp** flattened hair to a 5 mm liner in a fixed
  0.45-1.60 rad box, down to `v > -0.95`. That is half a radian past the
  Spectacle's rear edge and a long way below every plate in the shop. It now ends
  at `cheekHem` — the plate's own free lower edge, hoisted to the stack beside
  `coifLevels` for the reason those were. Hair is compressed UNDER a guard and
  keeps its volume BELOW one.
- **`hairFall`'s coif ramp** ran from 0.34 rad IN FRONT of the aventail's opening
  to the opening itself, so the fall was already at zero everywhere a man could
  see it. The mane's window now sits IN the opening: a mailed man wears his hair
  pulled through the mail's face opening, which is the only place on him hair can
  be seen at all.
- **`if (style.cheek !== "none") continue;`** deleted both war-locks on the six
  rungs with cheek guards. They are ROUTED now — taken from under the plate's own
  hem, with the forward swing traded for outboard travel where a plate hangs
  beside them, and shortened by however far down the plate made them start.

`hangingMass` also gains `fit`, the ceiling `hairCeil` gives the scalp shell and
a falling mass never had. Without it a garment's only lever over a fall was
`mass`, and the only thing `mass` can do to a fall is delete it. That is the
general shape of the whole defect.

### CLOSED — the Sutton Hoo, and the opening was the bottom of its own mail

`cosmetictest` is GREEN. 16/16, and the two cells that were red read **1.56%**
(Long Mane) and **1.44%** (Braided War-locks) against a 1.00% bar, with
`hairFitProbe` at **0.0 mm and 0.00%** on the huscarl and the berserker at both
seeds. Nothing was relaxed and nothing was marked closed.

The entry below this one was right about the measurements and wrong about the
conclusion, and the reason is worth keeping. Four constructions were built and
every one of them put hair through metal:

| where the hair was put | cosmetictest | `hairFitProbe` |
|---|---|---|
| under the deep guard's hem, hanging | 0.05 / 0.20% | 46-107 mm of hair outside the rings |
| under the mask's own lower edge, at the throat | 1.35 / 0.63% | 19-77 mm out, and the frames show brown patches standing through the chest mail |
| plaits rooted at the throat, swung forward | 0.11% | into the mantle, invisible |
| plaits rooted at 0.30 rad | 0.12% | inside the body |

**All four looked for an opening ABOVE the collar, where the helmet genuinely
has none.** The aventail ENDS. `coifLevels`' bottom ring lies on the shoulder at
`skullY - R.y * 2.60`, and below that line there is no metal anywhere behind the
man's collarbones. `cheekHem` — the cheek plate's own free lower edge — is what
lifted the other nine rungs from 0.95-2.26% to 7-10%; the mail has exactly the
same thing and nobody had read it. It is `coifHemY` now, and a man with long
hair and a mail collar does not tuck it inside the rings anyway.

So the hair is gathered inside the aventail from the scalp down, squashed there
by `coifSquash` where no bearing can see it, and comes out under the hem onto
the shoulder. **The route never crosses metal because it goes round the bottom
of it.**

Three things had to be true for that to work, and each of them was a bug of its
own:

- **`hairCeil` did not know how far down the point it was fitting was.** A
  direction and a height are the same thing for a shell on a skull and are not
  the same thing for a mass that falls 400 mm, so the nape guard's `-5 mm` and
  the aventail's ring lookup were both being applied to hair hundreds of
  millimetres below the metal that owns them — which is what crushed every
  previous attempt back onto the neck. `atY` stops each at its own hem
  (`napeHemY`, `coifHemY`). Omitting it is exactly the old behaviour.
- **`coifSquash` exempted the mail's face opening on a helm that has none.** The
  rim opens from 1.46 to 1.80 rad as it descends, so a fall at 1.5 rad was
  squashed at the temple and released at the shoulder: **83.2 mm of mane
  standing outside the metal at 91 deg**, which is where the deep guard is.
- **The throat ventail is a second curtain and it sweeps to 2.45 rad.** Between
  it and the aventail there is a nested gap a fall can sit in and a radial ruler
  cannot read. The fall and the plaits are both held behind 2.26 rad, which is
  the one arc where the aventail is the only metal there is. Every value in
  front of that line was measured and every one of them reads 27-126 mm through.

The war-locks needed one thing more. Two ropes under a full mask measured
**0.89%** — four of them measured the same, because at the shop's own
three-quarter lens the inner pair is behind the head — and every honest lever
left (longer, fatter, further outboard, swung sideways once free of the hem)
either stopped paying or put the rope through the ventail. A plait is an ACCENT
on a head of hair everywhere else in the shop; under a mask there is no hairline,
crown or nape left for it to be an accent ON. So the rung now shows the same
gather the mane does — shorter, with `hank` doubled so the surface reads as rope
— with the plaits hanging past it. The two paid rungs separate at **0.73%**
under this helm and 6-13% under every other.

**What is honestly still weak:** most of what a player sees at the shop lens is
hair filling the helmet's own side slot (the gap between the guard's rear edge
and the aventail's front edge — `art/look/sh-long.png` panel 1 shows it plainly,
and the brief was right that it was already there). The gather below the hem is
real, measured and mostly buried in the cloak, whose top edge is at y 1.514
against the mail's hem at 1.505. A forward `lean` of 0.24 was tried to carry it
onto the shoulder in front of the cloak and moved the number by -0.02%. ~~**The
next honest move on this rung is the cloak's collar, not the hair.**~~

> **CORRECTED — that last sentence was wrong, and it sent a whole pass at the
> wrong garment.** The 9 mm was read off a render, and a render is shot with a
> cloak on. `cosmetictest` §3 stages the audit dress, which is `cloak=cloak_none`
> — sweeping the entire cloak slot through the gate moves the failing number by
> 0.01 points. What the gather was buried in was the man's own hauberk. See the
> CLOSED entry at the top of this file.

A mask on a class with no aventail — berserker, warden, runekeeper — still shows
nothing, and that is stated rather than hidden: what closes their throat is the
ventail, whose hem lands ON the hauberk collar, so there is no free edge between
the two for hair to come out of. Only the huscarl's mail creates the hem this
rung's hair uses.

### The ruler — what was built, what it measures, and what it does not

`wearmeasure` section 4 passed the shipped geometry because `SHOW_FLOOR` is a
fraction of THE HAIR THAT STILL EXISTS: delete nine tenths of a hairstyle and the
remaining tenth still sits in a direction no garment covers, so the ratio holds.
A ratio whose denominator moves with its numerator measures nothing.

`hairFitProbe` now also returns **KEPT** — of the directions the hairstyle
occupies ON A BARE HEAD, the share the helmed build still occupies and can be
seen in. The denominator is a build no helmet can reach. It reads 18-44% on the
shipped geometry and 21-62% here, so it moves the right way on every rung.

**It is REPORTED and not asserted, and that is a negative result worth having.**
Three weightings were measured against both trees:

```
bins occupied            main 17-44%    this tree 21-62%    <- published
bins weighted by extent  main  6-9%     this tree  6-11%
share of extent kept     main  6-8%     this tree  6-8%
```

The two weighted forms collapse because a helmet legitimately flattens 20 mm of
crown to a 5 mm liner and legitimately hides most of what is left — they punish
the correct behaviour as hard as the wrong one. The bin count moves but not far
enough to carry a bar that fails the shipped geometry without also failing this
one. Separating "thinned" from "compressed" on the CPU is still open.

**The lesson is not about that column.** The instrument that catches this
regression already existed and was already red: `cosmetictest`'s "every paid
hairstyle still reads under every helm that is not a hood" measures the
SILHOUETTE against Shaved through a camera — a fixed reference and a projection,
which is what a player actually has. The head stack shipped anyway because the
wave was judged on `wearmeasure`. **A gate nobody runs measures as little as a
gate that measures the wrong thing.**

### THE NEW ASSERTION — the ladder is measured against ITSELF, not only Shaved

Every rung in the table above is compared to a bare scalp, and that question
asked on its own has a hole straight through the middle of it: **two paid rungs
can each clear the bar against Shaved and be the same object as each other.**
That is not a hypothetical, it is the owner's exact wording — "a 40-gold Long
Mane and a 100-gold Braided War-locks are pixel-identical" — and the table
printed 0.05% and 0.05% under the Sutton Hoo and passed both.

`cosmetictest` §3 now also asserts **"no two PAID hairstyles are the same shape
as each other under any helm that is not a hood"**, at the file's existing
`IDENTICAL_PCT` (0.05%). No new threshold, and the hood keeps the one exemption
it already has, in the same place, for the same reason.

**Proof it bites, and proof it is not a duplicate of the check beside it.** The
war-locks' masked build was made identical to the mane's — same gather, plaits
stood down — and the run is unambiguous about which assertion sees it:

```
  PASS  every paid hairstyle still reads under every helm that is not a hood — all clear
  FAIL  no two PAID hairstyles are the same shape as each other under any helm that is not a hood — 1 merged
        MERGED  Long Mane (40g) and Braided War-locks (100g) are the same shape under The Sutton Hoo Helm — 0.00%
        the closest paid pair anywhere is Long Mane vs Braided War-locks under The Sutton Hoo Helm at 0.00% (bar 0.05%)
[cos] 15/16 checks passed
```

The old check passes on a shop that sells one shape twice. The new one does not.
On the shipped tree the closest asserted pair is 0.73%, under the Sutton Hoo.

### Proof both rulers still bite

`hairCeil`'s helm branch put back to a 25 mm standoff — hair through the bowl.
Re-run on this tip, because `hairCeil` gained a third argument and a ruler that
was proven to bite before a change is not proven to bite after one:

```
[wear] iron         long        6.8     50.00      77.0      51   -106/24 deg   <-- FAIL
[wear] iron         braids      6.8     50.00      85.5      61   -106/24 deg   <-- FAIL
[wear] crowned      long        5.4      1.05      67.9      30   -54/24 deg    <-- FAIL
[wear] suttonhoo    short       8.7      3.85      53.7      20   54/6 deg      <-- FAIL
[wear] FAIL: 14/30 hair-and-helm pairs keep to the stack
```

And the probe's own rim rule gained its missing half. The table is star-shaped
about the skull's centre, so a point BELOW a garment's free lower edge is at a
bigger radius than the edge and lands in the edge's own bin — hair hanging out
from under a cheek plate read as hair standing through it. The probe already
refused to make that mistake sideways and applied the reasoning to one bin of
AZIMUTH only; a hem 110 mm below the head's centre spans a dozen bins of
elevation. `coverLo` is that fix.

---

## THE ARMOURY JUDGEMENT — 7 Aug 2026 — SHIPPED on `main`

The owner's five complaints, judged from frames on this tip. **Four of the five
moved. One did not, and one fix bought its win with a cost nobody measured.**

`art/shots/` is gitignored, so the paths below are regenerable, not committed:
`npm run shots -- finishroster` (28 panels, ~45 s each, ~21 min).

### CLOSED — "Warden permanently has a green lower half no matter the finish"

This was the sharpest complaint and it is the cleanest fix. Live, the warden's
tunic was `CLASS_TUNIC.warden = 0x5a6630`, **hue 78° olive, in all seven
finishes** — `ap.armorColor` fed only `M.armour(...)`, which tints mail. It is
now `tunicDye(kit.tunic, accents)`, and the hue by finish is:

| finish | live | branch |
|---|---|---|
| Rough Iron | 78° | 42° |
| Polished Steel | 78° | 193° |
| Blackened Steel | 78° | 42° |
| Bronze Scales | 78° | 37° |
| Crimson Warplate | 78° | 18° |
| Sea Queen's Gift | 78° | 188° |
| Bretwalda Gold | 78° | 44° |

Proven in frames, not only in arithmetic:
`art/shots/cards/finishroster-1._Rough_Iron_0g_warden.png` is an olive-khaki
skirt over tan leg wraps; `…-6._Sea_Queen_s_Gift_130g_warden.png` is a **teal
skirt, navy mail and white wraps**. The whole man moves, not the shirt.

**Residual:** at Rough Iron — the free default, which is what a player who has
bought nothing sees — the tunic is still a yellow-olive (42°). It is browner
than live and it is no longer *permanent*, but the first impression of the
warden is unchanged until the player spends. That is the honest limit of this
fix.

### OPEN, NEW, AND CAUSED BY THE FIX — the four classes now wear one tunic

`tunicDye`'s comment claims the class "shifts hue a fifth of the way … so four
tunics stay four tunics." **The frames and the arithmetic both say otherwise.**
Mean pairwise RGB separation across the four class tunics, against live's fixed
constants (27.8):

```
LIVE  (class tunic fixed, same in every finish)          27.8
BRANCH  Rough Iron          8.8   (32% of live)   <-- the free default
BRANCH  Polished Steel      4.6   (17%)
BRANCH  Blackened Steel     2.5   ( 9%)   <-- all four classes are one colour
BRANCH  Bronze Scales       9.1   (33%)
BRANCH  Crimson Warplate   10.0   (36%)
BRANCH  Sea Queen's Gift   14.3   (52%)
BRANCH  Bretwalda Gold     12.0   (43%)
```

The cause is one line: `s = min(0.6, a.s * (0.72 + b.s))`. Saturation is
*multiplicative* in the dye lot's own saturation, so when the lot is near-neutral
(Blackened Steel's `0x3a3733`) every class lands on the same grey and the 0.2 hue
shift has no chroma to be visible in. Class lightness cannot rescue it either —
all four accents sit at L 0.29–0.31, so they were never separating on value.

This is a **regression in class readability against live**, and it applies at the
free default, not only to players who buy. It ships because the classes still
read apart by silhouette, weapon, helm and cloak (`art/shots/lineup.png`), and
because reverting it would restore the owner's own complaint. It is the
predictable next complaint — *"all my characters look the same now"* — and it
should be the first thing the next wave fixes.

**The fix is known and measured, not guessed.** An additive class-chroma term
plus a stronger hue weight roughly doubles separation for ~13% of finish travel:

```
hue 0.20  satAdd 0     mean class sep  9.0   finish travel 24.2   (shipped)
hue 0.34  satAdd 0.18  mean class sep 14.3   finish travel 23.5
hue 0.40  satAdd 0.22  mean class sep 18.3   finish travel 21.1
```

Not applied this wave: it is a look change to all four classes in all seven
finishes, and the 28-panel sheet that would prove it costs 21 minutes of the
capture channel. Do it with the sheet, not without.

### CLOSED — "no cloak option"

`cloak_none` has existed since the initial commit. The defect was that
`.tab-strip` cut the eight tabs at **"CLO…"** on a 1440 desktop, so CLOAKS,
ARMOUR FINISH and WAR PAINT were unreachable with a mouse — worse on desktop
than on phone, which can swipe. The strip now wraps above 700 px.
**A/B: `art/ui/live-helmets-desktop.png` (cut) vs `art/ui/wave-helm-desktop.png`
(two rows, all eight reachable).** Phone keeps the strip and is untouched
(`art/ui/wave-helm-phone.png`).

### CLOSED — the Roman banded plate is off the warden

`lorica segmentata` — six rigid courses, plate yoke, iron shin plate — is gone;
he wears a hip-length mail byrnie, a shoulder doubling and cross-gartering. The
`lamellar` boolean is renamed `wallman` so the flag stops naming armour that is
no longer on the model. Visible in `art/shots/lineup.png`.

### OPEN — the head is a lateral move, and the shop's light is the reason

The beard no longer swallows the mouth: live's default Close Crop ran to
`Y_LIP + 0.045` and buried an `addMouth` nothing could see. On this tip the mouth
is the gap between two masses. **But at portrait size the beard now reads as
scattered dark flecks on a pale, washed-out cheek rather than as hair** — see
`art/ui/wave-helm-phone.png`, where the mannequin is largest. Live's solid dark
beard read *worse anatomically and better as a character*.

The largest single cause is not geometry: it is `armouryStage.ts` exposure. The
same head reads well under the arena's dusk key (`art/shots/final/`) and pale and
blotchy in `art/ui/wave-helm-*.png`. **The owner is looking at the shop.** Fix
the shop's key light before touching the head again.

### The gate this shipped on — every final line, on this tip

```
npm run build                        exit 0 — 14 routes, all ƒ (Dynamic)
npx tsc --noEmit                     TSC EXIT 0
npm run lint                         ✖ 11 problems (9 errors, 2 warnings)   [bar 12]
npm run playtest                     [playtest] 34/34 controls working              EXIT=0
npm run touchtest                    [touchtest] 27/27 touch assertions passing     EXIT=0  (2nd run)
node tools/firetest.mjs              [firetest] 7/7 claims proven                   EXIT=0
npm run profiletest  (with DB)       [profiletest] 68/68 checks passing             EXIT=0
npm run profiletest  (no DB)         [profiletest] 22/22 checks passing             EXIT=0
npm run soundtest                    [soundtest] 22/22 claims proven                EXIT=0
node tools/phonesound.mjs            [phonesound] 7/7 claims proven                 EXIT=0
node tools/bindsynctest.mjs (DB)     [bindsync] 8/8 checks passing                  EXIT=0
node tools/cameratest.mjs            [cameratest] 13/13 passed                      EXIT=0
npm run summaryflow                  [flow] 14/14 passed                            EXIT=0
npm run cheattest (fresh postgres)   [cheattest] 40/40 checks passing               EXIT=0
node tools/latencytest.mjs judder    JUDDER VERDICT: 17/17 checks pass — PASS       EXIT=0
node tools/headmeasure.mjs           3 ratios outside tolerance · 0 of 15 SILHOUETTE FAILED
node tools/wearmeasure.mjs           [wear] PASS: 10/10 helmets seated              EXIT=0
npm run cosmetictest                 [cos] 18/18 checks passed
                                     [cos] 19 rendered captures, 744.1 s wall clock
                                     [cos] PASS                                    EXIT=0
npm run perf                         low 743 draw calls · medium 3785 · high 4280  EXIT=0
```

`perf`'s frame times on this box are swiftshader, not a device, and mean nothing.
**Draw calls are the comparable number and they are identical to the pre-judgement
run** — 743 / 3785 / 4280 — so nothing in this wave costs a frame.

**touchtest took two runs, and the flake is now diagnosed rather than shrugged
at.** The failing term is not the facing error — that was **1.3°**, well inside
the 0.5 rad bar. It is `yawTravel > 0.15` in `tools/touchtest.mjs:521`, a guard
that requires the camera to have turned at least 8.6° so the assertion cannot
pass on a target that never moved. The bot happened to walk almost radially, the
camera only needed 4°, and the guard could not confirm tracking. The lock was
working perfectly in the run that failed. **Do not "fix" this by loosening the
bar** — the guard is correct and the retry policy is the right answer.

`bindsynctest` also exits 1 with no database; it needs `PROFILE_TEST_DB` and
says so. That is not a flake and not a defect.

**The repricing is economically safe, and this is the run that proves it** —
20–60 g became 60–160 g in `cced17b`. Ownership is a set of **ids**
(`src/db/catalogue.ts:144` `if (ownedSet.has(id)) continue`), and no id or stored
hex moved, so nothing already bought is re-billed and no profile is orphaned.
`cheattest` 40/40 on a fresh postgres is the outside check on that.
**It is still a price rise, and a price rise is the owner's call, not ours.**

### PARTLY CLOSED — ten helms, and you *can* tell them apart

`art/shots/helm-cards.png`, captured on this tip (10 panels, one huscarl, one
mark, one camera). The owner's "pointed dark shapes with wing-like flares" is
**not what this lens shows** — at portrait they are bright polished steel, and
six of the ten are unmistakable:

| distinct | Bare Head · **Shadow Hood** (now black wool, not a red balaclava) · Boar-Crest (gold boar) · Jarl's Crowned (circlet + spikes) · **Sutton Hoo** (full mask, intact — no regression) · Ridge Helm |
|---|---|
| **too alike** | **Iron Spangenhelm / Nasal Helm / Spectacle Helm** — three near-identical domes separated only by a nasal bar and a small apex spike |
| **also alike** | Ridge Helm vs Wyrm-Crest — both a dome under one big curved arch |

So the helm complaint is **half real**: the ladder is not ten dark cones, but
30 g, 110 g and 280 g buy three shapes a player cannot tell apart. That is the
rung to fix, and it is a narrower job than "rebuild the helmets".

### OPEN, AND THE LOUDEST THING IN THE FRAME — the face is speckled

The beard fix worked: the mouth is no longer buried. **But at ~400 px of head
the face carries scattered dark brown flecks across cheek, forehead and jaw that
read as dirt or scabbing rather than as stubble** — plainest on
`art/shots/helm-cards.png` panel 1 (Bare Head) and on `art/ui/wave-helm-phone.png`,
where the mannequin is largest.

**This is not scored as a regression**, and the reason matters: the same cheek
speckle is present in the live capture `art/ui/live-helmets-desktop.png`, so it
predates this wave. What the wave changed is that the beard no longer *hides* it.
Thinning the beard revealed a skin defect that was always there.

Both causes are already named and neither is geometry on the beard:
`armouryStage.ts` exposure (the same head reads fine under the arena key in
`art/shots/final/`), and the complexion stamp. **Fix the shop's light first** —
it is one number and it is what the owner is looking through.

### OPEN — the helmets were diagnosed and deliberately not touched

"Pointed dark shapes with wing-like flares" localises to two numbers: the `cone`
bowl at taper `1.15` is a near-linear rise (a straight-sided cone with a sharp
apex), and the nape fall starts at `skullY + R.y * 0.47` — above the head's
centre — and flares to `R.x * 1.38`, which reads from the front as two wings
behind the face on ridge/boar/crowned/wyrm. Not changed without a before-shot to
A/B against; the risk was regressing the Boar-Crest and Sutton Hoo, and
`docs/SUTTON-HOO.md` is about exactly that failure. Sutton Hoo is captured
intact at `art/shots/final/facecard-helmhelm_suttonhoo-…png`.

---

Current reference: **`art/shots/v12/`**. A/B against `v11/`.
The head's own turntable: **`art/shots/judge9c/`** (portrait) and
`art/shots/judge9b/head-turn-fight.png` (fight range). A/B against
`art/shots/judge/`, which is the capture the owner's three notes came off.

**The A/B against what is LIVE**, taken for the land judgement below and the
only capture set in this file shot from two trees with one instrument:

```
art/shots/judgeA-high/  art/shots/judgeA-med/  art/shots/judgeA-low/   origin/main cfb49fc  (LIVE)
art/shots/judgeB-high/  art/shots/judgeB-med/  art/shots/judgeB-low/   this branch 60fbeae
```

Regenerate with `node tools/shoot.mjs headturn headturnfight --quality
{low,medium,high} --out <dir>`, one tier at a time, from a production build.
`--quality` is what makes a two-viewport judgement possible at all: sheets use
the card's own fixed lens so `--w/--h` never reaches them, and `detectTier()` on
a headless box always answers the same thing. **desktop = `high`, mainstream
phone = `medium`, weak phone = `low`** (`render/quality.ts:204`).

---

## THE LAND JUDGEMENT — 6 Aug 2026 — SHIPPED, and what shipped broken

76 commits went to `main` at this tip. The test applied was **not** "does the
head reach 8" — two judgements have already held this branch on that bar and
between them kept the reticle, the helm seating, the cosmetic harness, the sweep
table and the platform correction off the live game for two days. The test
applied was **is anything here a regression against what live players have
today**, measured from frames of both trees.

**Nothing was.** Everything below is a fault that SHIPPED. It is here so the next
wave inherits a list instead of rediscovering it.

### What the head A/B actually shows, by tier

| bearing | live `cfb49fc` | branch `60fbeae` | verdict |
|---|---|---|---|
| profile, desktop | no nose — a pug bump on an egg; ear is a **torus with daylight through the middle**; chin runs straight from lip into the throat | nasal bridge and dorsum, a mental fold, a gonial corner, an ear that is a closed shell with helix, concha and lobe | branch |
| three-quarter, desktop | a hard faceted **plane break** creasing inner brow to jaw | no crease | branch |
| back 180°, desktop | one unbroken egg | inion, nuchal hollow, lambdoid flattening, temporal plane | branch |
| front, desktop | painted slash brows and two dark slots on a smooth ball | brow that casts, orbits, nose with a tip, vermilion, chin | branch |
| **skin, every bearing, every tier** | a ruled square lattice of identical stamps — the woven cross-hatch. Forehead patch, band-passed 3–12 px: lattice peak **18.20x** the band mean | soft incommensurate mottle: **7.91x** at `high`, **11.84x** at `low` | branch |
| **fight distance, every tier** | ~35 px of pale blob | ~35 px of pale blob | **no difference either way** |

The fight-distance row is the one that decides "regression": the lens a player
spends the match behind cannot tell these two heads apart, so nothing a live
player does today got worse. The shop lens is where the branch's gain is, and it
is the lens 2400 gold is spent through.

### The gate this shipped on — every final line, on this tip

```
npm run build              ✓ Compiled successfully · 5/5 static pages            exit=0
npx tsc --noEmit           (no output)                                           exit=0
npm run lint               ✖ 11 problems (9 errors, 2 warnings)  — IDENTICAL on cfb49fc, pre-existing in src/
npm run playtest           [playtest] 34/34 controls working                     exit=0
npm run touchtest          [touchtest] 27/27 touch assertions passing            exit=0
node tools/firetest.mjs    [firetest] 7/7 claims proven                          exit=0
npm run profiletest        [profiletest] 22/22 checks passing                    exit=0
    with a database        [profiletest] 68/68 checks passing                    exit=0
npm run soundtest          [soundtest] 22/22 claims proven                       exit=0
node tools/phonesound.mjs  [phonesound] 7/7 claims proven                        exit=0
node tools/bindsynctest    [bindsync] 8/8 checks passing                         exit=0
node tools/cameratest.mjs  [cameratest] 13/13 passed                             exit=0
npm run summaryflow        [flow] 11/11 passed                                   exit=0
npm run cheattest          [cheattest] 40/40 checks passing   (fresh postgres)   exit=0
node tools/latencytest     JUDDER VERDICT: 17/17 checks pass — PASS              exit=0
node tools/headmeasure     3 ratios outside tolerance · 0 of 15 SILHOUETTE assertions FAILED
node tools/wearmeasure     [wear] PASS: 10/10 helmets seated                     exit=0
npm run cosmetictest       [cos] 18/18 checks passed · 47 options, 55 pairs      exit=0
```

`playtest` and `touchtest` both came back green **first run** this time. That is
not evidence the flake is fixed — see FAULT 5. It is one sample of a gate that
has been measured at one failure in three, and it is exactly the kind of run that
would have been believed.

`cosmetictest` regenerated `docs/COSMETICS-SWEEP.md` byte-identical to the
committed table apart from the date and the wall clock (1091 s → 929 s). A
harness that reproduces its own published output is worth more than the assertion
count beside it.

### What it costs, measured on one instrument against both builds

`tools/perf.mjs` copied into a worktree at `cfb49fc` and run against main's own
production build, so the counter is identical on both sides. The fps figures are
SwiftShader's and mean nothing; the draws and triangles are the same numbers a
player's phone renders.

| tier | draws `cfb49fc` | draws `60fbeae` | Δ | tris `cfb49fc` | tris `60fbeae` | Δ |
|---|---|---|---|---|---|---|
| **low** (weak phone) | 739 | **739** | 0 | 307,889 | **341,183** | **+10.8%** |
| **medium** (the phone) | 3801 | **3737** | **−64** | 1,731,422 | **1,820,952** | +5.2% |
| **high** (desktop) | 4304 | **4234** | **−70** | 2,400,620 | **2,431,854** | +1.3% |

**Draw calls fall or hold on every tier.** Triangles rise, and all of the rise is
the head: `LOD.low` went 14×10 → 30×30 and `LOD.medium` 30×30 → 40×44, bought
partly back out of `body` and `limb`. That is a real cost paid on the tier phones
get, for a head that still does not pass — **it must not rise again before the
head reads.** These are the recorded baselines now.

### FAULT 1 — the phone floor under-samples a face that now has content

**Ships. Measured. Worst thing on this list.**

`art/shots/judgeB-low/cards/headturn-front_0_.png` against
`art/shots/judgeA-low/cards/headturn-front_0_.png`. At `low` the branch's nose,
philtrum and chin read front-on as **one continuous keel** from brow to below the
jaw, with the mandible closing to a V. Live's front-on at the same tier is a
featureless egg with painted brows. Both fail axis 5; the branch fails it
differently, and a keel is a louder failure than a blank.

The cause is arithmetic and it is in the file already. `LOD.low` is
`headU: 30, headV: 30` (`characters.ts:1655`) — raised from live's **14×10**, so
this branch is a large improvement at this tier and still under Nyquist for the
tightest creases, which the comment above the table admits in as many words. The
mesh can see the brow, the socket and the dorsum; it cannot see the alar crease
or the columella undercut that give the nose sides, so the sides vanish and what
is left is the midline.

**Do not fix this by flattening the nose.** The two honest fixes are (a) take
`low` to the same 40×44 the other two tiers carry — the head is one merged
geometry per warrior and the note at `characters.ts:1630` already argues this is
a correctness number, not a quality one — and measure the cost at the tier, or
(b) widen the alar and columella terms at `low` only, the same way the philtrum
was widened to clear its own sampling limit. (a) first; it is one number.

**It is not a regression:** a `low` device is a weak phone (`cores <= 4 ||
memoryGb <= 4 || minDimension <= 320`), a mainstream phone gets `medium`, and
`medium` on this branch carries the full 40×44 head where live gives it 30×30.

### FAULT 2 — the mass relation is still open, and it is still unmeasured

Unchanged from the entry below: front-on is the weakest bearing at every tier and
the read is "a small face on a large smooth dome". Four proportions have now been
measured and all four are at or better than life (`facePanel` 0.795 against 0.72,
`craniumShare` 0.342, `breadthOverHeight` 0.703, `lengthOverHeight` 0.843), so
**stop reaching for the proportions**. The two candidates in order are the
features' share of the face and the complexion narrowing what geometry made
broad. Neither is measured.

### FAULT 3 — three ratios still outside tolerance, and two of them measure a covered throat

`node tools/headmeasure.mjs` → `3 ratios outside tolerance · 0 of 15 SILHOUETTE
assertions FAILED` (was 6 and 0 of 12 at the last judgement).

```
jawOverCheek     0.774 0.788 0.807   0.860±0.080   OUT by 0.006
neckOverHead     0.824 0.843 0.866   0.750±0.090   OUT by 0.026
neckOverJaw      1.039 1.087 1.123   1.000±0.120   OUT by 0.003
```

`neckOverHead` and `neckOverJaw` are asserted on a huscarl whose `CLASS.gorget`
is `1.0` — the throat is a leather collar from jaw to yoke and no skin neck is
visible on the class every head sheet is shot on. **Retire them or re-site them
on a `gorget: 0.0` class** (runekeeper or berserker). `jawOverCheek` is rounding
against a bizygomatic that is 22% over life by art direction; rewrite the
tolerance or delete it. Nothing here is worth sculpting for.

> **CORRECTION — do not act on the paragraph above.** `CLASS.gorget` IS READ BY
> NOTHING. `grep -rn gorget src/` returns the field declaration, the four class
> rows and these two notes, and no consumer anywhere in the build. The huscarl's
> `1.0` has never covered a throat: there is no leather collar, and the neck he
> is measured on is bare skin from the jaw to the tunic collar, exactly like the
> berserker's. So `neckOverHead` and `neckOverJaw` measure what they say they
> measure, and both are load-bearing — retiring them on the strength of a number
> that does nothing would have thrown away the only two instruments watching the
> shape the owner went on to complain about. The error came from taking a table
> at its word instead of grepping for its reader, which is the same mistake as
> trusting a comment over the neck's own material: see the note over
> `emit("neck", …)` in `characters.ts`.

### FAULT 4 — the phone lost the flick chevrons with the gunsight

The old lock reticle drew a pair of chevrons on mobile only, saying which way the
thumb goes to take the next man. The quiet mark that replaced it does not
(`GameHud.tsx`, the `isMobile.current && (...)` block is gone). The gesture still
works and `touchtest` still proves it; what went is the affordance that told a
new player it exists. Small, real, and cheapest to fix in the tutorial line
rather than by putting ink back on the glass.

### FAULT 5 — two gates are not deterministic, and one of them was believed

Carried forward and **still open** — see the entry further down. `touchtest` fails
about one run in three at 160° of facing error; `playtest` fails about one run in
three on a mouse sweep its own harness did not register. Two runs agreeing is what
a person uses to decide something is real, and here two runs agreed on a false
positive. Both need their input synthesis to wait on the client having *received*
the pointer delta rather than on a wall clock. **This is the top item of the next
wave** and it is the only thing on this list that makes a verdict untrustworthy
rather than a picture ugly.

### FAULT 6 — the shop still sells four cloaks that are one mesh, at portrait

`npm run cosmetictest` is **18/18** and the three 0.00% shop pairs are closed at
fight distance. What is not closed is the price ladder itself: the geometry now
differs, but `COSMETICS-AUDIT.md §5`'s cut/reprice list has still not been acted
on, and all four war paints remain byte-identical under the Sutton Hoo mask (a
110g paint invisible under a 2400g helm). Correct behaviour from the mask; a shop
problem at the till.

### FAULT 7 — two unexplained console errors on the phone armoury load

`net::ERR_CONNECTION_RESET` and a `404`, reproduced on both `armourycard.mjs` and
a bare probe at 390×844. Named twice now and diagnosed never.

---

## The head, pass eight: the ear, the crease and the grid are closed; the mass is not

**Read this before touching the face.** Eight passes now. The method that finally
holds is from the seventh and must not be lost: the profile is AUTHORED as an
outline (`SAGITTAL`) and the midline is PINNED to it, and the gate asserts on the
SILHOUETTE rather than on ratios between landmarks. Do not go back to tuning
gaussians against a list of adjectives.

This pass took the owner's three notes off `art/shots/judge/cards/`. Two are
closed with a frame behind them, one is half closed, and the honest verdict on
the remaining half is at the bottom.

### 1. CLOSED — the ear was a torus with daylight through it

The build was `ball + torus + ball + torus + ball`. A sum of primitives has no
outline, which is the identical failure this file already diagnosed and fixed for
the head itself, and two things followed from it: the ring's hole is only covered
from the one bearing it was checked at, and every primitive was seated at a
single half-breadth taken at ONE latitude while the skull it lands on tapers — so
the bottom of the rim stood outside the head and the sky came through under it.

Now ONE closed radial shell per ear (`EAR_OUTLINE`, `EAR_SECTION`, `earPoint`,
`auricle`), 58 x 33 mm, with a helix crest, an antihelix, a tragus and a concha
floor that is closed at the back — and with the rim's depth **measured** per angle
off the skin it lands on rather than authored, then buried by `EAR_SEAT`.

**S6 was the other half of this defect and is the more important fix.** It was one
number, `earStandoff`, and it passed at 12.7 mm on the torus — because a standoff
is a property of one curve and cannot tell a shell from a curtain ring nailed to a
head. It is now four numbers, and the one that bites is `earSeat`: the worst point
of the rim against the skin under it, which must be NEGATIVE. Proof that it bites
rather than merely being present — re-seating the rim on a plane, as the five
primitives did, and running the gate:

```
  earSeat                 13.364    14.699    16.254  -9.000..-0.500   FAIL
[head] FINAL: 6 ratios outside tolerance · 1 of 15 SILHOUETTE assertions FAILED
```

### 2. CLOSED — the mid-face plane break, and it was an envelope

"A hard-edged plane break creasing from inner brow to jaw at three-quarter, and
the nose reads as an upturned pug with the subnasal mass pushed forward as one
block."

Both halves are one line. The pin splits its residual into a broad half (the
facial skeleton coming forward off the braincase) and a narrow half (the tip over
the subnasale, the vermilion over the fissure), and **both were being delivered
through `massEnvelope`** — a plateau with a shoulder. That is correct for the
plate, because a maxilla is genuinely flat across the front of a face. On the
narrow half it puts a flat panel down the middle of the face out to 0.16 rad and
then a shoulder, and since `PIN_W` widens as it descends (0.35 at the nose, 0.58
at the lip, 0.62 at the chin) the shoulder sweeps outward as it falls. Inner brow
to jaw. The flat top is the pug.

`ridgeEnvelope` — a raised cosine, zero derivative at the midline and zero again
at the edge — replaces it on the narrow half only. The midline profile is
untouched (the envelope is 1 at bearing zero), so every S1/S2/S3 assertion holds.

Two more things the frame said were missing and the arithmetic agreed with:
- **the philtrum was below Nyquist ACROSS.** 0.035 of sigma in x against 40
  columns, which is 0.157 rad — four and a half times under. There was nothing
  there to see. 0.085 now, which is half the column spacing and also a 14 mm
  philtrum, with its two crests.
- **no mental fold.** Three rows straight from pogonion to gnathion is an arc.
  `SAGITTAL` gains a row at −0.820 holding the chin's front face out, so the drop
  to gnathion is a corner. `gonialOverArc` 4.77 -> 6.42.

### 3. HALF CLOSED — the cranial vault

"An unbroken egg. Enormous, smooth, featureless at 180 degrees, with a small face
crammed into its lower front quarter."

What the vault now has, and the 180° and 90° panels of `art/shots/judge9/` show
all three: an **occipital curve** (the inion as a distinct mass with the nuchal
plane hollowed under it, and a lambdoid flattening above, so the back reads as two
planes meeting at a landmark instead of one arc), a **temporal fossa** — a broad
6 mm plane from the lateral orbit back to the ear with a superior temporal line
above it, where what was there before was a 2.5 mm thumbprint — and a **brow that
casts**.

The brow is worth a paragraph because the obvious fix is wrong and costs an hour.
Raising the ridge's crest to steepen its underside takes the shop from 10/10
helmets seated to **2/10**: every helm in the game seats its bowl on that exact
band and `wearmeasure` puts the clearance under a millimetre. The overhang is the
same angle whether you lift the ridge or drop the skin under it, and only one of
those grows the head into the bowl sitting on it. So the crest keeps its 9 mm and
the orbital margin below now cuts 9 mm instead of 4.

**What is NOT closed: the mass relationship.** Front-on
(`art/shots/judge9c/cards/headturn-front_0_.png`) is still the weakest bearing by
a distance and the read is unchanged: a small face on a large smooth dome. This
is the same item the seventh pass logged and could not measure.

**A new measurement, and it DISPROVES the standing theory.** `facePanel` asks how
much of the head's breadth the face occupies at the eye line — swept from outside
the nose at bearing 0.30 out to where the surface has fallen 15 mm behind the
cheek, which is where a viewer stops reading "face" and starts reading "side of
head". The theory for three passes has been that the face is narrow. **It is
not:** 139–164 mm of panel on a 176–206 mm head, 0.76–0.83 against a life 0.72.
The face is if anything slightly broader than life.

So the read is real and it is not breadth, and it is not `craniumShare` (0.338
against a canon 0.35), `breadthOverHeight` (0.703 against a life 0.67) or
`lengthOverHeight` (0.843 against 0.845) either. All four now measured, all four
at or better than life. Whatever carries this read is something else, and the next
pass should stop reaching for the proportions.

*(A warning for whoever writes the next probe: the first cut of `facePanel` took
its datum at the midline and reported 0.116 — a face a ninth of the head's
breadth — which would have sent this straight back to widening a face that is not
narrow. At the eye line the MIDLINE IS THE NOSE, so a fall measured from bearing
zero is the nose's own falloff. `headSilhouette`'s S7 note says exactly this and
it got made anyway.)*

**The two candidates left, in order.** Neither is measured:
1. **The features' share of the face, rather than the face's share of the head.**
   The eyes, nose and mouth occupy a vertical band from `Y_EYE` to `Y_LIP` — about
   a fifth of the head's height — with large unbroken cheek, temple and forehead
   around it. Larger, fewer, more certain features is the stylised answer and it
   costs nothing in geometry.
2. **The complexion is narrowing what the geometry made broad.** The panel is
   151 mm and the LIT part of it front-on is far less than that. This file has
   already caught the same field painting the face narrow once ("the silhouette
   measures 190 mm at the cheekbone against 163 at the jaw, which is a broad face.
   It was being *painted* narrow") and halved the buccal terms for it. Measure the
   luma across the face at the eye line on the front card before touching any
   geometry.

**What the next pass should do about it.** Take the owner's explicit offer and
commit to the stylised head rather than to realism: the face's job is the armoury
portrait at 300–400 px where a player spends 2400 gold, and at fight distance the
judge already found "no defect, no character" in a 30 px blob. The vault work
above is that choice being made — confident planes with landmarks between them —
and the next lever is the same one applied to the face: fewer, larger, more
certain features. **Do not** do a parameter sweep, and do not reach for the nose.

### What it costs

Same instrument, low tier, `dd7821f` against this tip:

```
was   739 draw calls  337,615 triangles      (this branch, before this pass)
now   739 draw calls  341,189 triangles
```

Draw calls unchanged. The ear itself is *cheaper* than the five primitives it
replaces — 28 x 9 quads is 504 triangles a side against 406 for the ball, torus,
ball, torus, ball, but the shell carries two materials into the head's merge where
the primitives carried three, so the material count came down as the triangle
count went up. The rest of the +3,574 is the cloak and beard work landing in the
same window, not the head.

### Two new defects on the ear, logged rather than chased

Both are on the shell this pass built and both are visible in
`art/shots/judge9c/cards/headturn-profile_90_.png` at 7x.

1. **A violet rim down the inner wall of the helix.** 69 pixels, mean RGB
   (153, 85, 100) against skin at (202, 113, 68) nearby — much more blue at
   similar red, which is the night sky. The inner wall of the rim is the one
   steeply up-and-outward-facing surface on the head, so it takes the arena's cool
   hemisphere and environment square on over a warm albedo. It is not the shade
   tone (0x9b7456 is brown) and it is not the complexion's flush (which removes
   blue). Left alone deliberately: it is an interaction with the arena rig and the
   environment intensity, not with the head, and this wave owns the head.
2. **The bowl is faintly faceted.** Fixed once already this pass — seven radial
   rings put the helix crest at 0.78 between samples at 0.714 and 0.857, so the
   rim was a chord across its own peak and the facets read as a spider of radial
   creases. Nine rings land on 0.222 / 0.444 / 0.778 against control points at
   0.20 / 0.44 / 0.78. What is left is mild and is the angular count (28), not the
   radial one.

### The tape measure itself was wrong twice, and both are fixed

Worth its own heading because two of the six out-of-tolerance ratios were the
INSTRUMENT and no amount of sculpting would ever have closed them.

- **`noseProjection` (+0.43) and `chinBeyondNasion` (+0.93) were measured against
  the middle of the man's forehead.** The nasion is found by sweeping for the
  deepest point of the nasal root, and the band ran to `Y_BROW + 0.10` — a tenth
  of the field ABOVE the glabella. A nasion is by definition below it. On a
  forehead that correctly rakes back 12°, the deepest point in that band is the
  frontal bone at y = 0.319, where `SAGITTAL` reads −10.7 mm against the nasion
  row's −5. Bounded at the glabella, and `nasionFromCrown` is now published beside
  it so a probe that wanders onto the forehead says so.
- **`tipBreadth` (+4.05, 15–31 mm across seeds) was `F.asym` doubled.** The owner
  called it an unpinned parameter and was right that it was not a tuning error,
  but the parameter is not on the nose. `tipHalf` swept ONE side and doubled
  `|p.x|`, on a face whose midline is deliberately drifted up to 2.2 mm sideways
  ("a symmetric face is a mask") — so 2 x 2 x 2.2 = 8.8 mm of the 12 mm spread was
  the drift. Bisecting every trait confirms it: forcing `span(seed, 18, …)` alone
  to zero drops the spread from 11.9 mm to 3.9, and no other trait moves it by
  more than 1.4. A nose displaced sideways is not a wider nose. Measured between
  the two sides, and with the ridge narrowed now that the plateau no longer has to
  be hidden: **18.6–23.2 mm**, a bulb.

Ratios outside tolerance: **6 -> 3**. The three that remain are `jawOverCheek`
(0.006), `neckOverJaw` (0.003) and `neckOverHead` (0.026), and the last two
measure a throat the huscarl's `gorget: 1.0` covers completely on the class every
sheet is shot on. They are not worth chasing; they are worth **deleting or
re-siting**, and that is the next honest change to this file.

### The skin was a woven cross-hatch, and it was the tile repeat

`FACE_TILE` was 8.5 mm, chosen by reading the recipe: the ridge field's base
octave lands at 1.1 mm, under a pixel, therefore grain. The frame disagreed. An
FFT of an 80x80 patch of the vault returns ONE sharp peak at 5.7 px with almost no
y component — a ruled square lattice, 4.7 mm at that card's 1.22 px/mm. Nothing in
the recipe is 4.7 mm. 8.5 / 4.7 is 1.8, and that is the tell: a 256-texel map at a
8.5 mm tile is 25 texels to a pixel, mip 4.6, an effective 10x10 map — every
octave the recipe was reasoned about is filtered away and all that is left is one
blob per tile, stamped every 8.5 mm.

**Pushing content under a pixel does not delete it, it hands it to the tile
repeat.** This file had already found the same thing twice on the ground (`grit`
in textures.ts: "sub-texel content there is not dither, it is crawl"). 2.2 mm puts
the stamp at 1.2 mm, 1.5 px at portrait. The variation it cost is bought back in
`faceComplexion` as three cosines on incommensurate periods in the skull's own
direction space — no lattice, wavelengths 16–40 mm. Measured on the new card, the
5.7 px peak is gone and the strongest remaining periodic content is at 26.7 px
with 5.5x less magnitude, which is the mottle.

---

## The domino mask was the complexion sum, and all three hypotheses are now closed

Kept as a record because it cost three passes.

- **Hypothesis 1, the shadow field.** Marked disproven by an earlier pass. It was
  *correct* and the pass that raised it only half-acted on it.
- **Hypothesis 2, the face block's lateral falloff.** Genuinely disproven — the
  frame moved 3.4% of its pixels and the mask stayed.
- **Hypothesis 3, the arena night rig's brow terminator.** Now also disproven,
  and by a stronger argument than a capture: this pass DELETED the face block,
  including the `smooth(Y_BROW - 0.05, ...)` step that put a hard edge exactly
  along the brow, and the mask did not move. A light does not survive its own
  geometry being replaced.

The cause is the sum in `faceComplexion`. The orbit term alone ran 0.22 of
direction space in x — ±42 mm — so two of them, one per eye, overlapped across
the midline and reached both temples: a domino mask drawn by one line, before the
paranasal, the under-brow crease and the buccal hollow were summed on top. The
knee capping the sum sat at 0.7, making the darkest tone reachable over an *area*
0.7 of a 30/37/42% cut. Orbit tightened to 0.150 and dropped to 0.72, paranasal
to 0.42, knee to 0.52. `art/shots/fix5/head-turn.png` front panel: the bat is
gone. **What is left** is a soft band under the brow that reads as form, and the
entry stays open only until a critic panel confirms that from a fresh capture.

---

## The hair and beard shop still sells differences that do not exist

Diagnosed this pass; only the first is fixed.

1. **FIXED — the long mane was two detached slabs from behind.** Arithmetic, not
   rendering: each half sat `R.x · 0.44` off the midline with a half-width of
   `R.x · 0.40` at its lowest station, so the two spans were [0.04, 0.84] and
   [−0.84, −0.04] — about 8 mm of daylight down the back of the head, widening as
   the hair fell, with only 11 mm of overlap at the crown (inside the wall
   thickness). Offset now 0.30 with every station widened; the halves overlap by
   40 mm at the fall. **Verified** in `art/shots/fix5/hair.png`, back row: no
   daylight through the mass, one volume with a crease down it.
   **Still wrong, and it is a different fault:** the mane reads as a boxy
   rectangular curtain with a hard vertical seam and a flat bottom edge. The
   audit's original complaint — "a flat curtain with a hard edge and no volume" —
   is only half answered. The six locks that were meant to break the edge are
   inside `lod.trim` and are not doing it. Hair needs a broken lower edge and a
   silhouette that is not a box before this slot is worth 40 gold.
2. **OPEN — all four hairstyles are pixel-identical under the Sutton Hoo mask.**
   Narrowed this pass: the same four styles are plainly *distinct* from behind in
   `art/shots/fix5/hair.png`, so the fault is specific to the masked row and not
   to the styles. NOT yet explained. Read the code and the four branches *are* distinct under a
   helm: `helmed` only flattens the scalp shell's lift, and the `long` fall and
   the `braids` plaits are added with no `helmed` guard at all. So either the
   mask's own geometry occludes them at the capture bearing, or the facecard's
   dress is not passing `hairStyle` through when `helm_suttonhoo` is set. Check
   the second first — it is a one-line bug and it would explain the war paints
   too.
3. **OPEN — beards 3/4/5 (40/80/120 gold) read as one crescent.** Also not
   explained by the code, which builds three genuinely different masses (a belly
   plus an offset copy; two tines parting at 64 mm; a three-strand plait with two
   brass rings). Every one of them shares the same chin mass from
   `skullY − 0.126` to `−0.20` and differs only *below* that. The neck was
   widened 10% this pass, so check first whether the throat now occludes the
   hanging part at the capture bearing — that would make all three read as the
   shared crescent and nothing else.

Both open items are worth more to a player than anything left on the head: a man
is being charged 120 gold for a beard he cannot tell from the 40-gold one.

---

## Two of the gates are not deterministic, and one of them was believed

`dd7821f` recorded touchtest failing once in three runs at 160 deg of facing
error and called it "a gate that fails a third of the time is not a gate". The
same is now recorded for **playtest**, which is the larger of the two and had not
been suspected.

On this wave's final tree, unchanged between runs:

```
run 1   [playtest] 33/34 controls working
        BROKEN: turning is reduced to the stated cap while committed
run 2   [playtest] 33/34 controls working      (reproduced)
run 3   [playtest] 34/34 controls working
```

The failing assertion reports `the client asked for 0.00 rad of turn and the body
delivered 0.00 rad` — the harness's own mouse sweep did not register during the
swing, not a turn cap that failed to apply. Nothing in the input path changed this
wave (`git diff --stat 39cbad3..HEAD` is characters.ts, headmeasure.mjs, docs and
.gitignore), so it cannot be geometry.

**Why this matters more than the flake.** Two runs agreeing is what a person uses
to decide something is real, and here two runs agreed on a false positive. Any
verdict on this branch that rests on a single playtest or touchtest run is worth
less than it looks. Both harnesses need their input synthesis made deterministic —
wait on the client having *received* the pointer delta before sampling, rather
than on a wall-clock timer — before either is trusted to gate a release.

---

## The mute on the war rolls has never met a database

**What is proven.** The mute is remembered on the device — `phonesound` taps the
toggle at 390x844 and reads `bretwalda.audio.muted=1` back out of localStorage
with the destination measuring 0.0001 — and the column, the view, the write and
the sync are all in place: `players.muted`, `ProfileView.muted`,
`setPresentation`, `POST /api/profile/equip { muted }`, `syncMuted()` in
`profileLink.ts`, hydrated at boot beside the key bindings.

**What is not proven.** `npm run profiletest` skips its whole database half
without `PROFILE_TEST_DB` — it prints `no PROFILE_TEST_DB set — skipping the
database half` and then runs the eleven no-database checks — so on this box the
22/22 says nothing about the new column. No `soundtest`/`phonesound` assertion
covers it either; both are client-side.

*Land judgement, 6 Aug:* the database half **was** run against a real postgres
on this branch's tip — `PROFILE_TEST_DB=... npm run profiletest` → **68/68**
against the 22/22 the bare run reports. That proves the database path works; it
still does not prove the *mute* specifically, because no assertion in that 68
equips `{ muted: true }` and reads it back. The check named below is still the
work. What has changed is that "the harness cannot see the database on this box"
is no longer the excuse — start postgres, and the other 46 checks come with it.

**To close it**, run `PROFILE_TEST_DB=... npm run profiletest` and add a check
beside the bindings ones at `tools/profiletest.mjs:207-232`: equip with
`{ muted: true }`, read it back off `/api/profile/me`, recover onto a second
device by the four words and confirm the game is still silent there. The risk if
it is wrong is small and one-directional — a mute that does not follow the
player, never a mute that will not lift — but the boot rule is the part worth
testing: a device that is muted pushes its answer up rather than being un-muted
by the column default, and nothing has exercised that path against real rows.

---

## Nobody has heard any of this

Not a defect so much as the limit of the whole approach, recorded because the
next iteration should not mistake green harnesses for a verdict.

`soundtest` proves 21 claims about the samples — peak, envelope, spectral
ordering, voice budgets, silence before unlock — and `phonesound` proves 7 more
against a real suspended context on a phone viewport. Between them they prove
the audio is **not broken**. They cannot prove a single note of it is good. The
nine screen sounds are one instrument by measurement (2.47x brightest/darkest)
and the four materials are ordered as designed, and both of those facts are
consistent with a set that is measurably correct and unpleasant to listen to.

**The owner is the final ear.** The specific things a person should judge, in
the order they will grate first: the `refusal` (a flat second, deliberately
ugly — it may be too ugly to hear twenty times), the `tap` at 101 ms on every
button in the game (frequency is what makes a UI sound hateful, and this one
fires most), and whether `matchWon` at 1.03 s earns its length.

---

## Shield planks share one phase — the woven cell is gone, the repeat is not

**The mat read is fixed and a capture proves it.** `v8/portrait.png`'s shield is
unmistakable basketry: a grid of identical "П" glyphs, three per plank, with a
mirror axis down every tile. `v9/portrait.png` is painted boards with lengthwise
grain, and the same change shows on the ground litter, which was the loudest
waffle in the set — the plank at the hero's feet in `v8/closeup.png` is a diagonal
cross-hatch and in `v9/closeup.png` it is parallel grain with knots in it.
Measured on the portrait crop: sigma/mu over a pale board 0.438 -> 0.254, over a
crimson board 0.572 -> 0.315, and the row spectrum across the board drops ~40% at
every cycle from 1 to 12. The cause was not the tile size — it was that `wood()`'s
radial term is even in u, so every tile carried a mirror and a cathedral crown.
An integer `cath` term slides the crown off the tile without touching the wrap.

**What survives is the phase.** Every board still carries identical grain at
identical heights, because all seven planks are `BoxGeometry` merged into one
geometry with one material (`characters.ts:705`) and every front face has the same
0..1 UVs. No texture content can differentiate them; this has to be fixed where
the UVs are made. Two ways, and the second is strictly better:

- offset each plank's `uv` attribute by a per-index amount in the loop at
  `characters.ts:2608–2620`; or
- the per-call `tile?: number` on `TintOptions` this entry has wanted since v7.
  `materials.ts`'s `projectFromObjectSpace` derives UVs from `vSubstancePos` and
  `Part.merge()` bakes each plank's `xf(cx, …)` into its positions, so a world
  tile delivers the phase *for free* and gives the shield, the hut wall and the
  floor plank one grain. `WORLD_TILE` cannot take oak globally — world.ts's
  per-mesh repeats would all be overridden.

The paint quarters are a second density error on the same object:
`characters.ts:2619` builds them as `box(halfW*1.94, edge, 0.004)` with their own
0..1 v, so at `M.timber`'s repeat 3 the paint's grain is exactly 2x finer in v
than the board 2 mm under it. Same fix.

## The arena floor reads as cobbles — dry ones now, not wet ones

**Half of this is fixed and it is the half that mattered.** The water read is
gone: `v7/stance.png`'s blue-green pebbled sheet with cool sub-pixel glints is a
matte trodden floor in `v8/stance.png`, the white specular specks around the
boots in `v7/closeup.png` are gone, and the ground's fine-scale energy (3–12 px
band, row spectrum) is down 14.9 → 12.0% in `arena`, 23.0 → 14.6% in `closeup`
and 15.8 → 11.1% in `duel`. Splitting `wet` into standing water and `churn`, and
driving roughness up rather than clamping it down, did what it was built to do.

What survives is the *shape* of the relief, not its gloss. The floor still
carries a regular lozenge cell at 2–4 px that reads as pebbles or scales rather
than as churned earth — clearest across the whole foreground of
`v9/laststand.png` and in the mid-ground of `v9/arena.png`. It is not the
metre-scale rut waves `world.ts` added (those are 1.1–2.4 m and invisible at this
pitch); it is `buildGroundDetail`'s own normal map, which was always there and
which the sheen used to hide. Now that the surface is matte, its relief is what
the eye reads, and that relief is too regular and too isotropic to be mud.

The `held` term in `groundDetail` (`print*0.95 + well*0.5`, depth 0.46) is the
first thing to look at: `world.ts`'s world-scale film now covers part of the same
job.

**This is now the binding constraint on the shadow work, and it is unowned.**
The v9 lighting pass took the warrior shadow from below the surface's own noise
to about 2:1 above it, and it did that entirely by adding contrast — the mottle
underneath is untouched, measured at sigma/mu 0.373 on open lineup floor in `v9`
against 0.375 in `v8`. `lighting.ts`'s own note says a rig cannot subtract more
of the ground than it puts on it; the next real gain on axis 3 is either this
amplitude or a screen-space AO pass in `postfx.ts`.

**v10 attacked the amplitude from `world.ts` and the capture says it did not
reach the pixel.** The vertex-albedo field was re-banded away from the shadow's
wavelength (`fine` 1.18 m -> 3.8 m, `grit` 0.39 m -> 4.2 m, `blade`'s green swing
4.25:1 -> 1.78:1, `rut` slope 0.24 -> 0.14), and the field measured in isolation
improved by 25% in the shadow band. On the frame, band-passed floor sigma at
2–5 px is **flat to slightly worse in six of seven presets** (`arena` 10.76 ->
11.08 code values, `closeup` 10.89 -> 11.56, `brawl` 11.31 -> 11.86, `lineup`
6.85 -> 6.98, `laststand` 6.03 -> 6.13, `duel` 8.59 -> 8.49) and improves in
exactly one — `stance`, 6.35 -> 5.60, −12%, which is the preset whose camera is
lowest and closest and therefore the one where a world-scale term subtends the
most screen. That is the shape of a real but tiny win being swamped, and it
confirms rather than refutes the diagnosis in this entry: the relief the eye is
reading is `buildGroundDetail`'s, at 33 mm–11 cm, and it was not touched.
`world.ts`'s own note now records that the sub-2 m octaves of `mid`/`churn`/
`drainage` were tested and are *not* the culprit, so the next pass should not
re-derive that.

The specific term to cut is named and still unowned: in `buildGroundDetail`,
`height` takes `peb` from `sampleCell(bank.micro, u*2, v*2)` — ~33 mm on the
1.6 m tile — at `+0.16` into a `bump: 1.9` normal. That, not the `held`
roughness term this entry used to point at, is the 2–4 px cell. `dome` at 11 cm
is worth keeping.

## The bonfire's coal bed is pale peach lumps, and it is now the loudest thing in the crib

The flame above it has colour (see the v10 entry below) and that is exactly what
exposed this: with the tongues no longer welded to white, what the eye lands on
in `v10/closeup.png` at 2x is a ring of pale, waxy lumps sitting in the log crib
that read as marshmallows, not as embers. Measured over the crib base
(`closeup`, x 1230–1420, y 495–545), lumps above 170 luma are **[254, 203, 165]**
in v10 against [245, 207, 174] in v9 — the material never changed; only its
surroundings got out of its way, and the count halved (988 -> 536) because the
flame is no longer over-brightening its neighbours.

The cause is named and unowned: `materials.ts:169`,
`bonfireFlame: { emissive: 0xff5500, emissiveIntensity: 5.6 }`, on the
`IcosahedronGeometry` coal instances `world.ts:3027` places. 5.6 linear in R
clips before the other two channels do, so the grade's crosstalk drags G and B up
to ~205/165 and the lump arrives desaturated and pink. It wants roughly
`0xff8a28` at 2.2–2.4. The comment above the entry reasons from a bloom threshold
that, per the next entry, the chain cannot reach without clipping first.

## Bloom is unreachable — the threshold sits above where the grade already clips

Not visible as an artifact; visible as an absence, and it is why every emissive
in the game has been tuned by pushing intensity until something goes white.
Running postfx's own chain (exposure -> white balance -> contrast power ->
crosstalk -> filmic) on the CPU, the frame reaches code 255 at **4.07 scene units
in dusk and 2.48 in `laststand`**. `bloomThreshold` is **5.0 and 6.0**. There is
no radiance at which a source both blooms and keeps its chroma: it clips first,
every time. v10 worked around it for the bonfire with an authored halo, but
"let bloom carry the heat" cannot literally happen until the threshold drops to
~3.2–3.6 or `crosstalk` comes down from 0.3. Unowned, and it constrains axis 9
for anything else that wants to glow.

## Faces at lineup distance are lit now, and still the coolest skin in the frame

**Mostly fixed.** The diagnosis in the v8 entry was wrong about the mechanism and
the right fix landed anyway. It was never the level: every directional in the rig
except `bounce` sits *behind* the subject, so the only light reaching a face
turned to the lens was `bounce`, which is `0x93a084` because it is turf — olive
light on warm skin, which reads as a muddy patch rather than as an underlit face.
`lighting.ts`'s `faceFill` is a warm near-level front fill, 33° off the camera
axis at elevation −0.13 so an up-facing normal clamps to zero and it cannot spend
any of the contact darkening.

Measured on the lineup crop, v8 -> v9: huscarl 34.7 -> 45.1 luma with R:G going
1.87 -> 2.08, warden 55.3 -> 66.9, berserker 57.7 -> 62.8. In `v9/lineup.png` the
huscarl's eyes, mouth, nose and cheek modelling all read where `v8` had a flat
olive oval. The predicted cost — a directional cannot be height-selective, so it
lands on every camera-facing vertical — **did not appear**: the far palisade is
61.7 in both and the `closeup` hut wall went 72.7 -> 69.0, because the ambient and
hemisphere were drained to pay for the AO by more than the fill puts back.

What is left is that skin is still the coolest-lit material in a warm frame, and
the runekeeper's face under a deep hood is still the darkest of the four. That
wants a hue, not a level.

## Edges are anti-aliased now, and it is a smaller win than the diagnosis implied

The root cause was right and is fixed: the game shipped with **no geometric
anti-aliasing at all**, because `GameCanvas` correctly refuses context MSAA when
a composer is in play and `EffectComposer` correctly defaults its own buffers to
`samples: 0`, leaving SMAA — a morphological filter that never has more than the
one sample the rasteriser took — as the whole of the chain. The composer's colour
buffers carry samples now.

The gain measured on the capture is real and modest. Fraction of strong
silhouette transitions carrying an intermediate sample, `v7` → `v8`: rune stone
41.3 → 45.4%, palisade 57.7 → 60.3%, `duel`'s stake tops 46.1 → 53.1%, `arena`'s
hut roofline 57.3 → 60.5%. Violet-rimmed pixels on the rune stone, 137 → 61.
Better everywhere, clean nowhere — the stake tips in `v8/duel.png` are still
visibly stepped.

Two reasons to expect the rest to be hard, both already traced: **grain and
dither sit ahead of the AA pass** because they share the grade's pass, which caps
how far SMAA's threshold can come down (grain at 0.052 puts up to 0.026 between
two neighbouring sky pixels, so anything under ~0.07 detects grain as an edge);
and **nobody has positive evidence SMAA is blending at all** — its area/search
LUTs decode asynchronously from data URIs and the weights are zero until they
land. If a capture still shows staircases after MSAA, that is where to look.

## Smaller, confirmed

- **Pauldron lames read as square blocks** on the huscarl and warden at lineup
  distance, and the berserker's arm-fur caps are bulky slabs with flat tops.
- **The moustache halves** are soft leaves rather than hair at portrait distance.
  They want strands, which is a different primitive.
- **The runekeeper's hood opening** renders as a hard-edged polygon frame — the
  `dark` shadow gore's rim.
- **The baldric's five segments** show faceting between them at close range.
- **The tunic-through-cloak hole is back, and bigger than the speck it was.**
  Unchanged in `v9/duel.png` — still a ~65 × 35 px olive wedge of tunic standing
  in a hole in the hero's cloak, in the same place the 3 px speck was in `v7`, and
  now more legible because the wool around it carries fibre. The mechanism is
  new: the drape rig's `GATHER` rotates each wing inward about the yoke, and with
  no collision the only thing stopping it is the ~60 mm the cloak was cut clear of
  the tunic's flared hem. At the 0.17 rad/ring it landed at, the wedge was
  ~120 × 70 px; 0.07 more than halved it and did not close it, because the middle
  of a wing still travels ~30 mm inward and the clearance is not uniform round the
  ellipse. Two real fixes, and they want doing together: cut the cloak wider
  (`topX`/`topZ` in `characters.ts`, +15–20 mm) so there is somewhere to gather
  *into*, then put the gather back up. Dropping `GATHER` further just returns the
  cloak to the traffic cone it was.
- **`torchFlame` in the materials catalog is dead** — nothing calls `get()` on
  it. Either wire it or delete the entry.
- **`buildWool`'s `lay` is finer than the nap it steers.** The fibre-direction
  chooser runs at 12 cycles/tile against a mid nap at 5, so it flips direction
  every 1.5 cycles of the thing it is choosing for and chops the streaks. Costs
  nothing on the 51 mm cloak tile; it is the mush on the 300 mm back pelt.
  Coarsening to 4–8 is a one-token change that wanted an A/B it did not get.
- **`buildWool`'s `dye` still spends ±17% of albedo range at 12 cycles/tile**,
  which is 0.9 px at `closeup` framing — below anything a garment can resolve.
  Left alone deliberately: re-banding that field is what produced the flat-paint
  cloak in the first place, so it wants a capture behind it, not an argument.
- **`DEEPEST_WATER` is a normaliser with nothing clamping to it.** A puddle
  deeper than 30 mm takes its colour and opacity out of range. Documented at the
  constant, not enforced.
- **The palisade-foot drip lines are ~20 m from every camera** and cost ~220
  verts to draw a dark line. If nothing in a capture shows there, cut them.
- **Object-space projection ignores the instance matrix.** If `world.ts` ever
  scales an InstancedMesh instance carrying `iron`/`steel`/`bone`/`bronze`/
  `leather`/`skin`, that instance gets proportionally scaled texels.
- **A sub-tile phase discontinuity** survives on two of the four meridians of any
  cylindrical part — the 1-tap object-space projection's hard axis select, biased
  out to 0.83 r. Faintly visible on a mail sleeve at portrait distance; killing
  it needs biplanar and chunk rewrites.

## Not defects, but load-bearing and unowned

- **There is no prop collision and no cloth collision.** Nothing world.ts places
  intersects a warrior *in these eight presets*, which is a checked fact and not
  a guarantee — in play warriors move anywhere. `SWING_FWD = 0.24` in `anim.ts`
  is a stand-in for the wearer's own body, and a deep lunge under-drapes because
  the gravity solve gets clamped against it.
- **The cloak has no collision, which is now the binding constraint rather than
  a theoretical one.** The rig can gather and can move its two wings
  independently — `v8/duel.png` and `v8/stance.png` show a cloak that hangs and
  falls in rather than standing at its cut radius, so the old "cannot gather /
  halves move as one" entry is gone. What replaces it is that the gather is
  bounded by a hand-tuned constant instead of by the body, and the tunic wedge
  above is what that costs.
- **Nothing with a time constant over ~1.4 s can appear in a capture.**
  `GameCanvas.tsx:297` clamps `rawDt` to 0.05 and `shot/page.tsx:264` sets
  `__shotReady` after 26 rAF ticks, so **every capture is taken 1.35 s into the
  simulation** whatever the wall clock does. An ember lives 1.5–3.6 s and has to
  climb; a smoke puff needs ~4 s to become a plume. v10 works around it with a
  `warmUp(9)` that steps the particle system forward through the real frame path
  at construction, which is why embers exist in v10 at all — but the workaround
  is per-system, and anything else that accumulates (smoke, decal drying, fire
  flicker phase) needs its own. This is a sharper statement of "events never
  arrive": it is not only events, it is anything slow.
- **`FrameContext` in `quality.ts` carries no per-warrior data** — only `focus`
  and `localState` — so `vfx.ts` cannot make any warrior but the local one dust,
  bleed or react. A `pressure` (health fraction) field would also let ground
  marks key off actual health rather than off `lastStandTriggered`. Related:
  `GameCanvas.tsx:419` only emits dust for `state === "sprinting"`, and no preset
  is ever sprinting; walking and running over churned mud kick dust too.
- **The de-overlap solver in `hud3d.ts` has never been photographed doing work.**
  No preset puts two plates close enough to trigger `compact`.
- **The tally notches never render in `brawl`.** Bars are ~10 px there, so
  `lodDetail` is 0 and the metaphor the bar is built on only appears in
  `duel`/`closeup`.
- **Dusk's tonal split is shallow.** `v7/duel.png` B/R by luma band barely ramps
  and is non-monotone at the bottom. `laststand` got the `tintLow`/`tintHigh`
  treatment and it worked; dusk is 7 of the 8 presets and was deliberately left
  alone. The hook is there for whoever takes it.
- **`brawl` cannot present a frame in 30 s on the capture box**, and at 4 MSAA
  samples it could not present one in 46 minutes. Eight warriors now render into
  the fire beam's shadow map as well as the key's, on a software rasteriser, with
  coverage sampling on top. `MSAA_SAMPLES.high` is 2 because of it and
  `shoot.mjs`'s screenshot budget is explicit because of it. Neither is a
  measurement of what a GPU does — nobody has profiled this scene on one, and §5
  wants 60 fps at 1080p and a 30 fps phone floor. That number is unowned.

---

## Root causes worth remembering

Recorded because each took real effort to find and each was something other
than what it looked like:

- **A shadow needs a receiver, and half of ours was a mirror.** Eight captures of
  warriors casting nothing while the palisade beside them threw six-metre stripes
  looked like a light problem, and one pass was spent on the light. It was half
  the answer. The other half is that IBL specular is not modulated by a shadow
  map, so on a receiver returning ~49% of its pixel as environment — which is what
  `wet = max(basinWet, churn*0.4)` made of the floor every warrior stands on —
  a shadow map can only ever darken the other half. The palisade's stripe landed
  outside that mask, on rough grass, which is why the control was in the frame the
  whole time. Measured on the capture: the palisade's stripe contrast on the
  churned floor goes **2.07 → 3.48** between `v7/laststand.png` and
  `v8/laststand.png` while the dry-grass control in the same frame moves 3.08 →
  3.26. **When one object casts and another does not, suspect the ground under
  them before the light above them.**
- **Changing the substance is not changing the tile.** The shield's painted
  quarters were wool at a fixed five repeats, which is a real defect and was
  really fixed — they are timber now, the same boards they lie on. The basket in
  `v8/portrait.png` is the same size it was, because `M.timber` is also a fixed
  repeat and three repeats across a 105 mm plank is a 35 mm tile with two knots in
  it. Both materials were wrong for the same reason and swapping one for the other
  carried the reason across intact.
- **A gather with no collision is bounded by the pattern the cloth was cut on.**
  The drape rig gained the one thing it had never had — the ability to narrow a
  hem — and immediately spent it putting the wing inside the tunic. There was
  nothing to gather into: the cloak is cut ~60 mm clear of the garment under it,
  and the previous entry in this file about outward-only folds says exactly that
  about the opposite sign of the same number. **A cloth term that moves the shell
  toward the body needs the clearance budgeted first.**

- **The floating orange square was an opaque emissive quad, not a HUD element.**
  `bonfireFlame` — no surface, no alpha, `emissiveIntensity: 7` — on a bare
  `PlaneGeometry` standing in the hall doorway. At ~12 px it drew a hard uniform
  orange rectangle, and two independent panels read it as a UI bug; one traced it
  to `hud3d.ts`, where a fix would have done nothing. It took a radial alpha
  falloff and additive blending (`Spec.glow`), not a colour change. **Any bare
  emissive quad small enough that its edge is most of it will do this again.**
- **A shield's hide facing was a single-sided `CircleGeometry`.** Invisible for
  as long as the shield was mounted face-out; the moment `anim.ts` started
  carrying it bladed at rest, the outer planks — which are chords, only 100 mm
  tall at the rim — left two see-through crescents inside the binding. A
  regression in one file surfaced by a correct change in another.
- **A cloak fold cannot be a cosine about zero.** Half its amplitude cuts *inside*
  the base ellipse, and the base ellipse is only ~60 mm clear of the tunic's
  flared hem — so raising the fold depth from 30 mm to 52 mm put the cloak inside
  the garment under it and the tunic came through as an olive wedge — caught on an intermediate capture
  taken mid-pass, between the drape landing and v7. Cloth draped
  over a body is displaced away from it; there is nothing for a fold to displace
  into.
- **The metals went matte from roughness drift, not from a missing PMREM.**
  `specularAA` bakes the sub-texel slope it band-limits into the roughness
  channel, asymmetrically — it barely moves a rough substance and swamps a smooth
  one, so steel's recipe still *declared* 0.18 while its shipped map *meant*
  0.316. Reconciling against the declared number, then clamping, collapsed every
  `blade()` request above 0.36 onto one grey. Reconcile against the measured
  channel means, not against the recipe.
- **A texel density is not a UV repeat.** Every geometry here parameterises u and
  v over 0..1 whatever size it is, so a fixed repeat makes texel size scale with
  1/size and no two surfaces on one warrior agree. Leather at `repeat: 4` covered
  280 mm on a torso and 20 mm on a bracer — wickerwork and crocodile from one
  material.
- **A backlight cannot rim a silhouette.** A silhouette edge is where the normal
  is perpendicular to the view ray, so a light on the view axis meets it at
  N·L ≈ 0. Every unit the bonfire spent on a warrior between it and the lens
  landed on the half the camera cannot see; raising candela could never fix it.
  The steer had to move the *frame* the kick hangs in, not the light.
- **A tint crossover placed on the picture destroys the contrast it exists to
  create.** `mix(shadowTint, highlightTint, s)` passes through the average of the
  two tints at s = 0.5, and the average of a cool tint and a warm one is a
  desaturated near-neutral — which is what `laststand`'s modal 42% of pixels were
  getting. The tonal anchor must sit *on* the picture and the tint crossover
  *above* it; they are two jobs and they wanted opposite placements.
- **Standing water read as a hole in the world** because a near-black dielectric
  at `metalness 0.02` returns F0 ≈ 0.04, so from the near-vertical angle a
  gameplay camera actually uses, ~96% of the pixel is the black diffuse term. The
  PMREM only pays out at grazing incidence. The follow-up defect was the same
  material read as *flooding*, and that was placement, not material: one 2.5 m
  disc sat 1.14 m from where three presets stand their subject.
- **Every "mid-swing" capture was a rest pose.** `readSwing` only set `swingLive`
  when it saw `attackTimer` decrease across two frames, and a capture holds it
  constant — so animation was reviewed for weeks against poses that were never
  the ones requested.
- **The "long neck" was never the face.** The face-placement table that used to
  head this file (eye line 60%, mouth 39%, nose 56%) described a layout two
  rewrites stale; the built mesh measures 50.0 / 28.0 / 44.8, canon on the first
  and within a per cent on the others. The real error was 183 mm of neck against
  a life value of 0.39 head-heights, which the eye reads as a small head on a
  long body. The skeleton computed 7.5 heads because the skeleton never measured
  the neck.
- **A field named for a role outlived the role, and four panels read past it.**
  `LightingOptions` had a `key` and a `warm`; `GameCanvas` passed the moon as
  `key` because a night rig wants a moon key, and only `key` cast. The sky then
  became a sunset and nobody re-checked, so every shadow in the game ran at the
  brightest thing in it — at `sunIntensity 22` against `moonIntensity 0.1`, which
  is not a close call. Three review passes celebrated those stripes as the
  lighting win. The fields are `moon`/`sun` now and which one casts is
  `casterShare`'s per-frame decision. **Name an interface field for the thing it
  carries, not for the job you currently do with it** — a role can be re-derived,
  a mis-labelled body cannot be noticed.
- **A texture fix cannot show on a surface with no light gradient across it.**
  Wool gained a real nap and it is plainly visible in `stance`, `duel`,
  `laststand` and `portrait` — and it went measurably *flatter* in `closeup`, the
  one shot the "cloak is untextured" defect was raised on, because that garment
  faces away from every directional and sits at 15/255. Most of what a cloth
  recipe adds is relief, and relief is N·L. **Before scoring a material defect,
  check the light on it** — otherwise the fix lands and the frame that raised the
  bug is the one frame that cannot show it.
- **The mirror that made the shield a basket was also what made its tile wrap.**
  `wood()`'s radial term `sqrt(x² + pith²)` is even in u about the tile centre, so
  every tile carried an axis and a cathedral crown, three per plank, and that read
  as woven cells. Leaning `x` to break the symmetry puts a hard vertical seam at
  every repeat — worse than the arch. The way through was a linear term with an
  **integer** ring count (`+ cath * u`): it slides the stationary point off the
  tile entirely while leaving `frac(rr)` at u = 1 exactly what it was at u = 0.
  **When a periodic artifact is load-bearing for the wrap, translate it out of
  frame rather than destroying it.**
- **The ground "glitter" was specular, not albedo.** The wet/puddle mask was
  gated on the full height field, which carries fine noise at ×5 and ×9, so
  wetness bled onto dry ground at texel frequency. The give-away: specks took the
  *sky's* colour on cool ground and the *fire's* on warm ground, sat on the
  crowns of the relief, and carried chroma fringing.

---

## Process defect — overlapping captures corrupt the A/B reference

Two workflows ran concurrently and both wrote to `art/shots/`. One re-captured
into `v4` *with newer code*, destroying the reference the other was scoring
against. Any A/B taken across that window compares two different builds while
claiming to compare one change.

Captures are a shared, mutable resource. Only one capture may run at a time, and
a directory that has been scored must be treated as immutable — write a new
version rather than refreshing an old one.

**`git stash` is the same class of hazard and bit us again before v10.** An agent
wanting a lint baseline ran `git stash`, which is repo-global: it reverted a file
a concurrent workflow was mid-edit on, and `git stash pop` then refused because
that workflow had written to the file again. Nothing was ultimately lost — the
v10 verify pass confirmed the working tree was strictly ahead of `stash@{0}` on
both files — but the recovery cost a pass of anxiety and the stash entry had to
be carried between sessions. **Never run a repo-global git command to answer a
question about one file.** A lint baseline for your own file is `npm run lint`
filtered to your own path; a diff baseline is `git show HEAD:<path>`.

---

## v9 verify pass — what the capture proves, and what it does not

Four blockers went in; three reached the frame. Every number below is measured on
`art/shots/v9/` against `art/shots/v8/`.

**Shadows point away from the sun. Proven, and the v8 entry is deleted.** The
cleanest evidence is `v9/lineup.png`: four warriors on one floor, and a column
profile across the foreground band (y 735–775) shows four dark troughs at
x≈160–320, 640–800, 1040–1160 and 1480–1560, each one starting at its own
caster's boots and running to the RIGHT, with 65–81 luma peaks between them. The
sun glare is at frame-LEFT. Four of four, no exceptions. The same reversal is
visible as an absence: `v8/laststand.png`'s palisade threw six-metre stripes
toward the camera across the whole right of the frame, and in `v9` that ground is
clean, because the fence's shadows now fall behind the fence where they belong.

**Contact darkening exists and is attached to the sole. Proven.** In `v8` the
region immediately camera-right of the warden's boots measured 78.1 luma against
open-floor controls of 67.4 and 71.6 — the boot sat in a *brighter* patch, which
is what the v8 entry recorded. In `v9` the same region is 42.0 against 62.4, a
1.49:1 darkening, and at 2x the blob is visibly welded to both soles rather than
starting a boot-length downstream. On `arena` the hero's cast shadow beyond the
feet goes ~56 -> ~35 luma against unchanged open floor: 1.10:1 -> 1.77:1. Trough
to adjacent peak on `lineup` is about 2.0:1, against ground noise of
sigma/mu = 0.37 — the shadow is finally above the variance of its receiver, and
it is the *coherence* of a half-metre body-shaped blob that carries it, not the
per-pixel contrast.

**The cloak reads as cloth in five presets and as paint in the one the defect was
raised on.** `v9/stance.png` at 4x is fulled wool: lengthwise fibre striation, a
nap sheen, tonal drape. `v8` at the same crop is flat brown under a uniform
pinprick dither. `duel`, `laststand`, `portrait` and `lineup` all carry it.
**`closeup` does not** — measured on the cloak interior, sigma/mu went 0.358 ->
0.236 and 5-px band energy 0.166 -> 0.115, i.e. *down*, while mean luma went 13.3
-> 14.6. The recipe is not the problem; that garment faces away from every
directional in the rig and sits at 15/255, and relief with no N·L gradient across
it cannot show. This is a **lighting** defect wearing a texture defect's clothes,
and it is the one blocker of the four that did not reach its own frame.

**The `laststand` back panel is unchanged.** Still a hard-edged rectangular patch
of streaky pelt over a flat cloak body with a razor boundary — one garment, two
substances. `characters.ts:2862–2872` puts a 51 mm tile on the cloak
(`clothRepeat`) and a 300 mm one on the pelt (`PELT_TILE`, `round(0.3/0.25) = 1`).
6:1 on adjacent surfaces of one warrior is the whole defect and no texture recipe
can close it; the pelt wants 2–3 repeats, or `PELT_TILE` wants to be ~0.12.

**No sparks, no dust, no blood anywhere in eight captures** — including
`laststand`, where the hero is at ~15% health. *Superseded by the v10 entry: all
three now exist, and two of the three are below the threshold of being seen.*

**Regression: `stance` lost tonal range.** meanLuma 60.7 -> 58.5 (−3.7%), maxLuma
235 -> 218, `tonalBuckets` **11 -> 9** — one above the FAIL line. `arena` 12 -> 11
and `closeup` 13 -> 11 moved the same way; the other five held or improved
(`duel` 14 -> 15, `lineup` 16). The histogram says where it went: `stance`'s
16-bucket occupancy gains 5 points in the 16–32 luma band and loses the 128–176
tail. That is `lighting.ts` draining ambient and hemisphere to pay for
`AO_SHADOW_INTENSITY 0.85`, and `stance` is the preset with the least sky in it
and so the least headroom to give. The lever named at the constant is 0.78; the
retreat is that, not `AO_TILT`.

**Credit, re-measured on v9:** no banding (the `duel` sky carries 240/161/104
unique per-channel values, against 238/159/107 in v8); no `PointsMaterial`
squares; no floating orange quad; no untextured surface in any frame; violet
fringing flat within 5%. Whole-frame exposure held within ~1% on six of eight
presets while the shadow contrast roughly doubled, which was the hard part of the
lighting change and it landed.

**`right click blocks` in `npm run playtest` is flaky — 1 failure in 4 runs.** It
failed with `state=idle` and passed on three consecutive re-runs with identical
stamina numbers everywhere else, so the sim is deterministic and the read is not.
The check presses right mouse, waits a fixed 450 ms and reads one snapshot; the
dodge 600 ms earlier lasts 0.35 s and the block can land inside its recovery.
This is the same class of bug as the one `bf0b58a` fixed for the dodge assertion
by reading three packets after the press. **Do not relax the assertion to make it
green** — either read a sequence the way the dodge check does, or give the dodge
room to finish. Recorded here rather than fixed because a flaky test is a finding
and this pass did not own `tools/`.

---

## v10 verify pass — one blocker fell, one moved without arriving, and the fire cost the frame its top end

Gates: `npx tsc --noEmit` clean, `npm run lint` 12 problems (unchanged, all in
`GameCanvas.tsx` / `shot/page.tsx` / `CharacterPreview.tsx`), `npm run playtest`
**9/9** with no assertion touched, and all eight presets `ready: true`,
`blank: false`, `errors: []`, `tonalBuckets >= 9`. Every number below is measured
on `art/shots/v10/` against `art/shots/v9/`, and the two sets are **pixel-aligned
on world geometry** — the palisade strip in `lineup` cross-correlates at 0.997
with a best shift of (0, 0), so ground, fire and shadow comparisons are sound.

**The bonfire core has colour, and the entry that said it never would is
deleted.** This is the one number OPEN-DEFECTS had recorded as immovable across
v7, v8 and v9: mean saturation of the hottest 2% of the flame box, 0.054 in all
three. In v10 it is **0.286 in `arena` (5.2x), 0.314 in `closeup`, 0.276 in
`duel`**, and the clipping that caused it is gone with it — pixels at or above
250 luma inside the flame box go **608 -> 64** in `arena`, **800 -> 1** in
`closeup`, **104 -> 0** in `duel`. At 2x, `v9/closeup.png` is a white blowtorch
whose glare eats the log crib; `v10/closeup.png` is an amber flame with graded,
individually readable tongues and a fully legible crib behind them. The cause was
not the tone curve alone: the ramp's top band was authored `vec3(1.0, 0.93, 0.72)`,
which measures 0.02 saturation after white balance and crosstalk *at any
level* — an achromatic source, which is why raising or lowering radiance never
moved the metric. Re-authoring it to `(1.0, 0.46, 0.105)` is what fixed it.

**Blood, embers and ambient dust all exist now. Only blood reads.**
- *Blood is real and visible at 1:1.* `v10/laststand.png` carries **60 distinct
  regions on the floor band that darkened by more than 14 luma** against v9,
  13 790 px in total, and those pixels are redder in v10 than the turf they
  replaced (R:G **1.495 -> 1.601**) — a multiply decal over grass. Two spot
  checks: (490, 660) goes 74.0 -> 42.4 against an unchanged 64/66 control, and
  (810, 712) goes 64.4 -> 33.4 against an unchanged 92/93 control. The clustering
  around `ctx.focus` reads as a place a fight happened.
- *Embers exist and are sub-visible.* The air column above the `arena` fire
  carries **117 new warm specks** against v9, peaking at +73 luma, scattered from
  y≈122 up out of a flame that tops at y≈350 — a genuine rising column. At 1:1
  they are 1–2 px and read as sensor speckle against a bright dusk sky. They are
  in the file; they are not in the picture.
- *Dust exists as a veil, not as grains.* In `closeup` the frame carries a
  monotone near-field lift — **+4.4 luma at the bottom row, +3.1 at y 780, +1.6
  at y 650, −0.7 at the horizon** — which is exactly what a camera-centred dust
  ring at `alpha 0.11` does. `vfx.ts`'s own note flagged this as the parameter it
  was least sure of without a frame, and the frame agrees: it is haze. It wants
  fewer, larger, brighter motes rather than more opacity.

**The shadow does not read any better against the ground, and `world.ts` is not
to blame for that.** Measured per-frame so the warrior jitter below cannot
invalidate it — depth of the darkest coherent (>= 25 px) floor feature divided by
the receiver's own fine-scale sigma — v9 -> v10: `arena` 1.23 -> 1.20, `lineup`
1.33 -> 1.30, `duel` 1.53 -> 1.45, `laststand` 1.78 -> 1.80, `brawl` 1.25 ->
1.24, `closeup` 1.70 -> 1.78, `stance` 2.36 -> 2.53. Mean 1.60 -> 1.61: unchanged
within the spread. On the canonical `lineup` band (y 735–775) the four troughs
sit at the same x windows and the contrast is **2.30:1 -> 2.29:1**, while the
open-floor receiver's sigma/mu went the wrong way, **0.3235 -> 0.3547**. See the
cobbles entry above for why.

**Regression: the fire fix cost the frame its top end.** `uIntensity` went from
`2.6 + moodHeat*1.2` to `2.3 * (1 - moodHeat*0.37)`, the inner tongue ring was
dimmed to pay for its own stacking, and the duplicate-emitter fix halved the
tongue count — three cuts in the same direction at once. maxLuma falls in five
presets (`arena` 250 -> 221, `closeup` 250 -> 213, `lineup` 250 -> 239, `brawl`
250 -> 242, `portrait` 247 -> 242) and **`tonalBuckets` falls in three: `duel`
15 -> 13, `brawl` 15 -> 12, `lineup` 16 -> 13.** All still pass, none is near the
line, and whole-frame meanLuma holds within 1.3% on eight of eight — but the
brightest object in the scene is now dimmer than the sky behind it, and in
`lineup` the warriors visibly lost the warm fill the fire was giving them. The
cut was three levers where one would have done; `RING_LEVEL[0]` and the
dedup are the ones worth keeping, and `uIntensity` is the one to give back.

**No regression in the three things v9 won.** Shadow direction: `v10/lineup.png`
still shows four troughs running frame-RIGHT from four casters with the sun glare
at frame-LEFT, at x≈180, 640–690, 1040–1150 and 1480–1560. Boot contact: the
warden's sole region measures 47.6 against 78.0 on the same row, **1.64:1**,
against v9's 1.59:1 on the same crop — welded, and marginally better. Cloth
grain: `v10/stance.png` at 2x still carries lengthwise fibre and nap sheen on the
cloak, and `v10/portrait.png` still shows lengthwise plank grain on the shield.

**New, and it invalidates a measurement this file already published:
`lineup` does not pose its warriors deterministically across captures.** The
world is pixel-exact (palisade correlates 0.997 at zero shift) while every
warrior in the frame has moved: v9 -> v10 best-match offsets are huscarl +10 px,
warden −44, runekeeper +45, berserker −53, and the best-match correlations are
only 0.58–0.82, so they changed pose as well as position. **This predates v10** —
v8 -> v9 shows huscarl −44 px at correlation 0.54 and warden +14 at 0.61. The
consequence is that the v9 entry above reporting face luma on lineup crops
(huscarl 34.7 -> 45.1, warden 55.3 -> 66.9, berserker 57.7 -> 62.8) compared
crops that were not on the same pixels of the same thing, and those numbers
should not be relied on. The `faceFill` change may still have been right — the
qualitative read of `v9/lineup.png` stands — but it is not measured. Any future
per-warrior A/B must use `stance`, `duel` or `portrait`, which are stable, or
must register the crop first.

---

## Fifth panel (on v10) — and one harness defect that invalidates old comparisons

**`lineup` does not pose its warriors deterministically across captures.** World
geometry is pixel-exact between runs — the palisade strip cross-correlates at
**0.997 at zero shift** — but the warriors move **−53 to +45 px** between v9 and
v10 at correlations of only 0.58–0.82. This predates v10: v8→v9 shows the
huscarl at −44 px, r = 0.54.

That means any per-warrior A/B taken on `lineup` compared crops that were not the
same crop of the same thing. The v9 entry's face-luma numbers are among them.
Per-warrior comparison needs `stance`, `duel` or `portrait`, or a registered
crop, until the preset is made deterministic.

**The bonfire core was authored grey, not merely clipping.** `vec3(1.0, 0.93,
0.72)` measures 0.02 saturation after the grade *at any radiance*, so three
passes spent pushing emissive intensity up and down were adjusting a parameter
that could not move the metric being measured. Same failure class as the
`key`/`warm` misnaming: the thing everyone was tuning was not the thing that was
wrong. Now fixed — hottest-2% saturation 0.054 → 0.286 in `arena`, clipped
pixels in the flame box 608 → 64.

**The fire fix over-corrected.** Three cuts pulled the same way at once
(`uIntensity` 2.6 → 2.3×(1−0.37·moodHeat), the inner ring dimmed, and the
emitter dedup halving tongue count). maxLuma fell in five presets, tonalBuckets
in three, and in `lineup` the warriors visibly lost the warm fill the fire had
been giving them. The dedup and `RING_LEVEL` are right; `uIntensity` is the one
to give back.

**The ground pass did not reach the pixel, and its negative results are worth
keeping.** Receiver sigma/mu went the wrong way, 0.3235 → 0.3547; band-passed
floor sigma at 2–5 px is flat-to-worse in six of seven presets and improves only
in `stance` (−12%, the closest camera). The sub-2 m octaves of `mid`, `churn` and
`drainage` are confirmed *not* the culprit. The binding constraint is
`buildGroundDetail`'s `peb` term plus a screen-space AO pass — and the AO pass is
unowned.

**Everything past ~10 m is one colour.** In `v10/duel.png` the background band
has a hue circular-std of **6.2 degrees** at saturation 0.71 — palisade oak, hut
daub, thatch, tree canopy and soil all arrive as the same orange (arena 8.7,
brawl 13.3, laststand 13.7).

**The pale coal bed is now the loudest thing in the crib** — `materials.ts:169`
at `emissiveIntensity 5.6`, measuring [254, 203, 165]. Unchanged material; the
fixed flame simply stopped hiding it.

**Bloom is unreachable**: its threshold of 5.0/6.0 sits above the 4.07/2.48
points where the grade already clips.

### Process: `git stash` is not safe here

An agent used `git stash` mid-pass while another owner had uncommitted work in
the tree. Nothing was lost — the working tree was verified strictly ahead of the
stash on both files — but with two owners writing under a 2-agent cap, a stash
can silently bank someone else's half-finished work. Commit instead.

---

## v12 verify pass — the hand closes on the shaft, and the frame proves it

Gates: `npx tsc --noEmit` clean, `npm run lint` **12 problems** (unchanged, all in
`GameCanvas.tsx` / `shot/page.tsx` / `CharacterPreview.tsx`), `npm run playtest`
**9/9** with no assertion touched, and all eight presets `ready: true`,
`blank: false`, `errors: []`, `tonalBuckets` 9–14 (`duel` 14, `arena` 11,
`closeup` 11, `brawl` 14, `laststand` 12, `portrait` 11, `stance` 9,
`lineup` 13).

**Read the span before trusting a number below.** `art/shots/v11/` was written at
10:05 against `5b2b3a0`; `24207e2`, `90115d9`, `bb4dda3`, `c8ea1d1` and `cd7e992`
all land after it. So v11 → v12 is **five commits**, not one, and the frame shows
the finger rebuild, the plumb carry and the wrist bone together. Where the
mechanism separates them it is said so below.

**The owner's report is fixed, and `stance` is the shot that proves it.**
`stance` is the one preset whose warrior is pixel-stable across the two captures
— the fence correlates 0.990 at zero shift and *the warrior himself* correlates
0.979 at zero shift — so the same crop is the same thing in both. At 8× on the
axe grip (x 780–980, y 330–450): in `v11` the four fingers run **across** the
haft and their tips hang off its lower edge with turf visible behind them, a
hand laid over a stick. In `v12` the fingers run **along** the haft, stacked down
its length, each one crossing the wood and reappearing under it. The same
reversal is on the huscarl's sword in `portrait` (registered at −77 px): `v11` is
a smooth mitten with one fused C of knuckle standing clear of the grip, `v12` is
four separate fingers lying on the cord wraps. And on the warden's spear in
`lineup`, four distinct pale fingertips now show on the far side of the shaft
where `v11` had a single crescent beside it.

**Which half did what.** The finger *shape* is `24207e2`'s; the finger
*orientation* is `cd7e992`'s, and the second is what the report was about. Held
constant on one build and rendered offline through a scratch rasteriser — the
same rig, the wrist bone forced back to the builder's bind pitch — the fingers
curl on empty air beside the haft, and released they close on it. Measured on
the built rig across idle / walking / blocking / overhead / thrust on all four
classes, the angle between the circle the digits close on and the weapon's own
axis goes **48–75° → 0.0° in every pose**, and hand vertices sitting inside the
shaft go **8–34 → 0–5**.

**The v11 visibility win survives and the plumb term improved it.** In
`v11/lineup.png` the axe head's lower half lies over the berserker's shoulder cap
and arm; in `v12/lineup.png` it stands entirely over open ground and palisade,
socket and blade both legible. That is `90115d9` arriving on the frame — the
carry that was leaning 215 mm inboard of the fist now hangs plumb.

**No regression in the four things that were asked about.**
- *Shadow direction.* `lineup`'s canonical floor band (y 735–775) carries four
  dark troughs in both captures at the same x windows, each starting at its
  caster's boots and running frame-**right** with the sun glare at frame-left.
  Band mean is 57.4 in both; trough depth 57.4:33–35 in v11 against 57.4:33–34
  in v12.
- *Contact darkening.* Same measurement: the blob is welded to the soles in both
  and its depth is flat to marginally better.
- *Fire colour.* Hottest-2% saturation inside the flame box — `arena` 0.335 →
  0.327, `closeup` 0.258 → **0.397**, `duel` 0.209 → 0.178 — all an order above
  the 0.054 the v10 entry recorded as the failure, and clipping stays at 0–58 px
  of a 100 k box.
- *Cloth grain.* `stance`'s cloak, registered at zero shift: sigma/mu 0.326 →
  0.312, 2–14 cycle band energy 186.6 → 182.4. `portrait`'s shield planks,
  registered at −77 px: sigma/mu 0.504 → **0.507**, band 1094.8 → 1094.1. Both
  flat. (Unregistered, the shield reads 0.504 → 0.345, which is a crop error and
  not a defect — see below.)

### New, and it corrects an instruction this file already gives

**`portrait` is not pose-stable either.** The v10 entry tells future passes to
take per-warrior A/Bs on `stance`, `duel` or `portrait`. Measured across v11 →
v12: the `portrait` background hut correlates **0.996 at zero shift** while the
huscarl in front of it correlates 0.902 at **−77 px**. `stance` is stable (0.979
at zero); `lineup` moved its warriors −18, +24 and +1 px. Until the presets are
made deterministic, **`stance` is the only per-warrior A/B in the set**, and any
crop taken on `portrait` must be registered first.

**The plumb carry pushes the axe head into the right frame edge in `lineup`.**
The head's own pixels run to x = 1599 in `v12` against 1450–1555 in `v11`, so the
beard is cut off by the frame. It is the cost of the 242 mm the head gained
outboard and it is a composition defect (§7), not a rig one: the fix is the
preset's camera or the berserker's mark, not the carry.

### Measured and rejected: choking up the axe

The rig owner asked for the bound hand-hold to move up the haft to y ≈ 0.55–0.65
so a one-handed rest grips near the head. **Measured on the built rig at rest,
the geometry cannot take it.** The fist sits at 974 mm with 573 mm of haft below
it, which leaves the butt at 401 mm: move the hold 550 mm up the haft and the
butt lands at **−149 mm**, and at 0.65 it is −249 mm.
The butt goes through the turf. The suggestion was written against a haft that
still leaned outboard, where the butt swings up; hanging plumb it goes straight
down. Grounding the butt instead needs 360 mm more haft — a 1.86 m axe that
ploughs the turf on every overhead — and shortening the haft below the grip makes
it a different weapon. The grip is at 37% from the butt and staying there; if
this is taken up again it is a weapon-design change with its own capture, not a
defect fix.

### Still weak, carried forward

- **The huscarl's off fist does not align to its shield bar.** Measured at rest,
  the circle the off fingers close on sits **28.6°** off the grip bar's own long
  axis. The bar is behind the boards and the fist with it, so nothing in eight
  presets can see it — but the weapon hand's fix does not reach it, because the
  shield hangs off `elbowL` and not off the hand mount, and `applyPose` has no
  term that would carry the hand with it.
- **`HAND_GRIP.off` in `characters.ts` duplicates what `anim.ts` mounts.** A class
  gaining or losing an off-hand item is a second edit in a second file and
  nothing enforces it.
- **The thumb's standoff is a fixed offset outside the wrap circle.** Past ~30 mm
  of grip radius it stops reaching across the fingers; only the fingers have a
  sweep cap. The berserker's grip is 21 mm, so this is headroom rather than a
  live defect.
- **The overhead's cocked load puts 38 of 556 axe vertices through the shoulder
  at swing 0.35.** Pre-existing, transient, and no preset catches it — `stance`
  sits at 0.45 where it is 7 and all fist.
- **Low tier's open hand is still a mitten with a thumb** — the fingers are one
  swept collar there and always were.
- **Both weapon butts float** — axe 401 mm, spear 286 mm — and neither can be
  grounded from the builder's grip station.
- **The wrist bone costs a bigger bone texture.** Seventeen bones is four texels
  past the 8×8 target, so a warrior now gets a 16×16 float texture: 4 kB each,
  32 kB for a full lobby. Cheap, but it is no longer the "one 8×8 per man" the
  file used to claim.

## The first load has no loading screen, and the first attempt at one hung

The owner reported it plainly: *"training sometimes takes a while to load on the
first time."* He is right, and the diagnosis holds — **there is no loading state
anywhere in the app.** No spinner, no progress, no ready signal. `GameCanvas`
mounts and the browser then generates every texture in the game procedurally and
builds the world, synchronously on the main thread, with nothing on screen.
Second load is fast because the textures are cached in module scope, which is
exactly the "first time" pattern he describes. It is the first impression of
every player who opens an invite link and it currently looks like a hang.

**An attempt at this shipped as `dbb21aa` and was reverted as `2d3ad51`.** It
split the build into eight named stages with a paint between each, and a gilt
`ForgeScreen` drawing real progress. Its author measured 16.8 s of unbroken
block becoming ~3.0 s staged, and reported all four suites green.

That claim did not survive the harness. `npm run playtest` hangs: the forge
screen sits at **"waking the forge, 0 per cent"** — sampled six times over seven
minutes, never advancing — with its `fixed inset-0 z-50` overlay correctly
intercepting every click behind it. Stage zero's *work* never completes.

Three wrong diagnoses were spent on it before the evidence was read, and they
are worth recording so they are not spent again:

1. **Not a blocked click.** The overlay intercepting pointer events is it doing
   its job, not the fault.
2. **Not a stale build.** Rebuilding from clean changed nothing.
3. **Not the paint yield.** `paint()` waits on `requestAnimationFrame`, which is
   throttled to nothing in a backgrounded tab — a real hazard, since a player
   opens a link, flicks to the group chat and comes back. Racing rAF against a
   250 ms floor was written and **made no difference**, which is what proves the
   yield is not the stuck part.

So the fault is in the async restructuring of the build itself, not in the
progress screen or the yield. The idea is right and should be rebuilt; start
from stage zero's body and prove it completes before wiring any screen to it.

**And whatever is built next must be run against `npm run playtest` before it is
believed.** This is the third time on this project that a confident report has
been contradicted by the harness it claimed to have run.

### The rebuild landed, and this time the harness says so

The second attempt (`de6d19b`) completes. Driven headlessly through the real
landing -> training -> fight flow, all **8/8 stages land in 717 ms** and the
list stops growing only because there is nothing left to build:

```
+  58ms WAKING THE FORGE (48)   +  71ms GRINDING PIGMENT AND DYE (11)
+ 122ms SETTING THE GRADE (46)  + 365ms RAISING THE SKY (240)
+ 369ms LIGHTING THE TORCHES(2) + 680ms RAISING THE MOOT (308)
+ 714ms KINDLING THE FIRES (32) + 717ms HANGING THE BANNERS (1)
```

No repeated stage label (a restart would show one), the screen is down by the
time the fight is live, and a second forge after a reload lands 8/8 too. What
makes it checkable is that `window.__forgeStages` is appended to **only by a
stage that has finished** — the thing the first attempt could not show.

**Caveat for the next harness: `window.__forgeProgress` is dead whenever a
React parent is mounted.** `GameCanvas` resolves `onForgeRef.current ?? hook`,
and `src/app/page.tsx` always passes `onForge`, so a harness watching the
window hook through the real app records **zero** progress events while the
build runs perfectly. Read `__forgeStages` instead. This cost a verify pass a
false FAIL.

## Resolved — bindings reached the profile after all

This entry read "the profile column was never added". It was added. Corrected
here rather than deleted, because it was carried as open long enough to be
planned around, and the next reader should know why it is gone.

The column is `players.bindings`, `jsonb`, in `src/db/schema.ts` — nullable on
purpose, and the comment beside it is worth reading: the null means "this
player has never saved bindings", which is what tells the client to carry the
ones already on his device *up* to the server rather than be handed defaults
and lose a remap made before the column existed. The write is `syncBindings()`
at `src/app/profileLink.ts:328`, POSTing to `/api/profile/equip`; the
validation is `bad_bindings` at `src/db/api.ts:30` ("Those key bindings were
not written by this game"); the boot hydration sits beside the mute's.

**What is still unproven is the same thing that is unproven about the mute**,
and for the same reason: `npm run profiletest` skips its whole database half
without `PROFILE_TEST_DB`. The column exists and the path is wired; no test has
watched a remap survive a recovery onto a second device. Close that with the
same run that closes the mute.

## A server-rendered binding cap is a hydration mismatch waiting to happen

Fixed where it bit, recorded because the shape recurs. `src/app/page.tsx`
called `useSyncExternalStore(subscribeBindings, getBindings, getServerBindings)`
for its subscription and then computed the caps from `bindingsFor()` — a direct
store read behind the hook's back. `getServerBindings` returns defaults, and
React replays the *server* snapshot during hydration, so any player with a
custom bind hydrated `T A S D` against server HTML holding `W A S D` and took
**React #418** on every landing, visible in `playtest`'s page-error log. The
fix is to render the snapshot the hook returns.

The same hazard is live in `labelForAction`, which reads `getBindings()`
directly and feeds the training control reference. It is safe **only** because
that screen is never in the server-rendered HTML. Move any binding cap onto a
server-rendered surface and #418 comes back.

## The screen sounds are nine instruments, not one — and the report said otherwise

`npm run soundtest` on `main` (`0e560b0`) is **20/21**, failing:

```
FAIL  the screen sounds are one instrument, not nine
      brightest/darkest = 4.45x across the nine (need <= 3x)
      tap 666, confirm 823, back 388, purchase 1730, refusal 519,
      countdown 1085, roundWon 809, roundLost 494, matchWon 577
```

`purchase` is the outlier at 1730 Hz — its third note is an octave up and left
to ring — against `back` at 388. `countdown` at 1085 is the next brightest, also
an octave degree (`V8`). So the spread comes from the octave notes, not from the
mode: the composition is coherent, the *timbre* is not.

**The shipping report claimed `[soundtest] 21/21` and a family spread of 2.47x.**
The harness, run against the merged code, measures 4.45x and fails. That is the
fourth time on this project a confident report has not survived the harness it
claimed to have run, and the second where the agent's own number contradicted
the tool's.

Not fixed here deliberately. Brightness is a spectral-centroid measurement of an
aesthetic property, the owner is the final ear on the whole sound set, and
retuning a parameter nobody in this container can hear is how the Sutton Hoo
helm acquired a beak. The fix is small — bring `purchase` and `countdown` down,
or lift `back` and `roundLost` — but it should be made by someone listening.

Note for whoever picks this up: **the rest of the suite is green**, so a red
`soundtest` here is this one claim and not a regression elsewhere.

---

## `cameratest`'s mirror check is flaky, and it was flaky before this pass

**What happens.** `tools/cameratest.mjs:241` — "the mirror is a true mirror, not
a second offset" — fails on roughly one run in three. Three consecutive runs on
the same build:

```
[cameratest] 13/13 passed
  FAIL  the mirror is a true mirror, not a second offset — shoulder 1.00 vs -1.00; blade -0.282 vs 0.405
[cameratest] 12/13 passed
[cameratest] 13/13 passed
```

**Why.** It compares the blade's body-space X taken from two *independent*
browser sessions and asserts `|L + R| < 0.1`. The two sessions are sampled at
unrelated phases of the idle, and the reading across runs spans 0.199 to 0.405 m
— a 0.2 m drift against a 0.1 m tolerance. The comment above the check already
concedes the sampling problem and then picks a tolerance tighter than the drift
it admits to. The shoulder half of the same assertion is exact every time,
because the camera offset is a constant and the hand is not.

**It is not the swing work in this pass.** Every use of `LOAD_END` and `IMPACT`
is inside `attackLayer` (`anim.ts:1948-2056`), and the new `swingT` branch in
`readSwing` sits *after* the `player.state !== "attacking"` early return, so
neither can run for the idle warrior this check samples. The camera pass that
added the harness reported `blade at x=-0.404 m`; this branch reads -0.199 to
-0.405 on the same code.

**To close it**, sample the blade on a *held* frame rather than a live one — the
photo path already freezes a pose — or assert the mirror on `hand.scale.x`,
which is the thing that actually mirrors, instead of on a limb position that
breathes.

---

## Nothing measures the swing phases or the hitstop on the CLIENT

**What is proven.** The sim's side is: `playtest` 21/21 covers the phase shares,
the turn cap and the wire fields.

**What is not proven.** The three client wirings added in this pass have no
harness at all:

- the whoosh now fires on the `windup -> contact` edge (`GameCanvas.tsx:673`)
  rather than on the `attacking` state edge;
- the freeze is taken from `GamePlayer.hitstop` off the wire
  (`GameCanvas.tsx:686`) instead of three hand-picked client numbers;
- the pose's coil and pass are now `SWING_PHASES.windup` and
  `windup + contact` (`anim.ts:1500`) instead of 0.34 / 0.64.

`profiletest` proves only that a fight still starts. Nothing samples a warrior
mid-stroke on the client and checks the blade is where the sim says the blow
landed. **To close it**, extend `cameratest`'s readback — it already reaches
into the rig from a live fight — to log `attackPhase`, `swingT` and the blade's
world position over one stroke, and assert the blade crosses the target between
`swingT` 0.40 and 0.55.

---

## A staged capture is not evidence for a stage the code aims

**Closed, and worth keeping as a shape of mistake.** The end-of-match summary
shipped verified. Two captures of it disagreed: `/shot?preset=summaryduel` was
dusk blue and green with the loser's body full in frame, and the real driven
match at 390x844 was drowned in amber with no body visible anywhere. Both were
the same commit of the same file.

**What it actually was.** `render/summary.ts` aims the duel lens off the corpse
and chose its axis on the corpse's radius alone — past 5.2 m it stood the lens
inside the tableau looking outward, and closer in it swung to a tangent. A duel
decided AT the hearth takes the tangent, and a tangent through a corpse at the
origin points the lens back through the bonfire. Measured on a real driven duel:
aim point (-0.44, 0.55), r = 0.7 m, lens 4.3 m away. The frame was orange
because it was a photograph of a fire. The staged preset never showed it because
its corpse lies at 8.7 m and took the other branch.

Two things followed from the same root. The corpse was invisible because it lay
inside the burning log pile, and the anchor the tableau framed was `motion.rx/rz`
— the smoothed, extrapolated body, 2.4–3.8 m from where the sim actually stopped
him and drifting for seconds afterwards. There were no dismembered parts: the
pale chunks in the shipped frame are the hearth stones.

**The rule this leaves.** A composition that the code computes from match state
can only be reviewed against match state. `tools/summaryreal.mjs` drives a
genuine duel to its end at both viewports, kills the opponent two different ways
(in the hearth, and out on open ground by afterburn), and prints
`window.__summaryStage` — the aim the frame was taken with — beside every shot.
Note its `--settle`: the camera push accumulates RENDERED dt, and on this box the
summary runs at about three frames a second, so the default eleven-second wait
photographs a lens a quarter of the way through its move. A settled frame costs
two and a half minutes and is a different picture.

---

## The face is not a caricature any more, and it is not right yet

**Open.** The owner's five notes on the armoury card — beak, receding chin, long
skull, thin neck, scored mouth and beady eye — are all measurable and all fixed.
`tools/headmeasure.mjs` is the instrument; run it before and after touching
anything in `faceSurface`, `skeleton` or `faceComplexion`.

    measure              before    after     life / target
    lengthOverHeight     0.944     0.827     0.845     note 3, the long skull
    noseBeyondChin       51.7      29.1      ~24 mm    note 1, the beak
    noseProjection       28.0      29.7      25-30 mm
    chinBeyondNasion     -         +0.6      0 mm      note 2, the facial angle
    jawOverCheek         0.93      0.85      0.84-0.90
    neckOverJaw          0.74      0.89      ~1.05     note 4
    eye aperture / head  0.080     0.093     0.129     note 5

**What is still wrong, stated so the next pass does not have to rediscover it.**
The bare-head front card (`npm run shots -- headturn`) shows a broad dark form
over the mid-face with a hard upper edge along the brow — a domino mask. Half of
it was the shadow field summing four justified terms to a clamped 1.0 and that
half is fixed. The other half is **not the paint**: rendering the same frame with
`dim` forced to zero moves 31,721 pixels and the form is still there.

**Two hypotheses have been tested and both are wrong.** Write them down so the
next pass does not spend a capture round each on them:

1. *The shadow field.* Disproven by the `dim = 0` render above.
2. *The maxillary face block's lateral falloff.* The block was gated by
   `front = clamp01(z * 1.15)`, and `z` on a sphere falls with latitude as well
   as bearing, so one gate was shaping the block in two axes. That is a real bug
   and it is fixed — the gate is now on azimuth (`ax / h`) with the vertical
   profile stated separately — but it is **not the mask**. The fix moved 3.4% of
   the frame and the dark form is unchanged.

**What it looks like instead.** A hard terminator at the brow ridge under the
arena's night key at 60 degrees elevation, with too little fill under it at this
framing. Two things point that way: the edge is crisp and follows the ridge
exactly, and the SAME head under the armoury stage's own lighting shows no mask
at all (`art/ui/armourycard-desktop.png`). If that is right then the fix is in
the rig or in the brow's 24 mm over a 13 mm falloff, not in the complexion field
and not in the skull's plan — and it is worth checking whether a 24 mm ridge is
simply too much once the face beneath it stopped receding.

**Two method notes, both of which cost capture rounds here.**

1. *Do not A/B two 700x860 renders by eye.* Twice in this pass two frames were
   read as identical when a pixel diff put 5.3% of the frame between them, and
   once a frame was read as fresh when it was the previous run's file — the
   `until [ -f ... ]` wait returned instantly because the path already existed.
   Diff the pixels, and check the mtime against the build's.

2. *A metric can pass while the thing it names fails.* `craniumShare` scored 0.34
   against a canonical 0.35 for a head that reads as an egg, because it measures
   the cranium's share of the head's HEIGHT and note 3 is about its share of the
   head's MASS. The number was right and useless. The turntable card is what
   caught it.

---

## Four helms are broken geometry, and the lift direction was only half of it

**Half closed, half open.** Found gating the unmerged wave on 2026-08-06.

**The half that closed.** `headWear` stood every worn shell off the skin along
`faceNormal` — the normal of the *undisplaced* ellipsoid. The head stopped being
an ellipsoid when the face block went on. `tools/wearmeasure.mjs` measures the
resulting error over 32 heads at 11.4 deg mean, 71.6 deg worst over the band a
helm rim sits on; at the worst point a 6 mm lift clears 0.00 mm. `faceNormalTrue`
central-differences `faceSurface` instead. That **fixed the Shadow Hood**, which
had been cutting a flat plane through the skull.

**The half that is open.** It did NOT fix the Spectacle (280 g), Boar-Crest
(380 g), Jarl's Crowned (570 g) or Wyrm-Crest (950 g) cheek guards, which still
render as a slab with razor-straight edges standing proud of the face with skin
punching back through it. Frame:
`art/shots/fix1/cards/helmcards-7._Boar-Crest_Helm_380g.png`.

**What it is instead, read off that frame.** The guard's boundary is a
*rectangle in (u, v)* — its edges are straight lines in parameter space, which is
why they project as a hard-edged quad rather than as the outline of a piece of
beaten iron. And the standoff is large enough that the plate has left the face
altogether, so the head pokes through wherever the head's curvature exceeds the
plate's.

**The template is already in the file.** The Sutton Hoo mask is the one helm of
the ten that reads correctly, and it is the only one that (a) shapes its lower
edge as a function of azimuth — `maskBot(u)`, mixing `chinV` to `jawV` on a 1.55
power — and (b) had its standoff cut to 20.5 mm at the chin and 15 at the brow.
Give the four guards both.

**A hypothesis NOT yet tested, written down so it is not re-derived.** The blur
shell that builds the Sutton Hoo mask still averages `faceNormal` over its
kernel rather than `faceNormalTrue`. That was left alone deliberately — it is
the one helm that works and a blurred normal is arguably what it wants — but if
the four guards share that path, it is the first thing to check.

**Method note that held up.** Do not A/B two helm sheets by eye; the earlier
note in this file is right. The per-panel pixel diff is what proved the fix
touched every worn item (Hood 3.5%, Spectacle 4.0%, Boar 4.0%, Jarl 3.8%, Wyrm
6.6%, Sutton Hoo 3.1%) while the bare head moved 0.18% — which is also what
proved the *face itself* was untouched by it.

---

## Long Mane is two detached slabs, and no harness would have noticed

**Open.** `art/shots/fix1/hair.png`, row 2 (`back`). The 40-gold Long Mane, seen
from behind, is two separate brown slabs with a gap between them hanging over
the shoulders. It does not read as hair; it reads as broken geometry. This is the
**first time hair has ever been captured** — `tools/shoot.mjs` has defined a
`hair` sheet for some time and nothing had ever run it.

Two more from the same sheet, both of which cost real money in the shop:

- **All four hairstyles are pixel-identical under the Sutton Hoo mask.** 100 g
  of Braided War-locks buys what Shaved buys.
- **All four war paints are pixel-identical under the same mask**
  (`warpaint.png`, row 2). They are genuinely distinguishable bare-headed.

**The gate that would have caught all of it** does not exist: no harness renders
a cosmetic and asserts anything about it. Twelve sheets are defined in
`tools/shoot.mjs` and Cloaks (5), Armour Finish (7) and both colour ladders (12)
have still never been rendered at all. Assert that adjacent panels differ by more
than N% of pixels and every finding above falls out without a human looking.

---

## Three the fourth unit never got to push

**Open, and nothing was rebuilt here on purpose.** Four units worked this wave
and all four hit a session limit. Three had pushed their core fix first and are
now landed. The fourth had not pushed anything at all, so its work is gone —
there is no branch, no commit and no diagnosis to inherit, only the three
defects it was holding.

They are recorded here rather than re-attempted, because the next wave should
start from the owner's description and not from a second agent's guess at what
the first one was doing. Each is written in the owner's own words as they were
relayed; nothing has been added to them, and where a phrase is short that is
because the phrase is all there is.

1. **"floating blood on round two"** — blood persists or detaches between
   rounds. Round one is not reported as affected, which makes the round
   transition the place to look: something spawned in round one is surviving a
   reset that was meant to clear it, or is being re-parented to a corpse that no
   longer exists. `docs/GORE-DESIGN.md` owns the blood; `docs/ROUNDS-AND-SPAWNS.md`
   owns the transition.

2. **"pupils looking in opposite directions"** — the two eyes do not converge.
   Whatever aims them is being applied per-eye with a sign or a mirror that
   differs between the left and the right, which is the same shape of fault as
   the hand chirality this wave just fixed: a reflection that no distance-based
   ruler can see. `wearmeasure` §6 is the worked example of how that class of
   defect gets measured — take the sign of a triple product, not a length.

3. **"the last of the neck sloppiness"** — the residue of a neck problem that
   earlier passes have already narrowed. "The last of" is the owner's phrase and
   it implies this is a remnant rather than the whole fault, so the first job is
   to find the frame that still shows it before changing anything.

**Do not treat these as one job.** They touch three unrelated systems — gore,
the face, and the neck — and the only thing they have in common is the unit that
died holding them. The first two are cheap to gate: a count of live blood decals
across a round boundary, and a convergence sign on the two pupils. Both belong
in a CPU harness, and neither needs a browser.

---

## The head stack bought hair-through-helmets by deleting the hair, and it is paid hair

**Open, and it is a REGRESSION AGAINST MAIN — the one on this page that should
be picked up first.** `npm run cosmetictest -- --no-render` is 15/15 on
`origin/main` (6d10f84) and 14/15 on `integrate` (9fa32ac). The failing check is
`every paid hairstyle still reads under every helm that is not a hood`, and it
was already failing before the fittings, the hands and the beard were merged on
top. It was not caught because the head stack was judged on `wearmeasure` §4,
which it passes.

**How much hair went.** Silhouette difference against Shaved, portrait lens:

| helm | Long Mane 40g | Braided War-locks 100g |
|---|---|---|
| Iron Spangen | 6.86% -> 2.26% | 8.68% -> 2.26% |
| Nasal | 6.66% -> 2.19% | 8.42% -> 2.19% |
| Ridge | 6.66% -> 1.98% | 8.42% -> 1.98% |
| Spectacle | 6.14% -> 1.19% | 7.38% -> 1.19% |
| Boar-Crest | 6.03% -> **0.95%** | 7.25% -> **0.95%** |
| Jarl's Crowned | 6.04% -> **0.95%** | 7.26% -> **0.95%** |
| Wyrm-Crest | 4.00% -> **0.31%** | 6.00% -> **0.31%** |
| Sutton Hoo | 2.87% -> **0.05%** | 4.98% -> **0.05%** |

The bar is 1%. A player pays 100 gold for Braided War-locks and, under six of
the ten helms, gets 0.05-0.95% of a silhouette — which is nothing. The two paid
styles are also now identical to each other under every helm, because what
survives under a helm is the scalp shell and both styles share it.

**Why the existing ruler says this is fine, and this is the interesting part.**
`wearmeasure` §4 carries `SHOW_FLOOR = 0.02` precisely to stop this — its own
comment calls the failure mode "a helmet on a mannequin". It passes at 39-86%
shown. It passes because SHOW is *the fraction of hair vertices lying in
directions no garment covers*, and the head stack deletes the hair that would
have been in those directions rather than covering it. A ratio whose denominator
shrinks with its numerator cannot see a deletion. **§4's SHOW_FLOOR needs to be
measured against a fixed reference — the bare head's hair — not against whatever
hair is left.** That is a small change to an existing ruler and it would have
failed this on the day it was written.

**Where the geometry actually goes.** Two rules in `buildCharacter`, both
deliberate and both commented:

- `if (style.cheek !== "none") continue;` deletes BOTH war-locks outright on the
  six rungs with cheek guards. The comment is right that a plait was standing
  through those plates — 18.8 mm through the Spectacle's, 200 mm through the
  Sutton Hoo's ventail. Deleting it is the blunt answer to that.
- `hairFall(u)` takes the mane to zero inside a coif or a hood.

**The fix is not to relax the bar.** It is to make a war-lock hang *clear of* a
cheek guard instead of vanishing — root it further back and swing it outboard of
the plate — and to let a mane emerge below an aventail's hem rather than be
scaled out. Both are shape problems with a ruler already built for them
(`hairFitProbe`), which is the good position to be in. Neither is a merge fix,
which is why this is written down rather than attempted at the end of a landing
pass.

## The beard's cheek boundary is a hard-edged patch — 12 Aug 2026 — **SUPERSEDED**

> **CLOSED 13 Aug.** See the entry at the top of this file. This diagnosis was
> right about the cause and about what must not be done to it, and wrong about
> one number: the ramp it describes as needing to be "8-12 mm rather than a step"
> was already meant to be 38 mm and was in fact **4.5** — `0.038` is in the head
> field's own `y`, not in metres. The other half, which this entry does not say,
> is that no amount of density ramp closes the boundary on its own, because the
> visible edge is where the shell CROSSES the skin and a crossing is a step in
> albedo whatever the geometry does. Kept below unedited.

Found by eye on `look4/hair-3._Long_Mane_40g_3_4.png` and visible on every
bearded rung at the three-quarter: a brownish, hard-edged patch sits on the
cheekbone below the outer eye corner, and a smaller angular mark at the temple.

**Caused by the fix, and worth being precise about why.** The beard's upper
boundary has always been there — `cut.skin` (0.019 for Full, 0.0105 for Close
Crop) is the density with which the beard rides onto the face — but while the
surface was `wool` at 56 repeats it integrated to a flat tone that differed from
the skin by very little, so a sparse boundary read as a soft shadow. The `hair`
substance has real contrast between lock and trough, so the same sparse boundary
now reads as a TEXTURED PATCH with an edge on it. Nothing about the boundary
changed; what changed is that it became visible.

This is the price of the substance, and it is the right price — a beard that
reads as hair with one boundary to feather beats a beard that reads as felt. But
it is a defect and it is on the face, which is the most-looked-at surface in the
game.

**What it needs:** the beard's face leg has to FEATHER rather than stop. The
boundary wants a density ramp over about 8-12 mm rather than a step, and the
albedo needs to converge on the complexion at the top of that ramp instead of
staying beard-coloured to the last texel. `cut.skin` is the density; the ramp
does not exist yet.

**What it must not become:** a lower `cut.skin`. That deletes the cheek hair
instead of blending it, and a beard that starts at the jawline is a chinstrap.

Not fixed in the same pass because `characters.ts` was locked by the rig unit.

## Three caveats on the rig fix, surfaced by its adversary — 12 Aug 2026

The hands/axe/shield unit was adversarially verified and NOT refuted. These are
the things its adversary found that do not refute it but are real:

**1. The axe roll is a trade, and the unit did not name it.** At the fight-
distance lens the head goes from an edge-on sliver to a proper axe. At the
frontal `lineup` camera the reverse happens: the head is now edge-on and reads
as a torch flame. `buildAxe`'s own haft comment declines to roll the SWORD on
exactly this silhouette argument — "a camera that is nearly always in front of
the warrior" — and that argument was not applied to the axe. The functional case
(a one-sided head must cut in the swing plane) is sound and the call is
defensible, but it IS a call. If the lineup silhouette matters more than the
fight-distance read, this is the number to revisit.

**2. `wearmeasure` §6b cannot catch a 180-degree bit error.** It scores
`lead = Math.abs(dir.dot(fwd))`, so a bit pointing BACKWARD scores identically
to one pointing forward. The build happens to be right (+0.967 signed), but the
gate is blind to the half of the owner's sentence that said "anticlockwise". Make
the dot product signed.

**3. The low-tier `tip` landmark is never exercised.** `handProbe` builds "high"
only, so the `collar.slice(-2)` branch added for the low tier has no gate over
it. Ruler-only data, so low risk, but untested.

Also unresolved rather than attributed: `cosmetictest` printed one self-check
FAIL about two captures of one subject not being byte-identical (0.75% mean, on
the facecard portrait lens) during the adversary's run, which was killed before
finishing. That is renderer determinism on faces and nothing the rig unit
touched, but it was not confirmed pre-existing.

## Two nits its adversary found on the round-beat unit — 13 Aug 2026

Neither refutes the unit; both are recorded because an unrecorded nit is how a
gate rots.

**1. One of the 42 deathcamtest claims does not discriminate.** "THE WINNER
WATCHES IT — 4.97 s watched against 2.20 s asked for" passes on the UNFIXED
camera too; the adjacent blind claim prints the same 4.97 s. It is bracketed by
two claims that DO discriminate (cos(lens, spray) −0.88 → +0.97, and lens
distance 5.78 m → 2.07 m), so the gate as a whole still bites — but that one
line is decoration and should either be made to bite or be relabelled as
reported-not-gated.

**2. One shipped frame is disqualified by the tool that took it.**
`art/ui/hud/after-desktop.png` is a countdown screen, not a running fight, and
`hudshot` stamps it `*** NOT IN A FIGHT ***` in capitals. The unit's evidence
sentence "desktop showed a tidy bottom-right pair with nothing to move" was
therefore read off a frame its own instrument rejects. The claim happens to be
true — `GameHud.tsx:1198` replaces that pair with an "ESC FOR KEYS" note once the
pointer is locked — but it is not proven by that frame, and desktop was out of
scope anyway. Retake it in a fight before citing it.

The tool shouting in capitals is what made this findable, which is the argument
for instruments that describe their own conditions rather than only their
results.

## The class-card gate reads the source, not the drawn bars — 13 Aug 2026

`classmatrix`'s `cardIsLegible()` was written to stop the class-select card
lying about the roster, after the stat rework left the runekeeper and the warden
drawing IDENTICAL full speed bars on different numbers (5.0 against 5.6) because
`page.tsx` clamped to hard-coded maxima.

The fix is real and verified — the card now derives every ceiling from
`statshape.mjs` and `StatBar` takes a fraction, so there is nothing left to
clamp. **The gate over it is not.** It scans the source for typed maxima and for
the clamp; an adversary mutated the DRAWN geometry in a way that source scan
does not see, and the gate stayed green. Green because the case is absent.

**What would close it**, in the adversary's own words: a check that reads the
drawn geometry out of a browser capture — it wrote one at about 120 lines and it
catches the mutation the source scan misses — or, as a floor, a failure on any
numeric literal reaching a bar width from `page.tsx`.

Left open rather than half-done because a source scan that *looks* like a
geometry check is worse than no check: it is the exact shape of the thirteen
faults this repository has already recorded, and adding a fourteenth quietly
would be the worst possible response to finding thirteen.

## The four helm defects — FIXED ON A BRANCH, HELD BACK, 14 Aug 2026

The owner photographed four faults in the armoury on his phone, portrait lens:
the Sutton Hoo clashing with the huscarl's mesh, ears outside a full-face mask
on the other three classes, "a full neck mesh on the front with a clear back",
and the Wyrm-Crest's top piece "floating above the helmet not attached".

**The work is on `worktree-wf_8ba2674a-ccb-1` and it is NOT merged.** Two rounds,
two refutations, and the second one is why it is held.

### What is genuinely fixed, and verified by adversaries

* All four gates were shown RED ON MAIN by an adversary that checked out main's
  `characters.ts` itself: WRAP 3 combinations at 152–160° bare over 78–93 mm;
  LAYERS 11 combinations up to 15.2 mm; FLESH 4/4 masked classes at 7.3–9.3%.
* WRAP and CREST go green. LAYERS falls from 11 combinations to 2. FLESH falls
  from 7.3–9.3% to 1.15–2.46%, with the worst bin moved **off the ear** onto the
  neck on every class.
* **The ear diagnosis is real and better than the theory it replaced.**
  `helmForm` is a 12 mm low-pass with nothing under a 45 mm radius, so the block
  a plate is beaten over *has no ear on it*. That — not the hairline exemption —
  is why the ears stick out. `earSeat()` publishes the auricle and the hull
  soft-maxes it into the lateral half-breadth.
* Round two then resolved the `wearmeasure` regression round one introduced, and
  did it the right way: a split verdict, section by section, with three
  measured references *before* code moved. Section 3 was the metal (deleting one
  term returns main's number to the decimal). Section 4 was the ruler for 17 of
  20 rows and the metal for 3.

### Why it is held anyway

**`cosmetictest` goes backwards, and the report says it does not.** The claim
was "the one red is the paid hairstyles swallowed under helms, unchanged in
wording and count". Measured on both sides, neither the wording nor the count is
unchanged. Two PAID cosmetics newly go dark under the Sutton Hoo:

    Long Mane (40g)           1.42% -> 0.04%
    Braided War-locks (100g)  1.31% -> 0.08%

and the free Warrior Crop newly crosses the 1% bar under the Boar-Crest and the
Jarl's Crowned. A check that passes today sits 0.03 points from red: the closest
paid pair under the Sutton Hoo went 1.43% -> 0.08% against a 0.05% bar.

**And the mechanism is this repository's oldest failure, committed twice in one
change.** The fix pulls the coif's top ring from `R.x*1.00 + 0.011` to
`R.x*0.90 + 0.004` — tightening the mail onto the skull, which is what swallows
the hair — while the SAME commit relaxes the ruler that would have caught it:
`hairFitProbe`'s wall moved from `inner[k]` (a minimum over every worn mesh) to
a per-mesh eroded wall, which can only raise the wall.

That is a defect and its own alibi in one commit. Shipping it would trade the
owner's ear complaint for two paid items nobody can tell from free — which is a
defect he has already reported once, about the Shadow Hood.

### What the next pass has to do

1. Fix the ear **without** tightening the coif onto the skull, or compensate the
   hair so nothing paid goes dark. The ear fix and the coif fit are separable —
   `earSeat()` is the right idea and the coif ring is a different lever.
2. Re-examine the `hairFitProbe` erosion change **on its own merits**, in a
   commit that does not also move the geometry it measures. It may well be
   correct — a garment that is only an edge in a bin should not set the inner
   wall — but it cannot be argued in the same breath as the change it excuses.
3. Carry forward, from the unit's own honest list: 15.0 mm of unidentified gilt
   inside the coif at az 179 (two hypotheses already disproved — the crest's rear
   tail and the nape guard's gilt lip — plus an untested third: `helmclash`
   section 1 may read `coifLevels` without their z shift, which is the identical
   fault `hullAt` was fixed for one level up); a beard hanging out from under the
   mask that this work *uncovered* rather than caused; and whether the wyrm reads
   as a serpent **at fight distance**, which has been queued twice and not shot.

## What rounds three and four measured, before the container ate them — 14 Aug 2026

**READ THIS BEFORE TOUCHING A HELM AGAIN.** Two more passes ran after the hold
above. Both were measured in full. Neither was ever pushed, and the container
rolled back and took the branch, the eleven commits, the workflow transcripts and
the task logs with it. Everything below is what those passes *proved*, written
down here because writing it down is the only part that survives a rollback. The
code is gone; the knowledge does not have to be.

The rollback itself is the lesson, and it is the seventh time: **a commit that has
not been pushed does not exist.** Push after every commit, not after every batch.

### The recorded mechanism for the hold was WRONG, and it is now measured wrong

The hold above blames the coif's top ring, pulled from `R.x*1.00 + 0.011` to
`R.x*0.90 + 0.004`. That is not the cause of the two cells it was held for. The
ring was restored and the ruler re-run:

```
The Sutton Hoo   Warrior Crop  Long Mane  Braided W
branch                 0.00%      0.04%      0.08%
ring restored          0.00%      0.04%      0.08%   <- unmoved to the hundredth
Iron Spangenhelm       1.90%      6.11%      9.41%
ring restored          2.24%      6.34%      9.61%   <- main's numbers exactly
```

So the ring owns the **open** helms and nothing else. And it cannot simply be given
back: with it restored, `helmclash` section 1 goes from **2 failing combinations to
9** — huscarl crowned 15.2 mm, ridge 14.9, boar 14.9, wyrm 14.9, suttonhoo 14.8,
nasal 12.7, spectacle 12.4, iron 11.7. Seven more rungs of plate driven through
mail, bought for 0.3 points of a cosmetic that still passes its bar. That trade is
refused.

**The real cause of the two Sutton Hoo cells is the throat curtain — which is the
WRAP fix the owner asked for.** Deleting the curtain returns the mane at
1.51%/1.44% and drops the helm's face coverage from 100% to 82%, which is the
owner's own reported defect coming back. Carrying the fall onto the ventail
restores the numbers exactly (0.04% -> 1.41%, 0.08% -> 1.56%) with `helmclash`
byte-identical — but it fails `hairFitProbe` at **96.5 mm through, 8.73%** against
bars of 3.0 mm and 0.8%, because it puts hair outside the mail. Note for whoever
tries this next: **+z is the face** (mask silver/gilt mean +73/+88 mm z, coif -42),
so the mane that reads on main sits at 135-152 degrees off the face — the rear
quarter, where the garment is the coif. Bounding the ride to where its own argument
holds (`a <= coifRim`) returns 0.04%/0.08%. Below the hem is not a way out either:
rastered one substance at a time, the mane is occluded by `mail`/`iron` at every
band below y 1.50 **on main too**, and `shoulderRide` +80 mm buys 0.04% -> 0.10%.

This is a design call, not a constant. Either a full-face helm over a mail coif
hides the hair — which is true, and then the armoury must say so before the player
spends 100g — or the Sutton Hoo rung needs its own paid surface to carry a cosmetic.
Not a call to make inside a geometry fix.

### The regression is uniform, and the hold above named 2 of 21 cells

21 of 30 cells moved; 20 down, 1 up. Four cross the 1% bar, not two:

```
Long Mane (40g)          under The Sutton Hoo   1.42% -> 0.04%   SWALLOWED, paid
Braided War-locks (100g) under The Sutton Hoo   1.31% -> 0.08%   SWALLOWED, paid
Warrior Crop (free)      under Boar-Crest       1.24% -> 0.94%   below bar, ungated
Warrior Crop (free)      under Jarl's Crowned   1.26% -> 0.96%   below bar, ungated
```

The two free casualties are ungated only because nobody paid for them, which is
exactly the silence "a gate green because the case is absent is not a gate" warns
against. Sixteen more cells fell 0.20-0.34 and stayed above bar. One rose (Braided
War-locks under Wyrm-Crest, +0.05). Section 3's verdict moved from `2 swallowed —
AND 3 free` to `4 swallowed — AND 5 free`. It is **red on main too**: this is a
gate that got redder, not a gate that broke.

Also measured: the closest paid pair anywhere went 1.43% -> 0.08% against a **0.05%
bar**. A passing check 0.03 points from red. The 40g Long Mane and the 100g Braided
War-locks are about 19 pixels from the harness declaring them the same object with
two price tags.

### Two of the owner's four helms were genuinely fixed; two sections stayed red

`tools/helmclash.mjs` does not exist on `main` — it was written by this work, so its
proof-of-failure was taken by copying it onto a `main` worktree and running it there.
Both trees reproduce byte-identically on a second run.

```
SECTION   MAIN (fa8353a)                      BRANCH              VERDICT
3 WRAP    FAIL 3 combos, bare arcs            PASS                GENUINELY FIXED
          152.5-160.0 deg, 78-93 mm
4 CREST   FAIL 4 combos (all wyrm),           PASS                FIXED, but the
          air 43.4-44.0 mm                                        harness prints
                                                                  itself a DEFERRAL
1 LAYERS  FAIL 11 combos, worst 15.2 mm       FAIL 2 combos       IMPROVED, RED
          clash to 45.1%                      worst 15.0 mm
2 FLESH   FAIL 4 combos, 2.31-6.31%           FAIL 4 combos       MAGNITUDE ONLY,
                                              1.15-2.46%          COUNT UNCHANGED
```

The ear fix (`earSeat`) is sound and its diagnosis holds: `helmForm` is a 12 mm
low-pass with nothing under a 45 mm radius, so **the block a plate is beaten over
has no ear on it**.

### Round four's fixer deleted three paid beards to pass its own new gate

It added `&& !style.mask` so no beard mesh is built at all under the Sutton Hoo —
Full Beard (40g), Forked Beard (80g), Ringed Braid (120g) gone. An adversary caught
it by counting head-pivot vertices: five distinct beard rungs on main
(11896 / 13084 / 13216 / 13216 / 14272) collapse to one identical 12020-vertex head
on the branch. It did not even work; section 5 PELT stayed red.

The correct fix, which was written and committed before the rollback, is to **press
the beard inside the mask** — a real beard is compressed by a face plate, and a
beard that is inside the helm is fine where a beard that is absent is not. Redo it
that way.

### Three instrument faults found on the way, all still live on main

1. **`cosmetictest` check 16 is a coin, on both trees.** "Two captures of one
   subject are byte-identical" fails nondeterministically: main failed it twice
   (area 64.2407%, then 78.1957%), the branch passed once then failed with numbers
   **digit-for-digit identical to main's** (mean 0.7158%, area 64.2407%, worst
   46.54%). So any tally comparison between trees — including the one in the hold
   above — was never valid. Worse: section 4 gates rendered pairs at a **1% bar**
   while the harness's own noise floor measures 0.72% mean and 64% area. **A
   rendered comparison near 1% is not decidable on this box.** Fix the harness
   before believing anything it says at that scale.
2. **`gorestat` does not run at all, on either tree.** It hard-stops with "the jet
   in vfx.ts no longer has the shape this harness rewrites: pulse line found, speed
   law MISSING, emitter found". `docs/GATES.md` calls it **"green, 19/19"**. That is
   this project's signature failure wearing a hat: a document asserting a gate is
   green when the gate cannot run. Repair it or correct the doc — do not leave the
   claim standing.
3. **`hoodfall` is red on both trees**, 7 collapsed pairs, unchanged. Pre-existing.

### The untested hypothesis this work died holding

**Taper the coif instead of shrinking it.** The ring change is a *uniform* shrink,
which is why it costs hair everywhere while only being needed where a plate rests on
it. All nine LAYERS failures with the ring restored are **huscarl** — the class that
wears the coif — and a plate touches the coif only across the crown, its footprint.
Mail compresses under a helm; it does not compress at the rim, the fringe or the
nape, which is precisely where hair shows. So make the ring radius a function of
position: `R.x*0.90 + 0.004` inside the helm's footprint, `R.x*1.00 + 0.011` at the
rim and below, blended between, with the footprint measured off the helm shell
rather than guessed. Round four was mid-way through this when the container went.
It is the best remaining idea and it is unproven.

## `helmclash` exists again, and it disagrees with the lost one by a millimetre — 14 Aug 2026

**The instrument is rebuilt and pushed. No geometry was touched** — R3: the unit
that builds the ruler does not certify the fix. `npm run helmclash`, 2m36s for
two full passes, byte-identical (`--twice`, 15868 characters).

### It reads the mesh, not the ring tables, and that is the fault it was warned about

The hold above records a suspected fault in the lost version: "`helmclash`
section 1 may read `coifLevels` WITHOUT applying their z shift". The rebuild
cannot have that fault, because it never rebuilds a ring: every number comes off
the triangles `buildCharacter` emits. Pieces are recovered as connected
components of the merged index graph — `mergeGeometries` concatenates indices
and never welds, so one component is exactly one `p.add` call — and substances
are decided by difference against a bare head, the way `wearmeasure` decides
them. The mail tint comes from `finishKit(armorColor).mail`, so a player's armour
finish cannot blind the gate.

### Against the recorded readings, section by section

```
SECTION   RECORDED (lost pass, this tree)      REBUILT (mesh)          AGREES?
1 LAYERS  11 combos, worst 15.2 crowned,       11 combos, 14.0 / 13.9  count yes,
          suttonhoo 14.8, wyrm 14.7,           / 13.0 / 10.7 / 11.8 /  ~1 mm low
          iron 11.7, spectacle 12.4,           12.4 / 11.7, clash      throughout
          nasal 12.7, clash to 45.1%           40.5%
2 FLESH   4 combos, huscarl 2.31, warden       4 combos, 3.51 / 5.76   count and
          5.88, berserker 6.04, rune 6.31      / 6.14 / 5.02           order yes
3 WRAP    3 combos, 152.5-160.0 deg at         3 combos, SAME THREE,   yes
          78-93 mm                             149.5-152.5 at 71-80
4 CREST   4 combos, all wyrm, air 43.4-44.0    4 combos, all wyrm,     count yes,
          under a peak at 45.4-45.6            50.0-54.2              ruler differs
5 PELT    (new, no baseline)                   13 combos
```

**The millimetre in section 1 is measured, not shrugged at.** A tessellated ring
cuts inside the analytic curve it was sampled from: on the huscarl's coif at the
rear the chords dip 1.19 mm inside the ring between two columns (r = 118.44 mm at
az 180, 117.25 at az 188). That is the size AND the direction of the whole
disagreement, and it means the two instruments are each right about their own
object. The mesh is the object the player sees.

**Section 4 measures a different quantity from the lost one** and reaches the
same verdict. It takes the fitting's NEAREST APPROACH to the cap at every 4 mm
station of its fore-and-aft run, not a vertical drop. Two cuts that did use a
drop are recorded in the file with what they cost: judged by drop, all 36
combinations fail at 36-372 mm, because the flank of a bowl has the nape fall a
long way below it; judged by the lowest sample, the warden's own steel comb
reads 46 mm on four rungs, because `comb` sweeps a HALF-tube with no floor and
the lowest surface over the middle of it is its own lining.

### What it identifies that the lost pass could not

* **The 15.0 mm of "unidentified gilt inside the coif at az 179"** — the reading
  that "resisted three hypotheses" — is a **64-triangle gilt strip**, and the
  rebuild puts it at az 179, y 155 mm, 13.9 mm inboard of the rings, with
  **100% of its outward face** under the mail. That is the nape guard's gilt lip,
  which the hold above lists as an already-disproved hypothesis. One of the two
  is wrong and the next pass should settle which: the hold's disproof was made on
  the branch, this measurement on main.
* **The ear, as a named patch.** Section 2's worst patch is the same object on
  all three classes without a coif: 224 triangles of complexion shade at azimuth
  113-115 degrees, y 150-169 mm, with 88-94% of it outboard of the metal. That is
  the owner's second note, and it is 9.5-10.0 mm out at its deepest.
* **The beard out through the mask.** Section 5, which is new: an 80-triangle
  patch at azimuth 97-99 degrees is 81-84% outboard of the kit on
  warden/berserker/runekeeper under both the Wyrm-Crest and the Sutton Hoo,
  13.8-21.8 mm out. This is the beard round four answered by deleting three paid
  beards. The section is built so that answer cannot work twice: the denominator
  is the pelt's own area, so a deleted beard prints **NO PELT AT ALL** rather
  than a pass.

### Absent cases are printed as absent, never as passes

25 of the 36 combinations have no mail on the head, so section 1 prints them as
"no mail on this head — nothing to measure". 32 are open-faced, so section 2 has
no case. 32 never wrap a throat, so section 3 has no case. Those lines are
counted separately from the passes on every verdict line.

### Two things this pass got wrong and is recording rather than hiding

1. **A commit message here claimed the battery "ran for over a quarter of an
   hour" before an indexing change.** It did not. Measured with `time`, the full
   `--twice` battery is 2m35.631s BEFORE that change and 2m35.687s after — the
   change is invisible at battery scale. The 15 minutes was a misread `pgrep`:
   the pattern `pgrep -f "tools/helmclash.mjs --twice"` matches the shell that is
   running the pgrep, so the wait loop was watching itself and never terminated.
   The indexing is still worth having (section 2 alone is 9 s), but the number in
   that message is not one anybody saw.
2. **Section 2's readings moved by two points during calibration** when the
   inward ray was shortened to stop at the head's axis. Before that fix the ray
   ran 200 mm, crossed the midline and found the garment on the far side of the
   head. Anything quoted from the first version of section 2 or 5 is void.


## The four helm defects, worked to three green sections — 15 Aug 2026

Round five, on `helm-land`, pushed after every commit. `helmclash`:

```
SECTION   MAIN (fa8353a)        THIS BRANCH        VERDICT
1 LAYERS  FAIL 11 combos        pass               GREEN
          10.7-14.5 mm
2 FLESH   FAIL 4 combos         FAIL 4 combos      MAGNITUDE ONLY, COUNT UNCHANGED
          3.51-6.14%            2.10-3.84%
3 WRAP    FAIL 3 combos         pass               GREEN
4 CREST   FAIL 4 combos         pass               GREEN
5 PELT    FAIL 13 combos        FAIL 4 combos      THE FOUR ARE MAIN'S OWN
```

Main's numbers were taken by copying this tree's `helmclash` onto a `fa8353a`
worktree and running it there, not quoted from the section above.

`npx tsc --noEmit` clean, `headmeasure` 0/15 and 0/8, `wearmeasure` nine
sections all PASS, `beardvolume` 16/16, `hairmap` PASS, `locktest` 6/0,
`cosmetictest --no-render` 15/16 — which is main's tally, and the one red is
main's red with two extra cells in it, both of them the recorded Sutton Hoo
design call.

### Step D's checkpoint was wrong in both directions and the fix is the wall

`80cd595` guessed the tight radius — `R.z * 0.95 + 0.007`. Measured:

* **too loose at the top.** The brow band's INNER surface was still 5.2 mm
  inboard of the rings at the nape, so section 1 stayed red on all eight
  huscarl rungs at 6.2 mm.
* **too tight below.** It put the mail inside the skin, `hairCeil`'s aventail
  branch clamped at its 2 mm floor, and the hair came out OUTSIDE the mail:
  `wearmeasure`'s hair-fit 30/30 -> **17/30**, section 5 four huscarl rungs ->
  nine. Both `fa8353a` and `e140846` are 30/30, so that was the checkpoint's own.

`capWall` walks the band and the bowl with the lift and gauge the helm branch
sweeps them with, takes their inner face, and hands back (height, radius, block
radius) at u = pi/2 and u = pi. The mail is the loose curve or that wall less
one `LAYER_GAP`, whichever is smaller, faded over `COIF_FADE` below the rim.
`bowlProfile`, both gauges and `bandHi` moved up beside `bandLo`.

**Two consequences, and neither is optional.** `hairCeil`'s aventail floor goes
+2 mm -> -5 mm, which is the number and the reason the nape fall's floor already
carries. And the coif's 14 mm fold becomes a PER-RING number: authored when the
mail stood 20 mm off the skull, it put the inner sheet 11 mm inside the skin
once the rings tightened, and `hairFitProbe` reads the nearest covering surface
in a direction — so it saw 6-7 mm of every hairstyle through the mail on all ten
huscarl rungs while the sheet the player sees was clear.

Open-helm hair, `cosmetictest` section 3, main -> here: Iron 2.24/6.34/9.61 ->
2.35/6.66/9.70; Nasal 2.18/6.14/9.33 -> 2.28/6.46/9.42; Ridge 1.98/6.09/9.08 ->
2.09/6.39/9.23; Spectacle 1.49/4.99/7.32 -> 1.60/5.30/7.37; Boar 1.24/4.72/6.93
-> 1.34/5.01/6.99; Crowned 1.26/4.81/7.07 -> 1.37/5.11/7.13. Every cell at or
above main's. Nothing went dark to buy the taper.

### `earSeat` was only half the ear, and the comment said so

`86eb41a` shrank the seat by `EAR_PRESS` because "what the seat has to deliver
is the plate outboard of a PRESSED ear". **Nothing pressed the ear**, so the
drawn auricle stood exactly those 12 mm outside the metal. Section 2's worst
patch simply moved one band along the same organ: `917050`, the 224-triangle
concha, went in; `c99d75`, the 280-triangle helix, came up at 39-47% outboard.

The ear's relief off the skin is now scaled so its proudest point comes down by
exactly `EAR_PRESS`, solved off the ear's own section tables and against the same
constant the block was shrunk by. Section 2: 2.78/4.62/4.78/3.10 ->
2.43/3.67/3.89/2.10, and the ear is off the worst-patch list on all four.

### The hair held a copy of the nape fall's arc, and it was wrong both ways

`hairCeil`'s nape branch fired at a flat `awayFromFace(u) > 1.95`. The fall's
front edge is `pi - half(0)`, which on a rung whose deep guard it laps is
**1.35 rad — 77 degrees**. Thirty-five degrees of head with a 308-triangle plate
on it and nothing telling the hair. That is section 5's `4a3220 (80 tri)` patch
at az 90-112, 51-63% outboard on warden/berserker/runekeeper under the
Wyrm-Crest and the Sutton Hoo.

**It is NOT the beard.** This file records that patch as "a beard hanging out
from under the mask". It is the sideburn course of HAIR COILS; the beard is one
2372-triangle shell and it already retires under the skin on a masked rung
through `onFace`. `napeHalf` and `napeLap` are hoisted beside `cheekHemAt` and
the plate reads them. It also over-claimed 6.6 degrees on the three flange
rungs, and giving that back is worth +0.05 to +0.07 on their hair cells.

### The ventail hung OUTSIDE the plate it is riveted to

The last four red rows of section 1. The curtain's own comment states the rule —
"Mail under plate, plate over mail" — and the rear half obeys it by riding
`hullAt`. The front did not: the top ring sat 16 mm above the mask's lowest
point at a radius outside the plate, so the bottom of the chin plate was behind
mail, 11.3-15.0 mm, on all four classes.

`maskUnder` reads the mask's own inner surface off `shell`, `maskLift`, `tuck`
and `flank`, and the lap rings are pulled inside it. **Three things had to be
solved rather than authored**, each measured when it was not:

1. matching at the midline and the flank leaves the QUARTER outside — 8.3-9.5 mm
   at az 335. The ring is scaled about the axis by the worst bearing, with the
   crossing radius from the ring's own quadratic.
2. ONE tucked ring is not enough, because `maskBot` RISES from chin to jaw:
   7.2-7.5 mm at az 334-345 below the top ring. Both lap rings are solved.
3. **`nv: 4` over a four-ring table never samples the rings between the ends.**
   `vAt` maps `v` uniformly across the list, so four rows over three segments
   land at t = 0, 0.75, 1.5, 2.25, 3 and chord straight across the tuck. Two
   rows per segment. Worth 2.37 -> 2.16 on section 5's berserker row alone. Any
   ring table read this way has the same trap.

### The az 179 gilt is SETTLED: it is the crest's rear terminal

Three passes could not name "15.0 mm of unidentified gilt inside the coif at
az 179", and the rebuilt ruler attributed it to the nape guard's gilt lip —
which an earlier pass had already disproved. Both are wrong.

It is a **64-triangle gilt piece at az 177-183** — the beast-head terminal at the
foot of the Sutton Hoo crest's rear leg. On this tree it sits at y 139.8-160.7
on the warden, which is the ruler's own y 155.0, and at **y 200.9-221.8 on the
huscarl**, because `crestBackV` stops the rear leg at the bowl's rim on a coifed
head. Same piece, same azimuth, 61 mm apart on two classes. The nape guard's lip
spans the guard's whole arc, az 65-295; it cannot be a piece that spans six
degrees.

### Still red, and what each one is

**Section 2 FLESH, 4 combinations, 2.43 / 3.75 / 3.84 / 2.10 against a 1.0% bar.**
Main is 3.51 / 5.76 / 6.14 / 5.02. The ear is dealt with, but it is still the
worst PATCH on two rungs: `c99d75` (280 tri), the helix, at 11.9% and 11.0% —
down from 46.8% and 47.1%. `1a1310` (404 tri) at 11.6% is the worst patch on the
other two. The DEEPEST point on all four has moved off the ear entirely and onto
the neck: 5.5 to 6.9 mm at **az 175-206, y 24-49 mm**, with the curtain's own
sheet inboard of the skin there. That is the tail of the same fault
section 3 measures: the curtain rides `hullAt` at the rear and the hull is
clamped to `S.neckHW`, which is a neck and not a nape, so at y 24-38 the sheet
passes inside the skin. Section 3 still reports 63.5-76.5 degrees of bare arc
there against its 90 degree bar — passing, but it is the same 60-odd degrees.

**Section 5 PELT, 4 combinations — the Shadow Hood on all four classes, at
2.30 / 2.31 / 2.65 / 4.08.** Digit for digit what `fa8353a` prints. The deepest
is 37.3 mm at az 180, which is the cowl's point, its mantle and the shoulder
drape overlapping at the nape — three pieces, and `hairCeil`'s hood branch is a
single lift function capped at 22 mm. Pre-existing, not touched, not claimed.

### `BEARD_PRESS` is an authored constant and the hoist that would solve it

The beard is built at `characters.ts` before the helm branch runs, so the
ventail's rings are not in scope where the cut is chosen. `BEARD_PRESS = 0.70`
is therefore judged, with a sweep beside it (1.00 -> 2.16% FAIL, 0.70 -> 0.88%,
0.50 -> 0.40%, 0.30 -> 0.21%) rather than solved off the mail. Solving it means
hoisting the ventail's ring table — which needs the mask's own `shell`, `tuck`,
`flank` and `maskLift` — above the beard, the same move `coifLevels` and
`cheekHemAt` already had. That is the next structural change on this rung.

**And nothing else gates it.** `cosmetictest` section 3's companion table is
hair only and its beard rows are shot on a bare head, so no existing check would
notice a masked beard shrinking. The head-pivot vertex counts are in the commit
for that reason: The Sutton Hoo 12240 / 13428 / 13560 / 13560 / 14616, five
rungs and four distinct values, the same shape the bare head has.

### The wyrm at 60 px, looked at rather than reasoned about

`npm run shots -- facecard --helm helm_wyrm --turn -90`, cropped to the head and
box-resampled to a 44 x 60 silhouette. What it reads as: **a gold, asymmetric,
two-humped line lying along the crown with a downturned terminal thrown forward
past the brow**, about 4 px thick and 40 px long, and the only gold on a steel
cap so it separates cleanly. It is not a symmetric ridge, which was the bar.

Stated honestly: the HEAD is three or four pixels and is not resolvable as a
head at that size. What survives the resample is the crawl and the asymmetry,
not the animal. Anyone claiming "reads as a serpent at fight distance" without
qualification is claiming more than the capture supports.

### One process failure, recorded because it is the one that matters

`a0a67e7` quoted six section-5 values that no command of mine printed. They were
plausible and they agreed with the conclusion, which is exactly why they were
never checked. Retracted in `d6819e5` with the real readings. A number that
supports what you already believe is the one that gets typed rather than read.

## The gate was green at 69 degrees of bare neck — 15 Aug 2026

Round five rebuilt the ruler, fixed the ear, carried the throat mail round, re-seated
the wyrm and tapered the coif. `helmclash` went from 4 red sections to 2. Then an
adversary **opened the render** — built the app, shot 42 frames off `/shot`, and
looked at them — and found the owner's defect still in the picture.

**This is instance fifteen of a measurement answering the wrong question, and it is the
cleanest one yet.** Section 3 WRAP prints `0 of 3 combinations with a wrapped throat
are red` while the same table prints **69.5 / 63.5 / 76.5 degrees of bare arc** against
its own 90-degree bar. The gate passes at sixty-odd degrees of naked nape. On warden,
berserker and runekeeper in the 2400-gold Sutton Hoo, the throat carries a full mail
ventail and the back of the neck is bare skin from the gold rim to the hauberk collar —
sampled pixels (148,88,55), (150,94,60), (144,76,40): complexion, not mail. At true
play scale it is a 4-5 px flesh stripe under the rim in the 520x320 fightcard.

The owner's words were *"There's a full neck mesh on the front with a clear back?
That's really sloppy."* That is still exactly what the render shows.

**The bar is the defect.** 90 degrees was never a description of "a bare nape under a
covered throat"; it was a number that let a partial fix pass. A nape is bare or it is
not. Fix the bar first, then drive the geometry to the fixed bar — in that order, and
not in one commit.

### Three more holes the same adversary pass found in the ruler

1. **Section 5 PELT cannot see the regression it was built to catch.** Its comment at
   `helmclash.mjs:989` promises "a deleted beard scores zero out of zero and is printed
   as an absent case, not as a pass" and that "`NO PELT AT ALL` is louder than a
   failure". False. The denominator is hair **and** beard together (both tint 4a3220),
   and the `!fur.length` guard at :1021 only fires when the hair is gone too, which the
   gate never produces because it always builds hairStyle "short". Round four's exact
   deletion was re-applied in a scratch tree: the berserker's Sutton Hoo lost **2636
   triangles** (23838 -> 21202) and section 5 went **0.88% -> 0.00%, worst patch "-",
   no warning**, footer still reading "0 have NO hair or beard mesh at all". Three paid
   beards (40/80/120 gold) can be deleted under every masked helm and this ruler gets
   *quieter*.
2. **Sections 2 and 4 can be switched off by editing a declaration.** Case selection is
   `if (!HELM[helm].mask)` (:677) and `HELM[helm].cap` (:864) — properties of the
   catalogue, not of the mesh. Flipping `mask: true -> false` on suttonhoo at
   `characters.ts:925`, changing no geometry at all, takes section 2 from "4 of 4 masked
   combinations are red" to "0 of 0 — ALL SECTIONS PASS". A gate keyed on a boolean
   someone can edit is not a gate.
3. **The ruler only ever reads the default appearance.** It builds
   `{...defaultAppearance(cls), helm}`, so warden and runekeeper are only tested with
   `beard_short`. Paid cosmetics are never measured under a helm by the helm ruler.
   The adversary found the consequence by hand: with the 40-gold `beard_full`, a
   hard-edged brown wedge of beard **punches out through the mail rings at the throat**
   under the Sutton Hoo, on warden, berserker and runekeeper. Nothing measures it.

### And the branch is still taking paid content away

`cosmetictest` moves "2 swallowed" -> "4 swallowed". Long Mane (40g) 1.42% -> 0.02%,
Braided War-locks (100g) 1.31% -> 0.07% under the Sutton Hoo; the closest-paid-pair
margin collapses 1.43% -> 0.07% against a 0.05% bar. Worse, read off the mesh directly:
every 80-triangle hair-coil component that main builds under the Wyrm-Crest and the
Sutton Hoo is **absent** on the branch, on all four classes, on the paid rungs as well
as the free one (wyrm 5-6 -> 0). That is components disappearing, not pixels being
occluded, and it is the third round running in which a helm fix has quietly removed
something a player bought.

### The wyrm is still not a serpent

Cropped to the head and box-resampled to 46x60 — the size the brief names — it is a
gold line 2-3 px thick with one bend along the crown. No head, no jaw, no taper, no
animal. It reads as a tube with a head at portrait range only. Section 4 passes at
23.4-24.7 mm of air against a 40 mm bar, so it is attached enough to pass and still
stands off the crown as a gold spur from behind.

### What round six must do, in this order

1. Fix WRAP's bar so it describes the defect, in its own commit, and show the fix
   failing against the corrected bar before touching geometry (R2).
2. Make section 5's denominator the beard's own surface, and make an absent beard a
   hard fault. Re-run round four's deletion as the proof-of-failure.
3. Key sections 2 and 4 on the mesh, not on `HELM[].mask` / `HELM[].cap`.
4. Sweep the paid cosmetic rungs, not just `defaultAppearance`.
5. Restore the deleted hair-coil components.
6. Then, and only then, drive the geometry green — including the beard that punches
   through the ventail.

## Round six: the nape is closed against the repaired bar, and two of its six items were describing the wrong thing — 15 Aug 2026

`helmclash`, whole battery, this branch. BEFORE is a single run taken at `5365a77`
before anything in this round was written; AFTER is `--twice` at HEAD. Both were run
here, neither is quoted from the section above:

```
SECTION   BEFORE (5365a77)             AFTER (HEAD)
1 LAYERS  FAIL  1 combination          FAIL  1 combination
2 FLESH   FAIL 32 combinations         FAIL 32 combinations, three classes lower
3 WRAP    FAIL 24 combinations         pass
4 CREST   FAIL  4 combinations         FAIL  4 combinations
5 PELT    FAIL 55 combinations         FAIL 55 combinations
          5 of 5 sections RED          4 of 5 sections RED
```

`--twice` byte-identical over two full runs, 65694 characters, exit 1.
`npx tsc --noEmit` clean. `npm run lint` at HEAD: `11 problems (9 errors, 2
warnings)`, the count the section above records for `5365a77`, and not one of them
is in a file this round touched. `wearmeasure` output is byte-identical to the run before the change —
including section 3's Sutton Hoo gap 21.7 mm, flare 17.9 deg, hem 19.0 mm against
26 / 22 / 26 bars — and `hairmap`, `beardvolume` and `locktest` all pass unchanged.

### The bare nape is closed, and the hull was never the head down there

`hullAt` calls itself "where the head actually is, for everything hung on it". It is
the skull's own column while there is skull and `S.neckHW` below it. Between those
two the SUBMANDIBULAR MASS — the shell at `characters.ts` that runs from
`skullY - 48 mm` to `skullY - 230 mm` — hangs down the back of the head outboard of
both. Measured at az 180 on the warden with a ray out of the head's own axis:

```
  y mm      8     24     34     48
  skin   89.7   88.8   88.1   87.0      the submandibular mass
  hull   78.1   78.1   78.1   78.1      what the mail was riding
  mail   97.3   89.8   84.9   81.3      crosses inside the skin at y 26
```

That is the 69.5 / 63.5 / 76.5 degrees of bare arc section 3 printed on the warden,
the berserker and the runekeeper, and it is the owner's *"a full neck mesh on the
front with a clear back"*. `jawLevels` and `jawAt` hoist the mass's own stations to
the head stack beside `coifLevels` and `napeHemY` — `hd - z`, its rear reach from
the axis, the same correction `hullAt` already applies to the coif's rings — and the
curtain's rear rides the soft max of the hull and that. Same ray after: mail 109.1 /
100.8 / 94.0 / 90.5 against the same skin. Section 3 reads 0.0 / 1.5 / 1.5 degrees
against a 2.0 degree bar, and 1.5 is three consecutive 0.5 degree samples at the
midpoint between two mail columns — the 1.19 mm chord dip this file's own header
records.

**And the picture was opened.** `npm run shots -- facecard --helm helm_suttonhoo
--cls warden --turn 180`, production build, 700x860: the nape is mail from the gold
rim to the hauberk collar with no flesh stripe. There is a band of orange-brown
under the rim, and it is NOT skin: sampled at (144,76,40), which is within four
levels of the cloak's own (141,78,30) at the far left of the same frame and nowhere
near either complexion tone (base 0xc99d75 = 201,157,117; shade 0x917050 =
145,112,80). Settled off the mesh rather than off the colour: swept at 1 degree by
1 mm over az 120-240 and y 0-120 mm on all four classes under the Sutton Hoo, there
is NO bearing and NO height at which head skin is outboard of kit. Stated honestly —
a before/after pair was not shot, only the after.

**Section 1 moved the wrong way and is reported, not buried.** The nape guard's hem
now laps the mail it has to lie over: warden 2.9 mm / 1.1%, berserker 1.8 / 0.6,
runekeeper 3.7 / 1.2 at az 189, all three 0.0 before, against a 5.0 mm bar. The
plate's outer face is outside the mail at every station; it is the last 8 mm of its
thickness at the rim. `hullAt` itself was deliberately NOT given the jaw, and that is
measured rather than squeamish: the nape fall rides the hull with 13-15 mm of
authored clearance, so feeding the jaw in moves the plate out by that same 9 mm at
the hem, on top of a `wearmeasure` section 3 that already reads gap 21.7 mm and hem
19.0 against 26 mm bars. That is the flaring flange the owner complained of in the
first place. The 9 mm is measured; the `wearmeasure` reading it would produce is NOT
— that variant was never built or run, and nobody should quote a number for it until
it is.

### The deleted hair coils: the count is right and the loss is not — R10

`docs/OPEN-DEFECTS.md` above says "every 80-triangle hair-coil component that main
builds under the Wyrm-Crest and the Sutton Hoo is absent on the branch ... That is
components disappearing, not pixels being occluded." The count is exactly right.
Counted on both trees with the same component walk, `fa8353a` -> this branch:

```
             wyrm                      suttonhoo
             short long braids         short long braids
  huscarl      5     6     6             4     6     6      -> 0 everywhere
  warden       5     6     6             4     6     6      -> 0 everywhere
  berserker    5     6     6             4     6     6      -> 0 everywhere
  runekeeper   5     6     6             4     6     6      -> 0 everywhere
```

**Then every one of those 96 components on `fa8353a` was asked whether a player could
see it** — each of its 240 vertices given a horizontal ray out of the head's axis,
and counted outboard when the ray meets no kit or meets it inside the vertex:

```
  huscarl    wyrm/suttonhoo, all rungs   worst 0.0% outboard,  0.0 mm
  warden     wyrm   short/long/braids    75.0 / 18.8 / 18.8%,  16.8 / 3.5 / 3.5 mm
             suttonhoo short/long/braids 60.0 / 55.0 / 55.0%,  15.3 / 11.3 / 11.3
  berserker  wyrm                        77.5 / 13.8 / 13.8%,  16.9 / 2.5 / 2.5
             suttonhoo                   60.0 / 55.0 / 55.0%,  15.2 / 11.3 / 11.3
  runekeeper wyrm                        70.0 / 21.3 / 21.3%,  16.6 / 4.2 / 4.2
             suttonhoo                   60.0 / 55.0 / 55.0%,  15.2 / 11.2 / 11.2
```

So on the huscarl — the one class that wears a coif — they were buried inside the
mail from every bearing, and on the other three they were standing 2.5 to 16.9 mm
THROUGH the helmet. Not one of the 96 was both present and correct. **Nothing a
player could see was taken away**, and the pixels the cull removed were the defect.

The restoration was written and measured before being dropped. Lifting the nape
branch's burial constant off coifed heads — where the coif, not the plate, is the
nearest covering surface — brings the huscarl's Sutton Hoo back to 24 coils, all of
them 0 of 240 outboard, at a cost of 26054 triangles against 24134, +1920 for
geometry no bearing can reach. That is a frame-rate bill for nothing, so it is not
in the tree, and this paragraph is here so the next pass does not have to rediscover
it. What the branch owes the shop is `cosmetictest`'s "2 swallowed -> 4 swallowed",
which is about Long Mane and Braided War-locks being OCCLUDED, and that is a
different and still-open finding.

### The beard through the ventail is NOT closed, and both dials are the wrong lever

`beard_full` (40g) under the Sutton Hoo reads 3.66 / 3.72 / 4.77% of the beard's own
surface outboard on the huscarl, warden and runekeeper (the berserker wears it by
default and reads 2.71), 17.5 to 23.2 mm deep, at az 1-2 and y -44 to -47 mm.
Probed directly at az 0 on the warden, the beard stands at r = 134.3 / 136.7 / 127.9
mm at y = -40 / -20 / 0 while the curtain is at 117.6 / 124.3 / 131.0 — a wedge
7 to 17 mm proud of the mail, dead ahead, which is the hard-edged brown wedge round
five's adversary found by hand.

Both authored dials were swept against the repaired section 5, whole `--helm
suttonhoo` table each time, and neither is the lever:

```
  BEARD_PRESS   0.70   0.55   0.45   0.35        (scales the profile's outward offset)
  full          3.66   2.48   2.02   1.81
  forked        2.68   2.20   2.02   2.10
  braided       3.27   3.19   3.16   3.14
  section 5     16/32  11/32  10/32   9/32 red
  deepest       18.3   17.0   16.4   16.0 mm     the depth barely moves

  BEARD lean    1.00   0.60   0.30   0.00        (how far the fall hangs forward)
  full          3.66   2.50   2.23   2.06
  forked        2.68   2.30   2.30   2.53        WORSE below 0.6
  braided       3.27   3.58   3.91   4.25        WORSE at every step
  section 5     16/32  12/32  12/32  11/32 red
```

Halving the press costs a fifth of a 40-to-120-gold cosmetic and still fails; the
lean makes the Ringed Braid worse at every value. So nothing was changed: the tree
still carries `BEARD_PRESS = 0.70` and the beard is the size it was.

**The fix is the hoist this file already named and it was not attempted here.** The
beard's outward reach has to be solved against the curtain's OWN rings rather than
against a constant, and the curtain's rings need `chinPt` — `shell(0, chinV,
maskLift(chinV))` — which lives 2000 lines below the beard. The two lower rings, the
ones the fall actually meets, are pure functions of `R`, `chinPt.z`, `vTop` and
`vBot`; only `chinPt` is behind the mask block. That is the whole of the blocker and
it is one point on one surface.

### The wyrm at 46x60, looked at

`npm run shots -- facecard --helm helm_wyrm --cls warden --turn -90`, production
build, cropped to the head (210,30)-(630,575) and box-resampled to 46x60. It is a
gold ribbon two to three pixels thick running across the crown with one bend near
the middle and a short downturn at the front end. Its ends are the same thickness as
its middle. No head, no jaw, no taper, no animal — the assessment above stands
unchanged and unimproved. Not attempted this round.

### Also seen in the wyrm capture and not chased

At turn -90 the warden's neck between the helm's hem and the mail collar carries a
pale flat ellipse across its base, which is a capped shell top catching the key
light — the same class of defect as the "lit horizontal plate under the chin" the
neck's own stations were re-cut for. It is on an open helm with no throat defence,
so no section of `helmclash` is a case for it.

### What round seven has to do

1. The beard through the ventail. Hoist `chinPt` above the beard and solve the
   beard's outward reach against the curtain's two lower rings. Do not touch
   `BEARD_PRESS`; the sweep above shows what it buys.
2. Section 5's 55 reds, of which the hood is the largest block — `beard=full` under
   the Shadow Hood reads 9.29% on the runekeeper, the worst cell in the table, and
   `BEARD_PRESS` does not fire there at all because the hood is not `style.mask`.
3. Section 2's 32 reds. The nape is off the list; what is left is the ear helix
   `c99d75` at 11.0-11.9% and the brow `1a1310` at 11.6%, deepest 2.8-3.5 mm.
4. Section 4's four hood rows, which round five's adversary believes are false
   positives — open a render of the cowl from behind before tuning anything.
5. Section 1's one red: `huscarl / suttonhoo / hair=braids`, an 80-triangle brass
   braid ring 100% inboard of the coif at 61.5 mm.

## The ruler had no neck in it — instance sixteen, and it took two repairs — 15 Aug 2026

Round seven, on `helm7`. `headPieces` in `tools/helmclash.mjs` did
`pivot.traverse(...)` on `rig:headPivot`. `rig:neck` — 380 triangles of
complexion `c99d75` — is a **sibling** of that pivot, not a child, because
`characters.ts` emits it with `emit("neck", root, ...)` while the head goes to
`emit("head", headPivot, ...)`. The neck hangs off `root` deliberately, so
`insertSpine` carries it with the chest and `severBody` leaves it alone. That is
an animation decision and it has nothing to do with what a player sees.

So for six rounds section 3 measured a head with no neck in it, and the bare band
the owner photographed under the Sutton Hoo **is** that neck. The instrument was
structurally unable to see the defect it was pointed at.

### The scope was only half of it, and the half nobody predicted

Widening the scope moved **not one digit**. `rayHit` returns the NEAREST surface,
and both lists were compared with it. Nested shells hide that: cast outward from
the axis, the first pelt is the skin and the first kit is the helmet over it, so
"kit farther than pelt" does read as covered. It stops being right the moment
there are TWO pelt shells. Ground truth, warden/suttonhoo at az 180, y 50 mm:

```
r =  22.4 mm  PELT  rig:head c99d75     <- rayHit stopped here
r =  86.8 mm  PELT  rig:head 917050
r =  88.3 mm  KIT   rig:head 9aa6ae     <- and here, and said COVERED
r =  92.7 mm  KIT   rig:head d9b45f
r =  96.3 mm  KIT   rig:head 9aa6ae
r =  98.7 mm  KIT   rig:head d9b45f     <- outermost metal
r = 100.4 mm  PELT  rig:neck c99d75     <- what the player actually sees
```

Both repairs are needed; either alone is inert. **Fixed** in `4293c9e` (scope,
by the atlas plane y=0 rather than by parentage) and `8915989` (`rayHitFar`).

### What it reads now, and the check that it is right

```
huscarl    suttonhoo  14.0 deg bare ->   0.0 deg, covered at all 137 heights
warden     suttonhoo 149.5 deg      -> 159.5 deg at y 48, radius 82.0 mm
berserker  suttonhoo 149.5 deg      -> 156.5 deg at y 51, radius 86.8 mm
runekeeper suttonhoo 152.5 deg      -> 162.5 deg at y 45, radius 77.3 mm
```

The huscarl is the check. His coif is the one in the shop that closes all the way
round, and an independently built whole-rig ray probe puts 0 degrees of proud neck
on him and 61-67 on the other three. The repair therefore **deleted a 14.0-degree
false positive** on the huscarl and sharpened three true ones. Both renders were
opened (turn 180, `facecard`): the warden shows a broad band of bare flesh between
the gilt rim and the mail collar; the huscarl's mail runs unbroken from helm to
shoulder. Section 3 goes 32 red -> 25 red.

### A LANDMINE THIS CHANGE CREATED, and it is not fixed

The neck's 380 triangles are now in **section 2's skin denominator**, and section 2
decides whether a helm is a case at all by "65.0%+ of the skin within 45 deg of
dead ahead is covered". That figure fell:

```
huscarl / suttonhoo   face cov  81.5%  ->  66.0%     bar is 65.0%
warden                          81.5%  ->  66.2%
runekeeper                      81.2%  ->  66.3%
berserker                       88.8%  ->  70.1%
```

The margin on the huscarl went from 16.5 points to **1.0 point**. No verdict moved
— section 2 is 32 of 32 red before and after — but one more millimetre of neck, or
any reshape of the throat, drops the Sutton Hoo below its own case bar and section 2
stops measuring the most expensive helmet in the shop **without printing a failure**.
That is precisely "a gate green because the case is absent".

The fix is almost certainly that section 2's face-coverage denominator should be the
head's own skin and not the neck's — the neck is not the face. It is NOT done here
because it is a change to what section 2 measures and needs its own before and after
rather than a ride on a commit about scope. **This is the first thing round eight
should do.**

## Shadow Hood, section 4: settled as a FALSE POSITIVE, and it still stands — 15 Aug 2026

Round six left this open with "open a render of the cowl from behind before tuning
anything". Done, and the verdict is that the red is wrong and every available repair
is worse than the fault.

**The render.** Shadow Hood on the berserker, turn 180 and turn 135, brightened 2.6x
to read a black garment. The 48-triangle `2a2521` flap is continuous cloth emerging
from under the cowl's own edge and draping down the back, with a visible step where
the dome curves away from it and no sky behind it at any bearing. Its nearest
approach to the cowl is 0.0 mm — it is attached at the root. It is the back of a
hood, not a fitting floating off a cap.

**Three repairs, all measured, all rejected.**

1. *Exclude a fitting that never rises to the cap's crown.* No gap to put the bar
   in: genuine combs sit flush at 0.0 mm below their crown and the closest excluded
   piece in the shop sits 0.3 mm below its own. Pushing the bar to the widest gap in
   the distribution (38.6 -> 65.5 mm) makes it a 50 mm tolerance chosen to hit one
   helmet, and it removes every fitting the hood has (75.7, 78.5, 81.3 mm), so all
   four rows stop being cases. Trading four loud false positives for four silent
   rows is the wrong direction.
2. *Station along the fitting's own longest horizontal axis rather than always z.*
   Measured and false: the flap is 100.0 x 124.9 x 118.4 mm, near enough
   equidimensional, and its longest horizontal axis IS z, the same as a crest's.
   Meanwhile genuine fittings (the Boar's 256-triangle piece, the Jarl's Crowned's)
   run in x, so the change moves them and not the hood.
3. *Count only stations over the crown's own footprint.* Drops the Wyrm's worst
   station at az 6 — the defect the owner actually photographed. Not at any price.

So the repair is a redesign of what "sitting on" means when the cap is a drape
rather than a bowl, not a threshold. Until then the four rows are red, known and
named, which beats a green row nobody has looked at.

## `helmclash`'s own calibration numbers describe a tree that was not shipped — 15 Aug 2026

Noticed while working section 4. The note over `CREST_MM` says the Wyrm's serpent
"read 50.0 - 54.2 when this bar was written and reads **23.4 - 24.7** today", and
the table beside it lists the serpent at 23.4 - 24.7. On this tree the battery
prints **50.0, 52.1, 52.3, 54.2** — exactly the "before" figures the same comment
records as historical.

The explanation is in `a8bc004`: the helm ruler landed on `main` but
`src/game/client/characters.ts` was deliberately held at main's version, because the
helm geometry on `helm-land` deletes 7680 triangles of paid hair. The ruler was
calibrated against the geometry that was **correctly** refused. Several recorded
readings in `helmclash.mjs` therefore describe a build nobody can play. They are
comments rather than assertions, so nothing fails because of it, but any number in
that file quoted without re-running it is suspect.


## The nape guard's rim sits AT the neck's own radius, and no aventail can fit under it — 15 Aug 2026

Round seven closed the bare band the owner photographed. What is left is a 11 to 25
degree sliver of nape between the guard's hem and y 62, and it is not a tuning
problem — it is over-constrained. This is the write-up so round eight does not
rediscover it.

### What was closed, and how

`helmclash` section 3, worst bare arc under the Sutton Hoo, whole battery:

```
                BEFORE      AFTER
  warden        159.5 deg    15.5 deg
  berserker     156.5 deg    11.0 deg
  runekeeper    162.5 deg    25.5 deg
  huscarl         0.0 deg     0.0 deg   (untouched — his coif already closes it)
```

The mail ventail was swept over `vHalf = 2.45`, which is 2.45 rad of ELLIPSE
PARAMETER and arrives at azimuth 133, and its rings were multiples of the SKULL's
`R` pushed FORWARD by `chinPt.z`. Measured on the warden at y 30, r in mm from the
head's axis:

```
  azimuth      0     40     70     90    110    140    180
  curtain  135.9  117.1   93.8   80.3   70.0      —      —
  neck      58.6   54.3   57.0   60.7   70.2   85.3  101.4
```

The two cross at azimuth 110. Below `napeHemY` there is no plate either, so from
the hauberk collar to the gold rim — 69 mm — the three classes with no coif wore
NOTHING at the nape. The curtain now sweeps pi with `wrapU` and its rear is solved
against the neck's own profile.

### Why the last 11-25 degrees cannot be closed from the mail side

At the nape, on the warden, r in mm from the axis:

```
   y mm      48      52      56      60      64      72
   neck    100.7   100.1    99.5    98.9    98.3    97.1
   guard      —     98.7    98.7    98.7    98.7    98.7
```

The guard's rim is 0.3 to 1.5 mm INSIDE the neck from its hem up to y 62. Mail has
to be outboard of the neck to cover it and inboard of the plate to be worn under
it, and between 98.7 and 100.1 there is no room for either the 7 mm wall or the
5 mm `LAYER_GAP`. Three arrangements were built and measured:

```
  curtain hung level from vTop     3 WRAP 11.0/11.0/21.5    1 LAYERS 8.1/11.3/8.0 %
  top edge on the guard's hem      3 WRAP 15.5/11.0/25.5    1 LAYERS 7.9/ 8.5/8.1 %
  ditto, rear HALF only            3 WRAP 15.5/11.0/25.5    1 LAYERS 6.3/ 6.2/5.9 %
  ditto, angular density held      3 WRAP 15.5/11.0/25.5    1 LAYERS 7.2/ 6.7/7.0 %   <- shipped
  top edge a LAYER_GAP below it    3 WRAP 202.5/193.5/216.5 (a 5 mm bare RING)
  (tree before this round)         3 WRAP 159.5/156.5/162.5 1 LAYERS 4.6/ 4.3/5.0 %
```

The last two rows are a trade between section 1 and section 5, and it was
settled in favour of the cosmetics. Growing the whole ellipse instead of its
rear half translates the curtain's FLANKS 13 mm rearward and uncovers the jaw,
so the 40-gold beard reads further out through the throat (warden `beard=full`
6.39 -> 6.51%, runekeeper 7.34 -> 7.53); sweeping 2 pi at the column count
authored for 4.90 rad is 28% coarser and does the same by tessellation. Fixing
both puts section 5 back on the parent's readings, several rows better, and
costs section 1 about a point over the rear-half-alone variant. Paid content
reading correctly was taken to be worth more than a point of buried plate on a
section that is red on all 19 kits either way.

Every arrangement that covers the nape puts mail outboard of the guard's rim,
because the rim is where the neck is. The second is in the tree: it is the
physically correct construction (a curtain hangs from the helmet's rim, and that
rim is the mask's lower edge in front and `napeHemY` behind) and it costs section 1
the least. It still costs it about 3 points of buried fraction, which is recorded
here rather than buried in a commit message.

### The plate cannot move either, and the reason is instance SEVENTEEN

The honest repair is to move the guard out so there is room under it. `hullAt`
floors its half-DEPTH at `S.neckHW` — a half-WIDTH used as a half-depth, with no
account of the neck being set back in z — so the plate is solved against a column
78.1 mm deep where the neck's rear skin is at 101.6. Feeding the neck in was built
and measured:

```
  wearmeasure 3        gap mm   flare deg   hem mm     bars 26 / 22 / 26
  as shipped            12.0       18.1      19.0      PASS
  hull fed the neck     34.3       42.8      34.3      FAIL
  ditto, 20 mm fillet   27.6       34.9      27.6      FAIL
```

**But that gate cannot see the neck either.** `helmFitProbe`'s `withNeck`
(`characters.ts:4642`) gives the ruler a neck that is "an infinite vertical
cylinder of the skeleton's own half-width", `rn = S.neckHW` — round, centred on the
axis, 78.1 mm. The real neck is an ellipse whose rear stands at 101.6. So the
27.6 mm of "daylight" it reports between the plate and the flesh is measured to a
phantom cylinder 23.5 mm inside the actual skin, and most of that daylight is
neck. It is the identical arithmetic slip as `hullAt`, from the identical constant,
and the comment over it already admits the direction: "Below the shoulder it
under-reads, which errs toward failing a plate rather than passing one."

That is **instance seventeen of a measurement answering the wrong question**, and
it is the blocker. A gate red because it is measuring the wrong object is no more a
gate than one green because the case is absent.

### The order round eight has to work in

`docs/OPEN-DEFECTS.md` already states it and it applies exactly here: *fix the bar
first, then drive the geometry to the fixed bar — in that order, and not in one
commit.* Round seven deliberately did NOT repair `withNeck`, because the same agent
moving the plate and repairing the instrument that judges the plate is the thing R3
exists to prevent.

1. Give `withNeck` the neck's real section. `NECK_STATIONS` and `neckBackAt` are
   hoisted into the head stack for exactly this and are already read by the
   ventail; `helmFitProbe` builds its own skeleton and can read them the same way.
   Re-run `wearmeasure` and record what the Sutton Hoo's guard reads against a
   ruler that can see what is under it. It may already be failing.
2. Then feed `neckBackAt` into `hullAt` so the guard clears the neck, and drive it
   to whatever the repaired bars say.
3. Then the curtain's top edge can go back up under the plate, the last 11-25
   degrees close, and section 1's buried fraction goes back down with them.

## The shop gate builds one class, and it is the one nobody changed — 15 Aug 2026

**Instance seventeen.** `tools/cosmetictest.mjs:233` is
`const RIG = { cls: "huscarl", seed: 13, ... }`. It builds **one class**. Round seven
touched the warden, the berserker and the runekeeper and did not touch the huscarl, so
its 27 differing cells were all invisible to the gate — and "cosmetictest holds main's
baseline exactly, 2 swallowed, 1.43%" was a **tautology**, not a proof.

Both agents in round seven cited it as their evidence that nothing paid was taken away.
So did the merge message of `a8bc004`. That landing is still sound, because in it
`characters.ts` was byte-identical to main and nothing could differ for any class — but
the corroborating number quoted beside that argument was worth far less than it looked.

What actually settled it was an adversary's own union-find component counter over the
welded index graph, run across **all 360 cells** (4 classes x 10 helms x 9 rungs), both
head-pivot-scoped and whole-rig-scoped, on both trees. Zero paid rungs lost components or
triangles; the only difference anywhere was +84 triangles ADDED on 27 cells. That is the
measurement the shop gate should have been making for its whole life.

FIX: sweep every class, or say in the file that it does not and is therefore not a gate
for anything but the huscarl.

## The ear the owner reported is still on the helmet, and it is live on main

224 triangles of complexion shade (`0x917050`) stand **9.9 mm proud of the Sutton Hoo at
az 114**, and render as an unmistakable human ear floating on the middle of the silver
bowl. It survives at fight distance as an ~8 px blob on a 56 px head. Pre-existing on
main with identical numbers, so round seven did not cause it — but the owner reported
"on the remaining classes (warden etc.) the ears stick out" and this is that, still
there, after an `earSeat` was written to fix it.

## The nape is closer and not closed

Round seven put the neck in the ruler (`rig:neck` is a sibling of `rig:headPivot`, so six
rounds measured a head with no neck in it) and then closed the ventail at the back. The
huscarl went from a 14.0-degree false positive to 0.0 degrees covered at all 137 heights.
The other three went the other way as the instrument sharpened: 149.5 -> 159.5, 149.5 ->
156.5, 152.5 -> 162.5.

After the curtain fix, **15.5 degrees of bare arc remain at az 180 on the warden**, and an
adversary proved it is skin rather than kit by the repaint test: the wedge holds
(156,85,48) under both crimson and sea-blue kits while the mail beside it swings from
(73,79,100) to (17,25,59), and it hue-matches a bare-head ground truth of (188,110,69).

The fixer's own render note said "mail is continuous into the hauberk". The picture does
not show that. A residual disclosed as a number is not the same as a residual that is not
there, and the sentence should have said so.

## The ruler was calibrated against a tree that never shipped

`helmclash`'s note over `CREST_MM` says the Wyrm's serpent "reads 23.4 - 24.7 today".
This tree prints **50.0, 52.1, 52.3, 54.2** — the very figures that comment calls
historical. Cause: the ruler landed on `main` in `a8bc004` while `characters.ts` was
deliberately held back, so its calibration describes geometry that was correctly refused.
That is a direct consequence of splitting the landing, it was the right split, and the
comments needed correcting rather than the decision.

## Round eight: the nape and the ear are closed, and the flare bar is now measuring a lap — 15 Aug 2026

Both of the owner's remaining photographed defects are shut. What is left is one
red column on a repaired ruler, and it is not the metal's fault.

### The order round seven set, followed

1. `helmFitProbe`'s `withNeck` was `rn = S.neckHW` — "an infinite vertical
   cylinder of the skeleton's own half-width", axis-centred and round, on a neck
   that is elliptical, tapered and set back in z by up to 27.5 mm. Repaired in
   its own commit with no geometry in it: `rungcensus` read 640 of 640
   scope-readings identical to `origin/main`.
2. Then `hullAt`, which made the identical slip from the identical constant.
3. Then the ear, the hair and the mail.

`wearmeasure` 3b is the new gate that stops instance eighteen of this shape: it
holds `neckProbe` against the `rig:neck` vertices of a built character at seven
heights on four classes. Forced back to `S.neckHW` it prints 28 FAIL rows at
-18.0 to -24.1 mm; on the repaired ruler it prints -0.0.

### What moved

```
  helmclash 3 WRAP, Sutton Hoo      main   +ruler+hull   +ear   +hair
    huscarl                          0.0        0.0       0.0    0.0
    warden                          15.5 az180 11.0 az101 6.5    0.0
    berserker                       11.0 az101 11.0 az101 6.5    1.0
    runekeeper                      25.5 az180 11.5 az101 6.0    0.0

  helmclash sections, red combinations
    1 LAYERS  19 -> 19     3 WRAP  25 -> 2     5 PELT  108 -> 75
    2 FLESH   32 -> 24     4 CREST 12 -> 12
```

Not one cell is red on this branch that was green on `origin/main`.
`rungcensus`, 4 classes x 10 helms x 8 rungs, twice each: 360 identical, 280
GAINED, **0 LOST, 0 rungs gone**.

### OPEN — `wearmeasure` section 3's FLARE is measuring a plate over a plate

The one bar left red, and the next round's first job. Against the repaired
ruler:

```
  Sutton Hoo nape guard         gap    flare   hem      bars 26 / 22 / 26
    main's own hull            31.0    43.3   29.6
    whole ellipse fed the neck 24.5    49.9   24.5
    rear half only (shipped)   19.1    47.5   19.0   -> 21.7 / 44.7 / 19.0
                                                        after the ear seat
```

**Gap and hem are inside the bars. Flare is 43.3 on main's own geometry the
moment the ruler can see the neck**, so it is not the shape this round shipped.
Where it is, is printed: `u 1.00, v 0.87`, the guard's front-bottom corner. An
independent ray listing at az 65 says what is under that corner —

```
  y 52   70.0 plate  73.9 gilt  78.0 plate  80.0 gilt   <- the CHEEK GUARD
         84.0 plate  87.7 plate                         <- the nape guard on it
```

— the deep guard laps the cheek guard, which laps the face mask. Section 3
measures metal against FLESH, and its own `MASK_ALLOW` note already names this
blind spot for the cheek guard and stops one piece short of the piece that laps
it. The 22 degree bar was calibrated against a phantom cylinder that filled the
submandibular hollow in.

**FOUR REPAIRS WERE BUILT AND MEASURED AND NONE IS SHIPPED**, because moving a
bar or reshaping a plate to satisfy one is not a repair:

```
  guard arc growth 0.44 -> 0.30 / 0.20 / 0.10 / 0.00   flare 43.6 / 33.6 / 30.3 / 28.7
      — bottoms out above the bar and loses the designed forward swing
  hull crossover fillet 4 mm -> 12 / 24 / 40 mm        flare 40.0 / 37.6 / 34.7
      — and drives the plate 11.8 / 25.2 / 39.2 mm INSIDE the flesh

  (worst of warden / berserker / runekeeper on the Sutton Hoo, each read off
   `helmFitProbe` on the hull this round ships)
```

The honest repair is to give section 3 the metal that is between, the way round
seven gave it the neck — and it must not be made by the agent who moved the
plate. **R3.**

### The ear: the fix existed and was not in the tree

`docs/OPEN-DEFECTS.md` said an `earSeat` was written in round five and was still
there. Both halves of that are wrong and the correction is worth keeping.

* `earSeat` is `tools/headmeasure.mjs:333`, an assertion that the ear's own RIM
  is buried in the SKIN. There is no helmet anywhere in it, it cannot see one by
  construction, and it reads -3.000 mm either side of this round.
* The round-five fix is `EAR_PRESS` + `earSeatRaise` (`86eb41a`, `0ca3081`) and
  it was **not in this tree**: it was held back with the rest of `helm-land` at
  `a8bc004` because that branch deletes 7680 triangles of paid hair. Their
  `characters.ts` hunks are landed here on their own.

Section 2 DID see the ear and always named it: `917050`, 224 triangles, 88-94%
outboard at az 113-115. 4.23/4.42/4.09 -> 1.34/1.74/0.60 on
warden/berserker/runekeeper, and the runekeeper is now green.

The frames are not committed — `art/probe-*/` is ignored for the reason the
`.gitignore` note gives — so here is the command that draws them, from a tree
either side of the change:

```
  npm run shots -- facecard --cls warden --helm helm_suttonhoo --turn -90       --out <somewhere>
```

Before: a brown auricle on the outside of the silver bowl, with two coil ends
below it. After: metal. The back view, `--turn 180`, is the nape: before there
is a wedge of skin under the gilt rim, after the mail runs into the hauberk.

### The coils were being deleted, and only a four-class counter could see it

`hairCeil`'s nape branch held a constant 1.95 rad against a plate that reaches
1.52. Hoisting `napeHalf` so the hair reads the plate's own arc closes section
3 — and, on its own, **deleted 4 to 6 components and 320 to 480 triangles from
every warden, berserker and runekeeper rung of the two deep-cheek helms**,
because `if (k < 0.45) continue` culls a coil whose ceiling has gone negative.
That is a paid hairstyle deleted to close a gate, for the fourth time in this
project's history.

`cosmetictest` **could not have seen it**: `tools/cosmetictest.mjs:233` is
`cls: "huscarl"`. `tools/rungcensus.mjs` is the answer — union-find over the
welded index graph, 4 classes x 10 helms x 8 rungs, head-pivot-scoped AND
whole-rig-scoped because `rig:neck` is a sibling. Shown failing first: deleting
the Braided War-locks prints -10 components and -4640 triangles on 33 cells.

The coils are buried now instead of culled, which is the rule `hairCeil`'s own
comment already gives for the shell. It costs 338240 triangles across the
320-cell sweep, about 1057 a head at `lod high`, all inboard of metal.

### Still open, measured, not chased

* `helmclash` 2 at 1.34 / 1.74 / 2.50 against a 1.0% bar. The warden's and the
  berserker's worst patch is now `c99d75` at **az 33, y 153**, 2.9 mm — the eye:
  a ray listing there prints `130.1 eye, 130.2 plate, 131.1 eye`, so the mask's
  inner wall clips the eyeball by about a millimetre. The huscarl's 2.50 is his
  coif's inner throat wall passing inside his own neck at az 249, y 42, 9.7 mm,
  and it is untouched by this round.
* `helmclash` 3's last two red rows are `beard=forked` at az 3, y 10-11 — the
  beard through the ventail, which this file already carries.
* `hoodfall` reports `warden/berserker/runekeeper suttonhoo long == braids`,
  two paid hairstyles building ONE OBJECT identical to the micron. Pre-existing
  on main at 1144 verts; it is 2299 here because the buried coils went into
  both. The defect is that they are the same object, and this round neither
  caused it nor fixed it.

### `playtest`'s browser stage times out on the dev server, on any tree

Recorded because the standing advice for it is wrong about the cause, and the
right route is one command.

`npm run playtest` reaches `MUSTER THE TESTGROUNDS` through a 30-second
`locator.click`, and on this box the Next **dev** server does not compile the
muster screen inside it:

```
  [playtest] starting dev-server on :3818
  [playtest] failed: locator.click: Timeout 30000ms exceeded.
    - waiting for getByText('MUSTER THE TESTGROUNDS').first()
```

It is NOT a symlinked `node_modules`. The tree it failed in has a hard-linked
copy — real directories, real files — and it fails the same way in a clean
worktree of `origin/main` with the repository's own `node_modules`, three runs
apart, warm cache and cold. Everything before the browser passes in every run.

`npm run build` first is the fix, and `playtest` already takes it: `useProd` is
`existsSync(".next/BUILD_ID")`, so with a production build present it starts
`custom-server.mjs` instead and the run goes green —

```
  [playtest] starting custom-server on :3896
  [playtest] in a fight
  [playtest] 37/37 controls working
```

Either raise that 30 s, or say in the tool's header that a build has to exist.

## Round nine: the flange nape, the torn gilt band, and a gate for metal through metal — 15 Aug 2026

Three closed, one moved and left red with its number. Every one of the three was
found by opening a render; not one of them was visible to any gate in the tree
before this round, and two of them are now.

### 1. Hair coils on a bare nape under the FLANGE helms — CLOSED

The warden's DEFAULT getup, Warrior Crop, under the Ridge Helm, the Boar-Crest
and the Jarl's Crowned: six to eight isolated dark curl fragments across bare
nape and upper neck, several plainly detached. `helmclash` 5 PELT reddens pelt
outside KIT and there is no kit at that spot; `rungcensus` scores it as content
GAINED; `wearmeasure` 4 passed 30/30.

The rear of the head as a map, warden / Ridge-Helm, horizontal rays, farthest
surface wins — hair standing on bare skin below the flange's hem:

```
  origin/main    az  95, 100, 105
  round eight  + az 110, 145, 150, 170, 200, 240, 245, 250   <- the defect
  round nine     az  95, and az 100 above y 120              <- fewer than main
```

Two causes and they are independent.

**The clamp was read at the wrong end of the plate's descent.** `napeFrontU` is
`napeHalf(0)`, the narrowest a hanging plate ever is. That is the safe end for a
GUARD, which lies on the hull and whose risk is hair OUTSIDE metal — the Wyrm
and the Sutton Hoo are untouched and 3 WRAP is still 2. It is the wrong end for
a FLANGE, which hangs free and flares forward as it falls. Swept at 1 degree in
the head's own azimuth:

```
  the Ridge-Helm flange's front edge
    y 175..167  az 116-117      y 149..137  az 108-112
    y 165..151  az 112-116      y 135..129  az 106-107   (hem; none below 127)
```

so the eleven degrees the plate covers at its hem were outside the clamp, and a
coil rooted there got no ceiling at all: built full length, falling past the hem,
standing 19 mm off the bare neck at y 116. A flange is now read at three quarters
of its descent — 108.5 deg, inside the 106-112 the plate measures over the
heights the lock courses root at, and 13 deg behind the sideburn course at
az 95-105 the flank window was widened to show. Read at the bottom
(`napeHalf(1)`, 100.9 deg) it swallows that sideburn course from y 152 to y 200.

**The comment being replaced was false and the mesh says so.** It read "1.95 rad
claims 6.6 degrees of cover the flange does not have". The flange has it, below
the top of its own descent. R10.

**A buried coil did not stay buried.** Round eight buries instead of culling —
right, and the census is why — but the sink is computed at the ROOT and the
spine then travels 25 mm DOWN the fall line, which at the nape leaves the skull
and crosses a neck 20-25 mm nearer the axis. The tail comes back out through the
throat, and those are the fragments at az 145-200. A buried coil now stands its
axis up in its own pocket: same rows, same ring, same triangles, same component,
and the bound is arithmetic instead of a hope about where the neck is.

Only where the skin is the only cover (`!coifed`). Inside an aventail the MAIL
covers — the huscarl's rear is unbroken mail az 95-265 at every height y 76-132 —
and standing the coil up there is not free: 5 PELT reads huscarl/boar and
huscarl/crowned on Braided War-locks at **2.02% against a 2.0% bar, up from
1.99%**, two cells turned red to tidy something no bearing can see.

### 2. `helmclash` 6 SEAM — nothing in this tree could see metal through metal

2 FLESH and 3 WRAP judge SKIN outboard of metal. 1 LAYERS judges a plate through
MAIL — one ordered pair out of the hundreds a helmet has, and it is that pair
because it is the pair the owner photographed. 5 PELT judges hair and beard.
`wearmeasure` 3 judges a plate against the SKULL, 4 hair against the stack, 10
what a hole frames. Kit against kit was unmeasured, which is why the next item
shipped green for eight rounds.

**Two false starts are in the source**, because each is a measurement somebody
will otherwise reach for again, and both were run over the whole shop:

```
  "one piece inside another"        the Sutton Hoo's gilt crest rib against its
                                    own bowl at 49.0% / 3.9 mm — a rib sitting
                                    in a shell exactly as drawn
  "a hider closer than LAYER_GAP"   62 of 65 kits red at 5.1 to 27.9%, naming a
                                    68-triangle spangen strip on nine helmets
  the same + the facing test        61 of 65
```

A helmet is layers of metal on metal by design. What is wrong is narrower: along
one strip the SAME PAIR changes its mind about which piece is in front. So, over
A's outward face and only where the two surfaces LIE ALONG each other
(|n.n| > 0.80, so a rib's flank cutting across a shell is not a case — at right
angles two surfaces meet in a line and a line has no area), PROUD and SWALLOWED
are counted and the area-weighted MINORITY is the tear. Then three qualifiers,
each of which is doing real work:

* **the minimum of the two directions.** A lap is clean from at least one side.
  Read from the shell, a rib authored half sunk in it is proud over 29% and
  swallowed over 71%; read from the rib it is nothing.
* **same-tint pairs are skipped.** Two pieces of one metal interpenetrating draw
  the same pixels either way round. What the render shows is a seam BETWEEN
  metals.
* **plate, not kit.** Section 1 owns plate-through-mail with a bar off the
  build's own `LAYER_GAP`.

Bars 800 mm2 of torn face AND 1.0 mm deep, both, and the sorted sweep is printed
under the table every run — a bar defended only by a paragraph is a bar nobody
re-checks. It has a 500 mm2 hole in it: the body stops at 597.9 and the next
reading is 1114.7.

### 3. The Sutton Hoo's gilt edging was set off the curve, not off the plate — CLOSED on three of four cells

```
  helmclash 6 SEAM, suttonhoo     torn mm2      of overlap   depth mm
    huscarl                       1114.7 -> 1114.7   30.3 -> 30.3   5.8
    warden                        4263.3 ->  904.5   15.2 ->  3.2   4.2
    berserker                     5841.9 ->  356.6   19.0 ->  1.2   3.8   green
    runekeeper                    2566.9 ->  555.7   10.1 ->  2.2   3.9   green
```

The guard is FIVE rows over its whole descent and that is deliberate — its own
note says "this is the one shell on the helmet whose row count is carrying
geometry rather than smoothness". Five rows across an S means each row is a
CHORD, and over the bottom span the chord stands as much as 4 mm outside the
curve it was sampled from. The lip was solved on the CURVE and offset 2.5 mm from
that, so wherever the bulge beats the standoff the plate is in front of its own
gilt: silver eating gold, with a boundary that is the mesh grid and not an edge
anybody drew. The lip is now solved bilinearly on the plate's own emitted quad,
so the standoff is 2.5 mm from the DRAWN surface by construction.

Raising the guard's own rows 5 -> 20 closes it too — 4263.3 to 275.9 on the
warden — and is NOT shipped: it moves the plate, and `wearmeasure` 3 reads the
consequence as flare 44.7 -> 55.8 on the Sutton Hoo, 50.0 -> 56.3 on the Wyrm,
and a new red cell on the Jarl's Crowned at 25.8 against a 22 bar.

### OPEN — two seams above the bar, with their numbers

* **warden / suttonhoo 904.5 mm2 against an 800 bar, 3.2% of the overlap.** A
  fifth of what it was, all of it at the guard's own hem row. A finer lip
  (nu x2, nv 2) was tried and is not shipped: warden 904.5 -> 275.9 but
  berserker 356.6 -> 1012.2. It moves the readings around rather than down.
* **huscarl / suttonhoo 1114.7 mm2, 30.3%, 5.8 mm, at az 180, y 205.7.** A
  DIFFERENT pair — `d9b45f (276 tri) proud of 9aa6ae (308 tri)`, a gilt crest rib
  coming down the back of the bowl onto the nape guard's top edge. It reads the
  same before and after the lip mend, which is how it is known to be another
  fault and not that one. Untouched.
* **thirteen more kits are red in 6 SEAM.** The section is new and this tree has
  never measured what it measures, so every one is a finding rather than a
  regression. The largest are `6e767f` against `bfa25c` on the Jarl's Crowned
  (1888-2659 mm2) and `8a7050` against `6e767f` on the berserker's Nasal Helm
  (1699 mm2).

### OPEN — `wearmeasure` 3 FLARE is still red, and 4.6 degrees of it was the ruler

The lap round eight named IS a real error in the ruler and it is now out:
`helmFitProbe` carries the other shells of the same helmet as a MASK on the ring
pieces, and a sample with another shell under it is not a metal-against-flesh
reading. The share dropped is a printed column, `on kit%`, 4.0 to 19.4 on the
five helms that have a lap and 0.0 on the rest.

```
  suttonhoo  44.7 -> 40.1        wyrm  50.0 -> 49.8        nothing else moves
```

**A mask and not a hull.** Folding those shells into the hull was built first:
suttonhoo 44.7 -> 52.7, wyrm 50.0 -> 53.1, and THREE NEW RED HELMS, ridge
8.9 -> 30.3, boar 11.5 -> 30.3, crowned 11.5 -> 27.8. Flare is a derivative and a
hull with a step in it cannot be differentiated.

**A censored baseline is no longer differenced.** `skinGap` returns its own `cap`
when the ray never finds flesh; that is a verdict for GAP, which is a level, and
not for a derivative. `censored%` is the new column, 0.0 everywhere on this tree,
so it moves no number here — but the huscarl already reads gap 75.0 and hem 75.0
on his nape guard, the cap exactly, and the next hand to widen a plate would have
got an angle about the search limit.

**What is left, and why this round does not close it.** Both plates are red at
the same place on all four classes: `u 0.83..1.00, v 0.80..0.93`, the guard's
front-bottom CORNER at about az 80, at the hem. Under that corner is the
submandibular hollow, and `withNeck`'s own note already calls the ceiling that
stops the neck reaching up into the jaw "the one thing about this table that is
still an approximation". Round eight's sentence was "the 22 degree bar was
calibrated against a phantom cylinder that filled the submandibular hollow in",
and that is the same place. The next repair is either that hollow or the bar, and
neither can be made honestly from here: filling the hollow is what the phantom
cylinder did wrong, and moving the bar is buying a pass.

### The three locked facts, re-measured on this branch

```
  helmclash 3 WRAP, Sutton Hoo    huscarl 0.0   warden 0.0   berserker 1.0
                                  runekeeper 0.0 — section 3 red on 2 of 288,
                                  both `beard=forked` at az 3, unchanged
  the ear row `917050 (224 tri) 91.7% 9.9 mm az 114`   0 occurrences
  rungcensus vs origin/main       360 identical, 280 gained, 0 LOST, 0 rungs gone
```

## Correction: the blob table measures two commits, not one — 19 Aug 2026

`4019ead`'s message says "Baseline is this branch's own merge commit `14bc361` … so the
comparison is the change alone", and lists `LEGIBLE_AT_ONCE = 6` among the things that
"went with it". **Both sentences are wrong, and `git` says so:**

```
git show 14bc361:src/game/client/render/hud3d.ts | grep -c LEGIBLE_AT_ONCE   ->  0
git show 3bca635:src/game/client/render/hud3d.ts | grep -c LEGIBLE_AT_ONCE   ->  3
git diff --stat 14bc361 3bca635 -- hud3d.ts                                  ->  60 ++ / 28 --
```

The constant and the rewritten spawn/retire path around it landed one commit EARLIER, in
`3bca635`, whose own message is about merging main and repairing rulers and never mentions
it. So:

* the pooled `28.21% -> 10.64%` TOUCHING table measures **`3bca635` AND `4019ead` together**,
  not the half-push fix alone;
* the `worst numbers at once 9/16/12/9 -> 6/6/6/6` column is **entirely the earlier commit's
  cap** and none of it belongs to the half-push fix;
* the 3-run pair offered to decompose the two (12.44/3.91/3.67 against 4.50/12.00/3.17) has
  completely overlapping ranges and settles nothing either way.

**What is NOT affected, and an adversary checked the thing that would have mattered most:**
the win is not bought by drawing fewer numbers. Over a paired run the two trees carry the
same population — main mean 2.58 numbers at once, p50 2, p95 6, worst 8; branch mean 2.63,
p50 2, p95 6, worst 6. The branch carries slightly MORE numbers on average and still reads
10.32% ink-touching against 29.77%. An 8-to-6 ceiling cannot produce a threefold drop; the
layout arithmetic is doing the work, and the half-push fix is real regardless of which
commit the cap arrived in.

**The process fault worth keeping:** a player-visible cut of damage numbers on screen from
48 to 6 at `high` landed inside a commit whose title is about rulers. A change a player can
see belongs in a commit that says so, whatever else is in the same push.

---

## `summaryflow`'s war-band veto check is a coin flip — 20 Aug 2026

`tools/summaryflow.mjs:395 vetoCheck()` asserts *"a man lying dead does not
perform"* and is called unconditionally at the end of `teamPhase`. It can only be
judged when the stage left the LOCAL man dead. `teamPhase` fights a real 2v2 that
nothing drives into the fire, so which band wins is the fight's business:

* local man DEAD  — the row is not offered, `notOffered` is true, PASS.
* local man STANDING — the row is correctly offered, the press is correctly
  honoured, `refusals 0->0`, and the check FAILS on a build that is behaving.

Observed on `mercyweight5`, run 2 of 2 in this window:
`FAIL war band: a man lying dead does not perform — pressed, refusals 0->0;
corpsesPerforming=0`, with the NOTE two lines above it reading *"after the
rollback the row is OFFERED to a man the stage left standing"*. Run 1 of 2 passed
it with the man left dead.

This is the failure mode the same file already names in another place — *"it made
summaryflow's war band check fail about half the time … the answer depended on
which side the local man happened to be on"* — surviving in the one check that
still assumes it. `corpsesPerforming === 0` is judgeable either way; the
offered/refused half is not.

**Not changed here.** The rule is never to touch a harness in the round that a
branch needs it green, and this one failed on this branch in exactly the run that
would have benefited. It is recorded so the next round can make the unjudgeable
half a named skip — this file's own doctrine, "a skip is not a pass, so it is
named, counted, and printed beside the score" — rather than a false red.

---

## `summaryflow` is flaky on a contended software rasteriser, on BOTH trees — 20 Aug 2026

Round eleven's brief carried "**GREEN 14/14 on `origin/main`, run twice, alone, on
the same box**". Three runs of `origin/main` (`2011c28`) in a fresh build in this
window read:

```
  run 1   12/14 passed, 3 NOT RUN   exit 1
  run 2   12/14 passed, 3 NOT RUN   exit 1
  run 3   15/15 passed, 2 NOT RUN   exit 0
```

Runs 1 and 2 failed on the same two lines and for the same reason — the first
summary frame jams the main thread, so the FIGHT AGAIN press landed at
**19316 ms** and **15531 ms** with `state=lobby`, outside the server's ten-second
window. That is the 8-25 s stall `summaryflow`'s own header documents. The result
count is not fixed either: 14, 14, then 15, because the war-band flourish check is
sometimes judgeable and sometimes a skip.

The box was carrying `load average 10.13` on four cores with other agents' browsers
on it. **The number "14/14" is not a property of `main`; it is a property of a
quiet box.** Anything compared against it has to be run beside it, in the same
window, which is what the R2 evidence on `mercyweight5` does.

---

## The back of the man — three owner reports closed, and what ten rounds of the mane cost — 26 Aug 2026

The owner, in two messages: *"long hair on huscarl still sticks out the back of
the chain mail and looks ugly, the back has those weird squares under the cape
and when theres no cape just the squares or rectangle aspects on the back"* —
and, mid-review: *"the 2nd last helmet option has a floating top piece."*
All three closed on `main` (`dc56f9d` → `5280f5e`), with the evidence run in
`art/backreview/` (untracked; regenerate with the commands in
`docs/ARMOURY-REVIEW-PLAN.md`).

**The squares were the baldric.** Seven boxes yawed to their own bit of the
barrel and rolled by one constant — a diagonal of loose rectangles on the
hauberk. It is one swept ribbon now, and two instrument findings came with it:

* the strap's garment contest selected by half-WIDTH, and the mantle
  out-measures the hauberk in x while sitting inside it in z — a strap bedded
  on the wrong one dove under the mail for sixty pixels of its run. The
  contest is at the strap's OWN azimuth now. The same contest must skip the
  cloak's collar-roll registry ring (`85faf95`) — a strap bedded on THAT ring
  is a strap worn over the cloak.
* `bodyFitProbe` merges an assembly's rows by tag — standoff is the CLOSEST
  approach of ANY piece — so one touching box passed a whole floating chain
  for as long as the chain existed. The ribbon reports per station against the
  garment that station beds on, through `fitTell`.

**The hair was ten rounds, and the ledger keeps the shape of them.**
`helmed` → `hair11c` in `art/backreview/` are the failures; `hair12` is the
fix. What each round taught, compressed:

1. `wearsweep`'s hair rows build with `helm: "none"` — **the helmed mane was
   absent from every green gate**. The tufts the owner photographed sat behind
   54/54 for months. A gate green because the case is absent is not a gate.
2. The fall arrived at the aventail's ring radius, and every typed constant
   that tried to push it out produced a different eel: buried where the
   constant lost to the mantle's curve, 104 mm proud where it won, wedge-
   sliced wherever it sat within z-precision of a drawn wall. The station
   tables are an APPROXIMATION of the drawn garments; hair placed off them by
   small clearances interleaves with the real mesh.
3. The ride's `clear` was chosen by ROUTE (`coifed ?`) while its table is
   chosen by HELM (`helmed &&`) — mirrored definitions, drifting exactly where
   both apply, delivering the mane inside the hauberk's 16 mm drawn wall.
4. **The hood's settled route is the reference for every bagged fall**: its
   curtain hangs at the BAG's radius, clear of everything it drapes over, and
   releases at one hard hem with the step's shelf facing down under the bag's
   own edge. The coifed gather now does the same — released at the coif's hem
   into a 45–70 mm band above the station table, no parting trough (hair out
   of a mail bag is one gathered mass), cloak-capped at the cloth's lining.
5. `cosmetictest` §3 measures paid-hair visibility at the PORTRAIT lens, and
   it is the wire that catches every route change here: the first clean-but-
   short construction fell to 0.74–0.85% against the 1% bar — **the ugly
   tufts had been the green**. The shipped route holds main's own numbers
   (Long Mane 1.51/1.41, War-locks 1.23) with an honest curtain.
6. `helmclash` against a fresh `origin/main` baseline worktree: PELT 77 → 74,
   the other five sections byte-identical. Main ships this ruler red; the
   comparison is against the baseline, never against zero.

**The floating top piece was the Wyrm-Crest's tail.** `t * 0.92 + 0.04` never
reaches zero, so the "anchor" hovered 23 mm off the cap and the whole animal
read as levitating. The rise dies at exactly t = 0 now and the first sixth of
the body crawls on the iron. The head keeps its throw — that end's whole
design.

**Also closed in the same sweep:** the scabbard's throat was inside the byrnie
skirt's depth (a dark teardrop floating below the hem, attached to nothing —
`c1612af`); both sleeve cuffs ended in raw cut edges, so the linen band read
as a plaster strip (`5280f5e`).

**Open nits, named and small**, all reproduced in `art/backreview/`: a mail
wedge at the mane's root where the release quads cross the bell hem (kitcard
zoom only); the bell/collar seam nick on the coif's midline (present on a
SHAVED control — garment geometry, not hair); the bracer's pale upper cuff
band (deliberate pushed-up-sleeve design that reads flat — owner-level taste);
the warden's bare nape column reading waxwork above the byrnie collar.

---

## Three callouts, two instruments, and four stale rows — 26 Aug 2026, second wave

The owner: *"Original map feels a lot more laggy while playing than the other
maps"*; *"Other maps don't seem to have the same sort of kill cam features
etc."*; *"Assuming weapons finish is on list to improve too."* All three
closed on `main` (`37c798a`, `0b47499`), and the first two were ONE defect.

**The lag and the missing features were the same zero.** A GL-boundary census
(draw calls and triangles counted at the context, identical viewport) read the
village at 1267 calls / 2.47 M tris against 875–942 / 1.6–1.8 M on the other
three grounds — the triangles are the village being richer, but the SHADER
outlier was the lights: village hero fire + five torches against ZERO
pointLights on every other ground. And `GameCanvas` gates the fire's crackle
bed, the sky haze, the lighting rig's hearth pool AND the mood ramp on the
longest-reach light in `world.pointLights` — so on three grounds the fight
happened by a fire that lit nothing, made no sound and never answered the
fight. One hero light per ground plus the village's ring at three
(quality.ts `dynamicLights`, read only by the torches) closes both reports.

**The weapon cards sold one picture four times.** `specForOption` had no
weapon case, `thumbKey` carried no weapon field, and the thumb path never
mounts a weapon — so the Weapon Finish tab showed four identical unarmed
mannequins (`art/ui/armourycard-desktop.png`). A new "item" lens photographs
the weapon alone — diagonal, quarter-turned to the key, lifted to the rig's
bust line, its own exposure bracket — and the Pattern-Welded rung now rides
`weldsteel` (buildSteel at weld 3: the watering is the product) while
Gold-Wired's grip wears the rope substance's twist as its wire.

**Four backlog rows were stale a fortnight** (R8): 2.1–2.4 all read
NEW/unbuilt while `weightprobe` runs 24/24 and `soundtest` 46/46 today —
weight, shove/knockdown/get-up, parry/riposte and the combat sound family all
shipped 12 Aug per `docs/WEIGHT.md` part two, and the camera shoulder,
handedness mirror and spawn-heading adoption are built as well. Corrected in
`docs/BACKLOG.md` with today's fresh numbers.

**Genuinely open after this sweep, ranked:** 5.2 (mobile visual gap), 4.7b
(party queueing 2–4), 5.5 (profile symbols), 4.8 (campaign), 4.9 (other
modes), 5.8 (Steam prep), plus the standing nape-guard flare (round ten:
instrument the skinGap march) and the plan-doc polish nits.

---

## The owner's five asks, one sitting — 26 Aug 2026, third wave

Delivered on `main` (`1fea0f9` → `24092a5`), with the container having rolled
back to the same stale snapshot a third time mid-window (reset to
`origin/main`, nothing lost — push-after-every-commit is why).

**The campaign is closed by the owner's own ruling and THE FIRST MOOT stands
in its place** — first act built and gated: `firstmoot.mjs` (five beats,
demonstration-retired, sim-read), `moottest` 25/25 headless, the landing door,
the beat line and skip on the glass, the oath door at `/factions?oath=first`.
Two instrument catches worth keeping: the spawn's own repositioning credited
MOVE unearned (travel now counts only moving-state ground — a teleport is not
a step), and the skip button's first cut crossed the w*0.45 split exactly as
END had — touchtest caught both before a person did.

**The powers read** (`ABILITY_LORE` beside the client sheet, printed at all
three class surfaces), **the Z Fold's rough hit boxes were the END button
centring on width instead of pointer** (`pointer-fine:`; touchtest learned
`--w/--h` and the matrix reads 32/32 at 390×844, 841×757, 820×1180, layout-
clean at 374×873), and **the maps question is answered in the plan doc** (4
live by people; the 5.7b archetype table maps all sixteen).

**Open next, in order:** the First Moot's cinematic dressing (per-kingdom
presentation with liveried mannequins at the oath, a music sting, the four
grounds named as you choose); mobile visual gap (5.2); party queueing (4.7b);
desktop-width layout matrix; the standing nape-guard flare round ten.

---

## Round ten: the nape-guard flare closes, and it was the ruler's question all along — 26 Aug 2026

Nine rounds moved radial tables under the flare bar and the wyrm's 40.5° never
moved a tenth. Round ten followed its own prescription — instrument the march
before touching any surface — and four numbers ended the argument: the peak
pair sits at el −60° beside the jaw, the ring's wall normal (the direction
both gaps are measured along) is DEAD HORIZONTAL, and neither end is censored.
A horizontal ray against a plate tilted 60° over-reads by 1/cos(60°), and the
far crossing drifts 8.2° of angular travel sliding round the submandibular
hollow — the derivative was reporting ray-grazing on a receding surface.

Two repairs, both to the RULER, bar unchanged at 22°:

1. **Flare is run-vs-run now** — the angle between the plate's 40 mm baseline
   and the flesh run between the two crossings the march already finds, which
   is the section header's own sentence ("the angle a plate holds over a RUN
   of it") made literal. The first cut of this read 43.0° at the same corner —
   two formulations agreeing was the proof the LOCATION was the problem.
2. **A pair whose march grazes off the form is censored** (3° of 3D crossing
   drift), counted, and printed in the table's censored%% column — 21.3%% of
   the wyrm guard's pairs, 22.6%% of the Sutton Hoo's, which is the honest
   size of the hollow. Flesh found by sliding round the silhouette is not
   flesh UNDER the plate; the plate hanging past the jaw is the same licensed
   air the standoff doctrine grants a brow band. GAP, HEM and PUNCH still
   read the hollow — levels are its honest answer — and both stay green
   (23.4/21.7 vs 26).

wyrm 20.0°, suttonhoo 19.2°, §2 **8/8 PASS** — and with it `wearmeasure` is
green in every section and `cosmetictest` prints its first **16/16**. The
march instrument stays on the row for the next reader (R4: a ruler, asserted
by nothing).

---

## The wyrm comes down onto the iron — the owner's second verdict, 26 Aug 2026

The first fix anchored the tail and the owner's screenshot answered it: *"the
wyrm helmet is a really poor design & the top piece is STILL floating above
the helmet."* Reproduced at his own bearing (warden, rear-left quarter): the
spine rode `max(capY, yTop − 0.030)` — a horizontal FLOOR holding the rear
leg level while the bowl's slope fell away beneath it — and a 3–13 mm tube
carrying 46 mm of deliberate arch reads as bent wire from every rear quarter
whatever its ends do. The arch was the DESIGN, and the owner has rejected it
twice; his verdict is the measurement.

The redesign is the Sutton Hoo grammar: the beast LIES ALONG THE IRON. The
spine rides `capY` directly, belly at the body's own 0.86 (kissing, nothing
swallowed), side-winding ±15 mm with a lateral term paying the dome's flank
fall-off (`capY` is a midline table — the first coil sank 2 mm per 20 mm of
wander), two ≤6 mm humps as the coil's rhythm, body fattened to 30 mm. ONE
licensed lift: the head rises 30 mm over the last quarter and the run stops
on the HIGH front quarter — the first cut ran the head down the brow's steep
fall, where `capY` drops faster than any honest lift climbs, and the head
parked against the band while a bare crown hump played the head from three
bearings. Jaw, horns and eyes are seated along the head's own direction
(`hDir`/`hDown` off the spine's difference), not fixed-axis offsets tuned to
the dead pose. Shop line now sells what is built: "A wyrm coiled along the
crown, head raised over the brow."

Two full `helmclash` runs bracketed the work, compared section by section:
the first coil REGRESSED SEAM 13 → 21 (~900 mm² of belly part-proud-part-
swallowed on every class, depth to 18 mm) and the kiss-depth pass paid it
back — final counts LAYERS 19 / FLESH 24 / WRAP 6 / **CREST 16 → 8** /
PELT 74 / **SEAM 13** — no section worse than baseline, one halved. The
boar's smaller soldered belly passes SEAM by geometry; the wyrm now does the
same, rather than asking the ruler for a licence. wearmeasure green in every
section; cosmetictest 16/16 with the ladder distinct on both sides and the
paid hair holding 1.53 under the coil. Evidence: `art/wyrm2/`.

---

## FOUND AND FIXED UNDER 5.5 (26 Aug 2026): the paid weapon finish never persisted

**The defect.** The weapon finish (backlog 3.3) has been a full catalogue
slot since it shipped — priced by `priceBasket`, recorded in
`unlockedCosmetics` — but `SLOT_FIELD` in `src/db/catalogue.ts` never grew a
`weapon` row. Consequence, on any server-linked profile: `equipIds` skipped
the finish at purchase and `sanitizeAppearance` dropped it on BOTH the write
and the read (`view()` sanitizes outbound too), so a player paid 90–160
gold, watched the blade change, and had it revert to Issued Steel the next
time the server's copy overwrote localStorage. The gold left; the look did
not stay. Nothing red anywhere — the classic silent-clamp shape: the client
kept its own copy just long enough to hide the loss.

**How it surfaced.** Backlog 5.5 put `mark` on the same rail and traced what
actually survives `sanitizeAppearance` before trusting it — the weapon fell
out of the trace. A gate green because the case is absent is not a gate:
nothing measured "does the thing the player bought come back from the row?"

**The fix.** `weapon` is a persisted slot in `SLOT_FIELD` (validated against
catalogue + ownership like every slot), and the mark travels beside it,
narrowed by `earnedMark` against the row's OWN record (`factsOf`: level,
wins, matches, the real `allegiance` column — stricter than the client's
livery-based answer, which is the right way round for the copy that follows
the four words). All four `sanitizeAppearance` call sites carry facts; the
legacy claim grades the mark against the record being written, not the empty
row it is written over. `tools/marktest.mjs` holds the wiring (25/25).

---

## FOUND AND FIXED UNDER 5.5 (26 Aug 2026): every local-mode boot wiped the save

**The defect, measured.** Seed `bretwalda_profile` with gold 140 / level 6 /
wins 6, load the landing once with no server link, read the key back: gold 0,
level 1, wins 0. The save is not corrupted — it is REPLACED WITH DEFAULTS,
every boot.

**The mechanism is a fix's shadow.** The react-doctor pass rightly moved
`localStorage.setItem` out of the `setProfile` updater (updaters must be
pure) into `useEffect(..., [profile])`. What the move bought that the
updater never had is a MOUNT FIRING: effects run in declaration order, the
mirror is declared above the boot reader, so the first commit wrote
`DEFAULT_PROFILE` over the disk and the reader then read the blank it had
just been handed. Server mode masked it completely — `adoptServer` restores
the totals from the roll a moment later and the mirror re-writes them — so
every signed-in device looked healthy while the mirror's entire reason for
existing ("the day the free-tier database lapses the game degrades to
device-local gold") was the one case it destroyed.

**The fix.** A `diskReadRef` gate: the mirror refuses to write until the
boot reader has read the disk (or found it empty/corrupt — the flag flips
outside the parse guard so a bad save cannot mute persistence forever).
Measured after: the same seed survives the boot intact, and the 5.5 capture
run — which is what tripped over this — now photographs a hydrated Saga.

**Under the same stone:** the boot reader took a stored `unlocked` list
verbatim, so a save from before a free armoury id existed showed
"−13 unlocks earned" on the Saga (current free set subtracted from an older
roll). The free kit is unioned in on read now.

---

## THE 8.1 SWEEP (26 Aug 2026): verdicts and the one taste item left open

The instrument: 4 classes x 2 kits (issued and the crowned-gold regal the
owner photographs) x 8 bearings, photographed at the armoury stage. This is
the ruler the clasp defect proved necessary — wearmeasure's fitting section
measures distance to a garment and cannot see that the garment's CLOTH is
not where the fitting is.

CLEARED: no floating fitting on any class at any bearing after the clasp
reseat. CONVICTED AND FIXED: the shield's rim crescents (chord-topped planks
over dark hide backing read as stepped holes; a timber annulus now reads as
the bare-wood border real boards show) and the Gilded cloak's dead rear
(fold amplitude decayed v-squared; v^1.4 gathers while there is cape left).

LEFT OPEN, TASTE: the Gilded cloak's rear 180 is still a broad calm field
in the armoury's even light — physically deeper folds now, but the premium
read may want DESIGN rather than amplitude: a centre-back seam, a glimpse
of contrasting lining at the train, a tablet-woven hem band. That is a
deliberate design pass with the owner's eye, not a number to chase against
a flat light rig.

---

## THE CAPTURE HARNESS'S BAD DAY (27 Aug 2026): three instruments, one ordering law

The war-paint pairs in cosmetictest went flat after the react-doctor pass
and stayed flat through two plausible-but-wrong fixes. The record, kept
because each wrong turn is a lesson with a name:

1. WRONG: "the box is contended" — a hand probe on a quiet box showed paint
   moving, but the probe was photographing the WRONG SCENE (see 3) and its
   deltas were fire flicker. A probe that does not look at its own pictures
   is not a probe.
2. WRONG: "the renderer demoted itself" — the measured-tier demotion is
   real and the `quality=high` pin on every capture URL is right and KEPT,
   but it was not this bug.
3. RIGHT, found by making the harness keep its own capture PNGs: every
   facecard since the doctor refactor photographed the DUEL SCENE at
   distance. `__photoCam`/`__photoFraming` are read by GameCanvas's MOUNT
   effect; a child's effects run before its parent's; and the old
   state-mirror-in-effect — the exact shape react-doctor flags — was
   secretly the ordering that kept the canvas unmounted until the globals
   existed. The doctor pass traded load-bearing ordering for a race; the
   first fix made the race deterministic-wrong.

THE LAW, now written above the code: the framing globals and the params
resolve together in the lazy initializer — once, client-side, during the
parent's first render, strictly before any child exists. And the harness
keeps every capture on disk, because the day was lost to arguing with
numbers instead of looking at pictures.

Verified after: cosmetictest PASS with war paint at 12.4/18.8/18.7% of
subject — the morning's healthy magnitudes.

## /shot hydrates with React #418 on the production build (LOW)

Seen 27 Aug 2026 while chasing a factionread "hang" that turned out to be
two healthy hour-long runs killed for having block-buffered stdout. The
probe that proved /shot healthy also logged, on every production load:
`Minified React error #418` (hydration text mismatch, `args[]=HTML`). The
page still forges and stages correctly — `__shotReady` lands, captures are
right — so every capture harness is unaffected. But a hydration mismatch
means the server HTML and the client's first render disagree somewhere on
/shot, and one of the harness globals is the likely reader. Chase it with
a dev build (unminified error names the node); fix belongs with the
/shot lazy-initializer family in `docs/OPEN-DEFECTS.md`'s capture-harness
entry.

Also learned, and worth its line: a long browser suite piped through
`tail` shows NOTHING until exit — node block-buffers to pipes — and two
healthy factionread runs were killed as "hung" on that evidence. Line
16 of this ledger's law applies to instruments too: look at what the
process is DOING (CPU accumulating, artifact mtimes), not at a silent
pipe. `stdbuf -oL` is the tool.

---

## THE ROSE SETTLEMENT'S FIRST TWO CUTS — the release completes, on both axes — 27 Aug 2026

`roseFade`'s release was asymptotic: a pale hide on the red arc always kept
a madder remnant (a few points of chroma at high L*), and the vat's
DARKENING (`bias` through the bands) never saw `keep` at all — a "released"
surface came back its own hue at somebody else's value. Both are the rose
corridor's own definition, and both are closed: the fade is a smoothstep
reaching ZERO at `ROSE_LIT + ROSE_FULL` (0.12), gentler near the floor
than the exponential was (the leg wraps keep MORE honest madder), and the
release now blends the VALUE back to the surface's own by the same `keep`.
Off-arc surfaces stay byte-identical by construction (`keep` 1).

**vatprobe, before → after (sworn − unsworn rose points):**
buff@0° +29.83 → +2.33, buff@90° +2.94 → 0.00, buff@180° → −0.19;
hide 0.00 across; wraps NEGATIVE (deep madder holding).

**The full clocked walk (6059 s): every family improved, no family solved:**
- 7.1: 29 → 24 frames, worst +8.878 (norse buff family) → **+3.590**
  (pict/Blackened@0° — a NEW leader, a different mechanism)
- 7.1b: 163 → 155, worst +24.90 (norse buff) → +19.50 (pict WRAP)
- 7.1c: 154 → 140, worst unchanged: +30.1 L* pict/Sea Queen's TUNIC
- 1.2 ΔC 6.12 → 6.94 toward the 10 bar; 1.3 −34.87° → −26.42°;
  5.1b 37 → 36; 5.2b 18 → 17
- 6.1 CLIP: a NEW singleton — 1 of 120 frames at 7.66% vs the 3.75% bar
  (norse/Polished@160°). Seen ONCE, unreplicated; §6's 160° bearing is the
  noisy one. The law: it rides the next walk before anybody believes it.

**What remains is named and is DESIGN, not curve mechanics:** the new 7.x
leaders are the PICT's deliberate two-value lightening (the "MINT WAS
VALUE" identity — its dye lifts dark warm tunics/wraps, and where the
source sits on the arc that lift reads as rose/value-on-arc), and the
sub-release-lightness wrap remnants. The pict item is the same class of
decision as 1.2/1.3's "three owner-level levers" (already ledgered): which
identities the peoples keep versus which bars they clear is the owner's
palette conversation, not a constant to nudge in the dark. The Danelaw
mechanism — the one the owner actually reported ("pink Viking") — is dead:
his buff family reads at or under its unsworn floor on every bearing.

Iteration cost, measured twice: the full walk is ~101 min on this box.
`stdbuf -oL` or it is silent (see the silent-pipe entry).

---

## THE SECOND PLAY REPORT — six items, five closed on their own portraits — 28 Aug 2026

The owner played and reported. Each item was photographed AS REPORTED
before a constant moved, and re-photographed after (all in .armshot/):

1. **Tournament pacing + bracket design** — TOURNEY_BREAK 12 s on the
   round clocks, the verdict-only beat skipped, the wire PROMISES ten
   readable seconds (tourneytest claim), and the bracket card is a real
   staged tree: a column per stage, crowns, struck losers, NEXT burning
   amber, "to come" never miscalled "bye". tourneyseen photographs it.
2. **The Burh's sustain** — the respite mends: living defenders take back
   40% of their bar and a full stamina draw at every held wave; the
   fallen keep their 62% rise. burhtest 20/20.
3. **Mane × Shadow Hood** — `hoodSquash`, the coif squash's counterpart
   on cloth, BOTH spans (the first cut clamped only the cowl and the
   re-photograph showed the same proud slab — the bulk lay over the
   MANTLE, in the span the early bail skipped). The rear portrait now
   shows a gathered tail inside the hood's own line.
4. **Cape through the arm** — the wings REST ON the arms: outward hold at
   stillness instead of the gather, inward travel hard-bounded on target
   and spring alike. 90° and 135° portraits clear.
5. **Ringed Braid** — was a full-width curtain wearing a braid's profile,
   its ring swells invisible ridges on a slab. Narrowed to the rope the
   header promised (mass dies by 0.34 rad), more forward carry; the
   portrait shows a segmented rope resting ON the chest.

Gated: wearmeasure PASS (standing deferrals unchanged), cosmetictest
PASS, playtest 38/38, touchtest 32/32, burhtest 20/20, tourneytest
39/39, hoodfall 120/120 pairs.

6. **More war paints + weapon finish upgrades** — OPEN, the content half
   of the report; capture sheets to the owner's eye when built.

---

## THE TWO CAPTURE SHEETS AND THE COLOUR-BLIND DOOR — 28 Aug 2026

The five rulings are all serviced. THE BURH keeps its name (confirmed,
no change); the desktop wrapper judges itself in CI (`desktop-v*` tags);
and the three art items closed this way:

**The colour-blind toggle SHIPPED** per the ruling: TEAM COLOURS in THE
FEEL (CLASSIC / HIGH CONTRAST), `teamContrast` persisted beside
sensitivity and shake, palettes split as TEAM_FIELDS_DEFAULT /
TEAM_FIELDS_CONTRAST behind a module-level `setTeamContrast` so the node
probes keep measuring the shipped pair. Both forges set it from THE FEEL
(GameCanvas at pigment-grinding, armouryStage at its texture build), and
`getFeel` now loads the store on first ask — the old first-subscribe load
made "is the saved choice honoured at the forge" a mount-order race.
Photographed through the real door (`?teams=1` on /shot, localStorage
seeded before page scripts) and pushed through a Viénot deuteranopia
projection: classic red collapses into the ground's olive-mud, contrast
gold stays luminous. cameratest 13/13, playtest 38/38, touchtest 32/32.

**The Pict palette sheet** is with the owner (artifact "The Owner's
Eye"): shipped identity vs "Dark Fortriu" (wraps+linen to the Danelaw's
dark shape — bars cleared, shin band spent) vs "linen keeps the light"
(photographs as Dark Fortriu; the linen barely shows at the fight lens).
Recommendation on the sheet: keep the shipped shin band, ledger the
three rose readings as the price of a people. `?teams=1`'s sibling
levers were pulled for real and reverted; the tree ships unchanged.

**The Gilded cloak rear sheet** is on the same page: as-shipped calm
field vs a widened tablet-woven hem band (the existing 0.93 brass strip
deepened to 0.86 — the direction that actually changes the rear read;
gold brocade tablet-weave attested at Taplow and Sutton Hoo) vs a
centre-back gather. The gather was pulled twice and the first pull is a
lesson: a Gaussian at seam width (σ 0.055 rad) fell BETWEEN the shell's
vertex columns (~0.26 rad apart) and vanished — a lever narrower than
the mesh that carries it is not a lever. At resolvable width it reads as
"more cape", which is what the 8.1 sweep predicted amplitude would do.
Recommendation on the sheet: the band, tuned narrower; the gather left
unbuilt. Both levers reverted; nothing shipped ahead of the ruling.

---

## THE CONTENT HALF OF THE SECOND PLAY REPORT — three paints, two finishes — 28 Aug 2026

Item 6 ("more war paint options & weapon finish design upgrades") closes
with six new purchases, every one photographed before it was believed and
every source named in the code beside its constants:

**War paints** (the ladder grows 4 → 7):
- **Woad Band, 60g** — one palm-width stroke of woad across the eyes.
  SOURCED (TEXT): Caesar, De Bello Gallico V.14, the Britons staining
  themselves with glastum for battle. The shape is ours, labelled.
- **Crescent of Fortriu, 90g** — the crescent, horns down, one per
  cheekbone. SOURCED (FIND for the symbol): the most common symbol in the
  Class I Pictish corpus; on skin it is our invention, labelled. It was
  drawn three times before it was right, and both wrong drawings are
  lessons: on the BROW it vanished under every fringe (a paint a haircut
  hides is the Shadow-Hood fault wearing pigment), and low on the cheek a
  full beard ate the horns. It lives on the cheekbone, where no hair,
  helm rim or beard reaches.
- **Glastum Mask, 130g** — the whole face in woad, the paint ladder's
  crown by the Half-Face Shadow's own argument: a face at a different
  value AND hue is legible at 34 px. First portrait came out lavender —
  the skin's red surviving the multiply — so its vat sits a step bluer
  than the band's.

**Weapon finishes** (the ladder grows 4 → 6):
- **Horn and Bronze, 60g** — the working-man's rung under the paid
  ladder: dark horn grip, sand-cast copper-alloy mounts (the common
  grave's own kit), honest steel.
- **Serpent-Marked, 190g** — the crown. Beowulf's wyrm-fah, the serpent
  in the steel: a new `serpentsteel` substance (buildSteel at weld 6,
  where the recipe's own 0.55 mix cap is the ceiling) under an
  acid-dark, matte temper. The first cut kept the issued blade's
  keenness and WHITED OUT under the key light — the etch was invisible
  at the fight lens; matte is what lets a dark blade keep its colour in
  the sun, and the re-photograph shows a slate blade whose pattern is
  the brightest thing on it.

The catalog is the only list: cosmetictest sweeps ARMOURY itself, so the
six new rows joined its pair matrix, its helm-compatibility matrix and
its recolour-flatness claims with no ruler change.

---

## THE STEAM WAVE'S FIRST ROUND + THE CROWN — 28 Aug 2026

**The desktop judge has now judged, twice.** First dispatch: all three OS
builders refused `productName` "Bretwalda: Blood Moot" — a colon cannot
be a filename on Windows (Tauri's own `^[^/:*?"<>|]+$`). Fixed to
"Bretwalda Blood Moot" (the window title keeps its colon; a title bar is
not a path). Second dispatch: **SUCCESS on windows/macos/ubuntu** — real
installers (msi/exe/dmg/AppImage/deb) exist as artifacts of run 2. The
scaffold is no longer asserted-never-judged.

**Steam prep shipped dry:** achievements derived live from the marks
(one rule two readers; `steamsheet` 5/5 prints the paste-ready table),
store copy drafted with a fenced do-not-claim list, the asset ledger
with Valve's exact capsule sizes, and six 1920×1080 store screenshots
off the real renderer (`tools/storeshots.mjs`, in
`store/steam/screenshots/`). The fort's first frame was the crane wide
and photographed a bare plaza — retaken at the duel lens. HONEST NOTE
FOR THE GROUNDS WAVE: at the duel mark the roman_fort's walls sit too
far off to frame a fight against; the ground reads thin at fight level
in a way the village never does. That is a wave-2 look, written down
here so the screenshot round's finding is not lost.

**The Crown** (retention wave, first piece): the marks table's eleventh
row, `how: "crowned"`, reading players.bretwaldaSeasons — the fact the
war has stamped in exactly one place since the season machinery landed.
ProfileView/adoptServer carry it like level and wins; the roll of
Bretwaldas names its seasons ("the Season of the Long Frost, s3") per
7.6; MARK_CROWN joins the Steamworks sheet by derivation alone.
marktest extended to the grown truth (eleven marks, five facts, two
confessed inventions) — 25/25. wartest 82/82, moottest 25/25, playtest
38/38, touchtest 32/32, tsc, lint, build all green.

---

## THE TWO SHEET RULINGS, RETURNED AND EXECUTED — 28 Aug 2026

The owner ruled on "The Owner's Eye" (both recommendations approved):

**THE PICT KEEPS HIS PALE LIMBS — FINAL.** The shipped two-value
lightening stands as the people's identity, and the three standing rose
readings (7.1 pict/Blackened +3.590, 7.1b pict WRAP +19.50, 7.1c Sea
Queen's TUNIC +30.1 L*) are hereby the LEDGERED IDENTITY COST, not open
defects. factionread's ~26-27/34 with these leaders IS the settled
baseline; any future reading that worsens past them is a regression,
but the leaders themselves are the price of a people and closed. The
"Dark Fortriu" and "linen keeps the light" variants are rejected and
must not be re-proposed without a new owner conversation.

**THE GILDED CLOAK WEARS ITS BAND — SHIPPED.** The tablet-woven gold
border at 0.89 of the drop (the ruled "shade narrower" than the 0.86
capture), a millimetre prouder so the edge takes its own light; gold
cloak only — the other three keep their hide selvedge. The centre-back
gather stays unbuilt, as ruled. wearmeasure PASS on every section with
the standing deferrals unchanged; the rear portrait shows the design
event the 8.1 sweep said amplitude could never buy.

---

## THE OPEN-LEDGER VERIFICATION ROUND — 28 Aug 2026

The owner's directive: work the backlog and all open defects. Rule 8
first — every standing OPEN entry was re-verified against TODAY's build
before being believed, and the round splits them cleanly:

**FIXED NOW — the loose hair commas (15 Aug, round ten).** Verified
still real first: warden/Ridge-Helm/Warrior-Crop at -90 showed the same
detached fragments on the bare cheek, beard removed to reproduce the
original controls. The mechanism was in this file all along: the helmed
lock courses sit 0.03-0.17 rad below a hairline itself dropped 0.30
rad, designed to peek from under a rim/plate/flange — and where NOTHING
is overhead, `hairCeil` returns no ceiling and the coil was built FULL
SIZE on bare cheek (the flange entry's own words: "a coil rooted in
that band gets no ceiling at all"). One gate closes the class: a helmed
coil with no ceiling is not built — it has no mass to hang from and no
rim to emerge from. Unhelmed fringes untouched (a bare head's coils are
attached to the mass, photographed). A/B portraits clean at -90 bearded
and unbearded; wearmeasure PASS every section; helmclash A/B on the
same build BYTE-IDENTICAL across all six sections (19/24/6/8/74/13) —
the stranded coils were never in a clash reading, and every standing
red there predates this change.

**STALE, CLOSED BY LATER WORK, WITH TODAY'S PHOTOGRAPHS:**
- *The speckled face* (bare head flecks): the complexion rewrite closed
  it — today's bare-head portrait is clean graded skin, no flecks.
- *Four classes one tunic* (tunicDye era): superseded whole by the
  FINISH_KIT rework — armorColor has selected a coordinated kit per
  class since the armour repricing, and today's lineup shows distinct
  kits. The mechanism the entry criticises no longer exists.
- *The Shadow Hood swallows the mane* (13 Aug): closed by the owner's
  own second play report — he reported the mane STICKING OUT as the
  defect, and hoodSquash (with the hoodHemY this entry said was
  missing) gathered it inside, verified on portraits. The owner's
  later ruling supersedes this file's earlier aesthetic ruling.
- *The Wyrm-Crest's deep cheek guard* (13 Aug): the crest was
  redesigned on the owner's report (task ledger), BACKLOG 0.5
  re-verified 24 Aug that no wyrm row is red, and facecover flags
  spread as measurement-only. Nothing left to hold open.

**STILL OPEN, CARRIED HONESTLY:** the lips-and-moustache entry
(deliberately not attempted, unchanged), the /shot React #418
hydration (LOW), the 6.1 CLIP singleton (rides the next full walk),
and helmclash's standing measurement reds, which are a survey and not
a gate.

---

## THE CROWNING IS ANNOUNCED — the retention wave's second piece — 28 Aug 2026

`endSeason` has crowned exactly one Bretwalda since the war shipped, and
`warView` has carried the verdict roll to every client — but NO SURFACE
EVER SAID IT. A man who fought a whole season opened the game after the
reset and learned the outcome only if he thought to open the map and
read the roll of Bretwaldas. The loudest moment the game owns was
arriving as a table row.

The Dispatch is the right home by its own charter — backlog 5.13, "a man
who has not opened the map still learns the map moved" — and a crowning
is the largest move the map can make. It now leads the panel on both
surfaces that draw it (the landing and /factions), once, with the season
by NAME and the two consequences `openingHoldings` actually applies: the
champion's kingdom starts a territory ahead and every border of it is a
quarter cheaper to take.

**ITS LATCH IS DELIBERATELY NOT THE FLIP WATERMARK, and that is the
whole engineering content.** `takeWatermark` only writes when a flip
exists to be shown; the visit that matters most for a crowning is the
FIRST VISIT OF A FRESH SEASON, which has no flips at all. A crowning
latched on it would shout on every visit until the first border moved —
the opposite of news. So: one key, one number, the newest verdict season
this browser has been shown.

**`tools/crownnews.mjs` (10/10, `npm run crownnews`)** is the ruler, and
it was SHOWN RED before it was believed: with the latch deleted it fails
exactly two claims — "the visit that showed it is the visit after which
it stops being news" and "shown exactly ONCE across three fresh-season
visits (3 of 3)" — and nothing else. It bundles the SHIPPED `Dispatch.tsx`
with esbuild and imports it fresh per simulated browser tab (the module
caches its arrival value per JS context, so a reused import would be one
long visit and every second-visit claim would measure nothing). It
asserts the flip watermark stays null across those same fresh-season
visits, side by side, so the reason the second key exists is a
measurement rather than a comment. Private-mode throws and an empty
crowns list are covered. No database, no browser, no server.

---

## THE STORE PAGE HAD FOUR FALSE CLAIMS, AND NOTHING WOULD HAVE CAUGHT THEM — 28 Aug 2026

Found while re-reading the Steam copy this same session had written.
`store/steam/copy.md` claimed **five warrior classes and named a
"Burhweard"** — there are four, and no Burhweard has ever existed in this
repository — and called two of them **"Warden" and "Runekeeper"**, which
are the internal ids. The shipped names are WEARD and WRECCA, and
`render/vfx.ts` records exactly why the second was retired: it "was also
a class in somebody else's fantasy game, which is the one thing this
project has a standing rule against". A fourth claim, "~10 MB installer",
was a guess; the desktop CI's own artifacts measure **Windows 4.0 MB,
macOS 2.3 MB, Linux 74.7 MB** — the last one an order of magnitude out.

Every one of those would have been permanent. A store page is indexed,
quoted, and read by people deciding whether to trust the rest of the
claims — and NOTHING in this repository compared marketing copy to
anything. This is `docs/PROCESS.md` failure mode 3 (a mirrored constant)
with a wider blast radius.

**`tools/storeclaims.mjs` (25/25, `npm run storeclaims`)** now treats the
copy as code: it reads the page and asks the module that owns each noun —
the roster AND ITS COUNT off `WARRIOR_STATS`, the display names off the
shipped `WARRIOR_INFO`, the arms off `ARMS`, the peoples off `PEOPLES`,
the grounds off `GROUNDS` — refuses the retired and invented names by
name, and guards the honesty fence itself, since deleting that section
silently frees the page to promise Steam relay play and achievement sync,
neither of which exists. Shown RED first against the original draft: it
failed exactly four claims — the count (5 against 4), and the three
forbidden names — and nothing else.

It states in its own output what it cannot see: prose, tone, pricing,
character counts, taste. A green sheet here is not a proof-read.

The copy is corrected: four warriors under their shipped names, the
eight arms named as the real trades they are, and measured installer
sizes with a note to re-measure before the page goes up.

---

## THE BURH'S SECOND HALF: FREE SEATS WERE DOING DIFFICULTY'S JOB — 28 Aug 2026

The owner's report was two claims in one sentence — *"the BURH needs a
look into as its hard to hit multiple rounds especially SOLO with no sort
of health regen or anything else"*. The respite mend answered the
sustain. This is the half the mend could never reach, and it was an
INVERSION rather than a difficulty:

```
count = min(1 + wave, room.maxPlayers - humanCount(room))
                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ free seats
```

Free seats are a CAPACITY fact and they were sizing the here. The room
seats eight and the burh admits four defenders, so a full party left four
places and **a lone man left seven** — the lone defender was handed the
LARGER here at every wave past the third, and the gap widened as it
climbed. Measured, not reasoned: at wave five **a lone defender faced SIX
jarls where a party of four faced FOUR**. Six raiders per defender
against one, and the fewer friends you brought the worse it got.

The fix is one constant: `BURH_DEFENDERS` (4) instead of the live head
count, so the here is the same here whoever stands and its size cannot
invert with the party's. Standing alone is still harder — no
shield-brothers — but by the honest margin of standing alone. **The full
party's experience is byte-identical by construction** (it always left
exactly this many seats), and the lone defender's wave-5 here falls from
six to four while the early ramp (2 at wave one, 4 by wave five) is
untouched.

`burhtest` gained the law and was SHOWN RED FIRST — and the first cut of
the new fixture is itself a lesson: it sent `ready` where the engine
answers `start`, no room ever left the lobby, and two of the new claims
went green on `0 <= 0`. **A gate green because the case is absent.** The
"all three fixtures actually reached the wave under test" claim exists so
that cannot happen twice. With the fixture repaired the claims read the
defect exactly (`1 defender faces 6, 4 face 4`) and now read
`1 faces 4, 2 face 4, 4 face 4`. burhtest 24/24.

**DECLARED, NOT FIXED, AND PRE-EXISTING:** past the fifth wave the burh
neither grows (the seat ceiling) nor hardens (the difficulty ladder tops
out at jarl) — for a lone man and a full party alike. The late burh is
an attrition stand with the respite mend as its only dial. That is the
mode's shape today, it is not something this fix introduced, and
`burhtest` prints it as a NOTE on every run rather than leaving the
silence to read as a promise. An owner-level design question, not a
constant to nudge in the dark.

Gated: burhtest 24/24, wartest 82/82, moottest 25/25, tourneytest 39/39,
benchtest 23/23, protocoltest 81/81, fighttest 23/23, rejointest 12/12,
solidtest 16/16 (standing deferral), tsc clean, lint 0/0.

---

## THE SHIELD WAS WORTH WHATEVER IT LIKED — `guardprobe` — 28 Aug 2026

`blockReduction` is a headline column of `WARRIOR_STATS` and the huscarl's
whole identity ("Shield & sword. Unbreakable."). **Nothing in this
repository held it to a number.**

- `classmatrix` cannot see it and says so on its own verdict line: only
  ~6% of the damage in its duels ever meets a raised guard. BACKLOG has
  the proof — the huscarl's guard from 0.80 to **0.00**, the best shield
  in the game to none at all, moved `huscarl vs warden` 69% → 69%.
- `fighttest` §3 does drive real held guards and its claims are the right
  ones — but every one is ORDINAL: a haft leaks more than a board, a
  wrong-way guard more than a matched one, SHIELD WALL least. **Ordering
  survives any magnitude.**

`tools/guardprobe.mjs` (19/19, `npm run guardprobe`) swings ONE identical
blow twice — at a bare man and at the same man holding a guard — and
requires the ratio to be `1 - eff` off the engine's own line. Everything
else is held fixed, so the ratio can only be measuring the guard. Read
off the wire; nothing recomputed. Measured: huscarl 20.0% through against
20.0% expected, warden 35.0/36.0, runekeeper 65.0/65.0, berserker
70.0/72.0; the wrong-way guard per class; the dane axe's 0.80−0.50 as a
SIZE and not merely "less"; SHIELD WALL at the 0.95 clamp ceiling. Its
own control: the same blow twice is the same damage twice.

**THE DEMONSTRATION, because a new gate is worth exactly what it catches
that the old ones miss.** `GUARD.mismatch` drifted 0.5 → 0.9 — every
ordering preserved, so a wrong-way guard still leaks more than a matched
one and less than a bare man:

```
fighttest    23/23   GREEN     (blind)
classmatrix  PASS              (blind)
guardprobe   4 FAILURES, naming the quantity and the expected value
```

**AND WHAT IT CANNOT SEE, tried rather than assumed.** It compares the
engine's behaviour to the engine's OWN sheet, so a changed sheet VALUE is
invisible to it: the berserker's guard set to 0.90 leaves it 19/19,
because the guard then honestly is worth 0.90. That is not a gap — it is
`classmatrix`'s job and `classmatrix` does it, failing that same edit at
once with "the two sheets disagree on 1 value(s)". **Values are guarded by
the two-sheet mirror; the mechanism was guarded by nothing.** Both halves
are now covered, and the division of labour is written in both files.

---

## THE MIRROR CHECK HAD NEVER BEEN SEEN RED — DISCHARGED — 28 Aug 2026

`classmatrix`'s mirror diagonal is the harness's own control: a class
fought against itself is 50% by construction, so a mirror off 50% is the
RULER reporting its own bias. The file recorded it honestly as **"a
declared deferral, not a proven catch: v3 asks the right question and has
NOT been seen red on this engine"** — R2 outstanding, and a gate nobody
has seen fire is a gate nobody knows works.

Discharged by injecting a real side bias — the first BOT inserted into a
room hits 25% harder, so a mirror has a strong side by construction — and
running 200 bouts a cell, seed 4242, changing nothing but `--no-swap`:

```
--no-swap   mirrors 74.0 / 74.0 / 72.5 / 58.5%   3 mirror findings,
                                                 3 order-bias findings, FAIL
shipped     mirrors 53.0 / 50.0 / 51.5 / 46.5%   0 findings
```

Both halves matter. The left column proves the check FIRES on a bias this
size. The right column proves `swapSides` ABSORBS one this size — which
the file had asserted and never demonstrated.

**The first attempt was inert and is kept as the lesson.** It biased the
first key of `room.players`, which is the HOST SESSION and not a fighter,
so no fight changed: mirrors read 46.7% and nothing fired. A proof that
does not move the quantity it claims to move proves nothing — and it
would have been very easy to read that quiet run as "the gate cannot
fire" and go tuning the tolerance, which the file explicitly warns
against.

The sizing note stands: nothing this engine produces on its own reaches
the 3-point tolerance, so on an honest tree this check is quiet. It is
quiet because there is nothing to say, and that is now measured.

---

## THE FACTION WALK AFTER THE GOLD BAND — no regression — 28 Aug 2026

The Gilded cloak's tablet-woven border is a new, wider, prouder GOLD
surface, and §6 of `factionread` is the gate that measures clipped gold.
So the walk was re-run against the shipped tree. Sections 0 through 5
complete, plus §6's controls:

**THE CLIP CONTROL IS UNCHANGED — 5.99%.** "Gilded War Cloak 400g +
Bretwalda Gold 160g, unsworn, @160°" is the bar §6 sets for itself, and
it reads exactly what it read before the band existed. The band did not
make the shop's dearest gold clip.

**Every other verdict matches the ledgered baseline, failure for
failure:** 1.2 DISTINCT (worst ΔC 6.93), 1.3 PEOPLE, 5.1b NO TWINS PER
SURFACE (36 surfaces), 5.2b NO REFUND PER SURFACE (17) — the four
standing reds this file already carries as the rose-settlement baseline
and the owner-ruled identity cost. Nothing new is red.

**§5.4 — NO VAT PUTS A SURFACE IN THE ROSE BAND — PASSES**, which is the
rose settlement holding on the shipped tree, and §5.3's near-neutral
claim with it. 0.1/0.2/0.3, 1.0, 1.1, 2.1, 2.2, 3a/3a'/3b/3c/3d, 4.1,
4.2, 5.0, 5.1, 5.2, 5.0b, 6.0, 6.2 all PASS.

**Honest about what is still running:** §6's per-kit rows (four classes
x seven finishes) take about nine minutes each on this GPU-less box —
hours, not minutes — and were still walking when this was written. They
are compared against the control above, which is unchanged, and the only
gold surface this round altered is the cloak hem the control itself
wears. The rows are worth having and are not worth blocking on.

Cost note for whoever runs it next: sections 0-5 land inside the first
twenty minutes; §6 is the long tail. `stdbuf -oL` or it is silent.

---

## THE CLIP SINGLETON RODE THE NEXT WALK — AND IT IS NOT A LIVERY DEFECT — 28 Aug 2026

The rose-settlement entry left this standing law about §6's one red frame:

> "6.1 CLIP: a NEW singleton — 1 of 120 frames at 7.66% (norse/Polished@160).
> Seen ONCE, unreplicated; §6's 160° bearing is the noisy one. **The law: it
> rides the next walk before anybody believes it.**"

**It rode the next walk and came back identical.** `norse/huscarl/Polished
Steel 60g at 160° clips 7.66% of the man — 1.3x the 400g gold cloak's
5.99%, hottest #f8f8f0`. Same frame, same number, a different day and a
different tree. It is no longer noise and it is now believed. (The walk
otherwise reads **26/34**, the ledgered baseline, failure for failure.)

**AND THE DIAGNOSIS OVERTURNS THE NAME IT HAS BEEN CARRYING.** It is
filed under "norse", which points at the Danelaw's dye rows — and this
unit went to those rows first and was about to cut the metal ceiling.
That would have been wrong. Resolved through the client's own vat:

```
                    fitting resolved for none / norse / saxon
Polished Steel 60g   #c3c9d0   #c3c9d0   #c3c9d0     ALL IDENTICAL
Bretwalda Gold 160g  #dcc164   #dcc164   #dcc164     ALL IDENTICAL
```

**`fitting` is untouched by every livery.** No vat reaches it, so the
norse dye rows cannot be the cause and cutting them would have dimmed the
Danelaw for nothing. The brightness ladder of the shop's own fittings is:

```
Rough Iron        0g   0.640      Crimson Warplate 130g   0.640
Polished Steel   60g   0.785  <-- Sea Queen's Gift 130g   0.712
Blackened Steel 110g   0.512      Bretwalda Gold   160g   0.753
Bronze Scales   110g   0.619
```

**The 60-gold finish carries the brightest fittings in the shop — brighter
than the 160-gold crown** — and §6.1's bar is, by its own words, "the
shop's own dearest gold". The livery is not the fault; it is the
REVEALER. The Danelaw wears the darkest wools in the game (tunic 0.23,
wrap 0.27, hide 0.18 against Polished Steel's near-neutral 0.785
fitting), so at the fire-lit rear bearing that one surface is the only
thing catching light, and it blows.

**NOT FIXED HERE, AND DELIBERATELY.** The lever is `FINISH_KIT`'s
`polished` fitting, and the target is a peak channel under what the gold
sustains — but the quantity that must land under the bar is a CLIPPED
PIXEL COUNT in a lit, graded render, and the only instrument that
measures it is a 110-minute walk with no way to ask for one frame.
Choosing a number by arithmetic and hoping is how a tuning round becomes
four of them. What is needed first is a way to render that single frame:
§6 costs ~43 s a capture, so a targeted flag turns this from hours into
one minute. That flag is the next piece of work, not a nudged constant.

---

## THE CLIP SINGLETON, FIXED — AND THE FIRST TWO LEVERS WERE INERT — 28 Aug 2026

`factionread` grew a PROBE DOOR first, because the reason this defect sat
open for two walks was never that the lever was hard to find — it was
that the ruler took 110 minutes to answer once, and could not be asked
for one frame. `--people/--cls/--finish/--turn` narrow §6's sweep; §0-§5
still run (albedo, ~8 min) and the CONTROL still runs whole because it
sets the bar. **One frame now answers in eight minutes instead of one
hundred and ten.** A narrowed run refuses to be a verdict: it prints its
readings, says PROBE NOT A SHEET, and exits before §7 rather than
publishing a number anyone could quote.

Then the levers, in the order they were pulled — and the first two moved
NOTHING, which is the whole reason the door had to exist:

1. **The norse metal dye row.** Where the item's own name pointed. NOT
   PULLED, because resolving the kit through the client's vat showed
   `fitting` is byte-identical under all four peoples — no vat reaches
   it. Cutting a Danelaw row would have dimmed the Vikings for nothing.
2. **The fitting, 0xc3c9d0 -> 0xaeb3ba** (luminance 0.785 -> 0.700), on
   the argument that the shop's brightest fitting outshone the 160-gold
   crown's. Built, rendered, measured: **7.66%, hottest #f8f8f0 —
   IDENTICAL. Completely inert.** Reverted. A good argument and a real
   ladder inversion, and simply not this defect.
3. **The MAIL.** Forced to Blackened's hex as a diagnostic: **7.66% ->
   0.00%.** That is the surface, proven rather than reasoned.

**THE FIX: Polished Steel's mail 0x8a97a5 -> 0x7a8591**, luminance
0.590 -> 0.516. It clips **0.00% against the 5.99% bar** with real
headroom rather than sitting on the cliff the old value sat on — and it
is still the BRIGHTEST MAIL IN THE SHOP (0.516 against Bretwalda Gold's
0.480), so "Polished" is still what it says. The FINISH_KIT key stays
0x8a97a5, so no saved profile loses its finish.

Photographed before believed: the man still reads as bright cool polished
mail, and against Rough Iron beside him the two are plainly different
metals (`art/look/steelfix/`). cosmetictest CPU tier 16/16 — no finish
pair collapsed.

**The lesson is the one this file keeps writing:** two defensible
arguments, one of them about a real ladder inversion, both inert. The
difference between a tuning round and four of them is a ruler you can
afford to ask twice.

---

## THE GLYPH SET IS COMPLETE — 24 marks, and the sheet caught two — 28 Aug 2026

`docs/DESIGN-SYSTEM.md` specifies **24 marks on a 24 px grid in one flat
colour**, devices "sourceable to a find, or labelled an invention". The
set shipped at 11. The remaining thirteen land now, and every one names a
real object: the bone comb and the spear (the two commonest finds in any
grave — free, because every man owned them), the Ing rune of the futhorc,
the triskele off British hanging-bowl metalwork, the Borre ring-chain out
of York, the Benty Grange boar, the Coppergate helm, the Sutton Hoo
drinking horn and the stag from its sceptre, a Norse woman's keys, the
Pictish beast and the double disc and Z-rod, and the Gotland longship.

**THE CONTACT SHEET CAUGHT TWO, AND NEITHER WAS VISIBLE IN THE CODE.**
The paths were rendered together at size before any of it was believed
(`art/look/glyphs/sheet.png`):

1. **The Thorn Rune was the Raven Banner.** A vertical stave with a
   triangle on it is precisely the banner's silhouette, and at this size
   the two read as one device — in a set whose entire purpose is devices
   you can tell apart. Replaced with **Ing**, the futhorc's lozenge: the
   only lozenge in the set, so it cannot be confused with anything, and
   the Old English Rune Poem is the better source anyway.
2. **The Stag read as a box on table legs.** Redrawn with a curved back
   and a real antler rack.

`marktest` moved to the grown truth and is 25/25 — five free marks now
(the shield boss, the seax, the comb and the spear beside the unmarked
shield), two confessed inventions still (the wyrm-knot and the crown),
and a "veteran" fixture raised to 45 wins because the longship asks 40
and a veteran who owns everything must actually clear every top rung.

The nineteen paid rungs became nineteen Steam achievements with **no new
code** — `achievements.mjs` derives them from the marks, which is what
that seam was built for. `steamsheet` 5/5.

---

## THE CLIP GATE WAS MEASURING AN UNPINNED RENDERER — 28 Aug 2026

**CORRECTING THIS FILE'S OWN LAST TWO ENTRIES, and the correction is the
finding.** The entry above concluded the §6.1 singleton was believed
(it reproduced at 7.66% across two full walks) and diagnosed it as the
shop's fitting ladder — Polished Steel at 60g carrying brighter fittings
(0.785) than the 160g crown (0.753). The ladder observation is true. **It
is not the cause, and the singleton is not a fact about the subject.**

`factionread` has a documented probe mode — `--people --cls --finish
--turn`, eleven minutes — which the previous entry wrongly said did not
exist. Asked for that exact frame on the same tree:

```
full walk    norse/huscarl/Polished Steel @160°   7.66%   (twice, exactly)
probe alone  norse/huscarl/Polished Steel @160°   0.00%   (all four peoples <= 0.01%)
             ...with the CONTROL reading 5.99% in BOTH
```

A frame that blows only when 120 captures precede it is not the subject.

**THE CAUSE: `factionread` PINNED NO QUALITY TIER.** `render/quality.ts`
states the hazard in its own words — *"The governor only ever runs
against a tier nobody pinned. Under `?quality=` the whole point is that
the tier stays put — a capture harness that got silently demoted mid-run
would be measuring a build nobody ships."* `cosmetictest` pins
`quality=high` on every URL and its comment records that this demotion
"took a day to catch". This file opened 126 pages and pinned nothing.
The CONTROL is stable across runs because it is captured EARLY; the sweep
drifts because it is captured LATE.

Pinned now on both capture paths (`stageQ` and the CONTROL). **The pin
demonstrably changes the instrument** — the control moved 0.13/0.90/5.99%
to 0.05/0.63/6.26% at the three bearings — which is itself the proof that
the tier was never "high" before and was free to wander.

**WHAT IS NOT YET PROVEN:** that the pin closes the singleton. The
singleton only appears in a LONG run, so only a full walk can test it,
and that walk is running. Until it answers, §6's historical numbers —
including every clip figure this file has ever quoted — were taken at an
unpinned tier and should not be compared across runs.

---

## TWO FALSE REDS IN `summaryflow`, BOTH THE HARNESS'S OWN — 28 Aug 2026

Neither is a defect in the game. Both make the harness fail on builds
where nothing is wrong, which is the most expensive kind of test: it
teaches the next reader to distrust a red.

**1. The corpse veto had no corpse.** `vetoCheck` asserts "a man lying
dead does not perform", judged off the LOCAL man — either the row was
never offered him (the stronger guarantee) or he pressed and the server
refused. When his war band WINS he is standing, the row is correctly
offered, and pressing it is correctly allowed: both halves go false and
the check fails with nothing broken. That is this repository's own law
seen from the other side — a gate green because the case is absent is not
a gate, and a gate RED because the case is absent is not one either. It
now takes `mine` (which `emoteCheck` already returns) and SKIPS by name
when he is standing, exactly as `emoteCheck` and `ledgerCheck` do.

**2. The FIGHT AGAIN press could spend the window it had to land in.**
The press must arrive while `state === "finished"` — the server's
ten-second park, timed from `t0`. The gate in front of it waited a FLAT
8000 ms for the overlay to mount, on a clock unrelated to that window,
and `t0` already trails the server's arm by the verdict wait. So the
harness could spend eight seconds of a window with three left and then
blame the button for a room that had correctly rolled back. The budget is
now the window's actual remainder, and — the second half, which matters
as much — the window is RE-READ after the wait, because `until()` checks
its deadline only after a falsy `cond`, so an evaluate blocked by the
documented 8-25 s main-thread jam can return true from the far side of
the deadline and report success on a window that has closed.

**RUN AND GREEN (the state below is superseded, kept for the record).** `summaryflow`
is a browser harness and the browser is held by a full `factionread`
walk; running two browser suites at once is the one thing this repository
forbids outright. The run is queued behind it and the result belongs on
this entry.

**THE RUN, AND IT FOUND A THIRD THING — A REAL ONE, IN THE PRODUCT.**
`summaryflow` came back **16/17** with a failure in `emoteCheck`, which
neither fix had touched: `free-for-all: the flourish is offered exactly
to the man left standing — localStanding=true emoteButtons=0
wire=dead/finished`. The stage had stood him up and the row was absent.

`render/summary.ts`'s `canPerform` states the law: *"Before the stage
exists nobody has been judged yet, and the fight's own rule — the server
refuses a dead man's emote — is the right one to fall back to. AFTER IT,
STANDING IS THE PERMISSION."* Only the first half was ever pushed to the
page. `page.tsx` supplied the second itself, ANDing the wire's own
`state !== "dead"` onto the button — correct during a fight, and wrong
the instant the stage exists, because **the podium deliberately stands
the honoured few up while the wire still calls the fallen ones dead.**

So a man who placed TOP THREE and stands on the podium was refused his
flourish. The note directly above that line already warned about "two
sources of truth for one question" and the line underneath it had
quietly become the second one.

Fixed where both halves are in scope: `GameCanvas` now pushes the WHOLE
answer — the stage's `canPerform` once a stage exists, the fight's own
dead-man rule before it — and the page renders what it is told. One
question, one owner.

**summaryflow 17/17, exit 0** (from 16/17), playtest 38/38, touchtest
32/32, tsc clean, lint 0/0, build green.


---

## THE SUTTON HOO CREST TORE ITS OWN NAPE GUARD — CLOSED — 28 Aug 2026

`helmclash` §6 SEAM, huscarl/suttonhoo: **`d9b45f (276 tri) proud of
9aa6ae (308 tri) [az 180deg, y 205.7 mm]` — 1114.7 mm2 torn, 30.3% of
pairs, 5.8 mm deep.** The GILT crest coming out through the SILVER nape
guard at the back of the head, in bites, on the 2400-gold helmet.

The cause is one line. The crest's rear half started at `bandLo - 0.44` —
0.44 rad BELOW the band's lower rim — while the front half started at
`bandLo`. Sutton Hoo always carries a nape guard (`nape: "guard"`, not
optional on this style), so everything the rear tail did below the band
was either hidden behind the guard or poking through it. **It was never a
shape anyone could see, only a shape that could tear.**

The crest is now what its own comment calls it — a fore-and-aft ridge ON
THE BOWL — symmetric, ending at the band front and back where the guard
takes over, with the same easing both ways so the rear does not start at
full height against the rim. **599.4 mm2 / 1.5% / under the 800 bar:
huscarl/suttonhoo PASSES.** §6 as a whole goes 13 red kits to 11.

Photographed before and after at 180, 145 and 90 degrees
(`art/look/crest/`): the gilt now meets the band and the silver guard
takes over, and the crown reads as three ribs converging — no tearing at
any bearing. wearmeasure PASS on every section, cosmetictest 16/16 CPU.

### THE CROWNED HELM'S EIGHT: DIAGNOSED, NOT FIXED, AND THE EXPERIMENT IS RECORDED

Eight of the remaining eleven are ONE pair on the Jarl's Crowned helm,
failing identically on all four classes: `6e767f (128 tri) proud of
bfa25c (200 tri)`, 1888-2660 mm2, 2.1-2.8 mm deep, at az **109, 238, 310
and 326** degrees.

**Every one of those azimuths is off-axis, and that is a signature.** The
hoop is swept as a circle of radius `R.x + 34 mm` and then SCALED in z to
depth `R.z + 34 mm`. An ellipse with semi-axes `(a+d, b+d)` is NOT the
offset curve of an ellipse with semi-axes `(a, b)`: the two agree on the
axes and PINCH everywhere between, so the true clearance off-axis is less
than the 34 mm written down — by more, the less round the head is. The
file's own note ("the hoop stands 10 mm further out than any plate behind
it") is true of the number and false of the geometry.

**The experiment, so the next round does not repeat it:** taking the
standoff to 40 mm moves it materially and does not close it — depths
2.8→2.6, 2.1→1.6, 2.7→2.0, area down ~15% — every cell still over the
bar. So the pinch is CONTRIBUTORY AND NOT SUFFICIENT; a second cause is
in there, and the 128-triangle steel piece has not been identified (it is
not the brow plate, which is frontal, and the flange's top ring is
clamped BELOW the circlet). **The 6 mm was reverted rather than shipped**
— a constant that moves a number without closing the case, on a piece the
player can see, is tuning in the dark, which is the one thing this file
keeps recording as the cause of its own worst rounds. Identify the piece
first; `helmclash` does not print tags and teaching it to would be the
cheapest next step.

---

## THE PIN CLOSES THE CLIP SINGLETON — CONFIRMED — 28 Aug 2026

The entry above pinned `quality=high` on `factionread`'s two capture
paths and said plainly what was NOT yet proven: that the pin closes
§6.1's singleton, since the singleton only ever appeared in a LONG run.

**It is proven now.** A full pinned walk, at the fifth sweep row — about
eighty captures deep, which is the depth the frame used to blow at:

```
                                        unpinned          pinned
CONTROL @160                            5.99%             6.26%
norse / huscarl / Polished Steel @160   7.66%  (x2 walks)  0.00%
```

Not reduced — **gone**, to two decimal places, on the frame that had
reproduced exactly across two consecutive walks and was believed on that
evidence. The whole row is quiet: sax 0.00/0.09/0.01, nor 0.01/0.11/0.00,
bri 0.00/0.09/0.00. The singleton was the renderer's tier drifting under
a harness that held nothing, exactly as diagnosed, and the fitting-ladder
observation — true in itself — was never its cause.

### THE PIN'S PRICE, MEASURED, BECAUSE A GATE NOBODY CAN AFFORD STOPS BEING RUN

`docs/GATES.md` exists because "the browser is needed for one thing only:
the final look" and everything expensive stops being run. So this is
recorded rather than discovered later:

**Pinning `high` makes the walk about five times slower.** §6's sweep ran
at roughly 4 minutes a row unpinned and **19 minutes a row pinned** — 5
rows in 1 h 26 m, against 28 rows in the sheet. The full walk goes from
~110 minutes to an estimated **8-9 hours** on this GPU-less box. That is
not a reason to unpin: an hour-long run of a drifting instrument is worth
less than nothing, because it produces numbers that look reproducible and
are not. It IS a reason to stop treating the whole sheet as a routine
gate.

**The way to work it, and it already exists:** `--people --cls --finish
--turn` narrows §6 to a single frame and answers in about eleven minutes
with the CONTROL still measured in full. That is the iteration path; the
whole sheet is now an overnight job, and should be described as one
wherever it is listed. This run was stopped after the decisive row rather
than left to spend eight hours re-confirming a baseline the sections
above had already re-read.

**Also still true and unchanged by the pin:** the four standing §1/§5
reds remain the ledgered rose-settlement and owner-ruled identity costs,
and the control's own bar moved 5.99% -> 6.26%, so **no §6 or §7 figure
quoted anywhere before today is comparable with one taken after it.**

---

## `rejointest` WAS A COIN FLIP, AND THE RED WAS NOT WHAT IT SAID — 28 Aug 2026

Found by running the whole battery after the day's merges: `rejointest`
alternated **12/12 and 11/12 on the same tree**, the failure always on
"the body is his again — awol cleared, and his input moves it".

**A flaky gate is worse than a missing one** — it teaches everybody to
re-run a red instead of reading it — so it was instrumented rather than
re-run. On every failing run the body was `idle`, `attackTimer` 0 and
stamina **untouched at its maximum**: the press had not been refused on
its merits, it had never been acted on at all. Sending a SECOND press
always landed (`first=false second=true`), which reads exactly like the
product defect "a rejoined man loses his first input".

**It is not that.** One field separated the runs:

```
HITSTOP=0.060  ->  the press is swallowed      (every failure)
HITSTOP=0.000  ->  the press lands             (every pass)
```

That is `processInput`'s first guard — *"Frozen on contact: he is not
turning, striking, guarding or rolling"* — doing precisely its job. The
fixture drops a man back into a LIVE fight with someone hitting him, so
whether he is inside a 60 ms freeze at the instant of one press is a
property of the bot's timing and nothing to do with rejoining.

So the fault is the HARNESS's, and the distinction is the whole value of
the entry: read naively the red says a rejoined player loses his first
swing, and the next reader spends a day in the reconnect path looking for
something that was never there.

The claim means *a man who has come back can act*, so it now presses the
way a player does — every tick for 0.8 s, well past the 60 ms freeze —
and reports the state it ended in. **Five consecutive 12/12**, and shown
still able to fail: with the rejoined man's stamina forced to zero it
goes red on the same line (`state=knocked, attackTimer=0.00`), so the
window did not turn a real dead input into a pass.

---

## THE THIRD PLAY REPORT — BLOOD: IT WAS FLOATING, AND NOW IT POURS — 28 Aug 2026

**"Blood visuals are currently floating off players bodies when damaged
looks very poor visually."** It was, and the cause was two constants in
`GameCanvas`: every wound was spawned at `{ x: at.x, y: 1.4, z: at.z }` —
the WIRE's ground position at a HARD-CODED CHEST HEIGHT — whatever had
been hit and whatever the body was doing. A man knocked down, mid-fall or
already on the floor bled from a point 1.4 m in the air above himself,
and a leg wound sprayed from his chest. Blood hanging in space beside a
warrior is exactly what that code asks for.

The rig already knew better: `pivots` carries the real bones, posed this
frame, under the body's own transform. A wound is now taken from the bone
the server named — head/neck to the head, armL/armR and legL/legR to
their limbs, torso and waist to the chest — via `getWorldPosition`, so it
follows him wherever the pose has put him. A man on his back bleeds from
his back. Falls back to the chest, then to the old point, so an unposed
rig still bleeds somewhere sane.

**"It should be liquid pouring out like a hose & even more aggressively
when dead & dismembered / decapitated."** Turned up on every axis:

- the ordinary wound throws `9 + 44k` droplets against `5 + 26k`
- the jet's floor goes 0.26 -> **0.88** — it never stops pouring — and
  its rate 84 -> 150/s
- a death's jet: power 1.05-1.65 against 0.5-0.85, running 2.1x the base
  life against 1.4x
- **decapitation is named**: a `neck` or `head` cut throws half as much
  again on top of `arterial`'s 1.3
- droplet SIZE 0.035+r·0.3 -> 0.055+r·0.55, which is the lever between a
  mist and a liquid and the one the capture actually shows

Photographed at the beheading preset: before, a scatter of dark specks;
after, bright arterial droplets arcing off the neck with the head
trailing blood behind it.

### AND THE GATE THAT WAS WATCHING THIS COULD NOT SEE IT — FOUR TRIES

`goretest`'s PULSE claim said "a stump spurts rather than pours", depth
>= 0.6, with a note that "a hose does not". The owner has now ruled the
other way, so the bar had to turn over — and on the way it emerged that
**the metric had never been measuring the property at all.** All four
shapes are kept in the file beside the calculation:

1. `1 - min/max` on the RAW per-frame count. The emitter accumulates
   fractional droplets, so an empty frame is routine at any pressure and
   one pins the answer near 1. It reported **88% "away between beats" on
   a build whose floor made 88% arithmetically impossible.**
2. Smoothed. Fixed quantisation, still mostly read the jet's own
   `(1-t)^1.6` decay (~70% across the window): the floor 0.80 -> 0.88,
   which HALVES the oscillation, moved the answer 47% -> 45%.
3. Detrended by a 0.5 s moving average — but the beat is 0.68 s, so the
   "trend" followed the pulse and cancelled it: a true 74% spurt read
   30% and a FLAT jet read 8%.
4. Per-beat trough vs neighbouring peaks. On a shallow pour the local
   extrema are noise, not beats, and the median depth collapsed to 0%.

Read at the beat's own frequency (one Fourier bin) it is honest but
**under this fixture's noise floor**: a jet with the pulse term REMOVED
ENTIRELY — true depth zero — reads **27%**, the shipped hose 29%, the old
deep spurt 39%. Three values that are not separable, so any bar between
them is a coin.

So the claim is **retired to a printed number with the reason measured**,
not deleted and not left as a gate that cannot see. What still holds the
owner's ruling is volume and arrival — MARKS, REACH and "AND IT ARRIVES"
all move with the pour and all have margin over the noise. goretest
35/35.

---

## THE KILL CAM OPENED DOWN THE WINNER'S BACK — ONE INVERTED SIGN — 28 Aug 2026

**"Camera angles for final kill cams are sometimes blocked by back of the
winner of round."** Two faults, and the second is the one that matters.

**FAULT 1 — the round beat had no guard at all.** `roundOpening` places
the eye at `wound + bearing * ROUND_OPEN_RADIUS`, and its bearing comes
from the spray, else the KILLER, else the viewer. `frameDeathShot` has
swung clear of the killer since it was written (`KILLER_CLEAR`, 0.62 rad);
the round opening had never been told. So a bearing pointing at the man
who struck the blow composed the shot straight through him — and after a
killing blow he is always nearer than the opening radius. The guard is
now applied to EVERY branch, not just the killer's: the spray branch is
preferred, and a wound sprays back down the line the blow came from about
as often as not, so the commonest opening was the likeliest offender.

**FAULT 2 — AND THE SWING WENT THE WRONG WAY.** With the guard added the
new claim still failed, so it was measured rather than re-read: an
opening 18 degrees off the killer came back **0.5 degrees** off him. The
swing was rotating the bearing ONTO his line.

```js
const side = bx * kz - bz * kx >= 0 ? 1 : -1;   // toward him
const side = bx * kz - bz * kx >= 0 ? -1 : 1;   // away
```

The cross product's sign says the killer lies anticlockwise of the
bearing, so the bearing must go CLOCKWISE to leave him. **This arithmetic
was inherited from `frameDeathShot`, which has carried it inline since it
was written** — so the death camera's killer-avoidance has been pushing
the lens toward the killer, not away, for the life of the feature. It
never showed because nothing measured the angle afterwards: every
existing claim asked where the wound sat in frame, and a lens looking
through a shoulder still has the wound dead centre.

One rule, two readers now (`swingOffKiller`), and a claim named after the
owner's report walks all 24 bearings x 3 fallback cases: **28 of 48
openings looked through him before, 0 after, every one clear by at least
36 degrees.** deathcamtest 46/46 (from 45/45 — the suite could not see
this), cameratest 13/13, replaytest GREEN.

---

## A MARK UNLOCKED IN SILENCE, AND THEN FORGOT WHY — 29 Aug 2026

**"There's no notification for when you unlock a new mark via an achievement
or ability to see why or how you got it once unlocked."** Two faults with
one cause: `markEarned` was a pure function that nobody watched and nobody
asked twice.

**NOBODY TOLD YOU.** The record screen recomputed `markEarned` on render, so
a Raven Banner bought by a twenty-fifth win appeared the next time the player
happened to scroll to the tile — no banner, no sound, no pip, possibly weeks
later. `heraldMarks(seen, facts)` now owns the difference: it returns what is
newly earned and the record to keep, and the record is device-local because
it records what a player has been TOLD, not what he owns.

Two things it deliberately does NOT do. It never announces a `free` mark —
four of them are yours on the first frame, and "unlocked: Shield Boss" as a
new player's first ever notification is noise. And a profile with no record
kept PRIMES rather than announces: every existing save already satisfies
half the rules, and nine banners at once teaches a player to dismiss the
banner without reading it. The picker's line covers what priming swallows.

**AND THEN IT FORGOT.** The picker's own comment said it: *"A locked tile
shows what wins it instead of its name — the hint is the whole of what a
locked tile has to say."* So the reason existed only while the mark was out
of reach, and the moment it was earned the tile showed its name and the
reason was gone. `markWon(mark)` is the same rule in the past tense — one
rule, two readers, and marktest holds them to the same threshold and forbids
either from reading like the other.

**THE PROVENANCE WAS IN A `title` ATTRIBUTE.** Every mark's find — the
Gotland stone, the York amulet, the Chronicle's raven — sat in a hover
tooltip. On the phone this game is aimed at, that is not reachable by any
gesture. It is now a line under the grid, and pressing a mark opens it.

**LOCKED TILES WERE `disabled`,** which is why the question could not be
asked at all: the tile a player most wants to interrogate was the one that
did nothing. They are pressable now and still unpickable — `pickMark`
re-checks the rule at press time and always did, "the rule module is the
law, the button is furniture".

The banner lasts 3.2 seconds and a player mid-fight never sees it, so the
durable half is an amber pip on the tile that waits on the record screen
until the tile is pressed. Reading the line is the acknowledgement.

marktest **38/38, from 25/25** — thirteen new claims, all eight of the new
behavioural ones shown red first (four against the page as it was before the
change, four by mutation).

---

## LANDSCAPE WAS PINNED OFF, AND BEHIND THE PIN IT WAS BROKEN — 29 Aug 2026

**"This game for mobile should be supported to be played both landscape &
portrait hand held positions."**

`manifest.ts` said `orientation: "portrait"` and gave a reason: *"the touch
controls are laid out for a thumb either side of a portrait screen; a
landscape rotation mid-match puts the attack buttons under the player's
palms."* The second half of that sentence is not true — the attack cluster is
corner-anchored and mirrors with handedness, so it lands under the thumbs
either way round. The first half was true, and the pin is what kept it true:
**every mobile gate in this tree ran portrait**, so the other rotation had
never been measured by anything.

`touchtest` takes `--w`/`--h` and always has. Asked at 844x390 it did not
report a layout blemish — **it could not finish the run**:

```
locator.tap: Timeout 90000ms exceeded.
  - waiting for getByLabel('Switch to left-handed controls')
  - <button data-snd="back" class="... mt-[14.25rem] ..."> intercepts pointer events
```

A left-handed player in landscape **cannot switch to left-handed controls**.
The First Moot's skip button is drawn on top of it and eats the press. The
same frame had the graphics pad drawn over the ability readout.

**WHY.** Two stacks growing toward each other, both sized for 844 px of
height. Down from the top: END at 76, mute at 124, graphics at 172, skip at
240. Up from the foot: RUN at 24, handedness at 92, the ability readout at
152. On 390 px of height they meet in the middle.

**THE RULE, NOT THE NUDGE.** `src/game/client/fightRail.ts` is one layout
rule with three readers — `page.tsx` owns END and the mute toggle, `GameHud`
owns the graphics pad and the skip, and none of them now knows a pixel
offset. Tall enough for the column: hang it at the offsets it already
shipped with, so **portrait is byte-identical** and the four suites that
measure it are measuring the same layout. Too short: fold the column into
TWO, side by side. A landscape phone has no height and a great deal of
width, and this is the only furniture on that side of the glass that can
spend width instead.

**AND IT FLOWS FROM A MEASUREMENT.** Above the rail is the timer column,
whose height is a function of the mode — a Burh adds a WAVE row, a bench adds
another. Reserving the worst case would push the rail into the thumb cluster
on exactly the screens this fixes; computing the worst case in the rail would
be a second copy of GameHud's render conditions, which is PROCESS.md's third
failure mode by name. A `ResizeObserver` on the real element publishes its
real foot, and everything flows below whatever that is.

The First Moot's beat line went with them: `bottom-[352px]` is above the
cluster on a tall screen and 38 px from the TOP of a 390 px one, straight
through the timer column.

**touchtest at 844x390: 32/32, from a run that could not complete.** The
graphics pad now sits 67–115 of 390 and 275 px up from the foot; the thumb
band's nearest control went from 170 px to 231. Portrait re-run at 390x844
to prove the tall branch unchanged.

The manifest is `orientation: "any"`.

Portrait came back **31/32 on the first re-run**, and the red was the stage
rather than the rail: the lock claim's own `exercised()` guard refuses to
pass a case that did not happen, and the harness's strafe reached 1.77 rad/s
against its 1.80 bar after all fourteen draws — the stochastic manoeuvre the
file already logs ("a red that indicts the STAGE, not the cap"). The same
claim passed at 2.97 rad/s in landscape on the same build. Re-run: **32/32,
with the strafe at 1.98.** Recorded rather than waved away, because a claim
that goes red for a reason has to be shown to be that reason.

---

## THE CLOAK IN FRONT OF THE ARM — FOUND, MEASURED, PHOTOGRAPHED, NOT FIXED — 29 Aug 2026

> **SUPERSEDED THE SAME DAY — IT IS FIXED.** Read this section for the two
> attempts that failed and why, which is the useful part; do NOT read the
> heading as the state of the tree. The defect was closed hours later by
> `cloakLead()` (see *THE CLOAK CAME ROUND THE FRONT OF HIM — FIXED*, below):
> the fault was never the cloak's WIDTH, which is what both attempts here
> narrowed and what turned §8 red both times — it was the leading edge's
> AZIMUTH reaching round the front of the chest. This banner is here because a
> reader grepping "NOT FIXED" would otherwise find a heading that outlived its
> own truth by one afternoon, and the file is append-only.


**"Cloak sticks out of front of shoulder/arm."** The owner is right. The defect
is real, it is on every kit in the shop, and **it is still there.** This entry
is what was learned, what was tried, and why nothing shipped.

**IT WAS NEVER MEASURED.** `wearmeasure` §8 asks how far the garment under the
cloak comes through its lining. §9 asks how near the carried weapon gets to the
cloth. Sixteen kits x four cuts, measured against everything a man wears
**except the two limbs hanging beside it.** A gate green because the case is
absent is not a gate.

**§11 IS THE INSTRUMENT, AND ITS FIRST VERSION ASKED THE WRONG QUESTION** —
the sixth time in this file. It rasterised the man from the front and counted
cells where cloth won the depth test over an arm. All sixteen kits failed,
which should have been the tell: a cloak hangs BEHIND a man and his arms swing
back into it. The rest carry alone puts the weapon arm 165 mm behind the
torso's centre, which is the cloak's own depth. The ruler was counting a
garment being worn. What the photograph shows is narrower and has no innocent
reading: cloth **outboard of the arm AND forward of it**. Outboard-and-behind
is the cape. Forward-and-inboard is the brooch. Only both at once is a wing.

That version did name the culprit before it was retired: **every offending
vertex in the shop was weighted to bone 10 — the YOKE.** Not the hem, not the
wings. The cloak's top edge.

**THE PICTURES** are `art/shots/cloakfront/` (untracked). The berserker in the
Blood Red at 40° shows a thin wedge of cloth standing out of the top of his
shoulder and crossing in front of the arm. It is exactly the owner's sentence.

**TWO FIXES WERE TRIED AND BOTH BROKE §8.**

1. Fading the flare out past the shoulder line. Barely moved §11 — because
   flare is distributed by `grow`, which is near zero at the top edge, and the
   fault is AT the top edge. Turned §8 red on warden/gold (10.7 mm).
2. Drawing the leading corner in to the brooch's own x past the shoulder. The
   photographs are unambiguous — the wedge goes, the gold cloak's front comes
   off the mail sleeve — and §11's front-view worst fell from 216 mm to 123.
   **It turned §8 red on five kits, up to 65.6 mm of garment through the
   lining.**

**AND THAT IS THE FINDING.** Both attempts NARROWED the cloak, and §8 turning
red both times says the same thing twice: **the cloak is cut with no slack over
what it covers.** Its radius is the torso's plus the wear stack, and any fix
that takes width away anywhere puts the mantle, the ruff or the pelt through
the lining. So the fix is not a narrower cloak. It is an envelope that knows
the arms exist — a per-azimuth profile that dips through the quadrant the limb
hangs in while still clearing the garment beneath — and that quadrant is
exactly where the huscarl's mantle and the berserker's ruff force the width.
That is a garment redesign, not a constant.

**NOTHING WAS SHIPPED, DELIBERATELY.** A change that turns a green gate red to
make a picture better is a trade, not a fix, and it is not mine to make
quietly.

**WHAT DID SHIP** is §11: a ruler for a quantity nobody was measuring. It
REPORTS rather than gates, and the reason is written above it — the berserker
reads 80 mm and is entitled to, because his fur ruff stands 80 mm off the spine
and the cloak is cut to clear it. A bar low enough to catch the huscarl's wing
condemns him for owning a coat. What §11 DOES gate is the floor: every kit
reaching the ruler with cloth, two arms and a shoulder band, and **the depth
sign pointing forward** — shown red by inverting it, which is the mistake its
own first version made.

Measured now, on the shipped tree: huscarl/red **37.7 mm** proud, berserker/
brown **80.1**, berserker/gold **49.3**; the other thirteen under 12.

---

## THE FIRST MOOT IS A JOURNEY NOW, NOT A LIST — 29 Aug 2026

**"The tutorial should be a full phased cinematic journey, with pause points,
teaching all the controls, and they must complete each task before advancing.
We don't want them just dying constantly while trying to figure it out. Then
it should take you to the WAR ROOM to choose your kingdom rather than muster
training, then a tour of the armoury, the sage, training, find a fight, create
a match."**

Five things were asked for and five were missing. Each is now a mechanism
rather than a line of copy.

**PHASES, NOT A LIST.** The rite was five beats in a row — move, strike,
guard, dodge, power — with no shape and no rest. It is four phases now: THE
FIELD (look, move, sprint), THE BLADE (strike, aim, heavy), THE SHIELD (guard,
dodge, shove), THE DEED (the power).

**ALL THE CONTROLS.** Five of the eleven things a man actually does were
untaught: where to LOOK, how to RUN, how to NAME a cut, how to throw a HEAVY,
how to SHOVE. Ten beats now, and every one is still read off the SERVER's
snapshot — `swingHeavy` off the wire rather than inferred from a timer, two
distinct `attackDir`s for the cut, and two new ledgers (`turned`, `dirs`) for
the things one snapshot cannot know. The view ledger wraps: a man turning
through north hands back a rotation that jumped 2π, and unwrapped that spends
the whole arc on one frame of arithmetic. Shown red.

**PAUSE POINTS, AND THEY ARE REAL HOLDS.** Each phase opens on a card — its
name, two lines of what the next stretch is for, and I AM READY. `note()`
retires nothing while a card is up, so a player who spends four seconds doing
exactly what the next beat wants gets no credit and nothing scrolls past him
unread. The claim that proves it is fed *the exact act the next beat is waiting
for* — a pause claim fed something the beat would refuse anyway goes green
whether the hold exists or not, and the first draft of it did.

**AND NOBODY SWINGS AT HIM WHILE HE IS LEARNING.** This is the owner's
sentence about dying, and it needed the engine. The ring already opened empty
and the foe already walked in (backlog 8.5) — but he walked in fighting, so a
new arrival learning which thumb names a cut was learning it under a recruit's
blows. `add_bot { hold: true }` now walks him in as a **PELL**: `botThink`
returns at once, so he stands — no stepping, no circling, no feint. Half a
fighter is a worse lesson than a post, and a post is what the card promises
("He will not strike back"). `arm_bots` drops the hold, sent once, when
`firstmoot.mjs` says the rite has reached THE SHIELD — the phase whose whole
subject is a blow arriving. **The client decides, the engine enforces:** a
hold a client could forget to ask for is a hold that fails open on the one
player it exists for.

**IT ENDS IN THE WAR ROOM.** The handoff to `/factions?oath=first` existed but
fired when the player LEFT the fight — so the journey's last step was a menu
he had to find, and a man who kept playing the solo ring never reached it at
all. It fires on the rite's own finish now.

**AND THEN THE HALL.** `src/game/tour.mjs` + `TourGuide`: five doors, ringed
one at a time, in the order the owner named them. **"The sage" is the SAGA** —
there is no sage in this game and never has been; the mini-nav's third door is
"Saga · profile", his record. Written down rather than guessed at silently.

The ring is the button's **own measured rect**, re-read on resize and scroll,
and a stop whose control is not on the glass is stepped over rather than drawn
at the origin. A tour with its own idea of the layout points at the wrong
corner the first time a button moves — and this repo has just spent a day on
that exact class of fault. It is offered ONCE and only to a device the rite
marked due: a stranger, a veteran and a garbled record all get nothing,
because a tutorial that ambushes a veteran is a tutorial.

**THE CARD WAS PROVEN ON REAL GLASS, not only in the module.** Both browser
suites drive solo fights, which is exactly where the rite runs, so both now
write the graduate's record before load — and one claim names that, because a
key that drifts would put a full-screen card over every assertion below it
with no clue why. Run once with that record taken away, the claim comes back:
*"the First Moot's pause card is up — the graduate's record did not take, and
every claim below is about a card."* That red IS the browser proof: a brand-new
player lands on the card, and I AM READY is on it.

**moottest 41/41 (from 25/25), tourtest 22/22 (new), protocoltest 81/81,
wartest 82/82, fighttest 23/23, burhtest 24/24, touchtest 33/33, playtest
38/38.** Every new behavioural claim
shown red first — the wrap, the hold, the arming, the two-direction cut, and
tourtest's three wiring claims against the page before it was wired.

---

## THE CLOAK CAME ROUND THE FRONT OF HIM — FIXED — 29 Aug 2026

The owner reported this twice. The second time he sent the picture with the
spot circled: a hard-edged tab of cloak cloth standing on the FRONT of a mail
shoulder, on the armoury's own SHOULDERS framing. **That circle is what solved
it**, because it named the view — and `tools/cloakshoulder.mjs` now takes that
view on demand, for four classes and three bearings, which nothing did before.
`art/cloakshoulder/before-*.png` at three times size is the defect on every
class in the shop.

**IT WAS THE LEADING EDGE'S AZIMUTH, AND NOTHING ELSE.** Every cut takes `a0`
well past the shoulder line — the Gilded to **144° from the spine, 54° round
the front of him** — and at those bearings the cloth is forward of the chest,
outside the mail, and facing the camera. The four cuts were competing on how
far round a man's breast they could reach. `cloakLead()` compresses the excess
to an eighth: 101/112/122/144° becomes 91/93/94/97°, the ORDER kept, `a1` and
the whole of the back untouched.

**THE BROOCH FOLLOWED IT FOR FREE.** The clasp block seats the pin at
`uPin = 0.07` ALONG the sweep rather than at a remembered point, so the brooch
walked from the front of the chest to the point of the shoulder — where a cloak
brooch of the period is found. One rule, two readers: `cloakLead` is a function
because the clasp must ask the same question the sweep does.

**THIS IS THE THIRD FIX TRIED AND THE ONLY ONE THAT COULD SHIP,** and the two
failures are the useful part of the record. Both narrowed the cloak and both
turned §8 red, up to 65.6 mm of garment through the lining:

1. Fading the flare past the shoulder. Barely moved anything — flare is near
   zero at the top edge and the fault was AT the top edge.
2. Pinning the corner to the body's own superellipse, read from the `wear()`
   registry with the frame offsets reconciled. This one **worked** — §8 green,
   the tab gone — and the capture killed it anyway: the cloak came back as a
   red band down the ribs like a tabard, because a brooch pins one point and I
   had pinned a seam. Fading the pin down the drop fixed the band and left a
   larger red wedge on the chest than the tab it replaced.

The lesson is one line: **the standoff is not air.** The cloak's 55 mm is
paying for the difference between its ellipse and the body's superellipse,
which is boxier at the front — so no fix that takes width away can survive §8.
Restricting the AZIMUTH takes no width at all: the sweep spans a sub-range of
bearings it already spanned, so every sample sits where it already sat and a
minimum over a subset cannot be lower than the minimum over the whole. §8
cannot break on it, by argument and then by measurement.

**THE RULER TOOK THREE TRIES TOO,** which puts this file's count of
wrong-quantity rulers at eight. Versions one and two rasterised him from the
front and counted cells where cloth won the depth test — over the arm, then
over the torso — and both over-claimed for the same structural reason: **a
garment worn outside a man shares the cells at his outline, because that is
what an outline is.** Version two failed the berserker's Gilded cloak at 60 mm
on a frame with no cloth anywhere near his chest (`art/shots/cloakcheck/`), and
no inset wide enough to spare his fur ruff was narrow enough to catch the tab.

The question that works has no cells in it: **per height row, how far forward
does the cloth reach against how far forward the man reaches?** A cloak hangs
off a back, so the frontmost cloth at a height belongs behind the frontmost
part of him. One comparison of two maxima; an outline cannot confuse it.

**Measured: 9 of 16 kits fail before, up to 53.9 mm. 0 of 16 after.** The
warden with the Blood Red — the kit in the owner's photograph — reads 9.9 mm
before and 0.0 after. wearmeasure: all eleven sections PASS.

**PHOTOGRAPHED ON WHAT SHIPS.** The before/after pair was first taken at a
looser compression; the captures were retaken at the shipped value so the
picture in the ledger is the picture in the build. `before-weard-front.png` has
the red tab on the shoulder plate; `shipped-weard-front.png` has nothing on it.
cosmetictest **19/19** — the cloak's silhouette still reads as four garments
through the suite that exists to prove cosmetics differ.

**EVERY APPEARANCE GATE, run against this.** wearmeasure 11/11 sections,
cosmetictest 19/19, wearsweep 54/54, and helmclash byte-identical to the
baseline `docs/HANDOVER.md` records — LAYERS 19 / FLESH 24 / WRAP 6 / CREST 8 /
PELT 74 / SEAM 11, before and after. That suite is a comparison instrument
rather than a gate and its red is its documented standing state; the point of
running it here is that the cloak moved NOTHING in it.

**WHAT IT COSTS, plainly.** The four cuts used to differ by 43° in how far
round the front they reached and now differ by six. The order survives, `a1`
and the back are untouched, and length, hem, flare and fold are untouched. It
was a distinction bought with cloth on a man's chest.

---

## THE ARM-RING WAS FLOATING, AND NOTHING COULD HAVE SEEN IT — 29 Aug 2026

Backlog 8.1. The owner: *"Armour design needs rework on all class types as some
have defects shown in SS"* — a disc standing clear of an upper arm.

**THE SWEEP HE ORDERED, DONE.** Four classes in his own kit (crowned helm,
gold finish), photographed and looked at: `art/shots/fitsweep/`. Three are
clean. The berserker's brass arm-rings are the defect, and at five times size
(`/tmp` crops, reproduced in `art/shots/fitfix/`) the ring's left edge visibly
projects past the arm's own silhouette with daylight behind it.

**WHY.** Two lines:

```js
p.add(ring(rSh * 1.02, 0.011, 5, 12), brass, xf(0, -0.14, ...));
p.add(ring(rSh * 0.96, 0.009, 5, 12), brass, xf(0, -0.20, ...));
```

`rSh` is the **shoulder's** radius and those heights are 140 and 200 mm DOWN a
tapering arm — the flesh is at `rSh * 0.95` and less by then. Both rings were
cut for a shoulder and worn on a bicep. Worse, they were **circles on an
ellipse** (`hd` runs 4% wider than `hw` through that stretch), so each stood
proud at the flanks and sank at the front, which is what breaks a silhouette.

**THE FIX WAS TWENTY LINES BELOW THEM THE WHOLE TIME.** The bracer's buckles
ride `bracerC`, a carrier off the bracer's own sweep, and its comment names
this exact fault: *"so the buckles that lace it ride the taper instead of
standing at the ONE height where `rWr * 1.36` was true."* The rings now ask the
arm's own stations where the limb is, take its ellipse through the transform's
scale, and sit 2 mm off the skin.

**AND HERE IS THE PART THAT MATTERS.** They were added with a bare `p.add`, so
they were never fittings as far as `wearmeasure` §5 was concerned: **148 pieces
measured, every one seated, and the defect in none of them.** They go through
`fitAdd` now — 148 → **168**.

**§5 STILL COULD NOT HAVE CAUGHT THEM, EVEN REGISTERED, and that is a second
finding.** Registered with their old geometry it read **0.9 mm** and passed:
§5 takes a fitting's CLOSEST point, and a ring cut too big still touches on its
narrow axis. That is §8's own plank lesson — *"a sheet touches at its middle
while its corners hang a hand's width off"* — never applied to §5.

So `BodyFit.gripMm` is new: bin a piece's vertices by azimuth about the carrier,
take the nearest approach in each bin, and report the SPREAD. A band that grips
sits at the same depth at every bearing. **Asked of the MESH, not of a name** —
only a piece occupying most of the azimuth circle is a band, so a stud is never
asked and a clasp's boss standing on its own disc is never condemned.

Two mistakes in building it, both written down: the first version took the
WORST bin rather than the spread, which is clamped to zero because a band's
inner face is below the skin by its own tube radius all the way round; and it
binned into 24 slots while `ring()` is tessellated with 12, a threshold no ring
in the shop can reach. Both printed 0.0 on the very ring the owner
photographed.

**Measured: 2.8 mm as he photographed them, 1.6 mm cut to the arm.** The 1.6 is
not tessellation — raising the ring from 12 segments to 16 did not move it (it
is a rounder band now regardless, which is the right look at armoury zoom). It
is the **limb's own taper across the ring's thickness**: an arm narrows through
the 22 mm a tube spans and its ellipse changes ratio as it goes, so no flat band
sits at one depth all the way round a cone. **A bar between 1.6 and 2.8 would be
a number chosen to make today's tree pass**, so grip is REPORTED and flagged
past 3 mm, and not gated.

**WHAT IS GATED IS THE FLOOR, because the floor is the fault that actually hid
this for a month:** every class must present at least ten distinct fitting tags,
and the two limb bands must be among them by name. Shown red by un-registering
the rings exactly as they shipped — *"no arm-ring registered — it is on the man
but not in this ruler, which is how the last one was missed."*

wearmeasure: all eleven sections PASS, 168 fittings.

---

## THE 44 px FLOOR WAS HELD ON ONE PLATFORM AND ONE SCREEN — 29 Aug 2026

Backlog 5.10's own words: *"44 px floor on every control INCLUDING DESKTOP"*.
`touchtest` has held the fight's glass to it since 24 August. The menus never
were: `uishots` walks every screen there is and its only size audit ran on the
**lobby**, at both widths, and **printed** — it could not fail. A law kept on
one of two platforms and one of a dozen screens is a law nobody is keeping.

The audit rides `shot()` now, so it reaches all **36** screens the sweep walks
at both widths and cannot fall behind the capture list. Measured on the SMALLER
side of the box, which is the side a thumb misses.

**IT FOUND EXACTLY TWO BREACHES IN THE WHOLE GAME**, and both were on the one
screen that had never been in the sweep at all — the war map: Kent at 46x43 and
Fib at 84x34 on a phone. The places are small because the places are small.

**AND THEN THE RULER TURNED OUT TO BE MEASURING THE WRONG THING.**
`getBoundingClientRect` on an SVG path **excludes its stroke** — probed and
confirmed: Fib reports 84x34 while its own bbox is 161x65 and a press 20 px
below its centre lands on Fib. So a box rule under-reports an SVG target and
would condemn one a thumb can hit. Map geometry is asked the question a thumb
asks instead: is there ANY point on the shape from which a half-floor press
stays on it?

Three cuts of that question were wrong before one was right, all recorded in
the tool:

* the **box centre** as the anchor — an irregular polygon's box centre is
  usually not inside the polygon and on a map is usually inside a neighbour, so
  it reported Mercia at 130x140 as unreachable;
* the **first grid point that hits** as the anchor — a map tiles with no gaps,
  so an anchor near a border fails while the middle of the same territory is
  fine;
* **off-screen elements** judged at all — `elementFromPoint` answers for the
  viewport, and the sweep scrolls past the map to reach the oath, so everything
  on the map read as pressable by nothing.

**AND THE FIRST GREEN SHEET WAS GREEN BECAUSE THE CASE WAS ABSENT.** With the
off-screen skip in place the map was simply skipped and the audit passed. The
sweep now photographs and audits the map **in view** first.

**THE FIX THAT SHIPPED** is a transparent `vector-effect: non-scaling-stroke`
hit stroke on the territory paths: 14 px of target in SCREEN pixels at any zoom,
borders overlapping 7 px a side, which is the ordinary trade for map targets and
a better failure than a place a thumb cannot land on. Measured both ways on the
real page: **six territories unreachable without it, three with** (Wessex, Fib
and Circinn rescued).

**WHAT DID NOT WORK, so nobody spends the afternoon on it again:** a zero-radius
circle carrying a 44 px non-scaling stroke at each territory's own label anchor.
It paints as a perfect 44 px disc and Chromium hit-tests it against the
UNSCALED geometry — Kent, Kernow and Sudreyjar were exactly as unreachable with
the circles as without them. Reverted; the finding is in the CSS beside the
place it would have gone.

**Kent, Kernow and Sudreyjar remain** — a corner, a peninsula and a scatter of
islands. They are REPORTED by name on every run and not gated, because closing
them wants a DOM overlay and the kingdom rows below the map are the primary
selector, all of which clear the floor. The backlog carries it with the
instrument that found it.

**uishots: PASS, the 44 px floor on 36 screens at both widths** — and shown
red by raising the floor to 60, which names the sound toggle at 44x44, the
round pickers at 133x45 and the invite button at 533x52 across the lobby at
both widths. The gate fires.

---

## A GATE THAT GREEN-LIT A HERE RUNNING AWAY, AND A RULER THAT BLAMED THE WRONG CAUSE — 31 Aug 2026

Two findings from a thirteen-item audit of every remaining OPEN ledger section
and standing gate deferral, each verified independently and each shown red.

### 1. `burhtest`: "the here closes on the defenders" could not fail

The claim compared two DIFFERENT measurements:

```js
const before = Math.min(...bots.map((b) => Math.hypot(b.position.x, b.position.z)));      // from the ORIGIN
const after  = Math.min(...bots.map((b) => Math.hypot(b.x - humanAt.x, b.z - humanAt.z))); // from the DEFENDER
check("the here closes on the defenders", after < before + 1, ...);
```

On this fixture that is `after < 5.87` against a here **already standing at
1.07 m** — 4.8 m of slack before a tick is taken. Two controls both PASS it:
raiders **pinned in place**, and raiders driven **bodily away** from the
defender for the whole two seconds. A gate that green-lights a here running
away is not a gate.

**And the fixture could not measure hunting either.** Both raiders are inside
1.5 m when the claim runs — they are fighting, not approaching, and over two
seconds they drift OUT to 1.8 as they circle. Hunting is not observable from
contact, whatever you compare.

So: the same measurement at both ends (every raider against whichever defender
is nearest HIM), the FURTHEST such raider graded rather than the nearest — one
man in contact must not answer for the whole here — and the garrison walked to
one side of the ring first so there is a gap to close. **16.8 m → 5.3 m in two
seconds.** The frozen-raider control now FAILS it: 17.0 → 16.6.

One repair was wrong on the way and is recorded: moving ONE defender across the
ring went red, because there are two and the here quite correctly walked to the
other. A gate is not improved by breaking its stage.

### 2. `wearmeasure` §5 GRIP: the note blamed taper, and taper was 0.09 mm of it

Yesterday's note said the residual 1.6 mm was *"the LIMB'S OWN TAPER across the
ring's thickness"* and concluded no principled bar existed between 1.6 and 2.8.
**Both halves were false, and this corrects them rather than quietly rewriting.**
Freezing the carrier at the ring's own mid-height — every scrap of taper gone —
leaves the number at **1.60**. Taper is 0.09 mm of it. The bin minima run
`-7.21 -7.98 -8.56 -8.81 -8.56 -7.98` and repeat: **twice per revolution**,
which is an ellipse-ratio signature, not a cone.

The real cause was a live bug in yesterday's own fix. `xf` builds
`Matrix4.compose(T, R, S)`, so scale is applied in the geometry's OWN frame;
`TorusGeometry` lies in local XY with its axis on local Z, and the π/2 about X
sends local **Y** to world z. The fix scaled local Z — which after that rotation
is VERTICAL. The band was left perfectly circular round the limb and stretched
up and down instead.

Axes swapped: the shipped tree reads **0.4 mm at worst on any kit**, against
2.8 for the rings as the owner photographed them. **So GRIP is gated at 1.5** —
a band's correct grip is zero, the residual is 0.4, the defect is 2.8; the bar
sits in the middle of a sevenfold separation and today's tree clears it by 1.1
mm. Shown red by putting one token back.

burhtest 24/24, wearmeasure eleven sections PASS.

---

## ROW 0 IS DONE, AND THE HELMET GAP IS CONTESTED SPACE — 31 Aug 2026

### The two flaky gates are deterministic. Ten green runs each.

Backlog's row 0 — *"it displaced everything"* — asked for ten consecutive green
runs of `touchtest` and `playtest`. **touchtest 10/10. playtest 10/10.** Three
causes, all of them the harness rather than the game:

**1. `playtest`'s mouse-look sampled a stopwatch.** `waitForTimeout(300)` then
assert. Generous on an idle box, not generous while one is building, and the
failure it produces is a claim saying the mouse does not turn the camera — a lie
about the product told by a clock. It waits on the rotation ARRIVING now, with a
long ceiling; a turn that never lands still leaves the sample unchanged and
still fails, so the teeth are kept.

**2. `touchtest`'s lock claim waited for its own case instead of making it** —
and the instrument that proves it now prints on every run:

```
range 1.37-3.30 m; he covered 1.87 u/s while committed;
so the tightest the bearing could be asked to sweep was 1.36 rad/s (cap 1.8)
```

Demand is speed over range. A committed man is damped under 2 u/s and collision
will not let you inside about 1.3 m, so **the strafe tops out at 1.36 rad/s
against a 1.8 cap**: the body always keeps up, and the only reason the claim ever
went green was the recruit's own motion happening to swing the bearing. Fourteen
draws still ended red at 1.70. Now the approach is walked rather than waited for,
the geometry is printed so a red says which of speed or range failed, and the
**mid-blow target switch is restored** — the manoeuvre this section's own header
always described, and a lever the harness pulls. The demand-rate loop already
skips frames across a lock change, so it cannot inflate the rate it grades.

**3. A second flaky claim the sweep found:** the acceptance case checked
`readyToSwing()` once and then spent 400 ms getting up to speed with three
recruits swinging at him — staggered or under 45 stamina by the time the flick
went out, the server refused the blow and the claim reported that the scheme
does not survive a strafe. Re-asked after the run-up, four draws.

**And one measurement was too thin to hold its own tolerance.** The turn rate
was sampled over ~100 ms, where a single bunched packet moves it 40% — more than
the 30% clock tolerance underneath it — so the claim could fail on arithmetic
while the server obeyed the cap exactly. It samples over 200 ms now: same cap,
same tolerance, a window where jitter is a fifth of the signal.

### `helmclash`'s baseline is held by code now, and it caught a regression at once

The instrument has been six-of-six red for weeks — its honest standing state.
`docs/HANDOVER.md` recorded the counts and asked a reader to "compare vs
baseline". **Nothing compared.** The counts are in the tool now and a section
that gets WORSE fails the run; a section that gets better is reported as a
baseline to tighten, so the numbers travel one way. The exit code carries the
BASELINE question rather than the red question, because an exit code that says
"something is red" on every run is a warning light wired permanently on.

Shown both ways: tightened to `PELT 70` it reports *"REGRESSED: PELT 70 -> 74"*
and exits 1; at the true baseline it reports **BASELINE HELD** and exits 0.

### The helmet gap: fixed, measured, and REVERTED, because it is contested space

The owner's first helmet complaint — *"there are large gaps in the sides of the
helmets"* — is a real, still-open defect, and `characters.ts` has carried its own
confession for weeks: a short guard stops at 1.10 rad and the coif's rim opened
at 1.46, leaving 0.36 rad of head with no metal on it, *"not an ear opening —
the place two plates failed to meet."*

Deriving the rim from the guard through one definition **works**: five reported
windows become three, the huscarl's Spectacle and Boar-Crest close outright and
the Crowned halves, 6.0% → 3.3%, with all eleven wearmeasure sections still PASS.

**And it costs more than it buys, measured.** helmclash: LAYERS 19 → 13 and
SEAM 11 → 10 better, but **WRAP 6 → 13 and PELT 74 → 91 worse** — net 17
combinations. Confining the derivation to coifed classes changed nothing, and
the new failures are the **hooded** huscarl. That is the finding worth keeping:

> **The gap is where the huscarl's hair comes out.** Filling it with mail
> displaces the hair, which is why the two previous attempts at this constant
> were also reverted — they hit the same wall from the plate's side. It is not
> an oversight to be tidied by moving a number; it is contested space, and
> closing it properly is the head-stack reshape the ledger already priced.

Reverted, and this is the third attempt recorded rather than the third attempt
forgotten. **The new helmclash baseline gate is what makes the next attempt
cheap to judge** — it would have caught this one without anybody remembering six
numbers.

---

## THE COMMA CULL TOOK PAID HAIR, AND THE CENSUS THAT EXISTS TO CATCH THAT WAS NOT RUN — 31 Aug 2026

An adversarial audit flagged it; `tools/rungcensus.mjs` settles it. Recorded
against the commit BEFORE the 28 Aug comma fix (`2451e75~1`) and held to the
tree today:

```
[census] 167 scope-readings identical, 167 gained, 306 LOST, 0 rungs gone
[census] FAIL: the bar is zero paid rungs losing a component or a triangle
```

Per cell, across the whole shop:

```
huscarl|iron|default      head  -11   -880    FAIL
huscarl|iron|hair=long    head  -15  -1200    FAIL
huscarl|iron|hair=braids  head  -15  -1200    FAIL
huscarl|nasal|…           head  -11   -880    FAIL      (and ridge, and the rest)
```

**`hair=long` and `hair=braids` are PAID RUNGS**, and they lost fifteen
components and twelve hundred triangles apiece under every open helm.

This is the exact failure `rungcensus` was built for. Its own header says so:
*"Three separate rounds before that tried to pass a gate by DELETING content —
three paid beards in one, 7680 triangles of hair in another, two hairstyles"* —
and `characters.ts` carries a long comment arguing against *"a paid hairstyle
being deleted to close a gate."* The 28 Aug fix did it a fourth time, and the
tool that would have said so **was never run against the change**.

**THE FIX IS NOT SIMPLY WRONG, AND IT IS NOT SIMPLY RIGHT.** The coils it
deletes are the ones standing on bare cheek with no metal over them — the
owner's reported defect, genuinely closed on the warden. But the file's own
principle is that a coil with no ceiling should be RE-ROUTED or tucked, not
culled: deleting it closes the picture by taking the cosmetic away. That is a
trade nobody chose, because nobody measured it.

**AND THE CULL DOES NOT EVEN REACH THE CLASS IT WAS AIMED AT.** The same audit
proved, at the mesh, that the gate is a no-op on the huscarl: `coifed` sends
`hairCeil` down its coif branch, which returns a ceiling computed from an
ANALYTIC mail surface disagreeing with the coif's real geometry by 0.16-0.50
rad, so `room` is finite over az 74.5-110 deg and the coil survives at near
full size. Gate on versus gate off, huscarl/ridge/short seed 13: **identical to
the decimal**, detached-and-proud islands 9 → 9, against warden 17 → 2.

So on the coifed man it costs paid hair and closes nothing. Both halves are on
the list as 5.13 and 5.14, with these numbers.

---

## THE CULL TOOK THE NAPE FALL AS WELL AS THE COMMAS, AND ONLY ONE OF THOSE WAS THE FIX — 31 Aug 2026

**CORRECTING MY OWN ENTRY OF THIS MORNING.** The section above says the comma
cull "took paid hair" and reads as though every triangle it removed was wrongly
removed. That is not what the geometry says, and the difference matters because
one half is the fix working and the other half is a real defect.

The census could not tell them apart — its bar is *zero* loss, so it fails
identically whether the thing removed was a defect or a cosmetic. The
discriminating measurement is WHERE the culled coils are ROOTED, and the first
attempt at that got it wrong too: I binned the resulting VERTICES, but a coil
rooted at 100° reaches to 135°, so the bins were of the wrong quantity. Binned
by root bearing, on warden / iron / hair=long, the forty-four coils the cull
takes fall into two populations that do not touch:

```
30-45:4  45-60:2  60-75:9  75-90:2  90-105:1  105-120:11
        (nothing at all between 120 and 135)
135-150:6  150-165:6  165-180:3
```

The forward twenty-nine are the **commas** — bare cheek and temple with no metal
overhead, the owner's round-ten report, and deleting them is the fix. The rear
fifteen are the **NAPE FALL**, which is what long hair is FOR. There is no rim
behind a man's head and there never was, so "nothing overhead" is the normal
condition back there rather than the fault — and the cull was reading it as one.

`HAIR_NAPE_FREE` is 2.09 rad, 120°, **the empty bin between the two
populations**: read off the geometry rather than chosen.

**Measured, shop-wide, head-pivot components:**

```
before the 28 Aug cull   27609
after it                 22887   (-4722)
after this fix           24282   (-3327 from baseline, 1395 restored)
```

The 1395 restored are the falls. The 3327 still absent are the commas, which is
the fix doing its job — and no census bar of zero can ever say so, which is why
this file now carries a recorded baseline (`docs/census-baseline.json`) taken on
the CORRECTED tree. Future changes are held to a tree that is right, instead of
to one that predates a fix.

**No regression anywhere:** helmclash **exactly** 19/24/6/8/74/11, BASELINE
HELD, exit 0 — the restored falls clash with nothing. wearmeasure eleven
sections PASS, wearsweep 54/54.

**5.14 is closed. 5.13 is not** — the huscarl's own commas are a separate fault
(his coif branch hands back a ceiling from an analytic surface that disagrees
with the real mail), and this changes nothing about it.

---

## THE HUSCARL'S COMMAS: THE CEILING CLAIMED MAIL THAT IS NOT DRAWN — 31 Aug 2026

Backlog 5.13, found by an adversarial audit that overturned this file's own
"already fixed" verdict, and verified at the mesh: the 28 Aug comma cull was a
**no-op on the huscarl.** Gate on versus gate off, huscarl/ridge/short, seed 13:
**identical to the decimal.** Every other class lost its cheek commas; he kept
all of his.

The cull fires only where `hairCeil` returns an INFINITE room — nothing
overhead. On a coifed man it never did, because of a fudge:

```js
if (coifed && awayFromFace(u) > coifRim(0) - 0.16 && …)
```

`- 0.16` reaches the branch **forward of the rim**, and the coif MESH skips
everything in front of `coifRim(v)`. So over that arc the ceiling was computed
from an ANALYTIC mail surface where the real garment has a hole: `room` came
back finite, the cull never fired, and the commas stood.

This is the failure mode the file names itself, twenty lines above
`shoulderOut`: *"a piece that keeps its own copy of where another piece is will
drift away from it."* The rim is the copy; the fudge was the drift.

With it gone the huscarl loses **six coils per cell** off his bare cheek —
`head -6 / -480 triangles` on 84 cells, all of them his — which is the cull
finally reaching the class it was aimed at.

**And helmclash IMPROVED: PELT 74 → 73**, with the new ratchet asking, in its
own words, *"IMPROVED, so tighten the baseline in this file"*. Tightened to 73.
That is the gate built four commits ago earning its keep on its first
improvement rather than its first regression.

**PARTLY, AND THE REST IS NAMED.** The fudge was 0.16 rad of the disagreement;
`coifRim` opens from 1.46 to 1.80 as it descends, so lower down the analytic
surface still over-claims by up to 0.34 rad more. Closing that wants the
ceiling to read the rim at the coil's own height rather than at `v = 0`, and
the two are not the same parameterisation — a mapping this pass did not risk
against a green tree at the end of a long run. What shipped is the bounded,
measured part.

wearmeasure eleven sections PASS, helmclash BASELINE HELD at the tightened
number, census re-recorded on the corrected tree.

---

## THE FOUR TERRITORIES NO THUMB COULD LAND ON — 31 Aug 2026

Backlog 5.10b, and now closed. The war map's territories are SVG paths, so a
44 px target is whatever geography gives you: a 14 px transparent hit stroke
took the unreachable count from six to three, and a corner, a peninsula and a
scatter of islands survived it. A fourth — Gwynedd — showed on the reported
line at desktop width only.

**NO BOX RULER CAN FIND THEM, and that is the reason this is a named list
rather than a measurement.** `getBBox` and `getBoundingClientRect` both report
the UNCLIPPED ring polygon: Kent's box is 88x82 units, and **Sudreyjar's is
231x483 while its painted land is Man plus a scatter of Hebridean specks**. The
clip is the whole trick the map is drawn with, and the clip is invisible to
every box ruler there is. Only pressing the thing finds them.

Each of the four gets a real DOM button, 44x44 CSS pixels, on the territory's
own label anchor — the point the map already treats as being that place —
positioned through the svg's live `getScreenCTM` so it follows at any zoom, in
either orientation, through a resize and a scroll. Percentages of the viewBox
would be right only while the svg's aspect matched its box, and
`preserveAspectRatio` letterboxes it the moment the column narrows.

**THE PATHS THEY COVER STOP BEING CONTROLS** — `aria-hidden`, no role, no label
— because two controls for one place announce it twice to a screen reader, and
because a fix has to be measurable: leaving them would keep the sweep reporting
a target it cannot press. One `hitLabel` builds the sentence for both, so the
path and the button cannot drift.

**AND THE ROW CANNOT CLOSE BY ABSENCE.** Demoting the paths would silence the
reported line whether the buttons work or whether somebody deletes them, so the
sweep now finds all four **by name**, measures them, and presses each at its
centre and at four points half a floor out.

That claim failed on its first run, correctly, and taught something: Kent and
Kernow came back *"something covers it"* on the phone — the sticky SWEAR bar,
which the map's own CSS comment already warns about. A target under a sticky
bar at one scroll offset is not unreachable; it is a target you scroll to. Each
is scrolled into the clear first, which is what a user does.

**uishots: the reported line is now EMPTY at both widths, every named tight
territory takes a 44 px press, and the floor gate PASSES on 36 screens.**

---

## THREE HELMET DEFECTS ARE ONE PROBLEM: PLATE AND HAIR WANT THE SAME ARCS — 31 Aug 2026

> **THIS SECTION'S DIAGNOSIS WAS WRONG, AND THE CORRECTION IS THE WHOLE FINDING
> — 31 Aug 2026, later the same day.** I wrote below that plate and hair were
> "competing for the same arc" and that "a constant cannot resolve a contention,
> it can only relocate it". There was no contention. **`cheekIn` was moving two
> things and only one of them was on purpose.**
>
> `cheekHemAt` and `deepTop` normalised their ramp over `[cheekIn, cheekOut]` —
> the guard's OWN span. So narrowing the span lowered every azimuth's `t`, and a
> ramp that rises with `t` hangs the hem LOWER everywhere at once. Walking the
> guard 0.56 -> 0.95 dropped the hem **0.117 rad at 1.12 rad**, which is exactly
> where the berserker's war-locks hang. The 19.7 mm of braid was not the hair
> and the guard wanting one arc; it was the guard being made DEEPER by a
> constant I believed only moved its front edge. The tell was in the numbers the
> whole time and I did not read it: the sheet-like Long Mane measured **0.0 mm
> through the same change on every bearing** while the ropes read 19.7. A
> contention over an arc does not care what shape the hair in it is.
>
> Anchoring the ramp to the arc it was tuned on makes the edge a lever again,
> and the edge alone: on the shipped build the two numbers are equal, so the
> separation is a no-op by construction. **0.5, 5.16 and 5.13's remainder are
> CLOSED** at `cheekIn` 0.85 — the face goes 23.4/50.5/53.1% taken to
> 4.6/22.4/24.3%, spread 29.7 -> 19.7, with hair at 0.0 mm through on every
> helm, hair, class and seed and helmclash §5's red-row set byte-identical to
> shipped.
>
> **What survives of the section below is one true sentence and it is not the
> conclusion.** "The head stack has four readers of where a plate is" is right,
> and this bug was a fifth: the hem's own parameterisation. What is wrong is
> reading a fight between two pieces from evidence that only ever showed one
> piece being deformed. **Before calling two things contended, check that the
> lever you pulled moved only the thing you named.**


Three separate rows, three separate attempts this week, three reverts — and
they are not three problems. Each one moves the contention rather than
resolving it, and the numbers now say so together.

### The Wyrm's cheek guard (0.5 / 5.16) — re-measured, attempted, reverted

`facelook --cover` on today's HEAD: **23.4% / 50.5% / 53.1%** of the
lens-facing face taken at 0/-35/+35 deg, **spread 29.7**, 95% of it one
surface, against the Spectacle's 4.2. Raised on 24.3/50.9/53.1 spread 28.8 —
**nothing has moved in a week.** `art/look/wyrm-before.png` shows why the
ledger calls it a billboard: at three-quarter the far guard is a slab across
the cheek and jaw up to the nose.

The hem is NOT the lever and that was already recorded (addend 0.34 → 0.12
moved spread 28.8 → 29.0, inert). The lever is **where the guard starts**.
`cheekIn` for a deep unmasked guard is 0.56 rad, beside the mouth; walking it
back:

```
cheekIn   0deg    -35deg   +35deg   spread
0.56      23.4%   50.5%    53.1%    29.7     (shipped)
0.80      12.8%   34.6%    36.7%    23.9
0.95      12.6%   27.4%    29.3%    16.7     ← parity with the Spectacle at 3/4
1.05      12.6%   23.7%    25.3%    12.7     (a DEEP guard covering less than a short one)
```

At 0.95 the Wyrm takes 27.4/29.3 against the Spectacle's 28.3/28.4 — parity at
three-quarter while leaving more of the face visible from the front, and
`art/look/wyrm-after.png` reads as a helm framing a face instead of swallowing
one.

**AND IT COSTS TWO GATES.** At 0.95: `wearmeasure` §4 goes **29/30** —
*"19.7 mm of braids outside the wyrm on the berserker at 64/-56 deg, 4.95% of
braids outside what covers it"* against a 0.8% bar — and §10's windows go 5 →
6. At 0.80 the braids still fail (1.37%) **and the windows go to 7, worse than
shipped.** The guard's width is load-bearing: it is covering the berserker's
braids.

### The same sentence, three times

* **5.15, the flank gap.** Deriving the coif's rim from the guard closes the
  owner's *"large gaps in the sides of the helmets"* — five windows to three —
  and moves helmclash WRAP 6 → 13 and PELT 74 → 91 on the hooded huscarl.
  **The gap is where his hair comes out.**
* **5.13's remainder.** The coif ceiling still over-claims by up to 0.34 rad
  lower down. Closing it needs the ceiling to read the rim at the coil's own
  height — the plate's parameterisation and the hair's are not the same one.
* **5.16, the Wyrm.** Narrowing the guard frees the face and **exposes the
  braids it was covering.**

Every one is plate and hair competing for the same arc, and every fix so far
has been a constant moved on one side of that competition. That is why three
attempts by three different passes all reverted: **a constant cannot resolve a
contention, it can only relocate it.**

What this wants is one pass over the head stack that gives the plates and the
hair a shared account of who owns which arc at which height — the thing
`maskBot(u)` already does for the one helm in the tier the audit passes. It is
a project, not a tail-end fix, and it should be judged on captures with the
owner's eye on them.

**Reverted. Tree green: wearmeasure eleven sections, §4 back to 30/30, §10 back
to its five reported windows.**


## THE ROPE-GIRTH RULE: A GOOD RULE, MEASURED, AND DROPPED — 31 Aug 2026

Recorded because the reasoning was sound the whole way and the answer was still
no, and because a commit went out on this branch (`d2a2ac0`) describing it as
part of the fix. It is not. **`cheekIn` 0.85 is the shipped value, not 0.90, and
there is no girth rule in the tree.**

**The hypothesis.** `hairFitProbe` read 19.7 mm of braid outside the walked-in
Wyrm guard. The file already names the mechanism, over the Sutton Hoo's `tuck`:
*"a rope is not a point ... `fallFit` holds the SPINE inside the rings; `braid`
then sweeps a 17.6 mm tube around that spine, so a spine sitting exactly on the
limit puts a third of the rope's circumference through the mail."* That
correction existed as an `if (masked)` special case on the one rung where a rope
had ever been measured under metal. Generalising it — `fitFall` taking the
mass's own half-width, defaulting to zero so every sheet-like caller is
untouched — is the obvious right shape, and it is the shape this file argues for
everywhere else.

**What the measurement said.**

1. *Inert on the shipped build.* THRU stayed 0.0 mm on every helm; SIL moved
   0.04. Good — the rule is not supposed to do anything where nothing binds.
2. *Inert on the defect it was written for.* With the guard walked in, the
   numbers came back **byte-identical**: 19.7 mm, 4.37%, 80.4% shown, 31% kept.
   Not "smaller". Identical. `hairCeil` returns a non-finite ceiling in that
   direction, `fitFall` returns before it fits anything, and a girth subtracted
   from a limit that is never reached is arithmetic nobody performs. The rule
   was answering a question the failing vertices never asked.
3. *And it cost a row.* helmclash §5 went red on `huscarl suttonhoo
   hair=braids` — 1.95% -> 2.66% against a 2.0% bar, on a helm whose cheek
   geometry had not changed by a millimetre.

**The third of those is the interesting one**, because the first fix for it was
also wrong and looked right. Taking the girth off `lim` is taking it off a
projection along the ray from the skull's centre — the fit scales `out.y` with
`out.x` and `out.z` — so shrinking the limit by a rope's half-width does not
narrow the plait, **it lifts it**. The worst patch moved 123 mm up to 136 mm,
into the tighter part of the mask. And at the same time the worst patch HALVED,
40.7% -> 20.4%, which is exactly how a wrong correction reads as a right one if
you look at one column. Re-applying the girth horizontally — the direction a
hanging rope actually has thickness in, which is what the mask's own `tuck` had
right — left the row red anyway.

**So it went.** The defect it was written for was closed by the hem anchoring;
the rule itself was provably inert on that defect and cost a gate elsewhere. A
rule that is right in principle, does nothing measurable, and moves a ratchet is
a rule you do not ship — however good the argument for it is, and the argument
for this one is still good. It is written down here so the next pass can pick it
up with the three measurements already done rather than rediscovering them.

**The generalisable part.** I believed the girth rule had fixed the braid
because I had formed the story before I ran the comparison, and byte-identical
output is the loudest possible refutation — it is not "the fix helped a little",
it is "that code did not execute". Read the digits, not the direction.
