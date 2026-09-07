# Stage 5: merging a warrior's meshes across parts

Written 7 Sep 2026, on the owner's ruling: *write it up as a costed plan, don't
start it.* Nothing in this document has been built. It exists so the work can be
**scheduled against the branches it collides with** rather than started into
them, and so nobody re-derives the costing a fourth time.

`docs/PERFORMANCE.md` §"What a stage-5 fix can and cannot buy" is the source of
the numbers; this is the executable version of it.

---

## 1. What the prize actually is

A warrior is **47 meshes** on the median class. Eight of them are **348 of the
499 visible meshes in the arena — 70% of everything drawn.**

`tools/framecost.mjs` prints the floor in its own census:

```
8 warriors are 348 meshes — 70% of everything visible in the arena, and a merge
by material could take them to 206 (142 fewer draws before the shadow pass doubles it).
```

Per tier, from `PERFORMANCE.md`:

```
low               289 warrior meshes  ->  158     131 fewer
medium / high     417 warrior meshes  ->  229     188 fewer
```

Multiplied by one plus the casting-light count, at `high` that is **about 940
draw calls of 4,204 — 22%.**

**It is a floor, not a target.** Two meshes can only become one call if they
share a material, so the merge can never go below the man's distinct material
count. That number is 23–30 today (`framecost` prints it per warrior, labelled
"the stage-5 FLOOR").

## 2. Why it has not been done, precisely

Not skinning. `anim.ts`'s `articulate` **already** builds one 17-bone
`THREE.Skeleton` per warrior and rebinds limbs as `SkinnedMesh`.

**The blocker is that the eight parts are posed by their PIVOT's transform
rather than by a bone.** Two meshes on different pivots cannot share one
geometry buffer, because the buffer has one transform and they need two.

So landing it means:

1. moving the pivot transforms into bones,
2. baking each pivot's offset into its vertices,
3. merging by material across parts.

Step 1 is **a rewrite of `anim.ts`'s posing**, and `PERFORMANCE.md` records that
**two other branches also hold that file**. That is the actual reason this is a
scheduling problem and not a coding one.

## 3. What a fixer will get wrong, listed in advance

* **Merging naively breaks severing.** Limbs come off (`ZONE_SEAM` in
  `characters.ts`, gated by `severtest`). A merge that fuses an arm into the
  torso makes an arm that cannot leave. **Merge by (bone, material), never by
  material alone** — siblings on one bone move together and sever together, so
  the grouping is exact. This is the same argument the shadow proxy already
  won: *"Siblings share a parent, so their relative transform is fixed for the
  life of the rig and merging them is exact."*
* **Merging naively breaks cosmetics.** Kit is hidden and shown per man
  (`mesh.visible = false` at `characters.ts:12733`, `:12796`). Anything the
  armoury can toggle must survive the merge as its own group, or be merged
  **after** the loadout is resolved. `cosmetictest` and `wearmeasure` are the
  gates that catch this.
* **Reducing the material count first buys nothing.** Tempting, and checked:
  kit materials are already minted **once per warrior** (`const mail =
  M.armour(kit.mail)`), so one man already shares one mail material across
  every mail piece. The 47 meshes persist because `Part.merge()` merges only
  **within** each of the eight parts — mail on the torso, both arms and both
  legs is five draws whatever the material count is. Material reduction lowers
  the merge's FLOOR; it does not perform the merge. **The two are complementary
  and the order is: merge first, then reduce the floor.**
* **`mergeGeometries` refuses a list whose attribute sets disagree**, and the
  fallback is one draw call per piece — a silent no-op that looks like success.
  `Part.add`'s `VERTEX_TINTED` invariant exists for exactly this and must be
  preserved. A merge that appears to land and changes no draw-call count is the
  expected failure mode; **count the calls, do not assume them.**

## 4. The order of work

1. **Move the eight pivots to bones**, baking offsets into vertices. No merge
   yet. `weightprobe`, `severtest`, `cosmetictest`, `wearmeasure`, `helmclash`
   and `clipseen` all pass unchanged, and `framecost`'s draw-call count is
   **unmoved** — this step is deliberately a no-op on the numbers, which is what
   makes it reviewable on its own.
2. **Merge by (bone, material)** behind a flag, defaulting off.
3. **Measure both arms on one build** — `framecost --quality=high --params=…`,
   which is what `--params` is for. On a real GPU: the frame rate. Anywhere: the
   draw-call count.
4. **Judge the picture.** A fightcard capture at the same seed and turn, against
   a same-build control captured twice, per the protocol the lossy-cull round
   used. That round was **refused** on exactly this evidence — the man came out
   four luma points brighter — so the capture is not a formality.
5. **Then** reduce the material count, which lowers the floor the merge is now
   sitting on. `VERTEX_TINTED` and `Part.paint` already do this for the face.

## 5. What would make this NOT worth doing

Stated up front so the answer is not decided by sunk cost:

* If step 1 cannot be made a numerical no-op, the rewrite is not separable from
  the merge and both land in one unreviewable change.
* If the picture moves at step 4 the way the lossy cull's did, 22% is not worth
  it — that precedent is in `OPEN-DEFECTS.md` and it went the other way.
* If the other two branches holding `anim.ts` land posing changes first, this
  costing is stale and must be re-derived before, not during.

## 6. What was taken instead, and what remains

The hearth beam's shadow now runs on the settlement cascade's cadence
(7 Sep 2026) — the same shadow, half the passes, no light deleted. That was
available because it needed no posing rewrite.

**Refused in writing, and it stays refused:** cutting the shadow-casting light
count or the render scale. Both change what the player sees and both belong to
the owner. When the beam was examined for it, dropping the light was rejected
on its merits — the hearth is a key light on the dusk rig, not decoration.
