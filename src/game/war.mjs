// ============================================================
// THE WAR — the third loop.
//
// `docs/WHAT-THIS-GAME-IS.md` §3: the game is three loops and only two are
// built. The fight is seconds, the match is minutes, and THE WAR IS WEEKS —
// territory shifts, a people rises, a Bretwalda is crowned. This file is that
// third loop's rules, and nothing else.
//
// WHAT IT IS AND IS NOT. It is PURE. Every function here takes a plain object
// and returns a plain object; there is no database, no clock it reads on its
// own, no engine, no fetch. That is deliberate and it is the whole reason
// `tools/wartest.mjs` can play four hundred matches into a season in
// milliseconds and state the invariants directly rather than hoping a played
// season hands them over.
//
// The persistence lives in `src/db/war.ts` and it is a MIRROR, not a second
// opinion: it loads a state, calls the functions below, and writes back what
// they returned. `docs/PROCESS.md` records four instances in `characters.ts`
// alone of the same rule written twice and edited once. The flip threshold is
// written HERE, and the database contains no arithmetic at all.
//
// ---------------------------------------------------------------------------
// THE LOAD-BEARING RULE, and this file is where it is most easily lost.
//
// `docs/FACTIONS.md` §3:
//
//   "Factions decide look, kit, flag and names. NOT stats. And a faction never
//    gates a match — twelve players split four ways is four empty queues
//    instead of one working room."
//
// So note what is NOT in the territory record below: no damage, no reach, no
// health, no speed, no bonus of any kind. A territory carries a name, a
// people, a threshold and a shape. `threshold` is the only number, and it is
// how hard the ground is to TAKE — a property of the map, spent by the men
// fighting over it, never carried into a fight by anybody.
//
// And note what the engine is never told: a man's people. `engine.mjs` deals a
// territory and reports points by PLAYER ID. Which people banks those points is
// resolved afterwards, from the sworn record in the database, by
// `src/db/war.ts`. The engine therefore cannot sort a queue by allegiance
// because it has never heard of allegiance, and `tools/wartest.mjs` §7 holds it
// to that with a conquered map in its hands.
//
// A MAN'S TEAM IS NOT HIS PEOPLE. Four Norse and four Saxons in one room is a
// normal, legal, GOOD match: the red and blue bands are the match's own sides,
// and each man banks what he earned for whichever people he swore to. That is
// what makes "allegiance never splits matchmaking" survivable rather than
// aspirational — there is nothing to split.
// ============================================================

/** The four peoples. `docs/FACTIONS.md` §2. Order is tie-break order. */
export const PEOPLES = Object.freeze(["saxon", "norse", "briton", "pict"]);

/* --------------------------------------------------------------------------
   THE PROJECTION

   The same Web Mercator fit `src/game/client/factionMap/britain.ts` documents,
   restated as arithmetic so a territory can be authored in the coordinates
   its history is recorded in — degrees — rather than in SVG units nobody can
   check.

   It is NOT a re-derivation. The two constants were recovered from the four
   seats britain.ts already publishes (Winchester, Jorvik, Tintagel, Burghead)
   and agree with all four to under two units in a thousand, and with the LAND
   path's own bounding box at the Lizard, at Lowestoft and at Dunnet Head.
   `tools/wartest.mjs` §1 holds them against britain.ts's Winchester so the two
   files cannot drift apart silently.

   The scale is the SAME in x and y, which is not a coincidence and not a
   choice: Mercator is conformal only when it is, and britain.ts's whole
   argument for using it — "Scotland keeps its shape and the Moray Firth stays
   a firth" — depends on it.
   -------------------------------------------------------------------------- */
const MERCATOR_SCALE = 3269.5;
const X_AT_GREENWICH = 513.45;
const Y_AT_EQUATOR = 4258.4;

/** Degrees of latitude and longitude to britain.ts's 639 x 1000 frame. */
export function project(lat, lon) {
  const latRad = (lat * Math.PI) / 180;
  return {
    x: MERCATOR_SCALE * ((lon * Math.PI) / 180) + X_AT_GREENWICH,
    y: Y_AT_EQUATOR - MERCATOR_SCALE * Math.log(Math.tan(Math.PI / 4 + latRad / 2)),
  };
}

/* --------------------------------------------------------------------------
   THE GROUND

   Sixteen territories, four to each people, and the heptarchy's names live
   here rather than in the roster — which is exactly the composition
   `docs/FACTIONS.md` §5 settled on: "four peoples fight over named territory,
   and the territory is where the heptarchy's names live on."

   `bounds` are rings of [lat, lon] in degrees. They are CLAIMS, not
   coastlines: each ring runs well out to sea and the map screen clips it to
   the real Natural Earth shoreline, which is the same technique britain.ts
   already uses for the four faction fields and the reason no boundary has to
   be traced by hand twice. The frontiers of 878 were approximate; so are
   these, and deliberately.

   ARRAY ORDER IS PAINT ORDER. Later entries are drawn over earlier ones, so
   rings may overlap generously and the small territory always wins its ground
   from the large one it sits inside. Kernow is painted after Wessex; Mann and
   the Hebrides are painted last of all. This is why there are no gaps.

   `threshold` is the lead in contested points a challenger needs to take the
   ground. The four seats of `docs/FACTIONS.md` §2 — Winchester, Jorvik,
   Tintagel, Burghead — cost a third more, because a people's own hall should
   be the last thing it loses. It is the ONLY number on a territory.
   -------------------------------------------------------------------------- */

const SEAT_THRESHOLD = 320;
const FIELD_THRESHOLD = 240;

/* --------------------------------------------------------------------------
   THE FRONTIERS, AS FEATURES

   Every land-facing border below was once four points of a lat/lon box, and
   on a phone that read as what it was: a ruled line across Scotland, a
   dead-straight seam through Wessex, a Kent with a rectangle corner in the
   Thames estuary. The offshore run-out was never the problem — that is the
   clip doing its job — the problem was that the INSIDE of the island was
   drawn with a ruler.
   These are the features a chronicler would have named, sampled closely
   enough that they read as a river or a ridge: the Thames, the Lea, the Ouse,
   Watling Street, the Tamar, Offa's Dyke, the Humber, the Trent, the Tees,
   the Solway, the Cheviots, the Forth, the Tay and the Mounth.

   EACH ONE IS WRITTEN ONCE AND USED BY BOTH NEIGHBOURS. That is not tidiness,
   it is the fix for a second defect the same screenshot showed. WarMap.tsx
   strokes EVERY territory's ring after all the fills are down, so an edge
   that overlaps a neighbour is not hidden by being painted under it — it is a
   line drawn across that neighbour's ground. Mercia's old south edge ran from
   west London to the Bristol Channel and put a hairline straight through the
   middle of Wessex. Sharing one array between the two rings makes the two
   strokes land on the same pixels, which is the only way two rings can meet
   without a seam or a gap. Where two rings genuinely must overlap — Kernow
   out of Wessex, the offshore ends — the overlapping edge is kept AT SEA,
   where the clip removes it.

   Direction: each list runs in one stated direction, and a ring that needs it
   the other way uses `rev`. Degrees, [lat, lon], as the history is recorded.
   -------------------------------------------------------------------------- */

/** A boundary read the other way. Copies, so a shared line cannot be mutated. */
const rev = (line) => line.slice().reverse();

/**
 * THE AVON AND THE THAMES, the Severn estuary to the North Sea.
 *
 * West of the Thames's head at Kemble there is no Thames, and Mercia held
 * Gloucestershire; the water that carries the frontier on is the Bristol
 * Avon, which rises within a few miles of it. So the line is the Avon up from
 * Avonmouth through Bath and Chippenham, over the watershed above Tetbury,
 * and the Thames down from Kemble to the sea.
 *
 * Sliced by four rings: Mercia and Wessex share it as far as the Lea's mouth,
 * Wessex alone carries on to the Darent, and below that it is East Anglia's
 * Essex shore against Kent.
 */
const THAMES = Object.freeze([
  [51.38, -3.30], // the Bristol Channel — at sea, so the clip eats this end
  [51.50, -2.71], // Avonmouth
  [51.46, -2.62], // Bristol
  [51.41, -2.50], // Keynsham
  [51.38, -2.36], // Bath
  [51.35, -2.24], // Bradford-on-Avon
  [51.37, -2.13], // Melksham
  [51.46, -2.11], // Chippenham
  [51.58, -2.09], // Malmesbury
  [51.66, -2.09], // the Avon's head, above Tetbury
  [51.70, -2.03], // Thames Head, Kemble
  [51.64, -1.86], // Cricklade
  [51.69, -1.69], // Lechlade
  [51.71, -1.58], // Radcot
  [51.77, -1.42], // Newbridge
  [51.75, -1.27], // Oxford
  [51.67, -1.28], // Abingdon
  [51.60, -1.11], // Wallingford
  [51.53, -1.05], // the Goring Gap
  [51.46, -0.97], // Reading
  [51.54, -0.90], // Henley
  [51.52, -0.72], // Maidenhead
  [51.48, -0.61], // Windsor
  [51.43, -0.51], // Staines
  [51.41, -0.31], // Kingston
  [51.46, -0.31], // Richmond
  [51.48, -0.26], // Chiswick
  [51.47, -0.17], // Battersea
  [51.50, -0.12], // Westminster
  [51.51, -0.06], // Wapping
  [51.51,  0.01], // Leamouth — the Lea comes in, and the treaty line turns north
  [51.49,  0.07], // Woolwich
  [51.47,  0.18], // Erith
  [51.45,  0.23], // Dartford, and the Darent's mouth
  [51.45,  0.37], // Gravesend and Tilbury
  [51.46,  0.50], // Cliffe
  [51.49,  0.62], // the Medway's mouth
  [51.53,  0.79], // Shoeburyness
  [51.60,  1.40], // out into the North Sea
]);
/** Where the Lea comes in, and where the Darent does. Indices into THAMES. */
const THAMES_AT_LEA = 31;
const THAMES_AT_DARENT = 34;

/**
 * THE TREATY OF ALFRED AND GUTHRUM, in the order it names its own landmarks.
 *
 *   "up the Thames, and then up the Lea, and along the Lea to its source,
 *    then in a straight line to Bedford, then up the Ouse to Watling Street."
 *
 * It begins at Leamouth, where THAMES leaves off, and ends where Watling
 * Street crosses the Ouse at Stony Stratford. The one straight segment in it
 * — Leagrave to Bedford — is straight because the treaty says it is.
 */
const TREATY_LINE = Object.freeze([
  [51.51,  0.01], // Leamouth, on the Thames
  [51.55, -0.02], // Lea Bridge
  [51.59, -0.05], // Tottenham
  [51.66, -0.03], // Enfield Lock
  [51.69, -0.01], // Waltham Abbey
  [51.76, -0.01], // Hoddesdon
  [51.81, -0.03], // Ware
  [51.80, -0.08], // Hertford
  [51.84, -0.22], // Wheathampstead
  [51.88, -0.42], // Luton
  [51.90, -0.47], // Leagrave — the Lea's source
  [52.14, -0.47], // Bedford — "then in a straight line to Bedford"
  [52.15, -0.52], // Bromham, and up the Ouse
  [52.16, -0.63], // Turvey
  [52.15, -0.70], // Olney
  [52.09, -0.72], // Newport Pagnell
  [52.06, -0.85], // Stony Stratford, where Watling Street crosses the Ouse
]);

/**
 * WATLING STREET, and then the Dove.
 *
 * The treaty's own words stop at the road, and the road is the frontier from
 * the Ouse crossing up past High Cross to Wall. North of Wall the Danish
 * shires stop being bounded by a road and start being bounded by a river: the
 * Dove is the line between Staffordshire and Derbyshire from the Trent to its
 * head under Axe Edge, and beyond that the Pennine edge to Longdendale, where
 * English Mercia, Danish Mercia and Deira all meet.
 */
const WATLING_DOVE = Object.freeze([
  [52.06, -0.85], // Stony Stratford
  [52.13, -0.99], // Towcester
  [52.22, -1.07], // Weedon
  [52.35, -1.16], // Watford Gap
  [52.49, -1.28], // High Cross, Venonis
  [52.58, -1.55], // Mancetter
  [52.65, -1.83], // Wall, Letocetum
  [52.73, -1.72], // Alrewas, on the Trent
  [52.85, -1.58], // Newton Solney, the Dove's mouth
  [52.87, -1.69], // Tutbury
  [52.92, -1.85], // Uttoxeter
  [53.02, -1.75], // Ashbourne
  [53.14, -1.81], // Hartington
  [53.21, -1.93], // Axe Edge, the Dove's head
  [53.34, -1.93], // Chapel-en-le-Frith
  [53.47, -1.92], // Longdendale
]);

/**
 * THE GREAT OUSE BELOW BEDFORD, to the Wash.
 *
 * Bedford is the hinge of the treaty line: above it the Ouse divides English
 * Mercia from the Danes, below it it divides one Danish army from the other —
 * the Five Boroughs from Guthrum's East Anglia, along the fen edge.
 */
const OUSE_TO_WASH = Object.freeze([
  [52.14, -0.47], // Bedford
  [52.23, -0.27], // St Neots
  [52.33, -0.18], // Huntingdon
  [52.33, -0.07], // St Ives
  [52.40,  0.26], // Ely
  [52.58,  0.30], // Littleport
  [52.75,  0.40], // King's Lynn
  [53.05,  0.55], // the Wash, and out
]);

/**
 * THE DARENT AND THE ROTHER — Kent's landward side.
 *
 * Kent was a box, and the box's north-west corner sat out in the Thames
 * estuary. The kingdom's real landward edge is two rivers with the Weald
 * between them: the Darent up from the Thames at Dartford to Otford, the
 * ridge across to Edenbridge, then the head of the Rother and the Rother
 * itself down to the sea at Rye.
 */
const DARENT_ROTHER = Object.freeze([
  [51.45,  0.23], // Dartford, on the Thames
  [51.39,  0.22], // Farningham
  [51.31,  0.19], // Otford
  [51.24,  0.10], // the Sevenoaks Weald
  [51.19,  0.06], // Edenbridge
  [51.12,  0.22], // Ashurst
  [51.06,  0.42], // Lamberhurst
  [51.03,  0.52], // Hawkhurst
  [50.97,  0.65], // Newenden, on the Rother
  [50.95,  0.75], // Rye, and the Rother's mouth
]);

/**
 * THE TAMAR, Marsland Mouth to the Plymouth Sound.
 *
 * The oldest border in the file and still the one everybody would recognise:
 * Cornwall ends where the Tamar runs, and the two miles between the Tamar's
 * head at Woolley and the sea at Marsland Mouth close it.
 */
const TAMAR = Object.freeze([
  [50.20, -4.20], // at sea, off Plymouth
  [50.36, -4.17], // the Plymouth Sound, and the Tamar's mouth
  [50.41, -4.21], // Saltash
  [50.46, -4.20], // Calstock
  [50.51, -4.21], // Gunnislake
  [50.57, -4.20], // Horsebridge
  [50.63, -4.32], // Polson, below Launceston
  [50.75, -4.36], // North Tamerton
  [50.85, -4.42], // Woolley, the Tamar's head
  [50.92, -4.55], // Marsland Mouth
  [51.05, -5.20], // out into the Atlantic
]);

/**
 * OFFA'S DYKE, Prestatyn to Sedbury Cliffs — the Welsh march, north to south.
 *
 * The earthwork itself, and not a round number of degrees: the note that used
 * to sit on Dyfed's bounds recorded that -2.85 put a Welsh fill across
 * Somerset and the Cotswolds, and the dyke is the answer to why. It runs
 * within a few miles of -3.05 for its whole middle, and only at its two ends
 * — the Dee at Prestatyn and the Wye at Chepstow — does it swing east.
 */
const OFFAS_DYKE = Object.freeze([
  [53.33, -3.40], // Prestatyn, and the Irish Sea
  [53.20, -3.22], // Halkyn Mountain
  [53.09, -3.07], // Treuddyn
  [53.00, -3.05], // Ruabon
  [52.93, -3.06], // Chirk
  [52.79, -3.09], // Llanymynech
  [52.65, -3.12], // Buttington, on the Severn
  [52.56, -3.15], // Montgomery
  [52.44, -3.06], // Newcastle on Clun
  [52.34, -3.05], // Knighton
  [52.20, -3.03], // Kington
  [52.07, -3.13], // Hay-on-Wye
  [51.92, -2.95], // Pandy
  [51.81, -2.72], // Monmouth
  [51.77, -2.65], // Redbrook
  [51.70, -2.68], // Tintern
  [51.63, -2.66], // Sedbury Cliffs, above the Severn
]);

/** THE DYFI AND THE DEE — north Wales from south, Cardigan Bay to the dyke. */
const WALES_DIVIDE = Object.freeze([
  [52.50, -4.20], // Cardigan Bay, at sea
  [52.54, -4.05], // Aberdyfi, the Dyfi's mouth
  [52.59, -3.85], // Machynlleth
  [52.66, -3.68], // Mallwyd
  [52.78, -3.62], // Llanuwchllyn
  [52.91, -3.60], // Bala
  [52.98, -3.38], // Corwen, on the Dee
  [52.96, -3.19], // Llangollen
  [52.93, -3.06], // Chirk, and Offa's Dyke
]);

/**
 * THE MERSEY, Longdendale to the sea — English Mercia's northern limit.
 * The old rings had Mercia stopping at 53.45N and Deira starting at 53.50N,
 * which is a five-mile stripe of nothing across Lancashire.
 */
const MERSEY = Object.freeze([
  [53.47, -1.92], // Longdendale
  [53.41, -2.15], // Stockport
  [53.40, -2.50], // Warrington
  [53.34, -2.73], // Runcorn
  [53.45, -3.02], // the Mersey's mouth
  [53.60, -3.35], // the Irish Sea
]);

/**
 * THE HUMBER, THE TRENT AND THE DON — Deira's southern shore.
 * The kingdom of York ends at the water: the Humber in from Spurn, the Trent
 * up as far as Gainsborough, then the Idle and the Don west to the Pennines.
 */
const HUMBER_TRENT = Object.freeze([
  [53.55,  0.85], // the North Sea, off the Humber's mouth
  [53.58,  0.11], // Spurn Head
  [53.66, -0.15], // the Humber
  [53.72, -0.45], // Brough
  [53.70, -0.70], // Trent Falls
  [53.60, -0.75], // Keadby
  [53.40, -0.77], // Gainsborough
  [53.43, -1.02], // Bawtry, on the Idle
  [53.42, -1.35], // Rotherham, on the Don
  [53.40, -1.63], // Penistone
  [53.47, -1.92], // Longdendale
]);

/**
 * THE TEES, and the fell wall west of its head.
 * Bernicia is "Northumbria above the Tees" and this is the Tees: Teesmouth up
 * through Yarm and Barnard Castle to its head under Cross Fell. West of Cross
 * Fell the water runs out and the border is the watershed, over Shap and down
 * the Kent to Morecambe Bay.
 */
const TEES_AND_FELLS = Object.freeze([
  [54.55, -0.50], // the North Sea, off Teesmouth
  [54.64, -1.14], // Teesmouth
  [54.51, -1.36], // Yarm
  [54.46, -1.55], // Croft
  [54.53, -1.75], // Piercebridge
  [54.54, -1.92], // Barnard Castle
  [54.63, -2.08], // Middleton-in-Teesdale
  [54.68, -2.45], // Cross Fell, and the Tees' head
  [54.58, -2.50], // Appleby
  [54.47, -2.68], // Shap
  [54.33, -2.78], // Kendal
  [54.19, -2.90], // Arnside, on the Kent
  [54.10, -3.45], // Morecambe Bay, and out
]);

/**
 * THE SOLWAY AND THE CHEVIOTS — Strathclyde against Northumbria.
 *
 * From the Irish Sea up the Solway to the Esk at Gretna, up the Liddel to
 * Kershope, and over the west end of the Cheviots at Peel Fell. Beyond the
 * Cheviots the same watershed carries on north-west — Ettrick, the Moffat
 * hills, Tinto above the Clyde, the Pentlands — and ends at the Forth's
 * lowest ford at Stirling, which is where Pictland begins.
 */
const SOLWAY_CHEVIOT = Object.freeze([
  [54.60, -3.95], // the Solway's mouth, at sea
  [54.85, -3.55], // the Solway, off Silloth
  [54.95, -3.25], // Bowness, the Solway head
  [54.99, -3.06], // Gretna, and the Esk
  [55.08, -2.92], // the Liddel
  [55.15, -2.72], // Kershope
  [55.28, -2.55], // Peel Fell — the Cheviots' west end
  [55.35, -2.85], // the Teviot's head
  [55.42, -3.15], // Ettrick Pen
  [55.45, -3.40], // the Devil's Beef Tub
  [55.60, -3.60], // Tinto, above the Clyde
  [55.78, -3.50], // the Pentlands
  [55.90, -3.62], // the Avon, above Linlithgow
  [56.07, -3.94], // Stirling, the Forth's lowest ford
]);

/** THE FIRTH OF FORTH, Stirling out to the North Sea. Bernicia's north. */
const FORTH = Object.freeze([
  [56.07, -3.94], // Stirling
  [56.02, -3.72], // Kincardine
  [55.99, -3.60], // Grangemouth
  [56.02, -3.35], // Queensferry
  [56.10, -3.05], // Inchkeith
  [56.15, -2.60], // the firth's mouth, Fife Ness to North Berwick
  [56.20, -1.80], // the North Sea
]);

/**
 * THE FORTH ABOVE STIRLING, and Loch Lomond — Strathclyde against Fib.
 * The firth stops being crossable at Stirling and the frontier carries on as
 * the river, the moss at its head, and the loch. It stops short of Argyll:
 * Dal Riata is drawn as an outline and never filled, so no ring may run into
 * it, and this one hugs its eastern edge.
 */
const LENNOX = Object.freeze([
  [56.07, -3.94], // Stirling
  [56.13, -4.22], // Flanders Moss, the Forth's head
  [56.25, -4.62], // Loch Lomond's head
  [56.45, -4.90], // Glen Falloch, under the Dal Riata line
]);

/**
 * THE TAY AND THE SIDLAWS — Fib against Circinn.
 * Not the Tay alone: Scone stands on the north bank and Fib is the province
 * that made kings there, so the line leaves the water at Dundee, takes the
 * Sidlaw ridge behind Gowrie, and rejoins the Tay above Meikleour.
 */
const TAY_SIDLAW = Object.freeze([
  [56.47, -2.72], // Buddon Ness, the Tay's mouth
  [56.46, -2.97], // Dundee
  [56.53, -3.15], // the Sidlaws
  [56.58, -3.30], // Dunsinane
  [56.54, -3.42], // Meikleour, back on the Tay
  [56.56, -3.59], // Dunkeld
  [56.62, -3.87], // Aberfeldy
  [56.59, -4.00], // Kenmore, at Loch Tay's foot
  [56.47, -4.35], // Killin, at its head
]);

/**
 * THE MOUNTH — the Grampians' eastern wall, and Pictland's oldest division.
 * It meets the sea at Cowie above Stonehaven, is crossed at Cairn o' Mount,
 * and runs west under Lochnagar and the Cairnwell to the Drumochter pass.
 */
const MOUNTH = Object.freeze([
  [57.05, -1.70], // the North Sea, off Stonehaven
  [56.97, -2.19], // Cowie — where the Mounth reaches the coast
  [56.93, -2.60], // Cairn o' Mount
  [56.96, -2.98], // Mount Keen
  [56.96, -3.23], // Lochnagar
  [56.87, -3.40], // the Cairnwell
  [56.82, -3.72], // Beinn a' Ghlo
  [56.88, -4.00], // Drumochter
  [56.78, -4.45], // Rannoch Moor
  [56.68, -4.95], // Glen Orchy
]);

/**
 * THE DORNOCH FIRTH AND THE OYKEL — Cait against Fortriu.
 * Caithness and Sutherland are cut off from Moray by water for most of it:
 * the firth in to Bonar Bridge, the Kyle, the Oykel, and then the Assynt
 * watershed out to Enard Bay.
 */
const OYKEL = Object.freeze([
  [57.95, -3.30], // the Moray Firth, at sea
  [57.87, -3.98], // Tain and Dornoch
  [57.89, -4.34], // Bonar Bridge, the Kyle of Sutherland
  [57.98, -4.63], // the Oykel
  [58.03, -4.85], // Oykel Bridge
  [58.10, -5.05], // the Assynt watershed
  [58.10, -5.35], // Enard Bay
  [58.25, -6.30], // the Minch, and out
]);

export const TERRITORIES = Object.freeze([
  {
    id: "mierce", name: "Mercia", native: "Mierce", people: "saxon",
    blurb: "The English Mercia the Danes did not take, west of Watling Street.",
    threshold: FIELD_THRESHOLD, anchor: [51.86, -2.24],
    // The Avon and the Thames below, the treaty line and Watling Street to the
    // east, the Mersey above, Offa's Dyke down the western side. Every one of
    // those is shared with the neighbour it faces, so no edge of this ring is
    // a line drawn across anyone else's ground.
    bounds: [[
      ...THAMES.slice(0, THAMES_AT_LEA),
      ...TREATY_LINE,
      ...WATLING_DOVE.slice(1),
      ...MERSEY.slice(1),
      ...OFFAS_DYKE,
      [51.55, -2.78], // the Severn estuary, closing back to the Bristol Channel
    ]],
  },
  {
    id: "wessex", name: "Wessex", native: "Westseaxna rice", people: "saxon", seat: "Winchester",
    blurb: "Alfred's own kingdom, and the only one the Danes never held.",
    threshold: SEAT_THRESHOLD, anchor: [51.0632, -1.3080],
    // North edge: the Avon and the Thames, as far down as the Darent's mouth —
    // the old ring's 51.95N horizontal is what read as a seam through Wessex.
    // East edge: the Darent and the Rother, which Kent shares. West edge: the
    // Tamar, which Kernow shares and then takes back. The Channel side runs
    // well out to sea, Wight and Lundy inside it, for the clip.
    bounds: [[
      ...THAMES.slice(0, THAMES_AT_DARENT + 1),
      ...DARENT_ROTHER.slice(1),
      [50.60,  0.80], // the Channel, off Beachy Head
      [50.20, -1.20], // south of Wight
      [50.10, -2.60], // south of Portland
      ...TAMAR,
      [51.45, -4.30], // the Bristol Channel, north of Lundy
    ]],
  },
  {
    id: "deira", name: "Deira", native: "Jorvik", people: "norse", seat: "Jorvik",
    blurb: "The kingdom of York, and the Danelaw's northern half.",
    threshold: SEAT_THRESHOLD, anchor: [53.9591, -1.0815],
    // This was a 4-point rectangle and both of its long sides were ruled lines
    // across northern England. The kingdom of York is bounded by water on
    // three of them: the Humber and the Trent and the Don below, the Mersey
    // across to the Irish Sea, the Tees above — and the fell wall from Cross
    // Fell down to Morecambe Bay, where the water gives out.
    bounds: [[
      ...HUMBER_TRENT,
      ...MERSEY.slice(1),
      ...rev(TEES_AND_FELLS),
    ]],
  },
  {
    id: "bernicia", name: "Bernicia", native: "Bryneich", people: "saxon",
    blurb: "Northumbria above the Tees: Bamburgh, Lindisfarne and Lothian.",
    threshold: FIELD_THRESHOLD, anchor: [55.61, -1.71],
    // Northumbria above the Tees, and the horizontal at 56.10N that used to be
    // its northern edge cut the Firth of Forth in half and ruled a line across
    // Fife. The Tees below, the Solway and the Cheviots and the Ettrick
    // watershed west, the Forth above. Cumbria is inside it: Strathclyde did
    // not come south of the Solway until well after this season's year.
    bounds: [[
      ...TEES_AND_FELLS,
      ...SOLWAY_CHEVIOT,
      ...FORTH.slice(1),
      [55.60, -1.20], // the North Sea, east of Bamburgh
    ]],
  },
  {
    id: "five_boroughs", name: "The Five Boroughs", native: "Fif Burgas", people: "norse",
    blurb: "Derby, Leicester, Nottingham, Lincoln and Stamford — Danish Mercia.",
    threshold: FIELD_THRESHOLD, anchor: [52.95, -1.15],
    // Danish Mercia, and every side of it is a real edge: the Ouse below
    // Bedford out to the Wash, the Lincolnshire coast, the Humber and the
    // Trent and the Don against Deira, and Watling Street and the Dove back
    // down to Stony Stratford.
    bounds: [[
      ...OUSE_TO_WASH,
      [53.40, 0.60], // at sea, off the Lincolnshire coast
      ...HUMBER_TRENT,
      ...rev(WATLING_DOVE).slice(1),
      ...rev(TREATY_LINE.slice(11)).slice(1, -1),
    ]],
  },
  {
    id: "east_anglia", name: "East Anglia", native: "East Engle", people: "norse",
    blurb: "Guthrum's, settled by the treaty and farmed by his army.",
    threshold: FIELD_THRESHOLD, anchor: [52.41, 0.75],
    // Guthrum's share of the treaty, read off the treaty: up the Lea from the
    // Thames, the straight run to Bedford, then the Ouse — which above Bedford
    // is Mercia's edge and below it is the Five Boroughs' — down to the Wash.
    // Essex is in it because the treaty put it in it; its southern shore is
    // the Thames, shared with Wessex and Kent on the far bank.
    bounds: [[
      ...TREATY_LINE.slice(0, 12),
      ...OUSE_TO_WASH.slice(1),
      [53.20, 1.20], // the North Sea, off the north Norfolk coast
      [52.40, 2.20], // east of Lowestoft
      ...rev(THAMES.slice(THAMES_AT_LEA + 1)),
    ]],
  },
  {
    id: "kent", name: "Kent", native: "Cantware", people: "saxon",
    blurb: "The landing ground. Canterbury, and the shortest crossing there is.",
    threshold: FIELD_THRESHOLD, anchor: [51.28, 1.08],
    // This was a four-point box and its north-west corner stood in the middle
    // of the Thames estuary, which is the boxy Kent and the "line over the
    // water" of the report: the box's top edge at 51.75N ran on across the
    // Essex shore and its ink landed on Foulness and the Crouch islands. Kent
    // is now the Thames down to the Darent, the Darent up, the Weald across,
    // and the Rother down to Rye.
    bounds: [[
      ...rev(THAMES.slice(THAMES_AT_DARENT)),
      ...DARENT_ROTHER.slice(1),
      [50.70, 0.85], // the Channel, off Dungeness
      [50.75, 1.60], // and east, into the strait
    ]],
  },
  {
    id: "ystrad_clud", name: "Ystrad Clud", native: "Ystrad Clud", people: "briton",
    blurb: "Strathclyde, out of Dumbarton Rock — Britons who outlasted the rest.",
    threshold: FIELD_THRESHOLD, anchor: [55.94, -4.56],
    // Galloway, Ayrshire, Clydesdale and the Lennox. Its landward side is the
    // Solway and the Cheviots and the watershed above them, shared with
    // Bernicia; its top is the Forth above Stirling, shared with Fib; its west
    // runs down just outside Dal Riata, which is drawn and never filled.
    bounds: [[
      [54.55, -5.40], // the Irish Sea, south-west of the Mull of Galloway
      ...SOLWAY_CHEVIOT,
      ...LENNOX.slice(1),
      [56.28, -4.88], // and south along Argyll's edge, a hair outside Dal Riata
      [55.97, -5.06], // so Cowal is Strathclyde's and Knapdale is not
      [55.61, -5.46],
      [55.30, -5.45], // the Kilbrannan Sound, Arran inside and Kintyre out
      [54.90, -5.45],
    ]],
  },
  {
    id: "dyfed", name: "Dyfed", native: "Dyfed a Phowys", people: "briton",
    blurb: "The south and the middle of Wales, and the road to the Severn.",
    threshold: FIELD_THRESHOLD, anchor: [51.88, -5.27],
    // THE EAST EDGE IS OFFA'S DYKE AND NOT A ROUND NUMBER. It was -2.85, which
    // is east of Hereford and Gloucester, and the render showed a Welsh fill
    // laid across Somerset and the Cotswolds with a dead-straight border down
    // the middle of England. Nothing in `wartest` could see it and one PNG
    // could not miss it.
    // It is now the earthwork itself rather than a straight line drawn near
    // it, which is what closed the strip of nobody's ground the straight line
    // left between Tintern and Monmouth. The north edge is the Dyfi and the
    // Dee, shared with Gwynedd; the south edge stays out in the Severn and the
    // Bristol Channel, since the Welsh shore is at 51.4 and the Somerset shore
    // at 51.2 and anything drawn between them lands on the wrong one.
    bounds: [[
      ...WALES_DIVIDE,
      ...OFFAS_DYKE.slice(5),
      [51.45, -3.00], // the Severn estuary
      [51.28, -3.65], // the Bristol Channel
      [51.40, -5.90], // the Atlantic, west of St Davids
      [52.50, -5.70],
    ]],
  },
  {
    id: "gwynedd", name: "Gwynedd", native: "Gwynedd", people: "briton",
    blurb: "Snowdonia and Anglesey. Rhodri Mawr's, and hard country to take.",
    threshold: FIELD_THRESHOLD, anchor: [53.19, -4.47],
    // The Dyfi and the Dee below, shared with Dyfed, and the northern third of
    // Offa's Dyke — Chirk up over Halkyn Mountain to where it meets the sea at
    // Prestatyn. Anglesey is inside the offshore leg, and the clip finds it.
    bounds: [[
      ...WALES_DIVIDE,
      ...rev(OFFAS_DYKE.slice(0, 5)).slice(1),
      [53.60, -3.60], // the Irish Sea, off the Dee
      [53.60, -4.95], // and west of Anglesey
      [52.50, -5.30], // Cardigan Bay
    ]],
  },
  {
    id: "kernow", name: "Kernow", native: "Kernow", people: "briton", seat: "Tintagel",
    blurb: "Cornwall, the last British ground in the south, and Tintagel above it.",
    threshold: SEAT_THRESHOLD, anchor: [50.6667, -4.75],
    // The Tamar, and now the river and not a chord across it: Marsland Mouth
    // on the north coast, the Tamar's head at Woolley two miles inland of it,
    // and the water down through Launceston and Gunnislake to the Plymouth
    // Sound. The first cut ran its north edge along 51.25, which is the north
    // DEVON coast, and the render put a British fill on forty miles of
    // Wessex's shoreline. Wessex reads the same array the other way, so the
    // one line the two of them share is the one the eye sees.
    bounds: [[
      ...rev(TAMAR),
      [49.85, -4.60], // the Channel, south of the Lizard
      [49.80, -6.50], // west of Scilly
      [50.60, -6.40],
      [51.05, -5.60],
    ]],
  },
  {
    id: "fib", name: "Fib", native: "Fib", people: "pict",
    blurb: "Fife and the Tay, and Scone where the Picts made kings.",
    threshold: FIELD_THRESHOLD, anchor: [56.42, -3.44],
    // Fife, Kinross, Strathearn and Menteith: the Forth below, the Forth's own
    // upper water and Loch Lomond's head to the west, the Firth of Tay and the
    // Sidlaws and the Tay above. The line leaves the water at Dundee on
    // purpose — Scone stands on the north bank, and Fib is the province that
    // made kings there.
    bounds: [[
      ...rev(FORTH),
      ...LENNOX.slice(1, 3),
      ...rev(TAY_SIDLAW),
      [56.50, -2.20], // the North Sea, off the Tay's mouth
    ]],
  },
  {
    id: "circinn", name: "Circinn", native: "Circinn", people: "pict",
    blurb: "Angus and the Mearns, where the symbol stones stand thickest.",
    threshold: FIELD_THRESHOLD, anchor: [56.65, -2.89],
    // Angus and the Mearns, between the Mounth above and the Tay below — the
    // two features the Pictish provinces were actually divided by, in place of
    // the 57.15N and 56.45N horizontals that used to rule two lines clean
    // across Scotland. It reaches west over Rannoch to the head of Loch
    // Lomond, because four Pictish territories have to hold seven provinces'
    // worth of ground and the mountain has to belong to somebody.
    bounds: [[
      ...MOUNTH,
      [56.45, -4.90], // Glen Falloch, with Strathclyde
      [56.25, -4.62], // Loch Lomond's head, where Fib begins
      ...rev(TAY_SIDLAW),
      [56.55, -2.10], // the North Sea, off Arbroath
      [57.15, -1.40],
    ]],
  },
  {
    id: "fortriu", name: "Fortriu", native: "Fortriu", people: "pict", seat: "Burghead",
    blurb: "Moray and the great fort at Burghead. The Pictish heartland.",
    threshold: SEAT_THRESHOLD, anchor: [57.7017, -3.4906],
    // Moray, Badenoch, Lochaber and Ross: the Mounth below it, the Dornoch
    // Firth and the Oykel above. Its old south edge at 57.05N ran a ruled line
    // from Aberdeen to Skye, and its old east edge at -1.85 left Buchan
    // unclaimed; both are gone.
    bounds: [[
      ...MOUNTH,
      [56.95, -5.35], // north-west of Glen Orchy, keeping clear of Dal Riata
      [57.05, -6.20],
      ...rev(OYKEL),
      [57.90, -1.60], // the North Sea, beyond Fraserburgh
      [57.30, -1.45], // and beyond Aberdeen
    ]],
  },
  {
    id: "cait", name: "Cait", native: "Cait", people: "pict",
    blurb: "Caithness, Sutherland and Orkney — the far north, and the Norse at its door.",
    threshold: FIELD_THRESHOLD, anchor: [58.65, -3.37],
    // Caithness and Sutherland are cut off from Moray by water for most of
    // their length, so the border is water: the Dornoch Firth in to Bonar
    // Bridge, the Kyle, the Oykel, and the Assynt watershed out to Enard Bay.
    // The rest runs well out to sea with Orkney inside it.
    bounds: [[
      ...OYKEL,
      [59.60, -6.20], // the Atlantic
      [59.60, -2.10], // north and east of Orkney
      [58.20, -2.20], // and back down the Moray Firth
    ]],
  },
  {
    id: "sudreyjar", name: "Sudreyjar", native: "Sudreyjar", people: "norse",
    blurb: "The Southern Isles: Mann and the Hebrides, held from the sea.",
    threshold: FIELD_THRESHOLD, anchor: [54.24, -4.55],
    bounds: [
      [[54.60, -5.10], [54.60, -4.05], [53.90, -4.05], [53.90, -5.10]],
      [[58.60, -8.10], [58.60, -6.15], [56.55, -6.00], [56.55, -8.10]],
    ],
  },
]);

const BY_ID = new Map(TERRITORIES.map((t) => [t.id, t]));

/** A territory by id, or null. Null and not undefined: a caller has to choose. */
export function territory(id) {
  return BY_ID.get(id) || null;
}

/* --------------------------------------------------------------------------
   THE PURSE — what one match is worth to the war
   -------------------------------------------------------------------------- */

/**
 * The whole economy of the war, and it is four numbers.
 *
 * `cap` is the one that matters and it is not tuning: without it a single room
 * of eight men farming kills for an afternoon moves a border, and the war
 * stops being a record of what happened and becomes a record of who had the
 * afternoon. Forty is a shade under two clean wins, so the ceiling is only
 * reachable by a man who was going to be near it anyway.
 */
export const POINTS = Object.freeze({ turnout: 2, perKill: 1, victory: 12, cap: 40 });

/**
 * Contested points one man earned, from the row the match ledger already
 * printed for him. A pure function of a `MatchResult` and nothing else.
 *
 * Damage deliberately pays NOTHING. It is the noisiest number on the table and
 * the easiest to inflate against a recruit; the war is decided by the fight's
 * verdict — who died and who won — not by how loud it was.
 */
export function pointsFor(result) {
  if (!result) return 0;
  const kills = Math.max(0, Math.floor(Number(result.kills) || 0));
  const raw = POINTS.turnout + kills * POINTS.perKill + (result.isWinner ? POINTS.victory : 0);
  return Math.min(POINTS.cap, raw);
}

/* --------------------------------------------------------------------------
   THE DEAL — which ground a match is fought over
   -------------------------------------------------------------------------- */

/** How many of the most-contested territories a match can be dealt from. */
export const FRONT_WINDOW = 4;

/** FNV-1a. Not for cryptography and not for statistics — for repeatability. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The ground this match decides.
 *
 * Deterministic in `seed`, so a replay of a match replays the war it fed, and
 * so a client cannot re-roll for a border it would rather fight on.
 *
 * `front.contested` is the war's own ranking, most contested first — the
 * database supplies it, and the engine only ever reads it here. Narrowing to
 * the top few is what makes the map move somewhere a player can SEE: sixteen
 * territories drifting a point a night is a map nobody watches, four of them
 * moving is a front.
 */
export function dealTerritory(seed, front) {
  const offered = (front && Array.isArray(front.contested) ? front.contested : [])
    .filter((id) => BY_ID.has(id));
  const pool = offered.length ? offered : TERRITORIES.map((t) => t.id);
  const window = pool.slice(0, FRONT_WINDOW);
  return window[hash32(String(seed)) % window.length];
}

/* --------------------------------------------------------------------------
   THE WAR STATE
   -------------------------------------------------------------------------- */

const zeroContest = () => Object.fromEntries(PEOPLES.map((p) => [p, 0]));

/**
 * A season, from nothing.
 *
 * `holdings` and `thresholds` default to the map as it stands in 878 — each
 * people on its own four — and are overridden at a season reset by
 * `openingHoldings`.
 */
export function newWar({ seasonIndex = 1, startedAt = 0, holdings = null, thresholds = null } = {}) {
  const territories = {};
  for (const t of TERRITORIES) {
    territories[t.id] = {
      holder: (holdings && holdings[t.id]) || t.people,
      threshold: (thresholds && thresholds[t.id]) || t.threshold,
      epoch: 0,
      contest: zeroContest(),
    };
  }
  return {
    seasonIndex,
    startedAt,
    endsAt: startedAt + SEASON_DAYS * 86_400_000,
    state: "running",
    territories,
    /** profileId (as a string) -> what one man has done this season. */
    contributions: {},
    /** Every flip, in order. This is "what moved while you were asleep". */
    flips: [],
    /** `${matchKey}:${playerId}` for everything already banked. THE replay guard. */
    seen: {},
    /** Running totals, so conservation is checkable without a second pass. */
    bankedTotal: 0,
    clearedTotal: 0,
    verdict: null,
    endedAt: 0,
  };
}

/** Four to six weeks, per `docs/WHAT-THIS-GAME-IS.md` §3. Five is the middle. */
export const SEASON_DAYS = 35;

/**
 * Bank one man's contested points into one territory, ONCE.
 *
 * IDEMPOTENCY IS A PROPERTY OF THIS RULE, not only of a unique index in
 * Postgres. `${matchKey}:${playerId}` is the key, and a repeat answers
 * `already_banked` and moves nothing. The database's unique index is the
 * second belt, for the case of two processes racing; this is the first, and it
 * is the one `tools/wartest.mjs` can hold without a database in the room.
 *
 * Returns `{ applied, reason, flip }`. `flip` is null unless this point was
 * the one that took the ground.
 */
export function bank(state, entry) {
  const { matchKey, playerId, profileId, people, territoryId, points, at = 0 } = entry || {};
  if (!matchKey || !playerId) return { applied: false, reason: "no_key", flip: null };

  const key = `${matchKey}:${playerId}`;
  if (state.seen[key]) return { applied: false, reason: "already_banked", flip: null };

  const ground = state.territories[territoryId];
  if (!ground) return { applied: false, reason: "no_such_territory", flip: null };
  if (!PEOPLES.includes(people)) return { applied: false, reason: "no_such_people", flip: null };

  const n = Math.floor(Number(points) || 0);
  // A zero or negative entry is REMEMBERED and not applied. Remembering it is
  // the point: a retry of a match in which somebody scored nothing must not
  // become a route by which anything else is banked twice.
  if (n <= 0) {
    state.seen[key] = 1;
    return { applied: false, reason: "no_points", flip: null };
  }

  state.seen[key] = 1;
  state.bankedTotal += n;

  const pid = String(profileId);
  const contribution = state.contributions[pid] || (state.contributions[pid] = {
    profileId, people, points: 0, matches: 0, firstAt: at,
  });
  contribution.people = people;
  contribution.points += n;
  contribution.matches += 1;

  const { flip, cleared } = contestGround(ground, { people, points: n, at, seasonIndex: state.seasonIndex, territoryId });
  state.clearedTotal += cleared;
  if (flip) state.flips.push(flip);
  return { applied: true, reason: "banked", flip };
}

/**
 * THE FLIP RULE, and it is written here exactly once.
 *
 * `bank` above calls it with a territory out of an in-memory season;
 * `src/db/war.ts` calls it with a row it has just locked in Postgres. Both get
 * the same arithmetic because it is the same function — and that is the whole
 * reason it is a function. `docs/PROCESS.md` failure mode 3 is "the same
 * constant written twice, so editing one does nothing", recorded four times in
 * `characters.ts` alone; a threshold that lives in this file AND in a SQL
 * statement is that defect with a network hop in it.
 *
 * `ground` is `{ holder, threshold, epoch, contest }` and IS MUTATED. Returns
 * `{ flip, cleared }` — `cleared` being the points the flip consumed, which
 * the caller has to record somewhere or conservation stops reconciling.
 *
 * THE EDGE: a challenger takes the ground when his LEAD OVER THE HOLDER
 * reaches the threshold, not when his own tally does. So a people that fights
 * for its own border defends it, which is what makes a border worth defending
 * — and it is why a territory cannot be taken by two challengers pooling their
 * work, which would make alliances a mechanic nobody designed.
 */
export function contestGround(ground, { people, points, at = 0, seasonIndex = 0, territoryId = "" }) {
  ground.contest[people] += points;
  if (people === ground.holder) return { flip: null, cleared: 0 };

  const lead = ground.contest[people] - ground.contest[ground.holder];
  if (lead < ground.threshold) return { flip: null, cleared: 0 };

  // Cleared, not forgotten: the total is handed back so conservation still
  // reconciles after a flip. A war that cannot account for its own points is a
  // war nobody can audit.
  let cleared = 0;
  for (const p of PEOPLES) cleared += ground.contest[p];
  const flip = { territoryId, from: ground.holder, to: people, at, seasonIndex, epoch: ground.epoch };
  ground.contest = zeroContest();
  ground.holder = people;
  ground.epoch += 1;
  return { flip, cleared };
}

/**
 * The audit. `banked` is what was offered and taken; `held` is what is sitting
 * on the map now; `cleared` is what flips consumed. The three have to close.
 */
export function conservation(state) {
  let held = 0;
  for (const id of Object.keys(state.territories)) {
    for (const p of PEOPLES) held += state.territories[id].contest[p];
  }
  return {
    banked: state.bankedTotal,
    held,
    cleared: state.clearedTotal,
    ok: state.bankedTotal === held + state.clearedTotal,
  };
}

/**
 * The table on the map screen: who holds what, and who has worked hardest.
 *
 * Territory first, because territory is what the war is about. Points break a
 * tie, and the roster order breaks that — so the order is total and the screen
 * never shows two peoples in one place.
 */
export function standings(state) {
  const rows = PEOPLES.map((people) => ({
    people,
    held: Object.values(state.territories).filter((t) => t.holder === people).length,
    points: Object.values(state.contributions).filter((c) => c.people === people)
      .reduce((n, c) => n + c.points, 0),
    contesting: Object.values(state.territories)
      .filter((t) => t.holder !== people && t.contest[people] > 0).length,
  }));
  rows.sort((a, b) => b.held - a.held || b.points - a.points ||
    PEOPLES.indexOf(a.people) - PEOPLES.indexOf(b.people));
  return rows;
}

/**
 * End the season and crown exactly one Bretwalda.
 *
 * EXACTLY ONE is the requirement, and both halves of it are load bearing.
 * Never two: every tie-break below is total, ending at the profile id, so
 * there is no input on which two men can both come first. Never zero when a
 * man has fought: the crown goes to the winning people's highest contributor
 * whoever he is. A season nobody played crowns nobody and says so — an honest
 * null, rather than a crash or a stranger.
 *
 * Ending an ended season returns the verdict it already reached. A second
 * crowning is the same defect as a second banking.
 */
export function endSeason(state, now = 0) {
  if (state.state === "ended" && state.verdict) return state.verdict;

  const table = standings(state);
  const people = table[0].people;
  const men = Object.values(state.contributions).filter((c) => c.people === people && c.points > 0);
  men.sort((a, b) => b.points - a.points || a.firstAt - b.firstAt ||
    String(a.profileId).localeCompare(String(b.profileId)));

  const verdict = {
    seasonIndex: state.seasonIndex,
    people,
    standings: table,
    bretwalda: men.length ? {
      profileId: men[0].profileId, people, points: men[0].points, matches: men[0].matches,
    } : null,
    endedAt: now,
  };
  state.state = "ended";
  state.endedAt = now;
  state.verdict = verdict;
  return verdict;
}

/* --------------------------------------------------------------------------
   THE RESET
   -------------------------------------------------------------------------- */

/** How much cheaper the last champion's ground is to take. */
const TARGET_DISCOUNT = 0.75;

/**
 * The map the next season opens on.
 *
 * `docs/WHAT-THIS-GAME-IS.md` §3: "the map resets, with the previous
 * Bretwalda's kingdom starting at a small advantage and a large target on it."
 * Both halves, and they pull against each other on purpose:
 *
 *   THE ADVANTAGE is one extra territory — the first ground on the map that
 *   was not already theirs. Five against three, which is worth having and is
 *   nowhere near worth a season.
 *
 *   THE TARGET is a discount on their thresholds. Everything they hold is a
 *   quarter cheaper to take than the same ground would be in anyone else's
 *   hands. A champion defends more ground, held less firmly, against three
 *   peoples who can all see where he is.
 *
 * Note what the target is NOT: nobody's warrior is weaker for holding it and
 * nobody's is stronger for taking it. It is a property of the MAP. See the
 * header, and `docs/FACTIONS.md` §3.
 */
export function openingHoldings(previousWinner) {
  const holdings = {};
  const thresholds = {};
  for (const t of TERRITORIES) {
    holdings[t.id] = t.people;
    thresholds[t.id] = t.threshold;
  }
  if (!PEOPLES.includes(previousWinner)) return { holdings, thresholds };

  const spoil = TERRITORIES.find((t) => t.people !== previousWinner);
  if (spoil) holdings[spoil.id] = previousWinner;
  for (const id of Object.keys(holdings)) {
    if (holdings[id] === previousWinner) {
      thresholds[id] = Math.floor(territory(id).threshold * TARGET_DISCOUNT);
    }
  }
  return { holdings, thresholds };
}

/**
 * The front, for `dealTerritory`: the territories closest to changing hands,
 * most urgent first. A pure read of the state, so the engine and the map
 * screen name the same four borders.
 */
export function front(state) {
  const rows = Object.entries(state.territories).map(([id, t]) => {
    const best = PEOPLES.filter((p) => p !== t.holder)
      .reduce((n, p) => Math.max(n, t.contest[p]), 0);
    return { id, remaining: t.threshold - (best - t.contest[t.holder]), pressure: best };
  });
  rows.sort((a, b) => a.remaining - b.remaining || b.pressure - a.pressure || a.id.localeCompare(b.id));
  return {
    contested: rows.map((r) => r.id),
    holdings: Object.fromEntries(Object.entries(state.territories).map(([id, t]) => [id, t.holder])),
  };
}
