# src/game/client/render

The renderer, split into modules that can be replaced one at a time.
`GameCanvas.tsx` owns the canvas, the WebGL context, React state and input, and
drives everything here. It contains no art decisions; each module below owns
exactly one and nothing else touches it.

Two siblings sit outside this directory because they are not rendering:
`../input.ts` turns keys, mouse and thumb into the frozen server message, and
`../GameHud.tsx` is the screen-space DOM interface. Neither imports anything
from here except the camera rig's type.

Every module follows the same shape: a `createX(...)` that takes the scene and
the quality settings and returns a handle with `update(dt, ctx)` and `dispose()`.
`ctx` is the `FrameContext` from `quality.ts` — clock, camera, focus point, mood,
tier. If a rewrite needs something new from the frame, add it to `FrameContext`
rather than threading a new argument through call sites.

The bar these modules are held to is `docs/VISUAL-BAR.md`. Read it first.

---

### `quality.ts`
Owns tier detection and the `QualitySettings` object every other module reads,
plus the cross-module vocabulary (`FrameContext`, `Mood`, `RenderModule`) that
lives here because it is the one file everything already imports. No module may
ask the device anything itself — no `isMobile` checks, no `innerWidth`, no GL
renderer sniffing. Detection deliberately never drops a desktop below `medium`,
because the headless capture box is a desktop with a software GL stack and its
frames are what the visual bar is scored on. `?quality=low` or `window.__quality`
pins the tier. Runs: never — it is data.

### `textures.ts`
Owns procedural texture generation and the cache that keeps it to one build per
map. Returns `TextureSet`s ("albedo, normal, roughness, AO for wood") by name,
and particle sprites by name. Must never touch a material, a mesh or the scene —
it hands back textures and nothing else. Twenty surfaces, each one height field
first: normals are Sobel-derived from it, AO is its cavity term, and roughness
and metalness are packed into one ORM texture so a substance costs one fetch
rather than three. Generation is lazy and cached, because the full set is over
the 250 ms budget and the arena only ever asks for part of it. Runs: at build
time only, on first request per surface.

### `materials.ts`
Owns the shared `THREE.Material` instances the arena is built from, keyed by
semantic name (`palisade`, `hutRoof`, `runeGlow`), built on `textures.ts`. The
colour and roughness numbers in its catalog *are* the arena's art direction.
Must never build geometry or reach into the scene. Materials that are mutated
per instance — the health bar tint, damage-number canvases, per-warrior kit —
deliberately do not live here, but the *substance* accessors do — `armour`,
`tunic`, `hide`, `flesh`, `blade`, `timber` are what `characters.ts` builds a
warrior out of, so eight warriors share one program per substance instead of
allocating 73 materials each. Every textured material's colour is divided by its
map's mean so `map × color` still averages to the number in the catalog; that is
what lets the arena be textured without silently re-grading it.
`setEnvironment()` is how the sky's PMREM reaches every metal in one call, and
**sky.ts calls it**, on every rebake — the orchestrator must not, or the arena
ends up reflecting a disposed texture the first time the mood changes.
Runs: at build time only.

### `sky.ts`
Owns the air and everything behind it: the sky dome, moon, `scene.fog`,
`scene.background`, and the PMREM environment map derived from the dome. It is
the only module allowed to write `scene.fog` — mood has to move fog, dome and
grade together or the frame comes apart. Must never touch a light *directly* — it publishes
`sunDirection` / `moonDirection` / `sunColor` / `moonColor` and `lighting.ts`
reads them, so the key comes from where the moon actually is. It also patches
three's four fog `ShaderChunk`s to make fog directional (aerial perspective);
that patch is refcounted and restored on dispose. Runs: first in the frame,
before anything reads the atmosphere.

### `lighting.ts`
Owns the global light rig: ambient, hemisphere, the moon key with its shadow
cascade, and the two directional fills. Must never create geometry, and must
never own a light that belongs to a prop — the torch and bonfire point lights
are built in `world.ts` beside the flames they come from, and exposed as
`world.pointLights` for anyone who needs to grade them. Takes the sky's body
vectors and colours through `LightingOptions`; it keeps their azimuth and hue
and overrides their elevation, because a key at the moon's real 11° lays
shadows five body-lengths long across the arena. The ambient and hemisphere are
deliberately small — the sky's PMREM is the physical sky-light term and these
two only exist to keep a shadowed cheek off pure black. Runs: early, alongside
sky; the shadow cascade will want `ctx.focus`.

### `world.ts`
Owns everything static in the frame — terrain, palisade, torches, huts, rocks,
banners, bonfire, runestone, debris — hung off one root group so the arena is
one add and one remove. Per-frame it animates only the cached flames and
banners; it must never traverse the scene, because that walk used to cross every
warrior's sixty meshes looking for two names. Must never touch the camera, the
warriors or the HUD. Prop scatter runs off a fixed seed so two capture runs lay
out the same arena and an A/B against `art/shots/baseline` means something; pass
`rng: Math.random` for a different moot each match. Runs: first, so props are
posed before anything is composed against them.

### `vfx.ts`
Owns every particle in the game: impact bursts, blood, dust, blade trails, the
drifting fog motes, and decals when they land. Every point sprite it makes has a
map — that is the module's one non-negotiable rule. It enforces
`particleBudget`, so a burst can be dropped, never queued. Must never read
player state; the orchestrator decides *when* an effect happens, vfx decides
what it looks like. Runs: after the warriors have moved, so effects spawn at
this frame's positions.

### `postfx.ts`
Owns the final image: output colour space, tone mapping, exposure, and the
`EffectComposer` chain — `RenderPass → GTAO → Bokeh → Bloom → Grade → SMAA/FXAA`.
It is the **only** module allowed to call `renderer.render` — everyone else
renders by doing nothing. The beauty pass lands in a linear half-float buffer,
where three skips its own tone-mapping chunk, so the filmic curve is applied by
hand exactly once, in the grade. The damage flash and the low-health edge are
grade inputs (`hurt`, `setPressure`) rather than DOM overlays, so they land
before the curve and read as the frame going wrong rather than as interface.
Must never modify the scene. Runs: last, once per frame.

### `camera.ts`
Owns the camera and its yaw. The yaw lives here rather than in the input handler
because that one number is three things at once: where the camera looks, the
basis the movement vector is built in, and the `rotationY` the server is told
about. Also owns shake, FOV, follow/spectate/lobby modes, and camera collision
when it lands (the bonfire clip in the `duel` preset is this module's bug). Must
never read the player map — it takes `ctx.focus` and `ctx.localState`. Runs:
after the warriors are posed, before the frame is presented.

### `anim.ts`
Owns character rigs and the map from server state to pose. Split in two on
purpose: `stepWarriorTransform` is network smoothing (where the body is) and
`poseWarrior` is the pose (what the body does). They are separate calls because
the orchestrator has to read the smoothed position for impact effects before the
pose jitters it, and because a skeletal system can replace the second without
touching the first. Owns the blob shadow, which is a character presentation
element and the thing to delete when real contact shadows arrive. Emits blade
trails through a hook rather than calling vfx, so it stays decoupled. Must never
touch the camera or the world.

### `hud3d.ts`
Owns in-world nameplates, health bars and floating damage numbers — the only
things in the frame allowed to ignore depth, which is exactly why they read as
pasted-on quads today. Materials here are per-instance by design. Must never
touch the DOM HUD, which stays in `GameCanvas.tsx`. Runs: after the warriors are
posed, so plates billboard against the current camera.

---

## Frame order

`GameCanvas.tsx` builds the stage in this order, and the order matters:
`textures → materials → camera → postfx → sky → lighting → world → vfx → hud3d`.
postfx comes before sky because it owns `renderer.toneMappingExposure` and sky
encodes against that from its own constructor; lighting comes after sky because
it aims at the sky's bodies.

Then it drives this frame sequence:

1. `world.update` / `sky.update` / `lighting.update` — the static frame, before
   any early-out, so torches keep burning in the lobby.
2. Input → camera yaw → attack magnetism → `onSendInput`. Server-bound, and the
   only place the wire protocol is touched.
3. Per warrior: `stepWarriorTransform` → read position → impact feedback into
   `vfx` / `hud3d` / `camera.shake` → `hud3d.setHealth` → `poseWarrior`.
4. Retire warriors the server no longer sends.
5. `camera.update` — needs this frame's smoothed focus position.
6. `postfx.setPressure`, then `vfx.update`, then `hud3d.update`.
7. `setMood` on every module, so a mood change lands as one coherent step.
8. `postfx.render` — the only render call in the codebase.

## Rules that outlive any rewrite

- **No binary assets.** Every texture, sprite and mesh is generated in code. The
  game stays an instant-play link with no download step.
- **Only `postfx` renders.** Only `sky` writes `scene.fog`. Only `camera` writes
  the camera.
- **No `PointsMaterial` without a `map`.**
- **Every expensive feature needs a tier that degrades it**, and the low tier
  drops effects, not art direction.
- **Everything disposes.** Geometries, materials, textures and render targets
  are released in `dispose()`; matches must not leak into each other.
- The photo-mode contract (`window.__photoCam`, `window.__shotReady`) and the
  wire protocol in `src/game/engine.mjs` are frozen.
