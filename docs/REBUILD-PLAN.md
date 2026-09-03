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

## Step 7 came early: the five grounds are out of the code — 3 Sep 2026

The grounds were last on the list because they are the largest. They came
out through the same door as the men, and sooner, because the door was
already built. `tools/blender/exportworld.mjs --ground <id>` stands up the
texture and material libraries and `createWorld` exactly as GameCanvas
does and writes the result as OBJ+MTL, every map dumped to
`art/blender/tex-world/<id>/`, and a `materials.json` sidecar with what
the OBJ cannot say (roughness maps, alpha cutouts, UV repeat, emissive).
Two things the OBJ *can* say that it did not at first: the per-vertex tint
the code writes (turf, path, mud, daub, thatch) rides as `v x y z r g b`
with the ground shader's exposure roll and turf hue push folded in; and
the material colour, which three.js lets exceed 1 to lift a dark tint, is
baked into the vertex colour where there is one and the map where there
is not, so a renderer that clamps at 1 sees the same albedo.

`tools/blender/world.py` imports, wires each material from the sidecar
(roughness = scalar × map.g and metalness = scalar × map.b, the way
three.js reads them — the scalars run above 1 here, which is how mid-grey
maps come out matte), joins the thousand-odd parts per material into a
few dozen meshes and exports `ground-<id>.glb`. `worldrender.py` frames a
judging shot from up and back over the fighting circle, with a sky that
lights but does not mirror — the game has no environment reflections.

| ground | parts | meshes | triangles | glb |
|---|---|---|---|---|
| saxon_village | 1656 | 36 | 228,665 | 21 MB |
| pict_moor | 2853 | 7 | 58,568 | 6.5 MB |
| roman_fort | 4170 | 7 | 49,052 | 5.6 MB |
| danelaw_camp | 893 | 12 | 37,704 | 5.5 MB |
| offa_dyke | 768 | 8 | 49,440 | 5.9 MB |

What the Blender renders show, judged against `/shot` frames of the same
grounds: geometry and materials match; the village and dyke read as places
under daylight; the moor, fort and camp are dark because in the game they
are lit at dusk with the hearth as key light, and Blender's flat sun is
not that. The mood is Unity's job — `MoodLighting` carries the dusk rig
and the hearth light across. Two honest gaps: the banners' painted
devices are not in the export (the cloth is drawn with the canvas 2D API
and a byte-buffer stand-in only takes `fillRect`), so the flags fly plain
cloth; and the bonfire's flame is a static emissive mesh in the export,
replaced in Unity by a particle fire.

In Unity: `GroundView` loads `ground-<arena>.glb` when the join names the
arena and re-dresses every vertex-tinted mesh in `Bretwalda/Ground`, a URP
shader that does what `render/world.ts` does per pixel (detail tiled in
metres, near and wide tap, exposure roll, times the vertex tint).

## Step 2 is in: the strand beard and hair — 3 Sep 2026

The owner's phone photographed the beard as "thin in parts and unnatural"
and it was: a closed shell in the hair material, cut with a hard edge. It
could not be fixed in the code because a shell is what the code draws.
`tools/blender/strands.py` grows hair off that shell in Blender: strands
root on every face by area (11,000/m² on the beard, 5,200 on the pelt),
lie along the surface (gravity projected onto the tangent plane, lifted a
hair off it), fall in clumps that share a sway, and taper over five
segments from 1.1 mm. The shell stays as an underfur, 1 mm in and
darkened. The strands' colour rides per vertex — roots shadowed, tips lit
— off the material's own hex; Unity's `WarriorView` reads that hex off
the material name because glTFast's material does not read vertex colour.

Five passes, each judged in a 35 mm head render before the next:

1. Quills — 800 strands, 2.8 mm, straight out along the normal, and white.
   The white was the finding: the data was right (dark brown per vertex),
   the Principled sheen was turning edge-on ribbons to frost. Sheen off,
   specular down.
2. Fibre with stray bristles — four times the density, a third the width,
   tangent-hugging roots. Better; cheeks bristled sideways.
3. Cheeks shortened, tips darkened; but pelt strands fell over the eyes.
4. A normal-keyed sweep-back for the brow. Fixed three men; the
   runekeeper's crown faces up and still shed strands over the eyes.
5. Position-keyed: roots forward of the pelt's 42 % line are the fringe —
   thinned to a third, swept back, half the length.

Judged: the huscarl, warden and berserker read as bearded men at 35 mm;
the felt shell is gone from all four. Still visible, filed for the next
pass rather than pretended away: ribbons read as ribbons close up (a
strand texture with alpha would take that), the moustache is short, and
the strand count (3,000–5,000 beard, 4,000–6,000 pelt) is a budget line
Unity has not yet been asked to pay in a sixteen-man moot.

## Steps 3–4 in one door: the game's skeleton, skinned, with its clips — 3 Sep 2026

The men were going out as parts hung on six pivots. The game has more
than that: `anim.ts` inserts a spine, splits every limb into upper, lower
and wrist bones, hangs the cloak on a drape chain and paints weights
across each limb mesh. `tools/blender/exportrig.mjs` calls that same
factory (`createWarriorRig`) on a stand-in player and writes what comes
out: the rest-pose OBJ, and `warrior-<cls>.rig.json` with the bone tree
named by identity (Hips, Spine, Head, RightShoulder, RightUpperArm,
RightElbow, RightWrist, RightHip, RightThigh, RightKnee, CloakYoke,
Drape1…), the hand mounts, and per part either its rigid bone or its
per-vertex [bone, weight] pairs. `tools/blender/rig.py` builds the
armature, binds every part by vertex group with those weights, parents
the mounts to the wrists, dresses the materials, exports a skinned glTF:
25 joints, ~46 skinned meshes, ~30k triangles a man. `posetest.py` bends
an elbow, a knee, the spine and the head in a render; the weights hold.

The rigged men rendered white, and that took four experiments to place:
not the modifier, not the lights, not the materials — a shell. The game
hangs a `rig:shadow` mesh under every pivot with colour writing off, there
only to cast shadows; the OBJ has no such flag, so it came through as an
opaque white copy of the man, and only the limbs that moved out of it
showed their textures. The exporter skips anything that does not write
colour. Triangles halved.

`tools/blender/clips.py` authors nine clips on the armature — idle, walk,
run, attack, heavy, block, dodge, hit, die — in the man's own terms (pitch
forward, yaw, roll, metres right/forward/up), converted into each bone's
frame at key time from its rest matrix, so the same numbers serve every
class. glTF carries them; glTFast imports them as legacy clips; Unity's
`ClipDriver` plays them by fight state off the snapshot and holds a
one-shot for its length so a flicker on the wire cannot cut a swing
short. Judged frame by frame over seven rounds: walk, block, attack,
heavy, dodge and the death all read now. Two measurements paid for the
last three rounds: the Hips bone's head is the body's origin at the FEET
(so a hip pitch is a plank fall about the ankles, and the drop I had
added put the man a metre underground); a world rotation about the side
axis swings a downward bone's far end forward but an upward bone's
backward (the first death fell on its back, the heavy leaned away from
the target), and a forward lean swings a hanging arm BACK, so a strike's
arm pitch has to run ahead of the lean by the lean's size.

Still to come on the men: the weapons ride the wrist mounts through
`WarriorView.ArmUp` as before; the cloak's drape chain is not yet
animated (stiff in the clips); the strand count is unbudgeted.

## Sound in Unity, made in code — 3 Sep 2026

`SoundBank` synthesises every clip once at start the way `render/audio.ts`
does, no files: swing, heavy swing, hit, block (wood), clang (steel),
step, war-cry, fall, the hearth's crackle, the wind. Played spatially at
the man from the clip driver's own transitions and from the wire's hit
events (a shield takes a blow as wood, a parry as steel, the rest as
flesh; heavy lower and louder), the hearth's crackle at the bonfire, the
wind under everything. Not yet carried over from audio.ts: the impact
material table by hit zone, the UI sounds, the mute law and the quality
budget. Nothing here has been heard — the owner's editor compiles when it
has focus; the bank is judged by ear the first time Play is pressed.

## The compile check — 3 Sep 2026

`tools/unitycheck.sh` compiles every script under `Assets/Bretwalda` here,
with Roslyn from the .NET SDK against Unity's own engine and editor
modules, its netstandard 2.1 reference set and the package assemblies the
owner's last editor compile left in `Library/ScriptAssemblies`. Seventeen
scripts, no errors, four warnings, at the end of this day's work. It is
the only compile available until the owner's editor regains focus, and it
says nothing about what Play shows.
