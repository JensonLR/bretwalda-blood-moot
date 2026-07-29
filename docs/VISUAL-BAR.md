# BRETWALDA — The AAA Visual Bar

This is the standard every rendering change is held to, and the rubric the
visual-critic agents score against. Read this before touching the renderer.

The reference class is the current generation of Anglo-Saxon / medieval-knight
action games: *Assassin's Creed Valhalla*, *Kingdom Come: Deliverance*,
*Mordhau*, *Chivalry 2*, *Hellblade*, *For Honor*. We are not cloning their art
— we are matching their **rendering discipline** in a browser with three.js.

---

## 0. How work is verified

Nothing is "done" because it compiles. It is done when a capture proves it.

```bash
npm run build              # must pass — TypeScript is not optional
npm run shots              # writes art/shots/*.png + report.json
```

`report.json` must show, for every preset: `ready: true`, `blank: false`,
`errors: []`, and `tonalBuckets >= 8` (a frame using fewer than 8 of 16 luma
buckets is flat and has failed the grade before a human even looks at it).

Presets: `duel`, `arena`, `closeup`, `brawl`, `laststand`.
Baseline for comparison lives in `art/shots/baseline/`.

---

## 1. The failure list — what is wrong today

Every item here is visible in `art/shots/baseline/`. These are the bugs, not
opinions:

1. **No textures anywhere.** Every surface is a flat `MeshStandardMaterial`
   colour. Ground, cloth, mail, wood, thatch, stone, skin — all untextured.
2. **Grey square artifacts floating in mid-air.** `PointsMaterial` with no
   `map` renders opaque squares. The "fog motes" read as UI glitches.
3. **No shadows on the ground.** A directional light claims `castShadow` but
   the read is flat; characters sit on a fake dark blob.
4. **No post-processing at all.** No bloom, no ambient occlusion, no
   anti-aliasing beyond MSAA, no colour grade, no vignette, no depth of field.
   Fires and glowing runes have no light bloom around them.
5. **Broken character proportions.** Bobble heads, tube arms, mitten hands, no
   neck, no face, no hands. Silhouettes do not read as warriors.
6. **The ground is a flat disc** with a hard circular edge at the horizon.
7. **Background props are cardboard.** Huts are untextured prisms; the palisade
   is a ring of identical cylinders; nothing occludes or layers.
8. **Sky banding.** A 20×12 vertex-coloured sphere shows visible facets.
9. **Nameplates and health bars** are raw quads that read as floating black bars
   pasted over the world.
10. **The camera clips through the bonfire** in the `duel` preset.

---

## 2. The rubric — 10 axes, scored 1–10

A shot passes only at **8+ on every axis**. One axis at 7 fails the whole shot.
Score honestly; inflated scores waste everyone's iteration budget.

| # | Axis | What a 9–10 looks like |
|---|------|------------------------|
| 1 | **Material response** | Surfaces read as *substances*, not colours. Mail is metal with anisotropic glint; wool is fibrous and light-absorbing; leather has grain and specular sheen; wood shows grain direction. Correct albedo/roughness/metalness/normal per material. |
| 2 | **Texture detail** | No untextured surface anywhere in frame. Detail holds up at close range (`closeup`) and doesn't shimmer at distance (`arena`). Texel density consistent between objects. |
| 3 | **Lighting & shadow** | Real shadows with contact hardening. Ambient occlusion in every crevice, under every eave, where every object meets the ground. Key/fill/rim reads deliberately. No blown highlights, no crushed blacks. |
| 4 | **Atmosphere & depth** | Clear atmospheric perspective — distance desaturates and lightens. Volumetric light from fire and sun. Layered depth cues so the frame has foreground, midground, background. |
| 5 | **Character craft** | Believable human proportion (7–7.5 heads). Readable faces, real hands, layered kit (tunic → mail → straps → cloak). Silhouette identifiable per class at a glance. |
| 6 | **Animation weight** | Poses show mass and momentum — a swing loads, releases, and follows through. Weight shifts onto the front foot. No floaty limbs, no interpolation mush. |
| 7 | **Composition & camera** | Framing serves the fight. No clipping through geometry. Correct focal feel. The eye lands on the action. |
| 8 | **Colour grade** | A deliberate, coherent palette with a filmic curve. `laststand` should feel *different* — hotter, more desperate — not just tinted. |
| 9 | **Effects craft** | Fire looks like fire, not a glowing cone. Sparks, blood, dust, impacts have physical behaviour and read at gameplay speed. Nothing renders as an untextured square. |
| 10 | **Frame cleanliness** | No z-fighting, no visible seams, no aliasing crawl, no banding, no UI element that reads as a bug, no floating disconnected geometry. |

---

## 3. Hard technical requirements

These are not stylistic choices. They are the price of entry.

- **Colour management on.** `renderer.outputColorSpace = SRGBColorSpace`; every
  albedo texture `colorSpace = SRGBColorSpace`; normal/roughness/AO maps stay
  linear. Getting this wrong makes everything else look wrong.
- **Tone mapping** with a filmic curve and a deliberate exposure.
- **PBR maps** on every material: albedo + normal + roughness (+ AO, + metalness
  where it applies). Generate them procedurally — see §4.
- **An environment map.** `PMREMGenerator` over the sky so metals reflect the
  world instead of returning flat grey.
- **Post-processing chain**: AA → AO → bloom → grade → vignette. Must degrade
  gracefully; see §5.
- **Shadows** with a tight cascade around the arena, sensible bias, and soft
  edges. Contact shadows where feet meet ground.
- **No `PointsMaterial` without a `map`.** Every particle needs a sprite texture
  and additive or correctly-sorted alpha blending.

---

## 4. Assets are generated, never downloaded

The game must stay a zero-install instant-play link. That means **no binary
texture or model downloads**. Every texture is generated procedurally at
runtime into a canvas or a `DataTexture`, or authored as a shader.

This is a constraint, not an excuse. Procedural noise, weave patterns, grain,
scratch layers, edge wear and dirt masks can all be generated in code and look
excellent. Cache aggressively — build each texture once and share the instance.

**Budget:** total texture generation must stay under ~250 ms on a mid laptop
and under ~40 MB of GPU texture memory. Generate at 512² or 1024², not 4096².

---

## 5. Performance is part of the bar

A beautiful game that stutters has failed.

- **60 fps** at 1080p on a mid-range laptop with 8 warriors on screen.
- **30 fps floor** on a mid-range phone.
- Tiered quality: `high` / `medium` / `low`, auto-selected, with expensive
  passes (AO, high-res shadows, DoF) dropped on low. The low tier must still
  look good — it drops effects, not art direction.
- Instance repeated geometry (palisade stakes, rocks, grass). Share materials
  and geometries. Dispose properly on unmount — no leaks between matches.

---

## 6. Critic protocol

Visual-critic agents follow this exactly:

1. **Look at the actual PNGs.** Never score from a description of a change or
   from a diff. If you did not view the image, you have no verdict.
2. **Score all 10 axes** with a one-line justification each, citing what you
   see in the frame.
3. **Be harsh.** The question is not "is this better than before?" — it is
   "would this ship in a game people pay for?" Better-than-baseline is not a
   pass. Default to the lower score when torn.
4. **A/B against the previous iteration** and against `art/shots/baseline/`.
   State which is better and why. If a change made something worse, say so —
   regressions are common and matter more than gains.
5. **Return specific, actionable defects**, each naming the file and the fix.
   "Lighting is flat" is useless. "The moon's directional light at
   `lighting.ts:41` has no shadow bias tuning, so contact shadows detach from
   the boots — reduce bias to -0.0002 and enable a contact-shadow pass" is a
   finding.
6. **PASS requires 8+ on every axis.** Anything else is FAIL, and the loop
   continues.

Note on comparison: we cannot embed copyrighted screenshots from shipped games
in this repo, so the comparison is against the rubric above — which encodes
what those games actually do — plus blind A/B against our own prior iterations.
