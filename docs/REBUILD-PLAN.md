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

## Step 1 has started: the base head is out of the code — 2 Sep 2026

`headMesh(cls, seed)` in `characters.ts` walks the displacement field every
helm, hair and beard is sampled through and returns it as a quad mesh;
`tools/blender/exporthead.mjs` writes it as OBJ (metres, Y up); and
`tools/blender/head.py`, run in a background Blender, welds the seam, smooths,
subdivides once, gives it a warm subsurface skin, saves
`art/blender/bretwalda.blend` and exports `head-<cls>.glb`.
`tools/blender/render.py` makes the judging frames. All four classes' heads
are exported (seed 13); the huscarl's is rendered: brow, orbits, nose, lips,
chin and cheekbones, the code's face as a real mesh. The eyes, ears, mouth
interior and hair are separate parts in the code and are the next things to
bring across. Two laws paid for on the way: Blender's OBJ importer turns the
file's Y-up into Z-up (file +Z, the face, lands on −Y), and a look-at must be
given the world's up explicitly — three renders were of the occiput before
that was measured rather than assumed. A background Blender
(`Blender -b -P script.py`) needs no MCP socket, which matters because the
add-on serves one client at a time.

## And then the whole man came out the same door — 2 Sep 2026, later

`tools/blender/exportwarrior.mjs` calls `buildCharacter` with the raw material
set and writes the entire rig-less warrior — 46 named parts on the huscarl:
helm, face, beard, hair, mail, belt, cloak, wraps, boots — as OBJ + MTL in
world space, rest pose; `tools/blender/warrior.py` welds, smooths, saves
`art/blender/warrior-<cls>.blend` and exports `warrior-<cls>.glb`. All four
classes are out. `art/blender/warrior-huscarl.png` is the judging frame: the
code's man, recognisably, as a mesh. The Unity client now instantiates these
per class instead of capsules. What this is NOT yet: rigged (the parts are
baked at rest), textured (the raw material set is flat colour — the browser's
procedural textures do not travel), or the strand beard. Those are the next
three steps, in Blender, on these meshes.

## Driving Blender from here

The Blender MCP bridge only works from a Claude Code session running ON the
Mac that Blender is on (`docs/PLATFORM-PATH.md`, "Blender is not reachable
from a cloud session"). This session is on that Mac. When Blender's add-on
answers, the first script is the head: import nothing, build from the code's
own measurements — `headmeasure.mjs` and `characters.ts`'s skull table are
the spec, in millimetres.

## Unity, when the assets exist

- **The owner created the project on 2 Sep 2026**: Unity `6000.4.4f1`, the
  HDRP outdoors template, in its own repository
  (`github.com/JensonLR/BRETWALDA---Blood-Moot`), checked out as the folder
  `BRETWALDA - Blood Moot/` inside this one (ignored here; it is its own
  repository). **One early call worth making before assets accumulate: HDRP
  is a desktop and console pipeline and does not ship to phones; a build that
  must run a duel at 60 fps on the owner's phone wants URP.** Switching later
  means re-authoring every material; switching now costs a template.
- The sim stays `src/game/engine.mjs` behind the written protocol
  (`docs/WIRE-PROTOCOL.md`); Unity is a renderer plus input plus a socket, as
  §5 of PLATFORM-PATH says. Nothing about the game's rules moves.
- First milestone: one class, one ground, one duel against the existing
  server, at 60 fps on the owner's phone. **Code written 2 Sep 2026** in the
  owner's fresh URP project (`BRETWALDA - Blood Moot/Assets/Bretwalda`, its
  own repository): a WebSocket client speaking the wire, the seven-case
  switch, `solo` against one AI, `input` at 20 Hz, warriors as capsules with
  the code's head from the glTF, a follow camera, and a scene built from code
  (menu *Bretwalda > Build Duel Scene*). It compiles the moment the editor
  refreshes with glTFast and Newtonsoft resolved; the first play is against
  `node custom-server.mjs` on port 3000.
