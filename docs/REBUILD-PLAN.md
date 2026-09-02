# The rebuild: Blender first, then Unity — the plan, 2 Sep 2026

The owner's ruling (docs/HANDOVER.md, rulings): *"Steam/iOS/Android won't be
ready until we start building in Unity & Blender for improved visuals &
animations."* This is the order of work, written so a session can start it
without re-deriving it. It does not touch the web build, which keeps shipping
as it is; `docs/PLATFORM-PATH.md` §5b is the decision this executes.

## Why Blender before Unity

Unity consumes assets; it does not make them. A Unity project with no meshes is
a scene of capsules. Every hour in Blender produces something the browser build
can also load later (§5b's asset loader behind a build flag), so Blender work is
never stranded whichever engine ends up under it. Unity work before assets is
scaffolding that waits.

## The order of assets — the defect log, not taste

`docs/PLATFORM-PATH.md` §5b already says it: author first the things twenty
code passes have not closed and a player looks straight at.

1. **The head and face.** One base head, four class variants by proportion,
   the seed-driven variation the code does now expressed as blend shapes
   (brow, jaw, nose, cheek). Skin as a real texture with a warm subsurface
   look, not a complexion field.
2. **The beard and hair — as strands.** This is the item the shell could not
   close (OPEN-DEFECTS, "the owner's phone, 2 Sep"): hair cards or Blender's
   curves-to-mesh, with an anisotropic hair shader. Five beards, four hairs,
   built to sit under every helm rung — the `helmclash` and `wearmeasure`
   rules are the acceptance tests, re-expressed for a mesh.
3. **The hands.** A rigged hand with a real thumb, one grip pose per haft
   radius (13, 16, 17, 21, 24 mm — the roster's five), and an open hand.
4. **The ten helmets.** The bowls are already distinct in code
   (`tools/helmrungs.mjs` measured them); the meshes keep those outlines and
   gain the fittings a shell cannot carry — rivets, the boar's hair, the
   wyrm's scales, the Sutton Hoo's garnet cloisonné.
5. **The weapons and the shield**, in that order of visibility: sword, Dane
   axe, spear, seax, hand axes; the dished board with real planks and the
   painted devices (`src/game/standards.mjs` is the device list).
6. **The four bodies and the kit** — mail as displaced geometry or a normal
   map, cloth with thickness, the cloaks as simulated cloth baked to shapes.
7. **The five grounds**, last, because they are the largest and the code's
   versions read acceptably; the moor and the camp under the cold key first.

## Format and scale

- **glTF 2.0** (`.glb`) out of Blender, metres, Y up, one file per asset,
  textures embedded, PBR metal/roughness. Both three.js and Unity read it
  natively, so the browser can load the same files behind the §5b flag.
- Rigs: one humanoid skeleton shared by the four classes, Mixamo-compatible
  naming, so Unity's Humanoid retargeting and the browser's skinning both work.
- LODs authored, not generated: the fight card is 127 px per metre, so a
  helmet at fight distance is 34 px — the LOD1 that matters is the silhouette.

## How each asset is accepted

The same discipline as the code: a capture, a number, a gate.

- The silhouette sheets (`tools/silhouette.mjs`) and the helm ruler
  (`tools/helmrungs.mjs`) are re-pointed at the loaded meshes when the loader
  exists; a rung that adds less than 40 mm of outline is not worth selling as
  a mesh either.
- `helmclash` and `wearmeasure` become mesh-intersection checks (Blender can
  run them as a script on export: hair through iron is a boolean).
- VISUAL-BAR 8+ from regenerated captures, judged by the harsh-critic protocol.

## Driving Blender from here

The Blender MCP bridge only works from a Claude Code session running ON the
Mac that Blender is on (`docs/PLATFORM-PATH.md`, "Blender is not reachable
from a cloud session"). This session is on that Mac. When Blender's add-on
answers, the first script is the head: import nothing, build from the code's
own measurements — `headmeasure.mjs` and `characters.ts`'s skull table are
the spec, in millimetres.

## Unity, when the assets exist

- A new repository or a `unity/` folder — decided then, not now.
- The sim stays `src/game/engine.mjs` behind the written protocol
  (`docs/WIRE-PROTOCOL.md`); Unity is a renderer plus input plus a socket, as
  §5 of PLATFORM-PATH says. Nothing about the game's rules moves.
- First milestone: one class, one ground, one duel against the existing
  server, at 60 fps on the owner's phone.
