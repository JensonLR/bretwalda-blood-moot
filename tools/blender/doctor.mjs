#!/usr/bin/env node
// DOCTOR — prove Blender control, or name exactly which way it is broken.
//
//   node tools/blender/doctor.mjs          headless only (CI-safe, no GUI)
//   node tools/blender/doctor.mjs --live   also exercise the running GUI
//
// WHY THIS EXISTS. A server appearing in a tool list is not a working pipeline.
// For months the Blender path here was called "unreliable", which is the word
// you reach for when a thing fails in a way you cannot name. It had a name. See
// the header of bridge.mjs: two incompatible add-ons both answering on 9876, so
// half the MCP toolset works instantly and the other half hangs for 300 s.
//
// The cure for "unreliable" is a check that fails LOUDLY and SPECIFICALLY. This
// one does eleven things in one Blender session and asserts each — read the
// scene, create, rename, transform, material, custom property, save a .blend,
// export a GLB, validate the GLB's bytes, mutate again, observe the mutation,
// clean up. If the connection could only survive one mutation we would find out
// here rather than four hours into an export.
//
// The GLB is parsed as a container, not trusted because the file exists: magic,
// version, chunk table, and the JSON chunk's own accessor counts. A zero-byte
// glTF is still a file.
import { existsSync, statSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, live, doctor, EMIT, BLENDER, BLENDER_CLOSED } from "./bridge.mjs";

const LIVE = process.argv.includes("--live");
const WORK = join(tmpdir(), "bretwalda-blender-doctor");
const BLEND = join(WORK, "doctor.blend");
const GLB = join(WORK, "doctor.glb");

let failed = 0;
const ok = (name, cond, detail = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
  if (!cond) failed++;
};

// ---------------------------------------------------------------- diagnosis
const d = await doctor();
console.log("BLENDER DOCTOR");
console.log(`  binary            ${d.blenderPath}`);
console.log(`  installed         ${d.blenderInstalled}`);
console.log(`  version           ${d.blenderVersion ?? "—"}`);
console.log(`  headless works    ${d.headless}`);
console.log(`  glTF exporter     ${d.gltfExport}`);
console.log(`  GUI on :9876      ${d.guiListening}`);
if (d.guiListening) {
  console.log(`  GUI speaks addon  ${d.guiSpeaksAddonProtocol}   (ahujasid: {"type":"execute_code"})`);
  console.log(`  GUI speaks bridge ${d.guiSpeaksBridgeProtocol}   (Blender Lab: {"type":"execute"} + NUL)`);
}
for (const n of d.notes) console.log(`  note: ${n}`);
console.log("");

if (!d.blenderInstalled) { console.error(`[doctor] no Blender at ${BLENDER} — set BLENDER=`); process.exit(2); }

// ------------------------------------------------------- the eleven-step run
// All in ONE Blender session: the point is that state survives mutation, which
// a fresh process per step would hide.
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const SCRIPT = `
import bpy, bmesh, json, os

report = {}

# 1. READ the scene we were given.
report["read"] = {
    "scene": bpy.context.scene.name,
    "objects": sorted(o.name for o in bpy.data.objects),
    "unit_system": bpy.context.scene.unit_settings.system,
    "scale_length": round(bpy.context.scene.unit_settings.scale_length, 6),
    "fps": bpy.context.scene.render.fps,
}

# Start from empty so the default cube cannot be mistaken for our work.
bpy.ops.wm.read_factory_settings(use_empty=True)

# 2. CREATE.
me = bpy.data.meshes.new("BW_DOCTOR_MESH")
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=0.5); bm.to_mesh(me); bm.free()
ob = bpy.data.objects.new("BW_DOCTOR_ORIG", me)
bpy.context.scene.collection.objects.link(ob)
report["create"] = {"name": ob.name, "verts": len(me.vertices), "polys": len(me.polygons)}

# 3. RENAME.
ob.name = "BW_DOCTOR"
report["rename"] = {"name": ob.name, "found": bpy.data.objects.get("BW_DOCTOR") is not None}

# 4. TRANSFORM. Read back through the evaluated world matrix, not the field we
#    just wrote, so a silently-ignored set cannot pass.
ob.location = (1.5, -2.0, 0.75)
ob.rotation_euler = (0.0, 0.0, 1.5707963)
ob.scale = (2.0, 2.0, 2.0)
bpy.context.view_layer.update()
mw = ob.matrix_world
report["transform"] = {
    "loc": [round(v, 4) for v in mw.translation],
    "scale": [round(v, 4) for v in mw.to_scale()],
}

# 5. MATERIAL, created and assigned and read back off the slot.
mat = bpy.data.materials.new("BW_DOCTOR_IRON")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.28, 0.29, 0.31, 1.0)
bsdf.inputs["Metallic"].default_value = 1.0
bsdf.inputs["Roughness"].default_value = 0.42
ob.data.materials.append(mat)
slot = ob.data.materials[0]
sb = slot.node_tree.nodes.get("Principled BSDF")
report["material"] = {
    "slots": len(ob.data.materials),
    "name": slot.name,
    "metallic": round(sb.inputs["Metallic"].default_value, 3),
    "roughness": round(sb.inputs["Roughness"].default_value, 3),
}

# 6. CUSTOM PROPERTY — this is how the pipeline carries sever points and
#    sockets through glTF, so it has to survive a round trip, not just a set.
ob["bw_sever_zone"] = "rightArm"
ob["bw_socket"] = "HandR"
report["custom_prop"] = {"zone": ob.get("bw_sever_zone"), "socket": ob.get("bw_socket")}

# 7. SAVE a .blend.
bpy.ops.wm.save_as_mainfile(filepath=${JSON.stringify(BLEND)})
report["save"] = {"path": bpy.data.filepath, "bytes": os.path.getsize(${JSON.stringify(BLEND)})}

# 8. EXPORT a GLB.
bpy.ops.object.select_all(action='DESELECT')
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
bpy.ops.export_scene.gltf(
    filepath=${JSON.stringify(GLB)},
    export_format='GLB',
    use_selection=True,
    export_extras=True,          # carries the custom properties
    export_apply=False,
)
report["export"] = {"bytes": os.path.getsize(${JSON.stringify(GLB)})}

# 9. MUTATE AGAIN, after the save+export. The connection surviving one write is
#    not the property we need; surviving a write AFTER heavy IO is.
ob.location.z = 9.25
mat2 = bpy.data.materials.new("BW_DOCTOR_WOOD")
ob.data.materials.append(mat2)
ob["bw_sever_zone"] = "leftLeg"
bpy.context.view_layer.update()

# 10. OBSERVE the new state.
report["mutate_again"] = {
    "z": round(ob.matrix_world.translation.z, 4),
    "slots": len(ob.data.materials),
    "zone": ob.get("bw_sever_zone"),
}

# 11. CLEAN UP the temporary content.
bpy.data.objects.remove(ob, do_unlink=True)
report["cleanup"] = {"remaining": [o.name for o in bpy.data.objects if o.name.startswith("BW_DOCTOR")]}
${EMIT("report")}
`;

console.log(`HEADLESS  (${BLENDER})`);
let r;
try { r = await run(SCRIPT); }
catch (e) { console.error(`  FAIL  session did not complete\n${e.message}`); process.exit(1); }
const v = r.value;
if (!v) { console.error("  FAIL  no fenced payload came back — Blender ran but returned nothing"); process.exit(1); }

ok("1  read scene", Array.isArray(v.read?.objects), `${v.read.objects.length} objects, ${v.read.fps} fps, scale ${v.read.scale_length}`);
ok("2  create", v.create?.verts === 8 && v.create?.polys === 6, `${v.create?.verts} verts / ${v.create?.polys} polys`);
ok("3  rename", v.rename?.name === "BW_DOCTOR" && v.rename?.found === true);
ok("4  transform", Math.abs(v.transform.loc[0] - 1.5) < 1e-3 && Math.abs(v.transform.scale[0] - 2) < 1e-3,
   `loc ${v.transform.loc.join(",")} scale ${v.transform.scale[0]}`);
ok("5  material", v.material?.slots === 1 && v.material?.metallic === 1 && v.material?.roughness === 0.42,
   `${v.material?.name} metallic ${v.material?.metallic} rough ${v.material?.roughness}`);
ok("6  custom property", v.custom_prop?.zone === "rightArm" && v.custom_prop?.socket === "HandR");
ok("7  save .blend", v.save?.bytes > 0 && existsSync(BLEND), `${v.save?.bytes} B`);
ok("8  export GLB", v.export?.bytes > 0 && existsSync(GLB), `${v.export?.bytes} B`);

// 9. VALIDATE the GLB as a container, not as a filename.
const buf = readFileSync(GLB);
const magic = buf.readUInt32LE(0), ver = buf.readUInt32LE(4), total = buf.readUInt32LE(8);
const jsonLen = buf.readUInt32LE(12), jsonTag = buf.readUInt32LE(16);
let gltf = null, jerr = "";
try { gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8")); } catch (e) { jerr = e.message; }
ok("9  GLB is a real glTF container",
   magic === 0x46546c67 && ver === 2 && total === buf.length && jsonTag === 0x4e4f534a && !!gltf,
   `magic ${magic.toString(16)} v${ver} ${total}B json ${jsonLen}B${jerr ? " " + jerr : ""}`);
if (gltf) {
  const mesh = gltf.meshes?.[0];
  const extras = gltf.nodes?.[0]?.extras ?? gltf.meshes?.[0]?.extras;
  ok("9a mesh + accessors survived", (gltf.accessors?.length ?? 0) > 0 && !!mesh,
     `${gltf.meshes?.length ?? 0} meshes, ${gltf.accessors?.length ?? 0} accessors, ${gltf.materials?.length ?? 0} materials`);
  ok("9b custom properties survived export", extras?.bw_socket === "HandR",
     extras ? JSON.stringify(extras) : "no extras on node 0 — export_extras did not carry them");
}
ok("10 mutate after IO", v.mutate_again?.z === 9.25 && v.mutate_again?.slots === 2 && v.mutate_again?.zone === "leftLeg",
   `z ${v.mutate_again?.z}, ${v.mutate_again?.slots} slots, zone ${v.mutate_again?.zone}`);
ok("11 cleanup", (v.cleanup?.remaining?.length ?? -1) === 0);

// ------------------------------------------------------------------ the GUI
if (LIVE) {
  console.log("\nLIVE  (running GUI on :9876)");
  if (!(await live())) {
    console.log(`  skip  ${BLENDER_CLOSED}`);
  } else {
    try {
      // Three round trips: the connection must survive more than one mutation.
      await run(`
import bpy
if "BW_LIVE" in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects["BW_LIVE"], do_unlink=True)
ob = bpy.data.objects.new("BW_LIVE", None)
bpy.context.scene.collection.objects.link(ob)
${EMIT('{"made": "BW_LIVE" in bpy.data.objects}')}`, { live: true });
      const a = await run(`
import bpy
ob = bpy.data.objects["BW_LIVE"]; ob.location = (3, 4, 5); ob["bw_tag"] = "moot"
bpy.context.view_layer.update()
${EMIT('{"z": round(bpy.data.objects["BW_LIVE"].matrix_world.translation.z, 3), "tag": bpy.data.objects["BW_LIVE"].get("bw_tag")}')}`, { live: true });
      ok("live mutate + read back", a.value?.z === 5 && a.value?.tag === "moot", JSON.stringify(a.value));
      const b = await run(`
import bpy
bpy.data.objects.remove(bpy.data.objects["BW_LIVE"], do_unlink=True)
${EMIT('{"left": [o.name for o in bpy.data.objects if o.name.startswith("BW_LIVE")]}')}`, { live: true });
      ok("live cleanup", (b.value?.left?.length ?? -1) === 0);
    } catch (e) { ok("live session", false, e.message.split("\n")[0]); }
  }
}

rmSync(WORK, { recursive: true, force: true });
console.log(`\n${failed ? `DOCTOR: ${failed} FAILED` : "DOCTOR: all checks passed"}`);
process.exit(failed ? 1 : 0);
