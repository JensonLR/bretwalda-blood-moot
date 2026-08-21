// Shared material instances for the arena.
//
// Every material the world builds comes from here so that a texture or PBR
// change happens once, not forty times across a build loop, and so the arena's
// forty palisade stakes share one program and one uniform block. Materials that
// are mutated per-instance (health-bar tint, damage numbers) deliberately do
// NOT live here — see hud3d.ts.
//
// The colour numbers in the catalog are the arena's art direction and they
// still mean exactly what they meant before anything was textured. That is not
// automatic: `map × color` would otherwise multiply the substance's own colour
// into the catalog's and land somewhere much darker. Every textured material's
// colour is therefore divided by its map's mean, so the two multiply back out
// to the number written here. Change a catalog colour and you change what that
// surface reads as; change nothing and the arena grades the same as it did.
//
// The same argument applies to the two scalars a map modulates, and it was not
// being made. `roughness` and `metalness` are reconciled against what the map
// *actually* carries — measured off the packed channel — rather than against
// the number the recipe declares it was authored at. Those two parted company
// when textures.ts started baking specular anti-aliasing into the roughness
// channel: steel's recipe still says 0.18 and its map now means 0.316. See
// `packedMeans`; the divergence is why the metals went matte.
//
// And density is in metres, not in UV. See `WORLD_TILE`.
import * as THREE from "three";
// The colour/roughness numbers here are the arena's art direction. They came
// out of the original inline build code unchanged; treat a change to one as a
// change to how that substance reads, not as a tweak. `surface` says what the
// thing is made of; `repeat` says how big that substance is on this mesh, and
// only still means anything for the substances outside `WORLD_TILE` — the rest
// are sized in metres, because texel density has to stay consistent between
// objects or §2 of the bar fails.
const CATALOG = {
    ground: { color: 0xffffff, roughness: 0.96, metalness: 0, vertexColors: true, surface: "groundDetail", repeat: [22, 22] },
    grassTuft: { color: 0x4a5c2e, roughness: 0.95, metalness: 0, surface: "grass", repeat: [1, 1] },
    rock: { color: 0x6a7078, roughness: 0.98, metalness: 0, surface: "granite", repeat: [2, 2] },
    palisade: { color: 0x5a4127, roughness: 0.95, metalness: 0, surface: "oak", repeat: [2, 5] },
    palisadeBinding: { color: 0x2a2018, roughness: 0.98, metalness: 0, surface: "rope", repeat: [8, 1] },
    poleWood: { color: 0x4a3018, roughness: 0.9, metalness: 0, surface: "oak", repeat: [2, 6] },
    torchCup: { color: 0x2a2a2e, roughness: 0.5, metalness: 0.7, surface: "iron", repeat: [2, 1] },
    // The fire entries no longer draw a flame — vfx.ts owns those — but they are
    // still what a coal bed and a hearth seen through a doorway are made of, and
    // those have to clear the bloom threshold or the one genuinely hot thing in
    // the arena is the only thing in it that does not glow.
    //
    // Every number in this block used to be roughly *twice* its own clip point,
    // because they were sized to clear a gate of 5.0 that the grade could never
    // reach — so each one arrived as a flat white-pink footprint with no hue,
    // which is what made the coal bed read as marshmallows. The gate is 2.55 now,
    // and the ceiling is per-hue: running the full chain, a source clips at the
    // peak channel, and for these near-red emissives that lands at 2.3–2.5. Sit
    // between the two and a coal is both hot to the bright pass and still orange.
    //
    // 2.8 with the hue pulled off the red axis (0xff8a2e, not 0xff7711): a torch
    // is the smallest hot thing in the frame and wants the most bloom, and moving
    // green up buys the peak channel room before the split-tone's red multiply.
    torchFlame: { color: 0xffbb44, roughness: 1, metalness: 0, emissive: 0xff8a2e, emissiveIntensity: 2.8 },
    bonfireLog: { color: 0x3a2515, roughness: 0.98, metalness: 0, surface: "oak", repeat: [1, 4] },
    // Coals: opaque lumps, not flame. The old `opacity: 0.9` bought nothing on a
    // solid icosahedron and cost the whole instanced bed a sorted transparent
    // pass.
    // 0xff8a28 at 2.2: this is the pale-peach coal bed, and it was measuring
    // [254, 203, 165] — a lump whose R had clipped while the crosstalk dragged G
    // and B up behind it. 0xff5500 at 5.6 was 2.4x its own clip point of ~2.32.
    bonfireFlame: { color: 0xffaa33, roughness: 1, metalness: 0, emissive: 0xff8a28, emissiveIntensity: 2.2 },
    // Firelight through the hall door. Its footprint is ~12 px in `laststand`, so
    // every pixel of it is either the blob or its edge; as a flat opaque quad at
    // intensity 7 it drew a hard uniform orange square that two critic panels read
    // as a UI glitch, and one of them traced to the HUD.
    hearthGlow: { color: 0xffb055, roughness: 1, metalness: 0, emissive: 0xff6a1e, emissiveIntensity: 2.2, glow: true },
    hutWall: { color: 0x6a553c, roughness: 0.95, metalness: 0, surface: "plank", repeat: [3, 2] },
    hutRoof: { color: 0x41301c, roughness: 0.98, metalness: 0, surface: "thatch", repeat: [7, 3] },
    hutDoor: { color: 0x2a1c0e, roughness: 0.95, metalness: 0, surface: "plank", repeat: [1, 2] },
    barrel: { color: 0x6a4a28, roughness: 0.9, metalness: 0, surface: "plank", repeat: [4, 1] },
    barrelBand: { color: 0x3a3a3e, roughness: 0.5, metalness: 0.7, surface: "iron", repeat: [6, 1] },
    bannerRed: { color: 0x8a2530, roughness: 0.9, metalness: 0, surface: "linen", repeat: [3, 5] },
    bannerBlue: { color: 0x2c4a8a, roughness: 0.9, metalness: 0, surface: "linen", repeat: [3, 5] },
    spearShaft: { color: 0x5a3c22, roughness: 0.85, metalness: 0, surface: "oak", repeat: [1, 8] },
    spearTip: { color: 0xb8bfc8, roughness: 0.2, metalness: 0.9, surface: "steel", repeat: [1, 1] },
    debrisBlade: { color: 0xaab2bc, roughness: 0.3, metalness: 0.8, surface: "steel", repeat: [1, 3] },
    debrisHilt: { color: 0x3a2a18, roughness: 0.9, metalness: 0, surface: "leather", repeat: [1, 1] },
    runestone: { color: 0x7a7d84, roughness: 0.92, metalness: 0, surface: "granite", repeat: [1, 3] },
    // Sized against the bloom threshold, which is the only thing that decides
    // whether a rune glows or merely is blue. The bright pass measures the max
    // channel, so what matters here is the blue: 0x2288dd carries 0.68 linear in
    // it, and 5.0 puts that at 3.4 — clear of the 2.55 gate with enough margin
    // that the carved bottoms of the strokes glow and not only their edges.
    //
    // Blue keeps far more headroom than the fire hues do (it clips at ~6.25
    // rather than ~2.4, because the split-tone's warm highlight tint pushes red
    // and leaves blue alone), so this is the one emissive in the catalogue that
    // can afford to sit well over its gate.
    runeGlow: { color: 0x66c8ff, roughness: 0.4, metalness: 0, emissive: 0x2288dd, emissiveIntensity: 5 },
    bloodDecal: { color: 0x4a0a08, roughness: 0.35, metalness: 0, surface: "blood", repeat: [1, 1], decal: true },
};
// ---------------------------------------------------------------------------
// Texel density in metres
// ---------------------------------------------------------------------------
/**
 * How much of the world one tile of a substance covers, in metres.
 *
 * A UV repeat is not a density. Every geometry this file dresses parameterises
 * u and v over 0..1 whatever it is the size of — characters.ts's shells run u
 * once round the girth, three's BoxGeometry gives each face its own 0..1 — so a
 * fixed repeat means texel size scales with *1/size* and no two surfaces on a
 * warrior agree. Measured off `art/shots/v6/stance.png`: the berserker's hide
 * jerkin (`hide`, repeat 4, girth ~1.1 m) put leather's crease net at 70-140 mm
 * a cell, which is not leather, it is wickerwork; the same material on his
 * bracer landed at 20 mm and read as crocodile; mail rings came out at 45 mm
 * against a life size of 10 and read as knitting. That is the ~4x scatter, and
 * an absolute error of 4-10x underneath it.
 *
 * So the numbers below are physical. Where a recipe draws a countable lattice,
 * the number is arithmetic — (cells per tile) x (what one cell is in life), the
 * counts being in textures.ts:
 *
 *   mail     10 x 14 rings          -> 11 mm ring, 7.9 mm row pitch
 *   steel    13 chevrons, 260 lanes -> 23 mm pattern-weld figure, 1.2 mm hone
 *   iron     42 planish, 176 pits   -> 13 mm hammer facet, 3.1 mm pit
 *   bronze   44 pits, 5 cast blooms -> 3.6 mm pit, 32 mm bloom
 *   bone     176 pores, 3 cracks    -> 0.5 mm porosity, 30 mm crack
 *
 * Leather and skin are the two whose recipes are noise fields rather than
 * lattices, and for those the tap count is a bad predictor: what the eye picks
 * out is the base octave of the ridged field the creases and the wrinkle net are
 * built from, which measures about four times coarser than the tap scale
 * suggests. Both were set off a render instead — spectra taken down the lit
 * centre of a torso-sized and a bracer-sized cylinder at the portrait framing.
 * Arithmetic put leather at 0.07 and skin at 0.06; the frame said the dominant
 * crease was still 38 mm and the wrinkle net still 31 mm, which is elephant hide
 * and woodgrain. Halved, both land near 15 mm, which is worn leather and skin.
 *
 * Cloth is deliberately absent. characters.ts already sizes wool from the
 * garment's girth (`clothRepeat`), which is the same correction arrived at from
 * the other end; taking wool world-space here would apply it twice. Same for the
 * arena's timber, thatch, granite and turf, whose repeats world.ts authored
 * per-mesh against geometry it can see and this file cannot.
 *
 * Legibility, not literalism, decides where a number sits inside its bracket.
 * The portrait framing runs about 354 px/m, so 11 mm of mail is 3.9 px — a ring
 * that reads as a ring. The arena framing runs 76 px/m, which puts the same ring
 * at 0.84 px: under Nyquist, where it belongs to the mip chain rather than to
 * the frame, and mips are exactly what textures.ts's band-limiting and baked
 * specular AA made safe to land on. Rendered at both framings before landing;
 * the arena pass is the one that matters, and the finer mail mips to a clean
 * metallic sheen where the old ring was still large enough to beat against the
 * pixel grid.
 *
 * Dominant wavelength before and after, down the lit centre of a torso-sized and
 * a bracer-sized cylinder at the portrait framing:
 *
 *              torso (girth 1.19 m)      bracer (girth 0.31 m)
 *   leather    80.7 mm -> 18.2 mm        32.3 mm -> 17.4 mm
 *   mail row   15.7 mm ->  7.9 mm        rings were 40 x 15, now 11 x 7.9
 *   skin        113 mm -> 17.8 mm        forearm; the face used to disagree
 *
 * The second column is the whole point: one substance on two parts at one grain,
 * where before the same leather was 2.5x apart on the same warrior.
 */
const WORLD_TILE = {
    mail: 0.11,
    steel: 0.3,
    iron: 0.55,
    bronze: 0.16,
    leather: 0.035,
    skin: 0.035,
    bone: 0.09,
};
/**
 * Projects a substance from object space instead of from the mesh's UVs.
 *
 * three offers one lever on density, `Texture.repeat`, and it is per texture and
 * therefore shared by every mesh wearing the material — which is the whole point
 * of this file and also why the density cannot be fixed on the CPU. The lever
 * that does exist is the fragment shader: derive the UV from the vertex's own
 * object-space position, in metres, and texel size stops depending on how the
 * mesh was parameterised at all.
 *
 * Object space, not world space. A world-space projection on a warrior who walks
 * is a warrior whose mail swims over him. Every part here is rigid under
 * animation — anim.ts moves nodes, nothing is skinned — so the geometry's own
 * frame is body-fixed and the substance stays put.
 *
 * One tap, dominant axis, no triplanar blend. Three taps a map is not what the
 * phone tier has spare, and the seam a hard select leaves is smaller than it
 * sounds: the two projections either side of a switch differ only in the sign of
 * u, so half the meridians are continuous outright and the other half shift the
 * pattern by rather less than one tile with no change of scale or direction.
 * Where it would show most — a chest, a shield face, a helm crown, any plane
 * facing the camera — one projection owns the whole surface and there is no
 * switch in frame at all.
 *
 * Implemented by shadowing three's UV varyings with locals at the top of
 * `main()` rather than by rewriting `map_fragment` and its four siblings. Same
 * result, five lines instead of a hundred and fifty, and nothing here breaks the
 * next time three edits a chunk body. It also gets normal mapping right for
 * free: `normal_fragment_begin` builds its tangent frame from screen-space
 * derivatives of `vNormalMapUv`, so a shadowed UV re-derives a matching frame.
 */
function projectFromObjectSpace(m, tileMetres) {
    const perMetre = 1 / tileMetres;
    const body = `
	// The 1.5 on z is where the seam goes, not what it looks like. Untilted, the
	// switch between the two side projections sits at 45 degrees off front,
	// which on a limb is two thirds of the way out and square to the camera;
	// weighted, it moves to 56 degrees and 0.83 of the radius, where the surface
	// is steeply foreshortened, dark and about to become silhouette. Object
	// space, and characters.ts builds every part facing +z, so this holds
	// whichever way the warrior is turned.
	vec3 bwN = abs( vSubstanceNrm ) * vec3( 1.0, 1.0, 1.5 );
	vec2 bwUv = bwN.x > max( bwN.y, bwN.z ) ? vSubstancePos.zy
	          : bwN.y > bwN.z               ? vSubstancePos.xz
	                                        : vSubstancePos.xy;
	bwUv *= ${perMetre.toFixed(4)};
	#ifdef USE_MAP
		vec2 vMapUv = bwUv;
	#endif
	#ifdef USE_NORMALMAP
		vec2 vNormalMapUv = bwUv;
	#endif
	#ifdef USE_ROUGHNESSMAP
		vec2 vRoughnessMapUv = bwUv;
	#endif
	#ifdef USE_METALNESSMAP
		vec2 vMetalnessMapUv = bwUv;
	#endif
	#ifdef USE_AOMAP
		vec2 vAoMapUv = bwUv;
	#endif
`;
    m.onBeforeCompile = (shader) => {
        // `transformed` and `objectNormal` rather than the raw attributes, so a
        // morph or a skin — neither of which this game uses yet — would not silently
        // detach the substance from the surface it is on.
        const vert = `varying vec3 vSubstancePos;\nvarying vec3 vSubstanceNrm;\n${shader.vertexShader}`
            .replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvSubstancePos = transformed;\n\tvSubstanceNrm = objectNormal;");
        const frag = `varying vec3 vSubstancePos;\nvarying vec3 vSubstanceNrm;\n${shader.fragmentShader}`
            .replace("void main() {", `void main() {\n${body}`);
        // Both or neither. A fragment shader projecting off a varying the vertex
        // shader never wrote is not a degraded surface, it is a black one, and the
        // failure mode of leaving the UV path alone is a surface at the wrong
        // density — which is where this started and is survivable.
        if (vert === shader.vertexShader || frag === shader.fragmentShader)
            return;
        shader.vertexShader = vert;
        shader.fragmentShader = frag;
    };
    // three keys the program cache on `onBeforeCompile.toString()`, which is the
    // same string for every density because the density lives in the closure. Two
    // substances at different scales would share one compiled program and one of
    // them would silently wear the other's.
    const key = `substance-object-uv:${perMetre.toFixed(4)}`;
    m.customProgramCacheKey = () => key;
}
/**
 * The armoury sells finishes, and a finish is a different metal, not a coat of
 * paint. Anything not listed is a tinted mail hauberk.
 */
const FINISH_SUBSTRATE = {
    0x8a97a5: "steel", // Polished Steel
    0x2a2f38: "iron", // Blackened Steel
    0x8a6a3a: "bronze", // Bronze Scales
};
/**
 * Divides a requested colour by the map's mean so `map × color` averages out to
 * the colour that was asked for. Without this, texturing a material silently
 * darkens it by the albedo's own brightness and the whole palette drifts.
 */
/**
 * The mean of one channel of a packed map, measured rather than declared.
 *
 * `SurfaceInfo.roughness` and `.metalness` are the recipe's *authored* scalars,
 * and this file used to divide by them on the assumption that they described the
 * map. They did once. textures.ts now bakes specular anti-aliasing into the
 * roughness channel on the way out, and that pass is asymmetric by design — it
 * barely touches a rough substance and it swamps a smooth one — so exactly the
 * surfaces whose read depends on roughness are the ones whose declared number
 * stopped being true. Measured across the library: thatch 0.98 -> 0.974, oak
 * 0.88 -> 0.856, mail 0.45 -> 0.408, and steel 0.18 -> 0.316, which is 76% out.
 *
 * A tenth of the texels, on a stride that is coprime with the row length so the
 * walk does not sample one column of a lattice pattern forever. Under 0.1 ms on
 * a 512² map, once per substance, against a texture generation budget of 250.
 */
const channelStats = new Map();
/**
 * How far a scalar may be pushed to land the product on the number asked for.
 * The ceiling exists so a substance whose channel is nearly black cannot turn a
 * modest request into a runaway multiplier; four covers every reconciliation the
 * library actually needs, the widest being steel at 1.33.
 */
const clampScalar = (v) => Math.min(4, Math.max(0, v));
/**
 * Effective metalness per material — see `adopt`. A WeakMap because a disposed
 * material should not be kept alive by its own bookkeeping.
 */
const metalFraction = new WeakMap();
function packedMeans(key, tex) {
    if (!tex)
        return null;
    const cached = channelStats.get(key);
    if (cached)
        return cached;
    const image = tex.image;
    const data = image?.data;
    if (!(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray))
        return null;
    const texels = data.length >> 2;
    if (texels === 0)
        return null;
    const stride = Math.max(1, Math.floor(texels / 26_000) * 2 + 1);
    let rough = 0;
    let metal = 0;
    let n = 0;
    for (let i = 0; i < texels; i += stride) {
        rough += data[i * 4 + 1];
        metal += data[i * 4 + 2];
        n++;
    }
    const stats = { rough: rough / (n * 255), metal: metal / (n * 255) };
    channelStats.set(key, stats);
    return stats;
}
function compensate(hex, mean) {
    // The floor has to sit below the darkest channel any map actually has —
    // blackened iron and blood are down at 0.003 linear, and a floor above that
    // silently shifts their hue instead of preserving it. The ceiling only exists
    // so a mistake somewhere upstream cannot produce an emissive-looking surface.
    const c = new THREE.Color(hex);
    c.r = Math.min(8, c.r / Math.max(0.004, mean[0]));
    c.g = Math.min(8, c.g / Math.max(0.004, mean[1]));
    c.b = Math.min(8, c.b / Math.max(0.004, mean[2]));
    return c;
}
export function createMaterialLibrary(textures, settings) {
    // Kept even though nothing reads it: which maps a tier carries is decided in
    // textures.ts, where the memory is actually spent, and a material-level tier
    // decision (a cheaper shading model on low, say) should not have to ripple a
    // signature change out through the orchestrator to get here.
    void settings;
    const named = new Map();
    const adhoc = new Map();
    const tints = new Map();
    let env = null;
    let envIntensity = 1;
    /**
     * Applies a surface's maps and reconciles the scalars the maps now modulate.
     * Which maps exist is the texture library's call, not this one's — the low
     * tier hands back albedo and normal only, and every branch below reads as
     * "if there is a map for this, defer to it".
     */
    function dress(m, surface, repeat, color, roughness, metalness, tileOverride) {
        const info = textures.info(surface);
        const tile = tileOverride ?? WORLD_TILE[surface];
        // A world-sized substance takes the untiled instance: its UVs come out of
        // the shader, so a repeat clone would be a second texture object carrying a
        // transform nothing downstream ever reads.
        const maps = tile === undefined
            ? textures.tiled(surface, repeat[0], repeat[1])
            : textures.surface(surface);
        // Assigned rather than passed to the constructor, because three warns
        // loudly about parameters that are present but undefined.
        if (maps.map)
            m.map = maps.map;
        if (maps.normalMap) {
            m.normalMap = maps.normalMap;
            m.normalScale.set(info.normalScale, info.normalScale);
        }
        if (maps.roughnessMap)
            m.roughnessMap = maps.roughnessMap;
        // Only metals carry anything in .b, and binding the map anyway would cost
        // every plank and tunic in the arena a texture fetch that returns zero.
        if (maps.metalnessMap && info.metalness > 0)
            m.metalnessMap = maps.metalnessMap;
        if (maps.aoMap) {
            m.aoMap = maps.aoMap;
            m.aoMapIntensity = info.aoIntensity;
        }
        m.color.copy(compensate(color, info.mean));
        // three multiplies the scalar by the map channel, so with an ORM attached
        // the scalar has to be whatever lands the *average* on the number asked for
        // — that is how `palisade` stays a touch rougher than `poleWood`. Against
        // the map's measured mean, not the recipe's declared one: dividing by a
        // stale 0.18 asked steel for a scalar of 2.33, the old clamp cut that to 2,
        // and 2 x a channel that really means 0.316 rendered a 0.42 blade at 0.63.
        // Every `blade()` request above 0.36 collapsed onto that same clamp, so the
        // shield boss, the helm crown and the sword all came out one matte grey.
        const packed = packedMeans(maps.roughnessMap?.name || surface, maps.roughnessMap);
        if (packed) {
            m.roughness = clampScalar(roughness / Math.max(0.02, packed.rough));
        }
        else {
            m.roughness = roughness;
        }
        if (m.metalnessMap && packed) {
            m.metalness = clampScalar(metalness / Math.max(0.02, packed.metal));
        }
        else {
            m.metalness = metalness;
        }
        // What the surface will actually shade as, which is what decides how much
        // environment it is owed. Kept because `metalness` is now a bias and no
        // longer readable as a fraction.
        metalFraction.set(m, Math.min(1, m.metalness * (m.metalnessMap && packed ? packed.metal : 1)));
        if (tile !== undefined)
            projectFromObjectSpace(m, tile);
        if (info.cutout) {
            m.transparent = true;
            m.depthWrite = false;
            m.alphaTest = 0.04;
        }
    }
    /**
     * A radial alpha falloff for `glow` specs, generated once and shared.
     *
     * The profile is deliberately not a gaussian. A gaussian's tail is still
     * measurably above zero at the quad's rim, which on a 12 px footprint puts
     * the whole falloff inside two pixels and leaves the edge as hard as it
     * started. This one reaches exactly zero at r = 1 and spends its slope in the
     * middle, so the blob is soft over its whole radius at every size it is seen
     * at. Taller than wide is deliberate: a hearth throws light up the far wall.
     */
    let falloff = null;
    function glowFalloff() {
        if (falloff)
            return falloff;
        const N = 64;
        const data = new Uint8Array(N * N * 4);
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const u = ((x + 0.5) / N) * 2 - 1;
                const v = ((y + 0.5) / N) * 2 - 1;
                const r = Math.min(1, Math.hypot(u, v * 0.82));
                const t = 1 - r;
                // A hot core with a long shoulder: t^0.55 near the middle would flatten
                // it into the same slab, so the core is a separate narrow term added on
                // top of a broad quadratic skirt.
                const a = 0.72 * t * t + 0.28 * Math.pow(t, 6);
                const b = Math.round(255 * a);
                const i = (y * N + x) * 4;
                data[i] = b;
                data[i + 1] = b;
                data[i + 2] = b;
                data[i + 3] = 255;
            }
        }
        falloff = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
        falloff.wrapS = THREE.ClampToEdgeWrapping;
        falloff.wrapT = THREE.ClampToEdgeWrapping;
        falloff.minFilter = THREE.LinearFilter;
        falloff.magFilter = THREE.LinearFilter;
        falloff.needsUpdate = true;
        return falloff;
    }
    function build(name, spec) {
        const m = new THREE.MeshStandardMaterial({
            color: spec.color,
            roughness: spec.roughness,
            metalness: spec.metalness,
            vertexColors: spec.vertexColors ?? false,
            emissive: spec.emissive ?? 0x000000,
            emissiveIntensity: spec.emissiveIntensity ?? 1,
            transparent: spec.opacity !== undefined,
            opacity: spec.opacity ?? 1,
        });
        m.name = name;
        if (spec.surface) {
            dress(m, spec.surface, spec.repeat ?? [1, 1], spec.color, spec.roughness, spec.metalness);
        }
        if (spec.decal) {
            m.polygonOffset = true;
            m.polygonOffsetFactor = -2;
        }
        if (spec.glow) {
            m.alphaMap = glowFalloff();
            m.transparent = true;
            m.depthWrite = false;
            // Additive, so the blob cannot present a silhouette against what is
            // behind it: the darker the doorway, the more of the glow survives, which
            // is how light spill actually behaves.
            m.blending = THREE.AdditiveBlending;
            m.side = THREE.DoubleSide;
            m.toneMapped = true;
        }
        return m;
    }
    /**
     * Hands a material the sky's PMREM, and decides how much of it that material
     * is owed.
     *
     * sky.ts grades the environment to 0.42, and its reasoning is about *diffuse*
     * image-based light: a PMREM is a convolution of the whole sphere, half of
     * which is turf a standing surface cannot see, so at full strength it is the
     * largest indirect term in the frame and it is one colour. That argument does
     * not reach a metal. A metal has no diffuse term at all — the environment is
     * the entire ambient contribution it gets — and lighting.ts's ambient and
     * hemisphere, which carry the sky-light the 0.42 hands back to everything
     * else, are diffuse-only and pay a metal nothing. So a dielectric keeps the
     * sky's number and a metal is brought back to 1, which is neutral rather than
     * a boost: the helm crown and the shield boss return the ember horizon at its
     * real radiance, and that horizon sits at four linear units against a bloom
     * threshold of five, so they read as steel without smearing.
     */
    function adopt(m) {
        if (m instanceof THREE.MeshStandardMaterial) {
            // Assigned even when null: sky.ts nulls the environment on dispose, and a
            // material still pointing at a released render target is a use-after-free
            // waiting for the next mood change to rebake.
            m.envMap = env;
            const metal = metalFraction.get(m) ?? Math.min(1, m.metalness);
            // Only ever a lift toward neutral, never a cut: if the sky ever asks for
            // more than 1 that is a deliberate over-drive and metals keep it too.
            m.envMapIntensity = envIntensity < 1 ? envIntensity + (1 - envIntensity) * metal : envIntensity;
            m.needsUpdate = true;
        }
        return m;
    }
    function tint(surface, color, opts = {}) {
        const info = textures.info(surface);
        // A world-sized substance has one density, so a caller's repeat is dropped
        // out of the key as well as out of the dressing — otherwise `flesh()` and
        // characters.ts's own `tinted("skin", …, { repeat: 2 })` mint two identical
        // materials, and eight warriors stop sharing a program over a number
        // neither of them can act on any more.
        const tile = opts.tile ?? WORLD_TILE[surface];
        const worldSized = tile !== undefined;
        const repeat = worldSized ? 1 : opts.repeat ?? info.repeat;
        const roughness = opts.roughness ?? info.roughness;
        const metalness = opts.metalness ?? info.metalness;
        const key = `${surface}|${color}|${roughness}|${metalness}|${repeat}|${tile ?? ""}`;
        let m = tints.get(key);
        if (!m) {
            m = new THREE.MeshStandardMaterial();
            m.name = `${surface}:${color.toString(16)}`;
            dress(m, surface, [repeat, repeat], color, roughness, metalness, opts.tile);
            adopt(m);
            tints.set(key, m);
        }
        return m;
    }
    return {
        get(name) {
            let m = named.get(name);
            if (!m) {
                m = adopt(build(name, CATALOG[name]));
                named.set(name, m);
            }
            return m;
        },
        tinted: tint,
        armour(color) {
            const substrate = FINISH_SUBSTRATE[color] ?? "mail";
            // Mail is drawn over a gambeson, so its own roughness already covers both;
            // the plate finishes keep the polish their price paid for. No repeat: all
            // four substrates size themselves in metres, so a hauberk, a coif and a
            // pair of vambraces finally carry the same ring.
            return tint(substrate, color);
        },
        tunic(color) {
            return tint("wool", color, { repeat: 5 });
        },
        hide(color) {
            return tint("leather", color);
        },
        flesh(color) {
            return tint("skin", color);
        },
        blade(color, roughness) {
            return tint("steel", color, { roughness });
        },
        timber(color) {
            return tint("oak", color, { repeat: 3 });
        },
        standard(color, roughness = 0.8, metalness = 0) {
            const key = `${color}|${roughness}|${metalness}`;
            let m = adhoc.get(key);
            if (!m) {
                m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
                // Untextured, so the scalar is the fraction and no reconciliation ran.
                metalFraction.set(m, Math.min(1, metalness));
                adopt(m);
                adhoc.set(key, m);
            }
            return m;
        },
        setEnvironment(next, intensity = 1) {
            env = next;
            envIntensity = intensity;
            for (const m of named.values())
                adopt(m);
            for (const m of adhoc.values())
                adopt(m);
            for (const m of tints.values())
                adopt(m);
        },
        dispose() {
            // Textures belong to the library that made them — except the glow
            // falloff, which is ours because no surface recipe describes it.
            falloff?.dispose();
            falloff = null;
            for (const m of named.values())
                m.dispose();
            for (const m of adhoc.values())
                m.dispose();
            for (const m of tints.values())
                m.dispose();
            named.clear();
            adhoc.clear();
            tints.clear();
        },
    };
}
