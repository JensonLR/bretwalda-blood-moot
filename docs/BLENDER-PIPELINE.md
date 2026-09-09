# Blender, and how to make it do something twice

Written 9 September 2026, after the "Blender MCP is unreliable" report turned
out to be a true sentence about a false cause.

---

## 1. The root cause, because it will look like this again

Nothing was flaky. **Two different projects, both calling themselves BlenderMCP,
were installed at once, and both answer on port 9876.**

| | what it is | what it sends |
|---|---|---|
| Claude Desktop extension | the official **Blender Lab** bridge, at `~/Library/Application Support/Claude/Claude Extensions/ant.dir.gh.blender.blender-mcp` | `{"type":"execute","code":…,"strict_json":…}` **+ a NUL byte**, then reads until it sees a NUL back |
| Blender add-on | the third-party **ahujasid** build, at `~/Library/Application Support/Blender/5.1/scripts/addons/addon.py` (`bl_info` name "Blender MCP", ~96 mentions of Hyper3D/PolyHaven) | answers `{"type":"execute_code","params":{"code":…}}` and replies **bare JSON, no delimiter** |

So the add-on drops the bridge's message as an unknown type, and the bridge
blocks waiting for a NUL that is never coming — until its 300-second timeout.
Measured against the same running Blender 5.1.2:

```
bridge framing   {"type":"execute"} + NUL      no reply, timed out
addon  framing   {"type":"execute_code"}       0.00 s, {"status":"success"}
```

**This is why it read as "unreliable" rather than as "broken".** The bridge's
tools split cleanly in two, and nothing in the failure tells you which half you
reached for:

* **hangs for 300 s** — anything that touches the live scene:
  `execute_blender_code`, `get_objects_summary`, every
  `get_blendfile_summary_*`.
* **works perfectly** — the bundled RST doc search (`search_api_docs`,
  `search_manual_docs`, `get_python_api_docs`) and every `*_for_cli` variant,
  because neither goes near the socket.

Two more things worth knowing before you debug this again:

* **The add-on auto-starts.** `register()` defaults `auto_start` to true, so
  launching Blender.app binds 9876 within about two seconds. Nobody has to click
  anything. If the port is dead, Blender is not running — that is the whole
  diagnosis.
* **Headless does NOT bind the port,** and refuses loudly: *"BlenderMCP: cannot
  start server in background mode (blender -b) — commands would never execute"*.
  So a batch export cannot collide with an artist's open session. (I assumed it
  could, and tested it, and was wrong.)

### If you want the official tools to work

Replace the add-on in Blender with the Blender Lab one from
`https://projects.blender.org/lab/blender_mcp`, so both halves speak the same
protocol. **Nothing in this repository requires that** — see §2 — and the
installed add-on is not broken, it is merely a different program. Do not swap it
without a reason.

---

## 2. The rule that follows

> **An asset must never depend on a live GUI session to be reproducible.**

Anything a build needs goes in a `.py` next to `tools/blender/` and runs
headless. The socket is for *looking at* and *nudging* a scene a human has open.

This is not a new architecture — every exporter in `tools/blender/` already
shelled out to `Blender -b -P` and always did. The point of writing it down is
that the MCP is a tempting way to do production work one invisible mutation at a
time, and a rebuild cannot replay any of them.

`tools/blender/bridge.mjs` is the one place that knows how to reach Blender:

```js
import { run, live, doctor, EMIT } from "./tools/blender/bridge.mjs";

// headless — the default, and the production path (~1.2 s of startup)
const { value } = await run(`import bpy\n${EMIT('{"n": len(bpy.data.objects)}')}`);

// the open GUI session — opt-in, ~0 ms, for iteration only
await run(code, { live: true });
```

`EMIT(expr)` fences a JSON payload between markers so Blender's own chatter — a
missing codec warning, an add-on's startup line — cannot be parsed as a result.
`run()` returns `{ value, stdout, stderr }`.

`BLENDER=` overrides the binary; `BLENDER_MCP_HOST`/`_PORT` override the socket.

---

## 3. The doctor

```bash
npm run blenderdoctor          # headless only — CI-safe, no GUI needed
npm run blenderdoctor -- --live   # also exercise the running GUI
```

It prints the diagnosis first — binary, version, whether headless works, whether
the port is listening, and **which protocol the listener speaks** — so the two
failure modes above are told apart by name rather than by a stack trace.

Then it proves control instead of asserting it: eleven steps **in one session**,
because a connection surviving a single mutation is not the property that
matters. Read the scene, create, rename, transform, create and assign a
material, set and read a custom property, save a `.blend`, export a GLB,
validate the GLB, mutate *again after the IO*, observe it, clean up.

The GLB is parsed as a container — magic, version, chunk table, the JSON chunk's
own accessor counts — because a zero-byte glTF is still a file.

**Check 9b is the one that matters most here: custom properties survive the glTF
export.** That is the mechanism sever zones and hand sockets have to travel
through, and it is now proven rather than assumed:

```
ok  9b custom properties survived export  {"bw_sever_zone":"rightArm","bw_socket":"HandR"}
```

Last run 9 Sep 2026, Blender 5.1.2: **13/13, headless and live.**

---

## 4. Where assets go, and the trap in it

There are two directories and only one of them is reachable by a player.

| constant (`tools/blender/sink.mjs`) | path | who reads it |
|---|---|---|
| `GLTF_SINK` | `art/gltf` | **nothing** — it is the build's own scratch output |
| `AUTHORED_WEB` | `public/authored` | the client: `authoredSource.ts` fetches `/authored/warrior-<cls>.glb`, and Next serves `/` out of `public/` |

`exportclips.mjs` opens with *"A build step with no copy step is a build step
that lies"* — and then copied its warriors into `art/gltf` for a month.
`art/gltf` contains one `armoury.json` and not a single GLB; grep `art/gltf` and
`GLTF_SINK` under `src/` and there are no hits, ever. So `npm run exportclips`
could rebuild all fifteen clips, report success, and ship nothing a player could
load. The copy that *did* reach the client was a shell one-liner in
`package.json`, remembered by hand.

**If an exporter produces something the runtime needs, it writes to
`AUTHORED_WEB`.** Fixed 9 Sep 2026 for `exportclips` and `exportmen`;
`exportarmoury` and `exportportraits` still write to `GLTF_SINK`, and nothing
reads their output either — that is a live question, not a settled one.

---

## 5. The clip contract

`tools/blender/clips.py` authors **fifteen** clips at **30 fps**, in place (no
root motion — `walk` and `run` carry a vertical bob and zero forward
translation), over the 25-joint skeleton in §6:

```
idle  walk  run
attack  attackLeft  attackOverhead  attackStab   heavy
block  dodge  die
hit  hitLeft  hitOverhead  hitStab
```

Contact frames get VECTOR interpolation handles so a blade does not decelerate
into its own contact (`clips.py:72-86`).

`exportclips.mjs` gates on the count. It read **12** with a comment saying
"twelve", which was true when written: `clips.py` later grew the three
directional hit reactions and the gate never followed, so `hitLeft`,
`hitOverhead` and `hitStab` could all have stopped exporting while the build
still reported success. It reads **15** now, verified against all four shipped
GLBs.

`authored.ts:REQUIRED_CLIPS` still lists 12 and is a separate contract —
see §7.

### Determinism

The pipeline is reproducible, and this was checked rather than hoped: rebuilding
`warrior-huscarl` from its `.blend` through the repaired path produced a GLB
**byte-identical** (same md5) to the one already shipped.

---

## 6. The skeleton, and which way authority runs

**The rig is not authored in Blender and imported. It is extracted from the
running procedural rig and pushed outward.** `exportrig.mjs` names the game's
anonymous `Object3D` pivots by identity and writes `warrior-<cls>.rig.json`;
`rig.py` rebuilds the armature from that JSON and binds with the game's own
painted weights.

One shared 25-joint skeleton, identical across all four classes:

```
Hips  Spine  Head  Cloak  CloakYoke  Drape1..Drape6
RightShoulder  RightUpperArm  RightElbow  RightWrist
LeftShoulder   LeftUpperArm   LeftElbow   LeftWrist
RightHip  RightThigh  RightKnee
LeftHip   LeftThigh   LeftKnee
```

Plus two non-deforming empties, `HandR` and `HandL`, parented to the wrist
bones. At runtime only 17 of the 25 are real `THREE.Bone` — the rest are `Group`
pivots — and `exportrig.mjs` flattens both into one armature.

**Mount points are named, never offsets.** A weapon hangs off `HandR`, an
offhand off `HandL`, and **a shield off `LeftElbow`** — a board straps to the
forearm, and mounting it on `HandL` floated it half a metre off the man. That
was caught by a picture and not by a gate, which is the standing lesson for
everything in this file.

---

## 7. What is still not true

Two things a reader of this file would reasonably assume, and should not.

**The fifteen clips are downloaded, validated, and never played.** There is no
`AnimationMixer` anywhere in `src/` — grep it. `authoredSource.ts` parses the
clips, `authored.ts:warriorIsUsable` checks twelve of them are present by name
as a completeness checksum, and then `upgradeRigToAuthored` swaps **geometry,
skinning and materials only** and re-points `rig.pivots` at the authored bones
so the *procedural* pose layer keeps driving them. The comment at
`authored.ts:207` claiming the upgrade is "geometry, skinning and clips" is
wrong as written.

Every quality property the clips were authored for is therefore unreachable,
including the contact handles above — and `tools/cliptime.mjs` gates a
synchronisation between clip contact frames and server contact that never
happens at runtime. This is the single largest gap in the art pipeline and it is
a decision, not a bug: playing them means demoting `settleOnFeet`, `groundBlade`,
the blade-aim solve and the cloth solver from *being* the pose to *correcting*
it, and the procedural motion they produce is numerically gated (`gaitprobe`,
`swingstrip`) in a way the clips are not.

**Dismemberment does not work on an authored man.** `collectRig` finds limbs by
a `rig:` name prefix stamped by the procedural builder; authored meshes are
named `<role>_<n>`, and `upgradeRigToAuthored` clears `rig.body.children`,
orphaning every seam anchor. `beginGore` has a graceful path — `if (!cut)
return`, "a body that refused the cut falls exactly as it always did" — so a
severing kill becomes a non-severing one. Harmless today because the authored
path is behind `?authored=1`; a blocker for turning it on.

It no longer fails *silently*, which was the worse half. `upgradeRigToAuthored`
now sets `rig.authored`, and a refusal on an authored body warns once per session
and increments `window.__bretwaldaGoreRefused` so a harness can read it off the
window rather than watch a console. The graceful path is still correct for a
zone the builder genuinely has no seam for; what is no longer possible is an
authored man losing every severance in the game without anybody being told.

Fixing it properly means re-deriving seam anchors onto the authored bones and
teaching `collectRig` the `<role>_<n>` convention. The vertex-baking half is
already GLB-compatible — `project()` bakes through `skin.applyBoneTransform`,
duck-typed rather than `instanceof` — so it is the discovery half that is
missing, not the cutting.

---

## 8. Turning authored assets on

They are behind a hand-typed URL query parameter and nothing else:

```ts
// GameCanvas.tsx and armouryStage.ts — identical bodies, duplicated verbatim
new URLSearchParams(window.location.search).get("authored") === "1"
```

No env var, no settings toggle, no quality-tier hook. `public/authored` is 68
files and 43 MB with no streaming policy, and the heaviest single file is a head
of long hair at 3.5 MB. Making this a default is a visual and a bandwidth
decision, and §7 is the list of what has to be true first.

---

## 9. Running things

```bash
npm run blenderdoctor            # prove control, or name the failure
npm run blenderdoctor -- --live  # ...including the open GUI session
npm run exportclips              # all four warriors -> public/authored
npm run exportclips -- --cls huscarl
npm run exportmen                # rig + clips in one pass
npm run authored                 # the shell copy; belt and braces now
npm run gltftest                 # validate the shipped GLBs
npm run authoredtest             # the swap logic, headless
npm run build && npm run authoredshot -- --arena   # A/B pictures
```

`authoredshot` writes `.authored/*.png` and says so: *"this tool cannot judge a
picture."* Neither can any of the others. Look at them.
