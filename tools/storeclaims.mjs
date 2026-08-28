#!/usr/bin/env node
// ============================================================
// STORECLAIMS — the store page's checkable claims, checked against the game.
//
//   node tools/storeclaims.mjs        (npm run storeclaims)
//
// WHY THIS EXISTS, AND IT IS NOT A HYPOTHETICAL.
//
// The first draft of `store/steam/copy.md` — written by the same pass that
// built this file's neighbours — claimed **FIVE warrior classes and named a
// "Burhweard"**. There are four, and no Burhweard has ever existed in this
// repository. It also called two of them "Warden" and "Runekeeper", which are
// the INTERNAL ids: the player-facing names are WEARD and WRECCA, and
// `src/game/client/render/vfx.ts` records that "Runekeeper" was retired
// because it "was also a class in somebody else's fantasy game, which is the
// one thing this project has a standing rule against".
//
// Every one of those would have been true forever. A Steam page is not a
// screenshot you retake — it is indexed, quoted, and read by people deciding
// whether to trust the rest of the claims. `docs/PROCESS.md` failure mode 3 is
// a mirrored constant; marketing copy is the same fault with a wider blast
// radius, because nothing else in this repository compares it to anything.
//
// SO THE COPY IS TREATED AS CODE. The nouns a store page uses — classes,
// arms, peoples, grounds, modes — are all things the game already defines
// exactly once. This reads the copy, extracts those nouns, and asks the
// modules that own them. It cannot check prose, taste or tone, and does not
// pretend to: it checks the FACTS a reader could hold the page to.
//
// It is deliberately loud about what it cannot see — see the closing note.
// ============================================================
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { WARRIOR_STATS, ARMS } from "../src/game/engine.mjs";
import { GROUNDS } from "../src/game/grounds.mjs";
import { PEOPLES } from "../src/game/war.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COPY_PATH = resolve(ROOT, "store/steam/copy.md");
const copy = readFileSync(COPY_PATH, "utf8");

let pass = 0, fail = 0;
const claim = (ok, name, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "PASS " : "FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

// The page's own honesty fence: everything under it is notes to the owner and
// is explicitly NOT store text, so it is not held to the same claims.
const FENCE = "## Fenced honesty";
const fenceAt = copy.indexOf(FENCE);
const shipped = fenceAt > 0 ? copy.slice(0, fenceAt) : copy;
const notes = fenceAt > 0 ? copy.slice(fenceAt) : "";

console.log("[storeclaims] the page, against the modules that own the nouns\n");

// ---- 1. THE CLASS ROSTER ------------------------------------------------
//
// The count first, because that is the claim that was wrong: a page that says
// "five" is wrong even if every name it then lists is right.
const classIds = Object.keys(WARRIOR_STATS);
const COUNTED = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const countWord = shipped.match(/\b(one|two|three|four|five|six)\s+(?:warrior|warriors|warrior classes|classes|fighters)\b/i);
claim(!!countWord, "the page states how many warriors there are",
  countWord ? `"${countWord[0]}"` : "no count found — say it, or a reader counts the bullets");
if (countWord) {
  const said = COUNTED[countWord[1].toLowerCase()];
  claim(said === classIds.length,
    "and the number is the number of classes the engine has",
    `page says ${said}, WARRIOR_STATS has ${classIds.length} (${classIds.join(", ")})`);
}

// The player-facing names. Held in `src/app/page.tsx`'s WARRIOR_INFO, which is
// TSX and not importable here — so it is READ AS TEXT rather than guessed at,
// and the read is asserted to have found one name per class. A parse that
// silently found nothing would turn this whole section green by absence.
const pageSrc = readFileSync(resolve(ROOT, "src/app/page.tsx"), "utf8");
const infoBlock = pageSrc.slice(pageSrc.indexOf("const WARRIOR_INFO"));
const shownNames = [...infoBlock.slice(0, infoBlock.indexOf("];")).matchAll(
  /id:\s*"(\w+)",\s*name:\s*"([^"]+)"/g)].map((m) => ({ id: m[1], name: m[2] }));
claim(shownNames.length === classIds.length,
  "the harness actually found the shipped display names",
  shownNames.map((n) => n.name).join(", ") || "PARSED NOTHING");

for (const { id, name } of shownNames) {
  // A name is only required if the page lists the roster at all. It does, in
  // bold bullets; anything bolded in caps is checked.
  const named = new RegExp(`\\b${name}\\b`).test(shipped);
  claim(named, `the page names ${name} (the shipped name for ${id})`,
    named ? "" : "the roster is listed but this one is missing");
}

// The retired ids must never appear as player-facing nouns. `Runekeeper` in
// particular is the standing rule. Checked case-insensitively and only in the
// SHIPPED half — the fenced notes are allowed to discuss internals.
for (const retired of ["Runekeeper", "Warden", "Burhweard"]) {
  const found = new RegExp(`\\b${retired}\\b`, "i").test(shipped);
  claim(!found, `the page does not use the retired/invented name "${retired}"`,
    found ? "it does — this is the exact defect this tool was written for" : "");
}

// ---- 2. THE ARMS --------------------------------------------------------
//
// Every arm the page sells the reader has to exist in the engine's own table.
// The page writes them in prose ("sword and board", "the gar"), so the
// comparison is on a normalised form rather than on exact strings.
const norm = (s) => s.toLowerCase().replace(/[^a-z]+/g, " ").trim();
const armNames = Object.values(ARMS).flatMap((byId) => Object.values(byId).map((a) => norm(a.name)));
const shippedNorm = norm(shipped);
const armsMentioned = armNames.filter((a) => shippedNorm.includes(a.replace(/^the /, "")));
claim(armsMentioned.length > 0, "the page mentions at least one real arm",
  `${armsMentioned.length} of ${armNames.length} named`);
// And nothing that LOOKS like an arms list may contain an arm that is not one.
// The known trap: a plausible period weapon nobody can actually equip.
for (const invented of ["battleaxe", "longsword", "warhammer", "halberd", "greatsword"]) {
  claim(!shippedNorm.includes(invented), `no invented weapon "${invented}"`);
}

// ---- 3. THE PEOPLES AND THE GROUNDS ------------------------------------
const peopleWords = { saxon: "Anglo-Saxons", norse: "Norse", briton: "Britons", pict: "Picts" };
for (const p of PEOPLES) {
  const word = peopleWords[p];
  claim(!word || new RegExp(word.replace(/-/g, "[- ]"), "i").test(shipped),
    `the page names the ${p} (${word})`);
}
claim(Object.keys(GROUNDS).length >= 4,
  "the game has the grounds a page can honestly boast about",
  `${Object.keys(GROUNDS).length}: ${Object.keys(GROUNDS).join(", ")}`);

// ---- 4. THE FENCE ITSELF ------------------------------------------------
//
// The page's most valuable section is the list of things it must NOT claim
// yet. If that fence is ever deleted, the page silently becomes free to
// promise Steam relay play and achievement sync — neither of which exists.
claim(fenceAt > 0, "the honesty fence is present",
  fenceAt > 0 ? "" : "the do-not-claim list is gone — restore it before publishing");
for (const unbuilt of ["relay", "achievement"]) {
  claim(new RegExp(unbuilt, "i").test(notes),
    `the fence still names "${unbuilt}" as not-yet-claimable`);
}
// And the shipped half must not make those promises.
claim(!/steam relay|relay play/i.test(shipped),
  "the shipped copy does not promise Steam relay play");

// ---- 5. WHAT THIS TOOL CANNOT SEE --------------------------------------
console.log(`
  NOT CHECKED, and named so nobody mistakes green for proof-read:
  prose, tone, pricing, the short description's character count against
  Steam's own limit, screenshots, and every claim that is a matter of
  taste. This checks NOUNS THE GAME OWNS. A page can pass this and still
  be badly written or overpromise something no module can contradict.`);

console.log(`\n[storeclaims] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
