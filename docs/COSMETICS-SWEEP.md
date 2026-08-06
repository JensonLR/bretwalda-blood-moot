# The cosmetics sweep

Written by `npm run cosmetictest` on 2026-08-06. Do not edit by hand — re-run the harness.

**47 options across 8 slots. 19 s wall clock, 0 rendered captures.**

## How to read it

- **SIL%** — symmetric difference of the two coverage masks over their union, with materials, light and pose taken away entirely. The outline and only the outline.
- **FORM%** — share of the overlap where the nearest surface moved more than 2 mm. Two helmets can share an outline and differ inside it; SIL cannot see that.
- **ΔE** — CIELAB ΔE76 between the two catalogue swatches. Below 2.3 they are one colour.
- **PIX%** — mean per-pixel difference in the real renderer, fixed rig, fixed light, fixed virtual clock.
- **verdict** — IDENTICAL below 0.05% (the same object with two prices), FAINT below 1%, else DIFFERS.

A 0.00% in the SIL and FORM columns of a shape slot is a defect. A 0.00% in those columns of a colour slot is correct and expected — that is what a recolour is, and it is why the colour column exists.

## Every adjacent pair

| slot | pair | cost | ΔE | SIL% portrait | FORM% portrait | SIL% fight | FORM% fight | PIX% | verdict |
|---|---|---|---|---|---|---|---|---|---|
| helm | Bare Head -> Iron Spangenhelm | 30g | — | 12.01% | 44.90% | 2.41% | 7.63% | — | DIFFERS |
| helm | Iron Spangenhelm -> Nasal Helm | 110g | — | 3.02% | 9.84% | 0.64% | 2.04% | — | DIFFERS |
| helm | Nasal Helm -> Shadow Hood | 120g | — | 8.89% | 48.80% | 1.84% | 8.70% | — | DIFFERS |
| helm | Shadow Hood -> Ridge Helm | 190g | — | 8.19% | 49.37% | 1.66% | 8.77% | — | DIFFERS |
| helm | Ridge Helm -> Spectacle Helm | 280g | — | 1.21% | 16.77% | 0.20% | 3.19% | — | DIFFERS |
| helm | Spectacle Helm -> Boar-Crest Helm | 380g | — | 1.31% | 15.30% | 0.22% | 2.85% | — | DIFFERS |
| helm | Boar-Crest Helm -> Jarl's Crowned Helm | 570g | — | 1.91% | 5.66% | 0.46% | 1.28% | — | DIFFERS |
| helm | Jarl's Crowned Helm -> Wyrm-Crest Helm | 950g | — | 2.17% | 27.53% | 0.45% | 5.06% | — | DIFFERS |
| helm | Wyrm-Crest Helm -> The Sutton Hoo Helm | 2400g | — | 5.41% | 34.93% | 1.26% | 7.52% | — | DIFFERS |
| hair | Shaved -> Warrior Crop | 0g | — | 0.00% | 0.06% | 0.00% | 0.01% | — | FAINT |
| hair | Warrior Crop -> Long Mane | 40g | — | 0.67% | 12.10% | 0.12% | 2.29% | — | DIFFERS |
| hair | Long Mane -> Braided War-locks | 100g | — | 0.67% | 12.10% | 0.12% | 2.29% | — | DIFFERS |
| hairColor | Oak Brown -> Raven Black | 0g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| hairColor | Raven Black -> Norse Gold | 40g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| hairColor | Norse Gold -> Fire Red | 30g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| hairColor | Fire Red -> Greybeard | 30g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| hairColor | Greybeard -> Snow White | 30g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| beard | Clean Shaven -> Stubble | 0g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| beard | Stubble -> Full Beard | 40g | — | 0.31% | 11.05% | 0.08% | 2.31% | — | DIFFERS |
| beard | Full Beard -> Forked Beard | 80g | — | 0.00% | 2.49% | 0.00% | 0.50% | — | DIFFERS |
| beard | Forked Beard -> Ringed Braid | 120g | — | 0.00% | 3.56% | 0.00% | 0.76% | — | DIFFERS |
| beardColor | Oak Brown -> Raven Black | 0g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| beardColor | Raven Black -> Norse Gold | 40g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| beardColor | Norse Gold -> Fire Red | 30g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| beardColor | Fire Red -> Greybeard | 30g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| beardColor | Greybeard -> Snow White | 30g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| cloak | No Cloak -> Traveller's Cloak | 30g | — | 0.57% | 32.12% | 14.53% | 55.59% | — | DIFFERS |
| cloak | Traveller's Cloak -> Blood Red Cloak | 90g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| cloak | Blood Red Cloak -> Sea-Wolf Cloak | 90g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| cloak | Sea-Wolf Cloak -> Gilded War Cloak | 400g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| armor | Rough Iron -> Polished Steel | 30g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| armor | Polished Steel -> Blackened Steel | 130g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| armor | Blackened Steel -> Bronze Scales | 160g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| armor | Bronze Scales -> Crimson Warplate | 120g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| armor | Crimson Warplate -> Sea Queen's Gift | 100g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| armor | Sea Queen's Gift -> Bretwalda Gold | 510g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| warPaint | None -> Blood Stripes | 40g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| warPaint | Blood Stripes -> Raven Cross | 70g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| warPaint | Raven Cross -> Half-Face Shadow | 110g | — | 0.00% | 0.00% | 0.00% | 0.00% | — | IDENTICAL |
| hairColor | Oak Brown -> Raven Black | 0g | 20.2 | — | — | — | — | — | DIFFERS |
| hairColor | Raven Black -> Norse Gold | 40g | 56.5 | — | — | — | — | — | DIFFERS |
| hairColor | Norse Gold -> Fire Red | 30g | 34.1 | — | — | — | — | — | DIFFERS |
| hairColor | Fire Red -> Greybeard | 30g | 35.3 | — | — | — | — | — | DIFFERS |
| hairColor | Greybeard -> Snow White | 30g | 35.1 | — | — | — | — | — | DIFFERS |
| beardColor | Oak Brown -> Raven Black | 0g | 20.2 | — | — | — | — | — | DIFFERS |
| beardColor | Raven Black -> Norse Gold | 40g | 56.5 | — | — | — | — | — | DIFFERS |
| beardColor | Norse Gold -> Fire Red | 30g | 34.1 | — | — | — | — | — | DIFFERS |
| beardColor | Fire Red -> Greybeard | 30g | 35.3 | — | — | — | — | — | DIFFERS |
| beardColor | Greybeard -> Snow White | 30g | 35.1 | — | — | — | — | — | DIFFERS |
| armor | Rough Iron -> Polished Steel | 30g | 17.2 | — | — | — | — | — | DIFFERS |
| armor | Polished Steel -> Blackened Steel | 130g | 42.7 | — | — | — | — | — | DIFFERS |
| armor | Blackened Steel -> Bronze Scales | 160g | 47.5 | — | — | — | — | — | DIFFERS |
| armor | Bronze Scales -> Crimson Warplate | 120g | 32.7 | — | — | — | — | — | DIFFERS |
| armor | Crimson Warplate -> Sea Queen's Gift | 100g | 52.7 | — | — | — | — | — | DIFFERS |
| armor | Sea Queen's Gift -> Bretwalda Gold | 510g | 71.8 | — | — | — | — | — | DIFFERS |

## Every hairstyle under every helm

Change in the picture when the hairstyle is added to a helmeted head, as a percentage of the subject. The Shadow Hood is *supposed* to read 0 — it is a hood.

| helm | face covered | Warrior Crop | Long Mane | Braided War-locks |
|---|---|---|---|---|
| Bare Head | 0% | 8.31% | 18.90% | 14.84% |
| Iron Spangenhelm | 25% | 0.06% | 7.62% | 5.01% |
| Nasal Helm | 28% | 0.06% | 7.41% | 4.88% |
| Shadow Hood | 32% | 0.76% | 7.11% | 4.47% |
| Ridge Helm | 28% | 0.06% | 6.80% | 4.84% |
| Spectacle Helm | 46% | 0.06% | 7.48% | 4.92% |
| Boar-Crest Helm | 46% | 0.06% | 6.76% | 4.81% |
| Jarl's Crowned Helm | 46% | 0.04% | 6.70% | 4.76% |
| Wyrm-Crest Helm | 47% | 0.00% | 5.24% | 3.79% |
| The Sutton Hoo Helm | 100% | 0.00% | 4.25% | 2.58% |

## Notes from this run

- one-bearing twin — hair: Shaved and Warrior Crop — the same picture at portrait@180°, fight@-35°, fight@180°
- one-bearing twin — hair: Shaved and Braided War-locks — the same picture at portrait@180°, fight@180°
- one-bearing twin — hair: Warrior Crop and Braided War-locks — the same picture at portrait@180°, fight@180°
- Shadow Hood — Warrior Crop reads 0.76% under the Shadow Hood
- Shadow Hood — Long Mane reads 7.11% under the Shadow Hood
- Shadow Hood — Braided War-locks reads 4.47% under the Shadow Hood
- **FAILED**: no two options in a shape slot are the same object, adjacent or not — 7 twins
- **FAILED**: no two adjacent shape options are the same object (20 pairs) — 4 identical
- **FAILED**: every adjacent shape pair clears the 1% bar somewhere — 1 FAINT
- **FAILED**: every shape pair that reads at portrait still reads at fight distance — 7/20 pairs below 1% on a 520×320 play frame
- **FAILED**: every cosmetic is still on the head after it comes off — beard: 1 adjacent pairs are the same object once the head is off
