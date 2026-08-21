"use client";
import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import {
  Swords, Target, Scroll, ArrowLeft, Copy, Share2, Crown,
  Shield, Wind, Sparkles, Check, Lock, Coins, User, Skull,
  Ghost, Flame, Eye, Shirt, ChevronRight, Trophy, Medal, Heart,
  Hammer, Users, DoorOpen, Crosshair, Bot, BotMessageSquare, RadioTower, Minus, Plus,
  Flag, Hourglass, KeyRound, CloudOff, Volume2, VolumeX, Map, Dices
} from "lucide-react";
import { forgeName } from "@/game/names.mjs";
import { REPLAY } from "@/game/replay.mjs";
import type {
  GamePlayer, WarriorClass, GameMode, Team, BestOf, RoundResult, RoundScoreBy, MatchEndData,
  EmoteId,
} from "../game/types";
import { WARRIOR_STATS, ARENA_NAMES, getLevelTitle, xpForLevel, ROUND_OPTIONS, DEFAULT_BEST_OF } from "../game/types";
// The four bars on the class card, and — the point of the module — the ONE
// place their maxima come from, which is the roster itself. See the header of
// `statshape.mjs` for the two warriors this screen used to draw identically.
import { cardBars, type StatAxis } from "@/game/statshape.mjs";
import {
  ARMOURY, freeCosmeticIds, defaultAppearance, migrateAppearance, isPeople, peopleOf,
  type Allegiance, type Appearance, type ArmouryOption,
} from "../game/client/characters";
// The registry only — a Map, a queue and a set of watchers, with every import
// inside it erased at compile time. The renderer that fills it lives in
// `armouryStage.ts` and arrives with the dynamically imported preview, so the
// landing screen does not download a sky shader to draw an empty card frame.
import {
  requestThumb, watchThumbs, specForOption, faceSeedFor,
} from "../game/client/armouryThumbs";
import { Transport } from "../game/client/transport";
import { getHandedness, getServerHandedness, subscribeHandedness } from "../game/client/input";
import {
  bindingsFor, labelForAction, labelForCode, loadKeyboardLayout,
  getBindings, getServerBindings, subscribeBindings,
  bindingsAreDefault, hydrateBindings, setBindingsPersister, bindingsTouchedHere,
} from "../game/client/bindings";
import type { ForgeProgress, WireHitMessage } from "../game/client/GameCanvas";
import {
  bootProfile, bindWarrior, collectPay, buyKit, syncName, recoverProfile,
  syncBindings, noteBindingsSynced, syncMuted, noteMutedSynced, fetchAllegiance, LEGACY_KEY, type ServerProfile,
} from "./profileLink";
// Statically imported, unlike the canvas: this module builds no AudioContext
// until a gesture and pulls in nothing else, so the landing screen pays a
// couple of kilobytes for it and the FIRST tap on the page is already a sound.
import {
  getAudio, subscribeMuted, getMuted, getServerMuted, type UiSound,
} from "../game/client/render/audio";
import dynamic from "next/dynamic";
import HeroBackdrop from "@/game/client/HeroBackdrop";
import { territory } from "@/game/war.mjs";

const GameCanvas = dynamic(() => import("../game/client/GameCanvas"), { ssr: false });
const KeyBindingsPanel = dynamic(
  () => import("../game/client/GameHud").then((m) => m.KeyBindingsPanel),
  { ssr: false },
);
const CharacterPreview = dynamic(() => import("../game/client/CharacterPreview"), { ssr: false });

type Screen = "landing" | "create" | "join" | "lobby" | "game" | "training" | "muster" | "profile" | "armoury";

type Difficulty = "recruit" | "warrior" | "jarl";

interface RoomState {
  code: string; mode: string; state: string; arena: string;
  players: Record<string, GamePlayer>; hostId: string;
  countdown: number; matchTimer: number;
  killFeed: Array<{ killerName: string; victimName: string; timestamp: number }>;
  lastStandTriggered: boolean;
  // The round state rides on every snapshot, so the screens never keep their
  // own copy of the score — the server is the only thing that knows it.
  bestOf: number; roundIndex: number; roundTarget: number;
  roundWins: Record<string, number>; roundScoreBy: RoundScoreBy;
  lastRound: RoundResult | null; nextRoundAt: number;
  /**
   * THE NAMED GROUND THIS MATCH IS FOUGHT OVER, and it has been on the wire all
   * along with nothing rendering it. `engine.mjs`'s `territoryBlock` puts it on
   * every snapshot; until now a player could fight a whole season without ever
   * learning where. `holder` is who holds it as the war front last said, which
   * is what makes "you are taking this off somebody" a sentence.
   */
  territory?: { id: string; name: string; native: string; holder: string } | null;
  /**
   * HOW MANY AUTHORITATIVE SNAPSHOTS HAVE LANDED, stamped by this client and
   * never by the server. Read by `GameCanvas` as `ctx.wireEpoch` and by nothing
   * else; see `stampSnapshot` below for why it is counted here and what went
   * wrong when it was counted anywhere else.
   *
   * Optional because it is absent for exactly one value — the `null` this holds
   * before the first packet — and because the wire itself never carries it.
   */
  wireSeq?: number;
}

interface ProfileData {
  name: string; level: number; xp: number; gold: number; honour: number;
  kills: number; deaths: number; wins: number; matches: number;
  unlocked: string[]; appearance: Appearance;
  /** Four words, only ever set by the server. Absent means "kept on this device". */
  recoveryCode?: string;
}

// Where this player's hoard actually lives. "reaching" is the second or two
// before the first answer comes back, and it is a real state: the armoury must
// not offer a device-local purchase during it and then be overruled.
type Link = "reaching" | "server" | "local";

// One banner, two tones. A purchase that failed has to say so, and it has to
// say so on the screen the player pressed the button on.
interface Notice { text: string; tone: "bad" | "good" }

/** One man's share of what a match did to the war. Mirrors `src/db/war.ts`. */
interface WarOutcomeMsg {
  playerId: string;
  kind: "banked" | "unsworn" | "guest" | "no_points" | "already" | "unavailable";
  people?: string;
  points?: number;
  territoryId?: string;
  /** Set when THIS man's points took the ground off somebody. */
  flip?: { territoryId: string; from: string; to: string };
}

/**
 * THE FOUR MEN, AND THEY ARE NAMED IN THE LANGUAGE THE GAME IS SET IN.
 *
 * `id` is the wire's and the engine's and never changes — `WARRIOR_STATS`,
 * every save, every harness and the ledger are all keyed on it. What is written
 * here is only what a player READS, which is why two of these could be
 * corrected at no cost at all.
 *
 *   WEARD, not "warden". The same word, spelled as Old English spells it.
 *   WRECCA, not "runekeeper". THERE ARE NO RUNES IN THIS CLASS AND THERE NEVER
 *     WERE — 92 health, the fastest man on the roster, the largest dodge in the
 *     game at 5.6 m, the weakest guard at 0.35, and SHADOW STEP. That is not a
 *     mystic, it is a man with no shield wall to stand in. `wrecca` is the Old
 *     English for exactly that man: the exile, the lordless fighter, the word
 *     `The Wanderer` is built on. The old name was also a class in somebody
 *     else's fantasy game, which is the one thing this project has a standing
 *     rule against.
 *
 * And his weapons are named for what `characters.ts` actually builds: the class
 * "fights with a seax in each hand", single-edged with the broken-back spine
 * (`characters.ts:10250`). "Twin daggers" was describing real Anglo-Saxon kit
 * in a word that could belong to anything.
 */
const WARRIOR_INFO: Array<{ id: WarriorClass; name: string; desc: string; Icon: typeof Swords }> = [
  { id: "huscarl", name: "HUSCARL", desc: "Shield & sword. Unbreakable.", Icon: Shield },
  { id: "warden", name: "WEARD", desc: "Balanced blade. Reliable.", Icon: Swords },
  { id: "runekeeper", name: "WRECCA", desc: "Twin seaxes. The exile's speed.", Icon: Wind },
  { id: "berserker", name: "BERSERKER", desc: "Danish axe. Pure rage.", Icon: Hammer },
];

const AI_DIFFICULTIES: Array<{ id: Difficulty; name: string; desc: string; bots: number; tint: string }> = [
  { id: "recruit", name: "RECRUIT", desc: "Slow and forgiving. Learn the moves.", bots: 1, tint: "border-l-emerald-500" },
  { id: "warrior", name: "WARRIOR", desc: "Competent. Punishes a lazy guard.", bots: 2, tint: "border-l-amber-500" },
  { id: "jarl", name: "JARL", desc: "Ruthless veterans. Parry or die.", bots: 3, tint: "border-l-red-500" },
];

// One warrior is a sparring partner; eight in the ring is a full blood moot.
// Zero is allowed: an empty ring is where you learn what the buttons do
// without a Jarl opening your head while you find out.
const MIN_AI = 0;
const MAX_AI = 7;

// Actions that fire on the press rather than while held. The server reads them
// as plain booleans, so the single sample where one flips false -> true is the
// only evidence that the press ever happened.
const EDGE_ACTIONS = ["attack", "heavyAttack", "dodge", "ability", "block", "shove"] as const;

// What a message costs is what decides how often continuous state goes out. A
// frame on an already-open socket is a few hundred bytes, so the render loop's
// samples go straight down it; the HTTP fallback pays a whole fetch per
// message, so there the stream is thinned to roughly the server's tick.
const CONTINUOUS_GAP_MS = { ws: 12, http: 48 };

const DEFAULT_PROFILE: ProfileData = {
  name: "", level: 1, xp: 0, gold: 0, honour: 0, kills: 0, deaths: 0, wins: 0, matches: 0,
  unlocked: freeCosmeticIds(),
  appearance: defaultAppearance("warden"),
};

export default function Page() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [prevScreen, setPrevScreen] = useState<Screen>("landing");
  const [keysOpen, setKeysOpen] = useState(false);
  // How far the arena has got. Null until the canvas mounts and reports.
  const [forge, setForge] = useState<ForgeProgress | null>(null);
  const [forgeStalled, setForgeStalled] = useState(false);
  /**
   * THE MUSTER — who the server is still waiting for, and until when.
   *
   * The owner: "a lot of the time the game starts before fully loading in which
   * is a poor experience, we shouldn't start until everyone is fully loaded
   * in." The server holds the bell (engine `LOAD_HOLD_MS`); this is the half a
   * player can see, because a wait nobody is told about looks exactly like a
   * hang and would trade one bad experience for another.
   */
  const [muster, setMuster] = useState<{ waitingFor: string[]; until: number } | null>(null);
  const [playerName, setPlayerName] = useState("");
  /**
   * What the forged name MEANS, shown under the field. A generator that hands
   * back "Wulfstan" and nothing else is a dice roll; one that says "wolf-stone"
   * teaches the player how the language builds names, which is what makes the
   * next one his own idea rather than another press of the button.
   */
  const [nameGloss, setNameGloss] = useState<string | null>(null);
  const forgeWarriorName = useCallback(() => {
    const forged = forgeName();
    setPlayerName(forged.name);
    setNameGloss(`${forged.name} — ${forged.gloss}`);
  }, []);
  const [playerId, setPlayerId] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [selectedMode, setSelectedMode] = useState<GameMode>("blood_moot");
  const [selectedTeam, setSelectedTeam] = useState<Team>("none");
  const [soloClass, setSoloClass] = useState<WarriorClass>("warden");
  const [soloDifficulty, setSoloDifficulty] = useState<Difficulty>("warrior");
  const [soloBots, setSoloBots] = useState(2);
  const [botDifficulty, setBotDifficulty] = useState<Difficulty>("warrior");
  const [bestOf, setBestOf] = useState<BestOf>(DEFAULT_BEST_OF);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  /**
   * THE PACKET COUNT, AND IT COUNTS PACKETS.
   *
   * `GameCanvas` hands this to the interpolator as `ctx.wireEpoch`, which is
   * what lets `ingestNet` tell a man the server says is STANDING STILL from a
   * man the server has said nothing about (see the long note at
   * `anim.ts:ingestNet`). The witness has to be "a snapshot landed".
   *
   * IT USED TO BE COUNTED OFF ROOM-RECORD IDENTITY — a `useEffect` on
   * `[roomState]` that incremented once per committed value. That is a
   * different quantity and the difference is not academic: `emote`,
   * `last_stand` and a bare `countdown` tick all call `setRoomState` with a
   * fresh object carrying NO player positions, so each one advanced the epoch
   * with no packet behind it and told every still warrior that an authoritative
   * "he is exactly here" had arrived when nothing had. Measured on a 30 s
   * seven-bot fight by `tools/janktest.mjs --phases=epoch`: 596 advances
   * against 598 snapshots with a quiet wire, and 602 against 597 — seven
   * phantom advances, one per relayed flourish — with an emote pressed every
   * 600 ms. The exposure is worst on the intermission path in
   * `GameCanvas.tsx`, whose own comment says "the wire is static here", because
   * that is precisely where the break card offers the emote buttons: there the
   * packet count is ZERO and every advance is phantom.
   *
   * So the count is taken HERE, at the only place in the client that knows the
   * difference — the message handler, which can see the message type. A ref
   * rather than state: it is stamped onto the value being committed, so it
   * rides the same render as the record it describes and cannot be read out of
   * step with it. Incrementing in an effect keyed on the record cannot express
   * "this particular commit was a packet" at all, which is the whole defect.
   */
  const wireSeqRef = useRef(0);
  /**
   * Stamp a whole-room snapshot with its packet number. Every caller is a
   * message that came out of `serializeRoom` with every player's authoritative
   * position on it, and no other caller is allowed.
   *
   * The messages that are NOT snapshots need no counterpart and deliberately
   * have none: they all build their next record with `{ ...prev }`, which
   * carries the previous `wireSeq` forward unchanged. Silence on the wire then
   * reads as silence, which is the entire contract.
   */
  const stampSnapshot = useCallback(<T extends RoomState>(d: T): T => {
    wireSeqRef.current += 1;
    d.wireSeq = wireSeqRef.current;
    return d;
  }, []);
  const [matchResults, setMatchResults] = useState<MatchEndData | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkMode, setLinkMode] = useState<"ws" | "http" | null>(null);
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [copied, setCopied] = useState(false);
  const [armouryTab, setArmouryTab] = useState(0);
  const [staged, setStaged] = useState<Record<string, { id: string; cost: number; slot: string; value: string | number }>>({});
  const [previewClass, setPreviewClass] = useState<WarriorClass>("warden");
  const [link, setLink] = useState<Link>("reaching");
  const [buying, setBuying] = useState(false);
  // What became of the pay for the last fight. Shown on the results screen,
  // because a player whose gold did not land deserves to hear it from us
  // rather than notice it on the landing screen an hour later.
  const [payState, setPayState] = useState<"none" | "asking" | "paid" | "unpaid">("none");
  /**
   * The war's answer to the fight just finished, for THIS warrior. `null` until
   * the server has banked (or refused to bank) — a database round trip that the
   * match end does not wait for, so the summary shows the tableau first and the
   * war line lands a moment later rather than holding the screen for it.
   */
  const [warResult, setWarResult] = useState<WarOutcomeMsg | null>(null);
  const [carried, setCarried] = useState<{ gold: number; unlocks: number } | null>(null);

  const transportRef = useRef<Transport | null>(null);
  /**
   * THE LATEST-VALUE MIRRORS, AND THEY ARE WRITTEN AFTER THE COMMIT.
   *
   * These four read `screen`, `playerId`, `profile` and `busy` out of closures
   * that were made long before — the transport's message handler holds ONE copy
   * for the life of a session, and it has to see the current answer rather than
   * the one that was true when it was built.
   *
   * They used to be assigned on the same line they were declared, which is a
   * write DURING RENDER. React is explicit that a render may be discarded — a
   * transition that loses a race, a Suspense retry, an offscreen pass — and a
   * ref written by a render that never commits holds a value the UI never
   * adopted. `react-doctor/no-ref-current-in-render` flags all four.
   *
   * The mirror runs in an effect with no dependency array instead, so it fires
   * after EVERY commit and only after a commit. Nothing here is read during
   * render — every reader is a callback or a wire handler, which run after the
   * commit and after this effect — so the value they see is unchanged. The one
   * thing that would break is a reader in the render body, and there is none.
   */
  const screenRef = useRef(screen);
  const playerIdRef = useRef(playerId);
  const profileRef = useRef(profile);
  const busyRef = useRef(busy);
  useEffect(() => {
    screenRef.current = screen;
    playerIdRef.current = playerId;
    profileRef.current = profile;
    busyRef.current = busy;
  });
  // Written by settleLink rather than mirrored on every render: the transport
  // holds one copy of the message handler for the life of a session, so where
  // the gold is kept has to be readable from a closure that was made before the
  // first answer came back.
  const linkRef = useRef<Link>("reaching");
  const lastInputSentRef = useRef(0);
  const heldActionsRef = useRef<Record<string, boolean>>({});
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A warrior the engine named before the profile had signed in. Binding is
  // what reserves that fight's pay, and it can only be done before the fight
  // ends, so a join that lands mid-boot is held here and bound the moment
  // there is a profile to bind it to.
  const unboundRef = useRef<string | null>(null);
  // FIGHT AGAIN, pressed before the server has rolled the room back to its
  // lobby. The engine clears every ready flag when it does (engine.mjs,
  // endMatch), so a "ready" sent early would be wiped — the intent is held
  // here and honoured on the lobby_update that announces the rollback.
  const rematchRef = useRef(false);
  /**
   * Whether the STAGE would honour a flourish from this player. Pushed up by
   * GameCanvas from `render/summary.ts`'s own `canPerform`, which is the thing
   * that actually decides — see the note there. True until a stage exists,
   * matching that function's own fallback.
   */
  const [canEmote, setCanEmote] = useState(true);
  /**
   * THE SLOW-MOTION REPLAY, as `GameCanvas` reports it. `null` when nothing is
   * playing. Two things hang off it and both are the owner's words: the match
   * summary waits ("before a match ends"), and the skip is offered ("skippable
   * at end of match, just take them to the lobby").
   */
  const [replay, setReplay] = useState<{ playing: boolean; atEnd: boolean; skip: () => void } | null>(null);
  const [rematchWaiting, setRematchWaiting] = useState(false);
  // The sign-in, as a promise. Anything that must not guess where the gold
  // lives — a purchase, a payout — waits on this rather than reading a link
  // that has not been settled yet and writing to the wrong ledger.
  const bootRef = useRef<Promise<void> | null>(null);
  // Emote relays from the server, queued for the canvas's frame loop — the
  // only thing that can reach the rigs. Drained there, pushed here.
  const emoteFeedRef = useRef<Array<{ playerId: string; emote: EmoteId }>>([]);
  // The server's `hit` messages, queued for the same frame loop and for the same
  // reason. This page routed every other event on the wire and dropped this one
  // on the floor, so the canvas derived blows from health deltas instead — and a
  // parry, a shove and a knockdown all take nothing off, so three of the seven
  // kinds the engine sends had never made a sound. See GameCanvas's `hitFeed`.
  const hitFeedRef = useRef<WireHitMessage[]>([]);
  // A held emote key auto-repeats messages the server would only drop; this
  // spares the wire, nothing more — the real cooldown is the server's.
  const emoteSentRef = useRef(0);

  const [inviteCode, setInviteCode] = useState("");

  // ------------------------------------------------------------------ sound
  //
  // The whole interface is voiced from here rather than from fifty onClicks.
  // One delegated listener on the capture phase gives every button in the app
  // its tap; the handful of presses that MEAN something — a confirm, a way out,
  // a purchase, a refusal — carry `data-snd` and say so. A screen added
  // tomorrow is audible without anybody remembering to make it audible, which
  // is the only way a UI sound set stays complete.
  const audio = getAudio();
  const muted = useSyncExternalStore(subscribeMuted, getMuted, getServerMuted);

  const toggleMute = useCallback(() => {
    const next = !audio.muted;
    audio.setMuted(next);
    // Unmuting is itself a gesture, so this is also where a player who muted
    // before ever tapping anything gets his context built.
    if (!next) { void audio.unlock().then(() => audio.ui("confirm")); }
    void syncMuted(next);
  }, [audio]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.("button,[role=\"button\"],a[href]") as HTMLElement | null;
      if (!el || el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return;
      // The mute button voices itself — a tap on it must not play the sound it
      // is in the middle of turning off.
      if (el.dataset.snd === "none") return;
      audio.ui((el.dataset.snd as UiSound) || "tap");
    };
    window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true });
  }, [audio]);

  /**
   * THE UPDATER IS PURE, AND THE WRITING-DOWN FOLLOWS THE COMMIT.
   *
   * This used to put `localStorage.setItem` and a ref write INSIDE the
   * `setProfile` updater. A state updater must be a pure function of the
   * previous state: React calls it whenever it needs to, more than once under
   * StrictMode, and on renders it may then throw away. So the disk could be
   * written — and `profileRef` moved — for a profile the player never got.
   * `react-doctor/no-impure-state-updater` flags it as an error rather than a
   * warning, and it is right to.
   *
   * The updater does one thing now. The mirror to disk happens in the effect
   * below, keyed on the profile that actually committed.
   */
  const saveProfile = useCallback((updates: Partial<ProfileData>) => {
    setProfile((prev) => ({ ...prev, ...updates }));
  }, []);
  // Still written in server mode, as a mirror rather than as the store: on the
  // day the free-tier database lapses the game degrades to device-local gold,
  // and it should degrade to the player's real total rather than to whatever he
  // had the week the server came up.
  useEffect(() => {
    try { localStorage.setItem(LEGACY_KEY, JSON.stringify(profile)); } catch { /* private mode */ }
  }, [profile]);

  // The server's answer, drawn. Nothing here is added up on the client — a
  // response replaces the totals outright, so a lost reply is a stale screen
  // and never a wrong balance.
  const adoptServer = useCallback((p: ServerProfile) => {
    saveProfile({
      level: p.level, xp: p.xp, gold: p.gold, honour: p.honour,
      kills: p.kills, deaths: p.deaths, wins: p.wins, matches: p.matches,
      unlocked: p.unlocked, appearance: migrateAppearance(p.appearance),
      recoveryCode: p.recoveryCode,
    });
  }, [saveProfile]);

  /**
   * The people a man swore to, off the war rolls and onto his warrior.
   *
   * ONE DIRECTION ONLY, AND THAT IS THE POINT. This reads the server's
   * `players.allegiance` — the record written over an authenticated route when
   * he took the oath — and writes it into the local `Appearance` as the LIVERY
   * he fights in. It never writes the other way: nothing a player can do on
   * this screen can change which people banks his points, because the only
   * route that can is `/api/war/swear` and it locks once he has fought.
   *
   * `null` back — no credentials, no database, an unreachable host, or a man
   * who simply has not sworn — all land on `"none"`, which is the issued kit
   * and is what `defaultAppearance` already ships. A no is never a hole.
   *
   * The live room is told too, but only if the value actually moved: a
   * `set_appearance` on every boot would rebuild every rig in the lobby for
   * nothing. See `createWarriorRig` — an appearance change disposes and rebuilds
   * a man. In practice there is no room at boot — the oath is taken on
   * `/factions`, which is a page navigation, so coming back remounts this
   * screen with no socket — and the send is there for the day that stops being
   * true rather than for today.
   */
  const adoptAllegiance = useCallback(async () => {
    const sworn = await fetchAllegiance();
    const people: Allegiance = isPeople(sworn) ? sworn : "none";
    const current = peopleOf(profileRef.current.appearance);
    if (current === people) return;
    const ap = { ...profileRef.current.appearance, people };
    saveProfile({ appearance: ap });
    transportRef.current?.send({ type: "set_appearance", data: { appearance: ap } });
  }, [saveProfile]);

  /**
   * The key bindings, taken off the roll or carried up to it.
   *
   * Two cases, and the second is the one that is easy to get wrong. A profile
   * that has bindings hands them to the input layer — that is the whole
   * feature: remap on a laptop, type the four words on another, and the same
   * key moves the warrior. A profile with `bindings: null` has never saved any,
   * and the table on THIS device is then the only copy in existence — a player
   * who remapped before this column shipped has his in localStorage — so it
   * goes up rather than being overwritten with the defaults he would get back.
   *
   * From then on every change is sent by the persister below. Neither call can
   * fail into a broken control scheme: a refusal leaves localStorage as the
   * store, which is exactly how the game ran before there was a server.
   */
  const adoptBindings = useCallback((p: ServerProfile | null, opts: { asked?: boolean } = {}) => {
    // THE THIRD CASE, AND IT IS THE OWNER'S BUG. The landing screen is live the
    // instant it paints and this runs behind it; on a cold dyno the sign-in can
    // be seconds or tens of seconds away. A player who opens the remap screen
    // inside that window and adds a key had it silently erased here — the row
    // hydrated over the top of him, localStorage and all. Measured before the
    // fix: the cap read ["T","↑","Y"] with the request still in flight and
    // ["T","↑"] once it answered.
    //
    // A remap he just made is the newest thing anybody knows, so it wins and
    // goes UP instead. The one exception is `asked`: typing four words is an
    // explicit request for the other device's saga, and the roll wins there.
    const touched = bindingsTouchedHere();
    if (p?.bindings && Object.keys(p.bindings).length > 0 && (opts.asked || !touched)) {
      noteBindingsSynced(p.bindings);
      if (hydrateBindings(p.bindings)) return;
    }
    const mine = getBindings();
    if (touched || !bindingsAreDefault(mine)) void syncBindings(mine);
  }, []);

  // One place where "where does the gold live" changes, because two places
  // would eventually disagree and one of them is what the armoury reads.
  const settleLink = useCallback((next: Link) => {
    linkRef.current = next;
    setLink(next);
  }, []);

  // Where the gold lives, once that is actually known. On a slow first load a
  // player can reach EQUIP before the sign-in answers, and a guess there is a
  // purchase written to the device that the server never sees.
  const settled = useCallback(async (): Promise<Link> => {
    if (linkRef.current === "reaching" && bootRef.current) {
      try { await bootRef.current; } catch { /* the boot never rejects; belt and braces */ }
    }
    return linkRef.current;
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("bretwalda_name");
    if (saved) setPlayerName(saved);
    const savedProfile = localStorage.getItem(LEGACY_KEY);
    let parsed: Partial<ProfileData> | null = null;
    if (savedProfile) {
      try {
        parsed = JSON.parse(savedProfile);
        // Migrated on the way in, not on the way out: the armoury decides what is
        // equipped by matching the stored value against the catalog's, so a
        // finish that was re-graded between releases would show as owning nothing
        // and charge the player a second time for kit he already has.
        const merged = { ...DEFAULT_PROFILE, ...parsed, unlocked: parsed?.unlocked ?? freeCosmeticIds() };
        setProfile({ ...merged, appearance: migrateAppearance(merged.appearance) });
      } catch { /* ok */ }
    }
    // Deep link: ?code=WESSEX82 puts you one tap from battle
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code")?.toUpperCase().substring(0, 15);
    if (code) {
      setInviteCode(code);
      setJoinCode(code);
      setScreen("join");
    }

    // Sign in behind the landing screen. Nothing waits on this: the player can
    // be typing a name and creating a room before it answers, and if it never
    // answers the game is the one it has always been, with the gold on the
    // device. The one step it must not skip is carrying that gold across.
    let dropped = false;
    bootRef.current = bootProfile(saved ?? "", parsed).then((result) => {
      if (dropped) return;
      settleLink(result.mode);
      if (result.profile) adoptServer(result.profile);
      if (result.mode === "server") {
        // Hydrate first, install the persister second: seeding the table from
        // the roll is not a change the player made and must not be posted back.
        adoptBindings(result.profile);
        setBindingsPersister((b) => { void syncBindings(b); });
        // The mute, on the same terms as the keys. The one asymmetry: `false`
        // on the roll is indistinguishable from "never said", so a device that
        // is muted pushes its answer up rather than being un-muted by a default
        // — silence a man asked for is not something to undo at a boot.
        const roll = result.profile?.muted === true;
        if (audio.muted && !roll) { void syncMuted(true); noteMutedSynced(true); }
        else { noteMutedSynced(roll); audio.setMuted(roll); }
        // THE OATH, FETCHED AND DRESSED. `BACKLOG.md` 4.3: "a man swears to a
        // people and then looks exactly as he did before". This is where that
        // stops being true — the war rolls are asked who he swore to and the
        // answer is written into his appearance as a livery.
        //
        // Behind the screen like everything else in this block, and it fails
        // into the unsworn, which is a deliberate look and not a hole. It also
        // runs on EVERY boot rather than once: the oath is taken on `/factions`,
        // which is a different page, so coming back from the map is exactly the
        // moment a man's people can have changed under this screen's feet.
        void adoptAllegiance();
      }
      if (result.carried && (result.carried.gold > 0 || result.carried.unlocks > 0)) {
        // The server counts every id it folded in, free starting kit included.
        // A player means "the things I bought", so the number he is shown is
        // the one he would get by counting his own unlocks.
        const free = freeCosmeticIds();
        const bought = result.profile?.unlocked.filter((id) => !free.includes(id)).length;
        setCarried({ gold: result.carried.gold, unlocks: bought ?? result.carried.unlocks });
      }
      if (result.carryRefused) setNotice({ text: result.carryRefused, tone: "bad" });
      const waiting = unboundRef.current;
      if (result.mode === "server" && waiting) { unboundRef.current = null; void bindWarrior(waiting); }
    }).catch(() => settleLink("local"));
    return () => { dropped = true; setBindingsPersister(null); };
  }, [adoptServer, settleLink, adoptBindings, adoptAllegiance, audio]);

  // The three moments the game speaks without being pressed. Each is guarded by
  // what it last said, because a re-render is not an event — and each of the
  // three is already on screen in words, so nothing here is carried in sound
  // alone.
  const spokenRef = useRef("");
  useEffect(() => {
    const tick = roomState?.state === "countdown" ? Math.ceil(roomState.countdown || 0) : 0;
    if (tick <= 0) return;
    const key = `count:${roomState?.roundIndex ?? 0}:${tick}`;
    if (spokenRef.current === key) return;
    spokenRef.current = key;
    audio.ui("countdown");
  }, [roomState?.state, roomState?.countdown, roomState?.roundIndex, audio]);

  useEffect(() => {
    const r = roomState?.lastRound;
    if (!r || roomState?.state !== "intermission") return;
    const key = `round:${r.index}`;
    if (spokenRef.current === key) return;
    spokenRef.current = key;
    const mine = !r.draw && (r.winnerId === playerId
      || (r.winnerTeam && roomState.players[playerId]?.team === r.winnerTeam));
    audio.ui(mine ? "roundWon" : "roundLost");
  }, [roomState?.lastRound, roomState?.state, roomState?.players, playerId, audio]);

  useEffect(() => {
    if (!matchResults) return;
    const key = `match:${matchResults.winnerId ?? "none"}:${matchResults.results.length}`;
    if (spokenRef.current === key) return;
    spokenRef.current = key;
    audio.ui(matchResults.winnerId === playerId ? "matchWon" : "matchLost");
  }, [matchResults, playerId, audio]);

  /**
   * The level. It is the one reward in the game that was silent, and it is
   * deliberately NOT spoken off the payout message: the level rises in three
   * different places — the server's answer, the device-local tally, and a
   * recovery on a new phone — and only one of those is a moment worth a
   * fanfare.
   *
   * So it is spoken off the profile itself, guarded twice. `seen` starts null
   * and the FIRST level this device ever reports is adopted in silence: boot
   * reads a level 7 profile out of localStorage over the default 1, and a
   * fanfare for reading a file is how this feature ships broken. And a rise is
   * only voiced while a match result is on screen, which is the only time a
   * level can actually have been earned — signing in on a second phone, or
   * recovering an account, moves the number without anyone having fought.
   */
  const levelSeenRef = useRef<number | null>(null);
  useEffect(() => {
    const seen = levelSeenRef.current;
    levelSeenRef.current = profile.level;
    if (seen === null || profile.level <= seen) return;
    if (!matchResults) return;
    audio.ui("levelUp");
  }, [profile.level, matchResults, audio]);

  const say = useCallback((text: string, tone: "bad" | "good" = "bad") => {
    // The banner and its sound are set in the same call so they cannot drift:
    // there is no path that refuses a player silently or congratulates him
    // with the refusal.
    audio.ui(tone === "good" ? "confirm" : "refusal");
    setNotice({ text, tone });
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setNotice(null), tone === "good" ? 3200 : 4600);
  }, [audio]);

  const showError = useCallback((msg: string) => say(msg, "bad"), [say]);

  // The device-local tally, exactly as it was before there was a server, and
  // still the entire economy anywhere the database is not. It runs only when
  // the server has said there is no server — never alongside a payout, or the
  // same fight would be paid twice.
  const tallyLocally = useCallback((r: MatchEndData["results"][number]) => {
    const p = profileRef.current;
    const xpNew = p.xp + r.xpEarned;
    saveProfile({
      kills: p.kills + r.kills, deaths: p.deaths + r.deaths,
      matches: p.matches + 1, wins: p.wins + (r.isWinner ? 1 : 0),
      honour: p.honour + (r.isWinner ? 12 : 3) + r.kills * 2,
      xp: xpNew, gold: p.gold + r.goldEarned,
      level: Math.max(p.level, Math.floor(1 + Math.sqrt(xpNew / 100))),
    });
  }, [saveProfile]);

  const sendMsg = useCallback((type: string, data?: Record<string, unknown>) => {
    transportRef.current?.send({ type, data });
  }, []);

  const handleMessage = useCallback((msg: { type: string; data?: Record<string, unknown> }) => {
    switch (msg.type) {
      case "join": {
        const d = msg.data as unknown as (RoomState & { playerId: string });
        setPlayerId(d.playerId);
        playerIdRef.current = d.playerId;
        setRoomCode(d.code);
        setRoomState(stampSnapshot(d));
        setPayState("none");
        setMatchResults(null);
        // Reserve this fight's pay before there is any. An unreserved payout
        // is paid to nobody, on purpose — every other phone in the lobby can
        // read this id off a room snapshot — so skipping it is silently
        // earning zero.
        if (linkRef.current === "server") void bindWarrior(d.playerId);
        else if (linkRef.current === "reaching") unboundRef.current = d.playerId;
        // A training room has no war code and nobody to wait for. Hold the
        // muster — still showing that the trial is being raised — rather than
        // flashing the invite lobby on the way to the countdown.
        if (d.mode === "solo") break;
        setBusy(false);
        setScreen("lobby");
        // Put the invite code in the URL bar so the current tab IS the
        // shareable link — whatever domain the player is on is the right one.
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("code", d.code);
          window.history.replaceState(null, "", url.toString());
        } catch { /* ok */ }
        break;
      }
      case "lobby_update": {
        setRoomState(stampSnapshot(msg.data as unknown as RoomState));
        // The rematch loop: the room has rolled back to its lobby — ready
        // flags freshly cleared — and this player already said "again" from
        // the summary screen. Now the ready can actually stick.
        if ((msg.data as { state?: string })?.state === "lobby" && rematchRef.current) {
          rematchRef.current = false;
          setRematchWaiting(false);
          sendMsg("ready");
          setMatchResults(null);
          setScreen("lobby");
        }
        break;
      }
      case "countdown": {
        const d = msg.data as unknown as RoomState;
        if (d.players) setRoomState(stampSnapshot(d));
        else setRoomState((prev) => prev ? { ...prev, state: "countdown", countdown: (msg.data?.countdown as number) || 0 } : prev);
        setBusy(false);
        // A new match is starting: strike the last one's summary set, or the
        // canvas would stage a victory tableau over the opening bell.
        setMatchResults(null);
        rematchRef.current = false;
        setRematchWaiting(false);
        setScreen("game");
        break;
      }
      case "game_state": {
        const d = msg.data as unknown as RoomState;
        setRoomState(stampSnapshot(d));
        // `loading` IS THE REASON THE CANVAS EXISTS YET. The server holds the
        // bell until this client reports its arena standing, and the arena is
        // built by GameCanvas — which is only mounted on the game screen. Enter
        // it here or the muster waits twelve seconds for a forge that was never
        // started, every match. See `awaitLoad` above and LOAD_HOLD_MS in the
        // engine.
        if (screenRef.current !== "game" &&
            (d.state === "loading" || d.state === "fighting" || d.state === "last_stand")) {
          setMatchResults(null);
          setScreen("game");
        }
        break;
      }
      // Who the room is still standing about for. Rendered rather than
      // swallowed: a wait a player cannot see is indistinguishable from a hang,
      // which is the defect this whole phase was added to remove.
      case "match_loading": {
        const d = msg.data as { waitingFor?: string[]; until?: number };
        setMuster({ waitingFor: Array.isArray(d.waitingFor) ? d.waitingFor : [], until: Number(d.until) || 0 });
        break;
      }
      case "last_stand": {
        setRoomState((prev) => prev ? { ...prev, lastStandTriggered: true, state: "last_stand" } : prev);
        break;
      }
      // A whole room snapshot with the round's result spread over it. Taking the
      // snapshot is what puts the screen into "intermission" and shows the break
      // card; the round result itself is read back out of `lastRound`.
      case "round_end": {
        const d = msg.data as unknown as RoomState;
        if (d.players) setRoomState(stampSnapshot(d));
        break;
      }
      // WHAT THE FIGHT DID TO THE WAR, which arrives AFTER the match end.
      //
      // The banking is a database round trip the match does not wait for, so
      // this cannot ride on `match_end`. It is a second message, and it is sent
      // on the failure paths too — "this counted for nobody" is the line that
      // was missing. Only the local warrior's own outcome is kept: the others
      // are on the wire because the room shares one broadcast, and reading
      // another man's allegiance off it is not something this screen does.
      case "war_result": {
        const d = msg.data as unknown as { territoryId?: string; outcomes?: WarOutcomeMsg[] };
        const mine = (d?.outcomes ?? []).find((o) => o.playerId === playerIdRef.current) ?? null;
        setWarResult(mine);
        return;
      }
      case "match_end": {
        const d = msg.data as unknown as MatchEndData;
        setMatchResults(d);
        const myResult = d.results.find((r) => r.id === playerIdRef.current);
        const warrior = playerIdRef.current;
        if (myResult) {
          // The engine has already decided what this fight paid and told the
          // server. All the client can do is go and collect it — and if the
          // answer is that there is no server today, fall back to the tally
          // the game has always kept on the device.
          setPayState("asking");
          settled().then((where) => {
            if (where === "local") { tallyLocally(myResult); setPayState("paid"); return; }
            return collectPay(warrior).then((reply) => {
              if (reply.kind === "server") { adoptServer(reply.value.profile); setPayState("paid"); }
              else if (reply.kind === "local") { tallyLocally(myResult); setPayState("paid"); }
              else {
                setPayState("unpaid");
                // The results card is gone ten seconds after the last blow, and
                // an answer that arrives after it has nowhere to land. The
                // banner outlives the screen, so it carries the bad news too.
                showError("Your pay for that fight did not reach the war rolls.");
              }
            });
          }).catch(() => setPayState("unpaid"));
        }
        // No screen change. The summary is not a menu — the canvas stays up,
        // render/summary.ts stages the men who fought, and MatchSummary lays
        // the numbers over them. The player leaves when he presses something.
        break;
      }
      // A flourish, already validated and throttled by the server. Two homes:
      // the feed hands it to the canvas loop to perform and voice, and the
      // room record keeps it as the player's CHOSEN emote so a summary staged
      // minutes later can pose the victor with it.
      case "emote": {
        const pid = msg.data?.playerId as string | undefined;
        const emote = msg.data?.emote as EmoteId | undefined;
        if (!pid || !emote) break;
        emoteFeedRef.current.push({ playerId: pid, emote });
        setRoomState((prev) => {
          if (!prev?.players?.[pid]) return prev;
          return { ...prev, players: { ...prev.players, [pid]: { ...prev.players[pid], emote } } };
        });
        break;
      }
      // Every resolved blow, parry, block, shove and knockdown. Queued only —
      // the canvas's frame loop is the one thing that can place a sound on the
      // man it happened to, and a blow must not rebuild that callback. Bounded
      // because a tab in the background stops draining while the fight goes on.
      case "hit": {
        const d = msg.data as unknown as WireHitMessage | undefined;
        if (!d || typeof d.type !== "string") break;
        const feed = hitFeedRef.current;
        if (feed.length > 64) feed.splice(0, feed.length - 64);
        feed.push(d);
        break;
      }
      case "error": {
        setBusy(false);
        const code = msg.data?.code as string | undefined;
        const inMenu = screenRef.current === "landing" || screenRef.current === "create" || screenRef.current === "join" || screenRef.current === "training" || screenRef.current === "muster" || screenRef.current === "profile" || screenRef.current === "armoury";
        // During gameplay or lobby, silently swallow transient link errors —
        // the transports keep the session alive; don't scare the player.
        if (inMenu || busyRef.current) {
          showError((msg.data?.message as string) || "Something went wrong");
        } else if (code === "lost") {
          // soft banner only if we genuinely need action
          showError("Link flickered — try re-entering the room if things look wrong.");
        }
        break;
      }
    }
  }, [adoptServer, tallyLocally, showError, settled, sendMsg, stampSnapshot]);

  const ensureTransport = useCallback(async (): Promise<boolean> => {
    if (transportRef.current && transportRef.current.mode) return true;
    const t = new Transport();
    transportRef.current = t;
    t.on(handleMessage);
    try {
      await t.connect();
      setLinkMode(t.mode);
      return true;
    } catch {
      transportRef.current = null;
      showError("Could not reach the war council. Check your connection and retry.");
      return false;
    }
  }, [handleMessage, showError]);

  /**
   * AND THE LINK IS CLOSED WHEN THIS COMPONENT GOES.
   *
   * `ensureTransport` opens a socket and subscribes `handleMessage` to it, and
   * nothing tore either down on unmount — `leaveRoom` is the only close and it
   * is a BUTTON. A player who navigates away mid-fight, or a StrictMode
   * remount in development, left a live WebSocket delivering snapshots into a
   * handler whose component no longer exists. `react-doctor/effect-needs-cleanup`
   * flags the subscription as an error.
   *
   * Unmount only — the empty dependency array is deliberate. Re-running this on
   * every change of `handleMessage` would close the link mid-match, which is
   * the opposite of the bug being fixed. The ref is read at cleanup time, so it
   * sees whatever transport is live then rather than whatever was live at mount.
   */
  useEffect(() => () => {
    transportRef.current?.close();
    transportRef.current = null;
  }, []);

  const sendInputNow = useCallback((sample: Record<string, unknown>) => {
    lastInputSentRef.current = performance.now();
    sendMsg("input", sample);
  }, [sendMsg]);

  // One road for every emote press — the bound key, the break card, the
  // summary — so the client-side splash guard covers them all alike.
  const sendEmote = useCallback((emote: EmoteId) => {
    const now = performance.now();
    if (now - emoteSentRef.current < 500) return;
    emoteSentRef.current = now;
    sendMsg("emote", { emote });
  }, [sendMsg]);

  // Input used to be parked in a single slot that a timer drained, so a press
  // that landed and lifted between two drains was simply thrown away — the
  // slot only ever remembered the newest sample. Nothing is parked now.
  //
  // Movement, look and sprint are level-triggered: only the newest sample is
  // worth anything, so those may be thinned to what the link can afford. An
  // action is edge-triggered — the one sample where it reads true IS the
  // event — so it leaves on the frame the render loop reports it. A press seen
  // once is therefore sent once, and two presses are two edges and two
  // messages, however close together they fall. Block sits with the actions
  // because its onset is what the parry window is measured against.
  const handleSendInput = useCallback((input: Record<string, unknown>) => {
    const held = heldActionsRef.current;
    let edge = false;
    for (const action of EDGE_ACTIONS) {
      const down = input[action] === true;
      if (down && !held[action]) edge = true;
      held[action] = down;
    }
    if (edge) { sendInputNow(input); return; }

    const gap = transportRef.current?.mode === "http" ? CONTINUOUS_GAP_MS.http : CONTINUOUS_GAP_MS.ws;
    if (performance.now() - lastInputSentRef.current >= gap) sendInputNow(input);
  }, [sendInputNow]);

  const leaveRoom = useCallback(() => {
    transportRef.current?.close();
    transportRef.current = null;
    // A button still down when the link closes must not swallow the first
    // press of the next fight by looking like a key that never rose.
    heldActionsRef.current = {};
    setLinkMode(null);
    setRoomState(null);
    setRoomCode("");
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      window.history.replaceState(null, "", url.pathname);
    } catch { /* ok */ }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!playerName.trim()) { showError("Enter your warrior name first!"); return; }
    setBusy(true);
    localStorage.setItem("bretwalda_name", playerName);
    void syncName(playerName);
    const ok = await ensureTransport();
    if (!ok) { setBusy(false); return; }
    sendMsg("create", { name: playerName, mode: selectedMode, bestOf, appearance: profileRef.current.appearance, awaitLoad: true });
  }, [playerName, selectedMode, bestOf, ensureTransport, sendMsg, showError]);

  const handleJoin = useCallback(async () => {
    if (!playerName.trim()) { showError("Enter your warrior name first!"); return; }
    if (!joinCode.trim()) { showError("Enter a room code!"); return; }
    setBusy(true);
    localStorage.setItem("bretwalda_name", playerName);
    void syncName(playerName);
    const ok = await ensureTransport();
    if (!ok) { setBusy(false); return; }
    sendMsg("join", { name: playerName, code: joinCode.toUpperCase(), appearance: profileRef.current.appearance, awaitLoad: true });
  }, [playerName, joinCode, ensureTransport, sendMsg, showError]);

  // The whole trial is configured on the client and travels in one message, so
  // nothing can strand a player half-armed in a room they never asked for.
  const handleSolo = useCallback(async (difficulty: Difficulty = soloDifficulty, bots: number = soloBots) => {
    setBusy(true);
    const name = playerName.trim() || "Trainee";
    localStorage.setItem("bretwalda_name", name);
    void syncName(name);
    const ok = await ensureTransport();
    if (!ok) { setBusy(false); return; }
    sendMsg("solo", {
      name, difficulty,
      botCount: Math.max(MIN_AI, Math.min(MAX_AI, bots)),
      // An empty ring still has to start; there is no one to wait for.
      warriorClass: soloClass,
      appearance: profileRef.current.appearance,
      autoStart: true,
      awaitLoad: true,
    });
  }, [playerName, soloClass, soloDifficulty, soloBots, ensureTransport, sendMsg]);

  // The quick spar on the training screen doubles as a preset: whatever odds
  // you took last are the odds the muster opens on.
  const quickSpar = useCallback((preset: typeof AI_DIFFICULTIES[number]) => {
    setSoloDifficulty(preset.id);
    setSoloBots(preset.bots);
    handleSolo(preset.id, preset.bots);
  }, [handleSolo]);

  const handleCopyCode = useCallback(() => {
    navigator.clipboard?.writeText(roomCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => { /* ok */ });
  }, [roomCode]);

  const shareUrl = useCallback(() => {
    return `${window.location.origin}/?code=${roomCode}`;
  }, [roomCode]);

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({
        title: "BRETWALDA: BLOOD MOOT",
        text: `Draw steel in Dark Age Britain — tap to join my battle (${roomCode})!`,
        url: shareUrl(),
      }).catch(() => { /* ok */ });
    } else {
      navigator.clipboard?.writeText(shareUrl()).catch(() => { /* ok */ });
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  }, [roomCode, shareUrl]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard?.writeText(shareUrl()).catch(() => { /* ok */ });
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  // ---- armoury ----
  /**
   * The face the shop shows him.
   *
   * `buildCharacter` falls back to build order when it is handed no seed, and
   * that resolved to 0 for every warrior the old preview ever drew — so the
   * armoury showed every player on earth the same man. The recovery code is
   * the only identifier a profile carries that survives a session; a name is
   * editable and the wire's player id is minted fresh every time he connects.
   */
  const faceSeed = faceSeedFor(profile.recoveryCode || profile.name || "moot");

  const isUnlocked = useCallback((id: string) => profile.unlocked.includes(id), [profile.unlocked]);
  const equippedValue = useCallback((slot: string): string | number => {
    const ap = profile.appearance;
    switch (slot) {
      case "helm": return ap.helm;
      case "hair": return ap.hairStyle;
      case "hairColor": return ap.hairColor;
      case "beard": return ap.beardStyle;
      case "beardColor": return ap.beardColor;
      case "cloak": return ap.cloak;
      case "armor": return ap.armorColor;
      case "warPaint": return ap.warPaint;
      default: return "";
    }
  }, [profile.appearance]);

  // ---- Staged try-on: tapping items only changes the 3D mannequin ----
  const pendingValue = useCallback((slot: string): string | number => {
    return staged[slot] ? staged[slot].value : equippedValue(slot);
  }, [staged, equippedValue]);

  const previewAppearance = useCallback((): Appearance => {
    const ap = { ...profile.appearance };
    for (const slot of Object.keys(staged)) {
      const s = staged[slot];
      switch (slot) {
        case "helm": ap.helm = String(s.value); break;
        case "hair": ap.hairStyle = String(s.value); break;
        case "hairColor": ap.hairColor = Number(s.value); break;
        case "beard": ap.beardStyle = String(s.value); break;
        case "beardColor": ap.beardColor = Number(s.value); break;
        case "cloak": ap.cloak = String(s.value); break;
        case "armor": ap.armorColor = Number(s.value); break;
        case "warPaint": ap.warPaint = String(s.value); break;
      }
    }
    return ap;
  }, [profile.appearance, staged]);

  // Priced the way the server prices it: by what this profile owns, and by
  // nothing else. The old rule also forgave anything already equipped, which
  // was a second rule that could only ever disagree with the till.
  const stagedCost = useCallback(() => {
    let total = 0;
    for (const slot of Object.keys(staged)) {
      const s = staged[slot];
      if (!profile.unlocked.includes(s.id)) total += s.cost;
    }
    return total;
  }, [staged, profile.unlocked]);

  const hasChanges = Object.keys(staged).some((s) => equippedValue(s) !== staged[s].value);

  const stageItem = useCallback((opt: { id: string; cost: number; slot: string; value: string | number }) => {
    setStaged((prev) => ({ ...prev, [opt.slot]: { ...opt } }));
  }, []);

  const clearStaged = useCallback(() => setStaged({}), []);

  // The device-local till. Still exactly right when there is no server; it is
  // also, by itself, an economy a player can edit in devtools, which is why it
  // is now the fallback and not the rule.
  const applyLocally = useCallback(() => {
    const p = profileRef.current;
    const cost = stagedCost();
    if (p.gold < cost) { showError(`Not enough gold — need ${cost}.`); return; }
    const unlocked = [...p.unlocked];
    const ap = { ...p.appearance };
    for (const slot of Object.keys(staged)) {
      const s = staged[slot];
      if (!unlocked.includes(s.id)) unlocked.push(s.id);
      switch (slot) {
        case "helm": ap.helm = String(s.value); break;
        case "hair": ap.hairStyle = String(s.value); break;
        case "hairColor": ap.hairColor = Number(s.value); break;
        case "beard": ap.beardStyle = String(s.value); break;
        case "beardColor": ap.beardColor = Number(s.value); break;
        case "cloak": ap.cloak = String(s.value); break;
        case "armor": ap.armorColor = Number(s.value); break;
        case "warPaint": ap.warPaint = String(s.value); break;
      }
    }
    saveProfile({ appearance: ap, unlocked, gold: p.gold - cost });
    if (cost > 0) audio.ui("purchase");
    if (prevScreen === "lobby" || screenRef.current === "lobby") {
      sendMsg("set_appearance", { appearance: ap });
    }
    setStaged({});
  }, [staged, stagedCost, saveProfile, sendMsg, prevScreen, showError, audio]);

  /**
   * EQUIP & BUY. The client sends the ids on the mannequin and nothing else —
   * no price, no balance — and draws whatever comes back. A refusal keeps the
   * try-on exactly as it is and says why, because a shop that clears the
   * basket and shows the old gold looks like it worked.
   */
  const applyStaged = useCallback(async () => {
    const ids = Object.values(staged).map((s) => s.id);
    if (ids.length === 0) return;
    if (await settled() !== "local") {
      setBuying(true);
      const reply = await buyKit(ids);
      setBuying(false);
      if (reply.kind === "server") {
        adoptServer(reply.value.profile);
        if (prevScreen === "lobby" || screenRef.current === "lobby") {
          sendMsg("set_appearance", { appearance: reply.value.profile.appearance });
        }
        setStaged({});
        if (reply.value.spent > 0) audio.ui("purchase");
        say(reply.value.spent > 0 ? `Bought for ${reply.value.spent} gold.` : "Kit equipped.", "good");
        return;
      }
      if (reply.kind === "refused") { showError(reply.message); return; }
      // `local` — no war rolls today, so the device keeps the books.
      settleLink("local");
    }
    applyLocally();
  }, [staged, prevScreen, adoptServer, applyLocally, sendMsg, say, showError, settleLink, settled, audio]);

  /**
   * Four words, typed on a phone that has never seen this profile. On success
   * the server rotates the key and this device becomes that player — which
   * means the device it was recovered *from* is signed out, and that is the
   * right trade for the case this exists for: a phone that is gone.
   *
   * Answers with the sentence to show under the box, or null for "it worked".
   */
  const handleRestore = useCallback(async (code: string): Promise<string | null> => {
    const reply = await recoverProfile(code);
    if (reply.kind === "server") {
      adoptServer(reply.value.profile);
      // This device is now that player, keys included. A profile carrying
      // bindings takes this machine's over — that is what "restored" means —
      // and one carrying none is given the table already on it. `asked`,
      // because four words typed by hand outrank a remap made on this device:
      // the guard that protects a remap from the boot must not stop a player
      // deliberately pulling his own saga back.
      adoptBindings(reply.value.profile, { asked: true });
      setBindingsPersister((b) => { void syncBindings(b); });
      settleLink("server");
      setCarried(null);
      say("Your saga is restored.", "good");
      return null;
    }
    if (reply.kind === "local") return "No war rolls are being kept today, so there is nothing to bring back.";
    return reply.message;
  }, [adoptServer, adoptBindings, say, settleLink]);

  /**
   * Hand the shop's GL context back before a match starts.
   *
   * `armouryStage.ts` keeps its forge alive for twenty seconds after the last
   * preview unmounts, so stepping between the armoury and the class picker
   * does not regenerate twenty PBR map sets. A match started inside that
   * window would have TWO contexts up at once, each with its own texture
   * library — 80 MB of maps against VISUAL-BAR §4's 40 MB budget, on the
   * device that can least afford it. The one with the fight in it wins.
   *
   * Dynamically imported so the landing screen never downloads the module:
   * by the time this fires the preview has already pulled it in, so the
   * promise resolves out of the module cache on the same tick.
   */
  useEffect(() => {
    if (screen !== "game") return;
    let cancelled = false;
    void import("../game/client/armouryStage")
      .then((m) => { if (!cancelled) m.releaseArmouryStage(); })
      .catch(() => { /* the shop was never opened this session */ });
    return () => { cancelled = true; };
  }, [screen]);

  const openArmoury = useCallback((from: Screen) => {
    setStaged({});
    setPrevScreen(from);
    // Dress the mannequin as whichever warrior the player is actually about to
    // fight as, so the try-on is the real thing rather than a default.
    const cls = from === "muster" ? soloClass : roomState?.players[playerIdRef.current]?.warriorClass;
    if (cls) setPreviewClass(cls);
    setScreen("armoury");
  }, [roomState, soloClass]);

  // Which side of a phone the movement thumb is on. Read here for the same
  // reason GameHud reads it: anything drawn over the fight has to keep off the
  // free-look half, and which half that is is the player's choice.
  const lefty = useSyncExternalStore(subscribeHandedness, getHandedness, getServerHandedness);

  // Leaving the fight tears the canvas down; the next one forges from nothing.
  useEffect(() => {
    if (screen !== "game") { setForge(null); setForgeStalled(false); setMuster(null); }
  }, [screen]);

  /**
   * "MY ARENA IS STANDING." Sent once the forge has landed every stage, which
   * is the only honest definition of loaded this client has — the same signal
   * that takes the forge screen off. The server ignores a repeat, so there is
   * nothing to remember, and it can only ever make the fight start SOONER.
   *
   * `forgeStalled` is in the condition on purpose: at twenty seconds the forge
   * screen comes off regardless (see below), and a client that has given up
   * waiting for its own arena must not go on holding seven other people. The
   * server's own twelve-second cap would have released them first; this makes
   * the two agree rather than leaving the client silently the slower of them.
   */
  useEffect(() => {
    if (screen !== "game") return;
    // `forge !== null && forge.done >= forge.total`, and the first half is the
    // whole point. The first cut read `if (forge && forge.done < forge.total)
    // return;` — which does NOT return when `forge` is null, and `forge` IS
    // null for the beat between entering the game screen and the canvas
    // reporting its first stage. So this client shouted "my arena is standing"
    // before it had built a single thing, every match, and the muster it was
    // supposed to join it never joined. Nothing measured it: `readytest` drives
    // the server and cannot see what this client chooses to say, and the server
    // is behaving perfectly correctly when it believes a lie. It took a
    // screenshot (`tools/mustershot.mjs`) showing a fight where a wait should
    // have been.
    if (!forgeStalled && !(forge !== null && forge.done >= forge.total)) return;
    sendMsg("loaded");
  }, [screen, forge, forgeStalled, sendMsg]);

  // A loading screen that outlives the thing it is loading is the one failure
  // this feature has already had (docs/OPEN-DEFECTS.md). The build lands in
  // well under two seconds on real silicon and a few on a slow phone; at
  // twenty the screen comes off regardless and the game is behind it.
  const forging = Boolean(forge && forge.done < forge.total);
  useEffect(() => {
    if (!forging) return;
    const t = setTimeout(() => setForgeStalled(true), 20000);
    return () => clearTimeout(t);
  }, [forging]);

  // The bindings, live. Every key printed on a menu comes through this, so a
  // remap changes the reference instead of leaving it lying.
  // Read the SNAPSHOT this returns, never `bindingsFor()` behind its back. The
  // caps below are server-rendered, and `getServerBindings` is what React
  // replays during hydration — so a store read here makes the hydration pass
  // print the player's remapped caps against server HTML holding the defaults,
  // and React throws #418 and re-renders the landing on every custom bind.
  const binds = useSyncExternalStore(subscribeBindings, getBindings, getServerBindings);
  useEffect(() => { void loadKeyboardLayout(); }, []);
  const moveKeys = (["forward", "left", "back", "right"] as const)
    .map((a) => labelForCode(binds[a]?.[0] ?? "")).join(" ");

  // ==================== GAME ====================
  if (screen === "game") {
    return (
      <div className="fixed inset-0 bg-black">
        <GameCanvas playerId={playerId} roomState={roomState} onSendInput={handleSendInput} matchEnd={matchResults} onForge={setForge}
          onEmote={sendEmote} onCanEmote={setCanEmote} onReplay={setReplay} emoteFeed={emoteFeedRef} hitFeed={hitFeedRef} />
        {/* The arena being built, instead of a black screen. Driven only by
            stages that have LANDED (see GameCanvas), and it sits under the
            HUD's z-50 graphics-error overlay so a forge that will not wake
            says so rather than hanging behind this. `forgeStalled` is the last
            resort: whatever happens, the screen comes off. */}
        {forge && forge.done < forge.total && !forgeStalled && (
          <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-stone-950 px-8">
            <div className="label-overline">THE FORGE</div>
            <div className="font-display text-center text-lg tracking-[0.2em] text-amber-100 sm:text-2xl"
              style={{ textShadow: "0 0 30px rgba(255,180,60,0.35)" }}>
              {forge.label}
            </div>
            <div className="knot-band w-full max-w-[18rem]" />
            <div className="h-1.5 w-full max-w-[18rem] overflow-hidden rounded-full border border-amber-900/70 bg-black/80">
              {/* No transition. The stages land faster than 300ms and each one
                  runs synchronously, so an eased bar cannot tick while the
                  work is happening: it painted 29px of 1440 at 99% built. The
                  bar is the truth or it is decoration. */}
              <div className="h-full rounded-full"
                style={{
                  width: `${Math.round((forge.done / forge.total) * 100)}%`,
                  background: "linear-gradient(90deg,#7c2d12,#f0c14b)",
                }} />
            </div>
            <div className="text-[10px] font-bold tracking-[0.25em] text-stone-500">
              {Math.min(forge.stage + 1, forge.stages)} OF {forge.stages}
            </div>
          </div>
        )}
        {/* THE MUSTER, once this client's own arena is up and the room is still
            standing about for somebody else's. It is a named list rather than a
            spinner, because "waiting for Guthrum" is a fact a player can act on
            and a spinner is not. `until` is the server's own deadline; nobody
            waits past it.

            THE CONDITION IS "THE FORGE HAS FINISHED", NOT "THE FORGE IS NOT
            RUNNING", and `tools/mustershot.mjs` is why. The first cut read
            `!(forge && forge.done < forge.total)` — which is TRUE in the gap
            before the canvas has reported its first stage, because `forge` is
            still null there. So the panel flashed "WAITING FOR GUTHRUM" over a
            black screen for a beat, the forge bar then replaced it, and it came
            back at the end: the room appeared to be waiting for somebody else
            while this player had not started loading. Every assertion in
            `readytest` passed throughout. It took one PNG. */}
        {muster && muster.waitingFor.length > 0 && roomState?.state === "loading" &&
         (forgeStalled || (forge !== null && forge.done >= forge.total)) && (
          <div data-muster className="pointer-events-none absolute inset-x-0 top-1/2 z-40 -translate-y-1/2 px-8 text-center">
            <div className="label-overline">THE MUSTER</div>
            <div className="font-display mt-2 text-lg tracking-[0.18em] text-amber-100 sm:text-2xl"
              style={{ textShadow: "0 0 30px rgba(255,180,60,0.35)" }}>
              WAITING FOR {muster.waitingFor.join(", ").toUpperCase()}
            </div>
            <div className="knot-band mx-auto mt-3 w-full max-w-[18rem]" />
            <div className="mt-2 text-[10px] font-bold tracking-[0.25em] text-stone-500">
              THE FIGHT BEGINS WITHOUT THEM IF IT MUST
            </div>
          </div>
        )}
        {/* The score of the match, over the fight. A best-of is worth nothing
            if a player cannot see where he stands in it, and the HUD proper
            only knows about this round. Sits below the health bar the HUD
            owns, and never takes a pointer event off the controls. */}
        {roomState && roomState.mode !== "solo" && (roomState.bestOf ?? 1) > 1 && roomState.state !== "lobby" && roomState.state !== "finished" && (
          <div className="pointer-events-none absolute left-1/2 top-[4.6rem] z-20 -translate-x-1/2">
            <RoundTally roomState={roomState} playerId={playerId} />
          </div>
        )}
        {roomState?.state === "intermission" && <RoundBreak roomState={roomState} playerId={playerId} onEmote={sendEmote} />}
        {/* The end of the match. The stage behind this is the summary — the
            canvas is showing the victor and the wall, or the duel's corpse —
            so this overlay is only the numbers and the two ways out, top and
            bottom, with the picture left alone in between. It outlives the
            server's rollback to "lobby" on purpose: the player leaves the
            tableau when he presses something, not when a timer does. */}
        {/* THE LAST KILL OF THE MATCH, BEFORE THE SUMMARY.
            The owner: "a slow motion replay of the last kill before the next
            round and before a match ends, skippable at end of match, just take
            them to the lobby." The canvas holds the victor's tableau back
            while this runs; this is the skip, and it is offered ONLY at match
            end — a round break is four seconds and deals itself, and a skip
            there would just be a button that shortens a break nobody is
            waiting on.

            `replay.skip()` is `replay.mjs`'s own, so the beat ends in one
            place. The route out is the same one `onLeave` takes below, because
            "take them to the lobby" is a screen and not a camera. */}
        {replay?.playing && replay.atEnd && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-end justify-center p-6 pb-10">
            <button
              onClick={() => { replay.skip(); leaveRoom(); setMatchResults(null); setScreen("landing"); }}
              className="pointer-events-auto rounded-full border border-amber-400/40 bg-black/60 px-6 py-2 text-xs font-bold tracking-[0.25em] text-amber-200 backdrop-blur transition hover:border-amber-300 hover:text-amber-100">
              SKIP
            </button>
          </div>
        )}
        {matchResults && roomState && roomState.mode !== "solo" &&
          (roomState.state === "finished" || roomState.state === "lobby") &&
          !replay?.playing && (
          <MatchSummary
            data={matchResults}
            playerId={playerId}
            payState={payState}
            waiting={rematchWaiting}
            war={warResult}
            // The one refusal a player can undo from here. The oath is taken on
            // the map and the map is its own route, so this goes there rather
            // than growing a second swearing UI — one place decides who you
            // fight for. The socket is dropped first, deliberately: the match is
            // over and `The War` on the landing screen leaves the same way.
            onSwear={() => { leaveRoom(); setMatchResults(null); window.location.href = "/factions"; }}
            // BOTH, and the second is the fix. The wire's `state` alone was not
            // enough: this panel stays mounted through the rollback into the
            // lobby, and the rollback resets every man to idle — so a corpse the
            // stage had laid down got his flourish row back, three buttons the
            // stage then refused. Two sources of truth for one question, with
            // "vetoed" and "broken" identical to the man pressing them.
            // `canEmote` is the stage's own answer.
            onEmote={canEmote && roomState.players[playerId]?.state !== "dead" ? sendEmote : undefined}
            onFightAgain={() => {
              if (roomState.state === "lobby") {
                if (!roomState.players[playerId]?.ready) sendMsg("ready");
                setMatchResults(null);
                setScreen("lobby");
              } else {
                rematchRef.current = true;
                setRematchWaiting(true);
              }
            }}
            onLeave={() => { leaveRoom(); setMatchResults(null); setScreen("landing"); }}
          />
        )}
        {/* Centred on a desktop; on a phone it moves to the movement thumb's
            corner and mirrors with the rest of the controls. Centred, it
            straddles the line the touch scheme splits the screen on and leaves
            a 108px-wide patch of "a drag here does nothing" in the free-look
            half — see docs/MOBILE-CONTROLS.md. The short label is what lets it
            clear the split outright rather than nearly. */}
        {/* Sound, over the fight: the one place a player wants it off in a
            hurry is the one place he cannot reach a menu.

            It sits on the MOVEMENT side, under the END button, and that is not
            a taste — touchtest measured 80 sampled points on the free-look side
            that this button swallowed. Free look is a drag anywhere on that
            half of the screen, so anything opaque parked there is a patch of
            dead camera. See docs/MOBILE-CONTROLS.md. */}
        <SoundToggle muted={muted} onToggle={toggleMute}
          className={`absolute top-3 ${lefty ? "right-3" : "left-3"} mt-[7rem] z-30`} />
        {roomState?.mode === "solo" && (
          <button
            onClick={() => { leaveRoom(); setScreen("muster"); }}
            data-snd="back"
            className={`absolute top-3 ${lefty ? "right-3" : "left-3"} sm:left-1/2 sm:right-auto sm:-translate-x-1/2 mt-16 z-30 px-3 py-2 sm:px-5 sm:py-2.5 bg-stone-900/90 hover:bg-red-950 border border-stone-600 hover:border-red-700 rounded-lg text-xs sm:text-sm font-bold tracking-wider text-stone-200 transition flex items-center gap-2 backdrop-blur`}
          >
            <DoorOpen size={15} /> <span className="sm:hidden">END</span><span className="hidden sm:inline">END SESSION</span>
          </button>
        )}
      </div>
    );
  }

  // ==================== LOBBY ====================
  if (screen === "lobby" && roomState) {
    const isHost = roomState.hostId === playerId;
    const playersList = Object.values(roomState.players);
    const maxP = roomState.mode === "honour_duel" ? 2 : 8;
    const botCount = playersList.filter((p) => p.id.startsWith("bot_")).length;

    return (
      <MenuShell art="hall" notice={notice} onDismiss={() => setNotice(null)} muted={muted} onMute={toggleMute}>
        <ContentWrap wide>
          {/* header */}
          <div className="flex flex-col items-center gap-2.5 text-center">
            <LinkPill mode={linkMode} />
            <div className="label-overline">
              {roomState.mode === "honour_duel" ? "HONOUR DUEL" : roomState.mode === "blood_moot" ? "BLOOD MOOT" : "WAR BAND"}
            </div>
            <h1 className="font-display text-2xl tracking-wider text-amber-100 sm:text-3xl" style={{ textShadow: "0 0 24px rgba(255,180,60,0.3)" }}>
              {ARENA_NAMES[roomState.arena as keyof typeof ARENA_NAMES] || roomState.arena}
            </h1>
          </div>

          {/* TWO COLUMNS ON A DESKTOP, ONE ON A PHONE. See `.rail-grid`.
              Left is THE MATCH — how men get in, what they are playing, who is
              here — and it is the column allowed to grow, because the roster
              does. Right is YOU: the warrior everyone else will see, and the
              two choices that change him. Reading order is the same in the
              markup as on the screen in both layouts, so a keyboard and a
              screen reader walk it the way the eye does. */}
          <div className="rail-grid">
          <div className="rail-col">

          {/* INVITE — this is the whole reason the lobby exists. A second
              player only ever arrives through this block, so it gets the top
              of the screen, the largest type and the widest target. */}
          <div className="warcode-frame card-noble mx-auto flex w-full max-w-md flex-col gap-4 p-5 sm:p-6 lg:max-w-none">
            <div className="flex flex-col items-center text-center">
              <div className="label-overline">WAR CODE</div>
              <div className="warcode mt-2">{roomCode}</div>
              <div className="knot-band mt-1 w-full max-w-[15rem]" />
              {/* THE GROUND, NAMED BEFORE A BLOW IS STRUCK.
                  Every match is already fought over a real territory — the
                  engine deals one per match and puts it on every snapshot — and
                  nothing has ever shown it, so the war layer began at the
                  results screen and the fight before it was placeless. A man
                  who knows he is about to take Deira off the Norse is fighting
                  for something; the same man told nothing is queueing. */}
              <GroundLine territory={roomState.territory} />
            </div>

            <div className="flex flex-col gap-2.5">
              <button onClick={handleCopyLink} className="btn-primary w-full !min-h-[3.25rem]">
                {copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "LINK COPIED!" : "COPY INVITE LINK"}
              </button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button onClick={handleShare} className="btn-info w-full !min-h-[3.25rem]">
                  <Share2 size={17} /> SHARE INVITE
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-amber-200/10 pt-3.5 text-center">
              {/* This used to read "Paste the link in your group chat". That
                  pitch was scaffolding for the first round of testing among
                  friends and the owner has retired it — the game is going to a
                  storefront, and a storefront does not describe itself by the
                  one channel its first dozen players happened to arrive
                  through. What survives is the fact the sentence was carrying:
                  a link needs no code typed at the other end. */}
              <p className="text-[11px] leading-relaxed text-stone-400">
                Send this link and they join straight into your war band —
                no code to type, nothing to install.
              </p>
              <div className="link-preview">{shareUrl()}</div>
            </div>
          </div>

          {/* THE FORMAT — the host's, and the server's answer is what is drawn:
              the picker reads roomState, never a local copy, so every man in
              the lobby sees the same format at the same moment. */}
          <section className="flex flex-col gap-3">
            <h2 className="section-title"><Flag size={12} className="shrink-0" /> THE FORMAT</h2>
            {isHost ? (
              <div className="card flex flex-col gap-3 p-4">
                <RoundPicker
                  value={(roomState.bestOf as BestOf) || DEFAULT_BEST_OF}
                  onChange={(n) => sendMsg("set_rounds", { bestOf: n })}
                />
                <p className="text-[11px] leading-relaxed text-stone-400">
                  {roundsBlurb(roomState.bestOf || 1, roomState.mode)}
                </p>
              </div>
            ) : (
              <div className="card flex items-center gap-3 px-4 py-3">
                <span className="cabochon" />
                <span className="font-display text-sm tracking-wider text-amber-100">
                  {(roomState.bestOf || 1) > 1 ? `BEST OF ${roomState.bestOf}` : "SINGLE ROUND"}
                </span>
                <span className="text-[11px] text-stone-400">{roundsBlurb(roomState.bestOf || 1, roomState.mode)}</span>
              </div>
            )}
          </section>

          {/* warriors */}
          <section className="flex flex-col gap-3">
            {/* Stacked on a phone: side by side, the title shrinks under the
                controls and its player count disappears behind the select. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4">
              <h2 className="section-title min-w-0 sm:flex-1"><User size={12} className="shrink-0" /> WARRIORS <span className="tracking-normal text-stone-500">{playersList.length}/{maxP}</span></h2>
              {isHost && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={botDifficulty}
                    onChange={(e) => setBotDifficulty(e.target.value as "recruit" | "warrior" | "jarl")}
                    aria-label="AI difficulty"
                    className="select-frame"
                  >
                    <option value="recruit">AI: Recruit</option>
                    <option value="warrior">AI: Warrior</option>
                    <option value="jarl">AI: Jarl</option>
                  </select>
                  <button onClick={() => sendMsg("add_bot", { difficulty: botDifficulty })}
                    className="btn-primary !min-h-[2.75rem] !px-4 !text-xs">
                    <Bot size={14} /> ADD AI
                  </button>
                  {botCount > 0 && (
                    <button onClick={() => sendMsg("remove_bot")}
                      className="btn-ghost !min-h-[2.75rem] !px-4 !text-xs">
                      <Minus size={14} /> REMOVE
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              {playersList.map((p) => {
                const info = WARRIOR_INFO.find((w) => w.id === p.warriorClass);
                const WIcon = info?.Icon ?? Swords;
                const isBot = p.id.startsWith("bot_");
                return (
                  <div key={p.id} className={`card flex items-center gap-3.5 px-3.5 py-3 sm:px-4 ${p.ready ? "!border-emerald-700/50 !bg-emerald-950/25" : ""}`}>
                    <div className={`medallion ${isBot ? "!text-stone-400" : ""}`}>
                      {isBot ? <BotMessageSquare size={16} /> : <WIcon size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold">
                        <span className="truncate">{p.name}</span>
                        {p.id === roomState.hostId && <Crown size={13} className="shrink-0 text-amber-400" />}
                        {p.id === playerId && <span className="badge-sky">YOU</span>}
                        {isBot && <span className="badge-stone">AI</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] capitalize text-stone-400">
                        {p.warriorClass}{(p as GamePlayer & { appearance?: Appearance }).appearance && !isBot ? " · customised" : ""}
                      </div>
                    </div>
                    {roomState.mode === "war_band" && (
                      <div className={`shrink-0 rounded px-2.5 py-1 text-[10px] font-bold tracking-wider ${
                        p.team === "red" ? "bg-red-900/70 text-red-100" : p.team === "blue" ? "bg-sky-900/70 text-sky-100" : "bg-stone-800 text-stone-400"
                      }`}>{p.team === "none" ? "NO TEAM" : p.team.toUpperCase()}</div>
                    )}
                    <div className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${p.ready ? "border-emerald-300 bg-emerald-400" : "border-stone-600 bg-stone-700"}`} />
                  </div>
                );
              })}

              {/* An empty roster is the moment the invite matters most, so the
                  waiting state points back at it rather than showing nothing. */}
              {playersList.length < 2 && (
                <div className="card !border-dashed !border-stone-100/15 !bg-transparent px-4 py-5 text-center">
                  <div className="text-[13px] font-bold text-stone-300">Waiting for a second warrior</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-stone-500">
                    Send the invite link above, or add an AI to fight right now.
                  </div>
                </div>
              )}
            </div>
          </section>

          </div>{/* /rail-col — the match */}

          <div className="rail-col rail-sticky">

          {/* YOUR WARRIOR — live preview. `stack` because in a 23rem rail the
              side-by-side arrangement would give the mannequin a 9rem stage. */}
          <WarriorPanel
            stack
            warriorClass={roomState.players[playerId]?.warriorClass ?? "warden"}
            appearance={profile.appearance}
            name={playerName || "Warrior"}
            note="This is exactly how you appear to everyone in battle — armour, helm, cloak and paint."
            onCustomise={() => openArmoury("lobby")}
          />

          {/* class select */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <h2 className="section-title min-w-0 basis-full sm:flex-1 sm:basis-auto"><Swords size={12} className="shrink-0" /> CHOOSE WARRIOR</h2>
              <button onClick={() => openArmoury("lobby")} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-bold text-amber-400 transition hover:text-amber-300">
                <Shirt size={13} /> EDIT APPEARANCE <ChevronRight size={12} />
              </button>
            </div>
            <ClassGrid
              compact
              selected={roomState.players[playerId]?.warriorClass}
              onSelect={(c) => sendMsg("select_class", { warriorClass: c })}
            />
          </section>

          {/* teams */}
          {roomState.mode === "war_band" && (
            <section className="flex flex-col gap-3">
              <h2 className="section-title"><Users size={12} className="shrink-0" /> CHOOSE TEAM</h2>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setSelectedTeam("red"); sendMsg("select_team", { team: "red" }); }}
                  className={`card card-interactive !min-h-[3.5rem] px-3 font-bold tracking-wider ${selectedTeam === "red" ? "!border-red-500/70 !bg-red-950/40" : ""}`}>
                  RED WAR BAND
                </button>
                <button onClick={() => { setSelectedTeam("blue"); sendMsg("select_team", { team: "blue" }); }}
                  className={`card card-interactive !min-h-[3.5rem] px-3 font-bold tracking-wider ${selectedTeam === "blue" ? "!border-sky-500/70 !bg-sky-950/40" : ""}`}>
                  BLUE WAR BAND
                </button>
              </div>
            </section>
          )}

          </div>{/* /rail-col — you */}
          </div>{/* /rail-grid */}

          {/* actions — pinned bottom on mobile for thumb reach */}
          <div className="action-bar">
            {/* Three targets share one 390px row, so the two word buttons are
                allowed to shrink but never to wrap onto a second line. */}
            <div className="action-bar-row">
              <button data-snd="confirm" onClick={() => sendMsg("ready")}
                className={`min-w-0 flex-1 whitespace-nowrap !min-h-[3.5rem] !px-3 !text-[13px] sm:!text-base ${
                  roomState.players[playerId]?.ready
                    ? "btn-primary !border-emerald-400/60 !bg-emerald-700 !shadow-[0_0_28px_rgba(16,150,90,0.45)]"
                    : "btn-ghost"
                }`}>
                {roomState.players[playerId]?.ready ? "READY — SKAL!" : "READY UP"}
              </button>
              {isHost && (
                <button onClick={() => sendMsg("start")} data-snd="confirm" className="btn-primary min-w-0 flex-1 whitespace-nowrap !min-h-[3.5rem] !px-3 !text-[13px] sm:!text-base">
                  <Swords size={18} className="shrink-0" /> START
                </button>
              )}
              <button onClick={() => { leaveRoom(); setScreen("landing"); }} data-snd="back" aria-label="Leave room" className="btn-danger shrink-0 !px-3">
                <ArrowLeft size={18} />
              </button>
            </div>
            {!isHost && <p className="text-center text-xs text-stone-500">Waiting for host to start the battle...</p>}
          </div>
        </ContentWrap>
      </MenuShell>
    );
  }

  // ==================== THE ARMOURY ====================
  //
  // WHO OWNS THE SCREEN, at 390x844: THE MANNEQUIN DOES, and the cards scroll
  // under him.
  //
  // The choice is forced — a 390-wide phone cannot give a 3D stage and a grid
  // of ten cards both enough room to be any good — and it goes this way
  // because of what the two things are FOR. The cards are a chooser: a player
  // reads one for two seconds and taps it. The mannequin is the product. Every
  // tap on a card is a question about the mannequin ("what does that look like
  // on me"), and a layout that scrolls the answer off the top of the screen
  // makes the player tap, scroll up, look, scroll down, tap — which is the
  // shop the owner screenshotted. So the stage is sticky at the top of the
  // scroll on a phone and pinned beside the list on a desktop, and the cards
  // move under it. The staged bill goes to a fixed bar at the BOTTOM on a
  // phone, because that is where a thumb is and 2400 gold should not be spent
  // by reaching for the top of the screen.
  if (screen === "armoury") {
    const slot = ARMOURY[armouryTab];
    const cost = stagedCost();
    const shown = previewAppearance();
    const lensSlot = slot.slot;
    return (
      <MenuShell notice={notice} onDismiss={() => setNotice(null)} muted={muted} onMute={toggleMute}>
        <ContentWrap wide>
          <ScreenHead
            onBack={() => { clearStaged(); setScreen(prevScreen); }}
            title="THE ARMOURY"
            lede="Try everything on before you buy. Gold is earned in battle — never bought."
            aside={
              // Where the purse is kept, next to the purse. A player who is
              // about to spend 2400 gold is entitled to know whether it
              // survives him clearing his browser.
              <div className="card flex shrink-0 flex-col items-center gap-0.5 !border-yellow-600/50 px-4 py-2">
                <div className="flex items-center gap-2.5">
                  <Coins size={17} className="text-yellow-500" />
                  <span className="text-xl font-bold text-yellow-400">{profile.gold}</span>
                </div>
                <span className="text-[8.5px] font-bold tracking-[0.16em] text-stone-500">
                  {link === "server" ? "ON THE WAR ROLLS" : link === "local" ? "ON THIS DEVICE" : "COUNTING…"}
                </span>
              </div>
            }
          />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            {/* ===== THE STAGE ===== */}
            <div className="lg:w-[40%] lg:shrink-0">
              <div className="sticky top-0 z-20 -mx-4 bg-black/85 px-4 pb-3 pt-2 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:top-4 lg:mx-0 lg:rounded-xl lg:px-0 lg:pb-0 lg:backdrop-blur-none">
                <div className="card card-glow flex flex-col gap-2.5 p-3 sm:p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="section-title !mb-0"><Eye size={12} className="shrink-0" /> {slot.label.toUpperCase()}</div>
                    <span className="shrink-0 text-[9px] font-bold tracking-[0.14em] text-stone-500">
                      {WARRIOR_INFO.find((w) => w.id === previewClass)?.name}
                    </span>
                  </div>
                  {/* The plait. This screen is where a player decides to spend
                      a month's gold, and it should look like the front of the
                      game rather than like a settings panel. */}
                  <div className="knot-band -mt-1 w-full" />
                  <CharacterPreview
                    warriorClass={previewClass}
                    appearance={shown}
                    focusSlot={lensSlot}
                    faceSeed={faceSeed}
                    controls
                    height="clamp(198px, 30vh, 330px)"
                  />
                  {/* class picker for the mannequin */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {WARRIOR_INFO.map((w) => (
                      <button key={w.id} onClick={() => setPreviewClass(w.id)}
                        aria-pressed={previewClass === w.id}
                        className={`card card-interactive flex min-h-[2.75rem] flex-col items-center justify-center gap-0.5 py-1 ${previewClass === w.id ? "card-selected" : ""}`}>
                        <w.Icon size={13} className={previewClass === w.id ? "text-amber-300" : "text-stone-400"} />
                        <span className="text-[7.5px] font-bold leading-none tracking-wide text-stone-300">{w.name}</span>
                      </button>
                    ))}
                  </div>
                  {/* The bill, beside the mannequin on a desktop. On a phone it
                      is a fixed bar at the bottom instead — see below. */}
                  {hasChanges && (
                    <div className="hidden animate-fadeIn flex-col gap-2.5 border-t border-stone-100/10 pt-3 lg:flex">
                      <StagedBill
                        cost={cost} gold={profile.gold} buying={buying}
                        onBuy={() => { void applyStaged(); }} onClear={clearStaged}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ===== THE LADDER ===== */}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="tab-strip">
                {ARMOURY.map((s, i) => (
                  <button key={s.slot} onClick={() => setArmouryTab(i)} className={`tab-item ${armouryTab === i ? "tab-item-active" : ""}`}>
                    {s.label.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {slot.options.map((opt) => (
                  <CosmeticCard
                    key={opt.id}
                    opt={opt}
                    owned={isUnlocked(opt.id)}
                    equipped={equippedValue(opt.slot) === opt.value}
                    staged={staged[opt.slot]?.value === opt.value}
                    slotStaged={!!staged[opt.slot]}
                    affordable={profile.gold >= opt.cost}
                    cls={previewClass}
                    faceSeed={faceSeed}
                    base={shown}
                    onPick={() => stageItem(opt)}
                  />
                ))}
              </div>

              <p className="text-center text-xs leading-relaxed text-stone-500">
                Tapping an item dresses the man above. Nothing is charged until you
                press EQUIP &amp; BUY — and the price is settled on the war rolls, not here.
              </p>
              {/* Room for the fixed bill on a phone, so the last row of cards
                  is not permanently under it. */}
              {hasChanges && <div className="h-28 lg:hidden" />}
            </div>
          </div>
        </ContentWrap>

        {hasChanges && (
          <div className="animate-fadeIn fixed inset-x-0 bottom-0 z-30 border-t border-amber-900/40 bg-black/92 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
            <StagedBill
              cost={cost} gold={profile.gold} buying={buying}
              onBuy={() => { void applyStaged(); }} onClear={clearStaged}
            />
          </div>
        )}
      </MenuShell>
    );
  }

  // ==================== MENUS ====================
  return (
    <MenuShell art={screen === "landing" ? "hero" : "hall"} notice={notice} onDismiss={() => setNotice(null)} muted={muted} onMute={toggleMute}>
      {keysOpen && <KeyBindingsPanel onClose={() => setKeysOpen(false)} />}
      {screen === "landing" && (
        // Centred as a whole rather than as a stack of centred children, so the
        // title and the controls stay one composition from 390px to 1440px.
        <div className="wrap flex min-h-[calc(100dvh-6rem)] max-w-[34rem] flex-col justify-center gap-8 py-6 sm:gap-10">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2.5 text-amber-300/90 sm:gap-3">
              <span className="ornament-line" />
              <Swords size={13} className="shrink-0" />
              <span className="font-display text-[9px] tracking-[0.42em] sm:text-[10px] sm:tracking-[0.5em]">ANGLO-SAXON ARENA</span>
              <Swords size={13} className="shrink-0" />
              <span className="ornament-line" />
            </div>
            <h1 className="title-hero font-display mt-4">BRETWALDA</h1>
            <h2 className="title-sub font-display mt-1 text-[5.6vw] tracking-[0.26em] sm:text-[2rem]">
              BLOOD MOOT
            </h2>
            <div className="knot-band mx-auto mt-3 w-full max-w-[18rem]" />
            <p
              className="mx-auto mt-5 max-w-[26rem] text-[15px] leading-relaxed text-stone-300/90"
              style={{ textShadow: "0 1px 4px black" }}
            >
              Sword fighting in Dark Age Britain. Send a code, choose a warrior, fight — no downloads.
            </p>
          </div>

          {/* The controls sit on a panel. On a black field they read as three
              loose buttons; framed, they read as the front of a game. */}
          <div className="card card-noble card-glow mx-auto flex w-full max-w-[26rem] flex-col gap-3.5 p-5 sm:p-6">
            <label htmlFor="warrior-name-landing" className="label-overline block text-center">YOUR WARRIOR NAME</label>
            <input
              id="warrior-name-landing"
              type="text"
              value={playerName}
              onChange={(e) => { setPlayerName(e.target.value.substring(0, 20)); setNameGloss(null); }}
              placeholder="Enter warrior name..."
              className="input-frame text-center text-lg"
            />
            {/* The forge. Sits under the field rather than inside it so the tap
                target is its own — a 44px control crammed into the input's right
                edge is the classic way to make a phone user miss and start
                editing instead. */}
            <button
              type="button"
              onClick={forgeWarriorName}
              className="btn-ghost w-full !min-h-[var(--tap)] !text-xs"
            >
              <Dices size={16} /> FORGE ME A NAME
            </button>
            {nameGloss && (
              <p className="-mt-1 text-center text-xs text-[rgba(238,226,204,0.6)]">
                {nameGloss}
              </p>
            )}
            <button onClick={() => setScreen("create")} disabled={busy}
              className="btn-primary animate-glow w-full !min-h-[3.75rem] !text-lg">
              <Swords size={20} /> CREATE BATTLE
            </button>
            <button onClick={() => setScreen("join")} disabled={busy}
              className="btn-ghost w-full !min-h-[3.75rem] !text-lg">
              <Users size={20} /> JOIN BATTLE
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {/* THE WAR. A real link and not a `setScreen`, because the map is
                  its own route (`/factions`) — it has to be openable from a
                  message, shareable, and readable by someone who has not
                  fought yet. Losing the socket on the way there costs nothing:
                  from the landing screen there is no room to lose. */}
              <a href="/factions" className="mini-nav">
                <Map size={19} className="text-amber-400" />
                <span>The War</span>
                <span className="text-[9px] font-normal text-amber-400/80">the map</span>
              </a>
              <button onClick={() => setScreen("training")} className="mini-nav">
                <Crosshair size={19} className="text-amber-400" />
                <span>Training</span>
                <span className="text-[9px] font-normal text-emerald-400">vs AI</span>
              </button>
              <button onClick={() => openArmoury("landing")} className="mini-nav">
                <Shirt size={19} className="text-amber-400" />
                <span>Armoury</span>
                <span className="text-[9px] font-normal text-stone-400">customise</span>
              </button>
              <button onClick={() => setScreen("profile")} className="mini-nav">
                <Scroll size={19} className="text-amber-400" />
                <span>Saga</span>
                <span className="text-[9px] font-normal text-stone-400">profile</span>
              </button>
              <button onClick={() => setKeysOpen(true)} className="mini-nav">
                <KeyRound size={19} className="text-amber-400" />
                <span>Keys</span>
                <span className="text-[9px] font-normal text-stone-400">rebind</span>
              </button>
            </div>

            <div className="card grid grid-cols-3 divide-x divide-stone-100/10 !bg-stone-950/70 py-3">
              <LandingStat value={`Lv.${profile.level}`} label={getLevelTitle(profile.level)} />
              <LandingStat value={String(profile.gold)} label="GOLD" cls="text-yellow-400" />
              <LandingStat value={String(profile.wins)} label="VICTORIES" cls="text-emerald-400" />
            </div>

            {/* Shown once, to the player who has been playing all week and has
                just been given a server profile he never asked for. Without it
                the migration is invisible and indistinguishable from a wipe. */}
            {carried && (
              <button onClick={() => setCarried(null)}
                className="card card-glow animate-fadeIn !min-h-0 !border-amber-500/50 px-4 py-3 text-left">
                <div className="flex items-start gap-3">
                  <Scroll size={16} className="mt-0.5 shrink-0 text-amber-400" />
                  <div className="min-w-0">
                    <div className="font-display text-[13px] tracking-wider text-amber-200">YOUR HOARD CAME WITH YOU</div>
                    <div className="mt-1 text-[11px] leading-relaxed text-stone-300/90">
                      {carried.gold} gold{carried.unlocks > 0 ? ` and ${carried.unlocks} pieces of kit` : ""} carried
                      onto the war rolls. It is kept for you now — see the Saga for the four words that bring it back.
                    </div>
                  </div>
                </div>
              </button>
            )}
          </div>

          <p className="text-center text-[11px] leading-relaxed text-stone-300/60" style={{ textShadow: "0 1px 3px black" }}>
            Plays on phones, tablets &amp; desktops.<br />
            {moveKeys} + mouse on desktop · touch controls on mobile.
          </p>
        </div>
      )}

      {screen === "create" && (
        <ContentWrap>
          <ScreenHead
            onBack={() => setScreen("landing")}
            overline="SELECT GAME MODE"
            title="CREATE BATTLE"
            lede="Pick how the fight is fought. You can invite friends once the room is raised."
            center
          />

          <div className="flex flex-col gap-3">
            {([
              { id: "honour_duel" as GameMode, name: "HONOUR DUEL", desc: "1v1 single combat. Prove your worth.", players: "2 players", Icon: Swords, tint: "text-amber-400" },
              { id: "blood_moot" as GameMode, name: "BLOOD MOOT", desc: "Free for all. Last warrior standing.", players: "2-8 players", Icon: Skull, tint: "text-red-400" },
              { id: "war_band" as GameMode, name: "WAR BAND", desc: "Team battles. Shield-friends together.", players: "2v2 · 3v3 · 4v4", Icon: Users, tint: "text-sky-400" },
            ]).map((mode) => (
              <button key={mode.id}
                onClick={() => setSelectedMode(mode.id)}
                className={`card card-interactive w-full p-4 text-left sm:p-5 ${selectedMode === mode.id ? "card-selected" : ""}`}>
                <div className="flex items-center gap-4">
                  <div className={`medallion !h-12 !w-12 ${mode.tint}`}><mode.Icon size={22} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display tracking-wider text-amber-100">{mode.name}</div>
                    <div className="mt-1 text-[13px] leading-snug text-stone-300/90">{mode.desc}</div>
                    <div className="mt-1 text-[11px] tracking-wide text-stone-500">{mode.players}</div>
                  </div>
                  <ChevronRight size={18} className={`shrink-0 ${selectedMode === mode.id ? "text-amber-400" : "text-stone-500"}`} />
                </div>
              </button>
            ))}
          </div>

          {/* One life was the whole match before this control existed. It is
              set here rather than only in the lobby because the host decides
              the shape of the fight at the same moment he decides its mode. */}
          <section className="flex flex-col gap-3">
            <h2 className="section-title"><Flag size={12} className="shrink-0" /> HOW LONG IS THE FIGHT</h2>
            <div className="card flex flex-col gap-3 p-4">
              <RoundPicker value={bestOf} onChange={setBestOf} />
              <p className="text-[11px] leading-relaxed text-stone-400">{roundsBlurb(bestOf, selectedMode)}</p>
            </div>
          </section>

          <button data-snd="confirm" onClick={handleCreate} disabled={busy} className="btn-primary w-full !min-h-[3.75rem] !text-lg">
            {busy ? "SUMMONING..." : "CREATE ROOM"}
          </button>
        </ContentWrap>
      )}

      {screen === "join" && (
        <ContentWrap>
          <ScreenHead
            onBack={() => setScreen("landing")}
            overline="ENTER ROOM CODE"
            title="JOIN BATTLE"
            center
          />

          {/* An invited player arrives here with the code already filled, so
              the screen has to say "you are in the right place" before it asks
              for anything. */}
          {inviteCode && (
            <div className="card card-glow animate-fadeIn !border-amber-500/60 p-5 text-center">
              <div className="font-display mb-2 flex items-center justify-center gap-2 text-sm tracking-widest text-amber-300">
                <Swords size={15} /> YOU ARE SUMMONED <Swords size={15} />
              </div>
              <p className="text-sm leading-relaxed text-stone-300">
                A friend invites you to <span className="font-mono font-bold text-amber-300">{inviteCode}</span>.<br />
                Enter your name, grab your blade, and tap JOIN.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="warrior-name-join" className="label-overline">WARRIOR NAME</label>
              <input
                id="warrior-name-join"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.substring(0, 20))}
                placeholder="Enter warrior name..."
                className="input-frame text-center text-lg"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="war-code" className="label-overline">WAR CODE</label>
              <input
                id="war-code"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().substring(0, 15))}
                onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                placeholder="e.g. WESSEX82"
                className="input-frame font-mono text-center !text-2xl !tracking-[0.25em]"
              />
            </div>
            <button data-snd="confirm" onClick={handleJoin} disabled={busy} className="btn-primary w-full !min-h-[3.75rem] !text-lg">
              {busy ? "ANSWERING..." : "JOIN"}
            </button>
            <p className="text-center text-xs leading-relaxed text-stone-400">
              Sent a link instead? Open it — the code fills itself in.
            </p>
          </div>
        </ContentWrap>
      )}

      {screen === "training" && (
        <ContentWrap wide>
          <ScreenHead
            onBack={() => setScreen("landing")}
            overline="PRACTICE THE BLADE"
            title="TRAINING GROUNDS"
            lede="Fight AI warriors at your own pace, and learn what every button does before it matters."
          />

          {/* ===== TESTGROUNDS: fight AI ===== */}
          <div className="card card-glow-green !border-emerald-700/60 !bg-gradient-to-br !from-emerald-950/50 !to-stone-900 p-5 sm:p-6">
            <div className="flex flex-col gap-5">
              <div>
                <div className="mb-2 flex items-center gap-2.5">
                  <Crosshair size={18} className="shrink-0 text-emerald-400" />
                  <h2 className="font-display tracking-wider text-emerald-200 sm:text-lg">TESTGROUNDS — FIGHT THE AI</h2>
                </div>
                <p className="text-[13px] leading-relaxed text-stone-300/90">
                  Sharpen your skills alone against AI warriors. Enemies respawn — fight until you return stronger.
                </p>
              </div>

              <div>
                <button onClick={() => setScreen("muster")} disabled={busy}
                  className="btn-primary w-full whitespace-nowrap !min-h-[3.5rem] !px-3 !text-[13px] sm:!text-[0.95rem]">
                  <Users size={17} className="shrink-0" /> MUSTER THE TESTGROUNDS
                </button>
                <p className="mt-2.5 text-center text-[11px] leading-relaxed text-stone-400">
                  Choose how many AI you face and how good they are, pick your warrior,
                  dress him in the armoury — then draw steel when you are ready.
                </p>
              </div>

              <div className="rule-label">OR SPAR AT ONCE</div>

              <div className="grid gap-3 sm:grid-cols-3">
                {AI_DIFFICULTIES.map((d) => (
                  <button key={d.id} onClick={() => quickSpar(d)} disabled={busy}
                    className={`card card-interactive flex w-full items-center gap-3 border-l-4 p-4 text-left ${d.tint}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-display tracking-wider text-stone-100">{d.name}</div>
                      <div className="mt-1 text-[11px] leading-snug text-stone-400">{d.bots} AI · {d.desc}</div>
                    </div>
                    <Swords size={16} className="shrink-0 text-stone-400" />
                  </button>
                ))}
              </div>
              {busy && <div className="animate-pulse text-center text-sm text-amber-300">Summoning opponents...</div>}
            </div>
          </div>

          {/* ===== Controls reference =====
              Two columns from the tablet up: on a wide viewport a single
              column of short rows is exactly the empty-right-half problem. */}
          <div className="grid items-start gap-4 md:grid-cols-2">
            {/* Every cap here is read off the binding table, never written out
                — the reference would otherwise lie the first time anyone
                remapped, which is the whole point of docs/KEYBINDS.md. */}
            <Section title="DESKTOP CONTROLS" icon={<Swords size={14} />}>
              <CtrlRow k={moveKeys} d="Move — the direction also aims the cut" />
              <CtrlRow k="Mouse" d="Camera (over-shoulder)" />
              <CtrlRow k={labelForAction("attack", " / ")} d="Attack — direction follows movement keys" />
              <CtrlRow k={labelForAction("heavy", " / ")} d="Heavy attack — breaks blocks" />
              <CtrlRow k={labelForAction("block", " / ")} d="Block (hold); perfect timing = parry" />
              <CtrlRow k={labelForAction("dodge", " / ")} d="Dodge roll — brief invincibility" />
              <CtrlRow k={labelForAction("shove", " / ")} d="Shove — breaks a guard, drives a man back" />
              <CtrlRow k={labelForAction("sprint", " / ")} d="Sprint" />
              <CtrlRow k={labelForAction("crouch", " / ")} d="Crouch under a high blow" />
              <CtrlRow k={labelForAction("ability", " / ")} d="Class ability" />
              <button onClick={() => setKeysOpen(true)} className="btn-ghost mt-3 w-full !min-h-[3rem] !text-[12px]">
                <KeyRound size={14} /> CHANGE KEYS
              </button>
            </Section>

            <Section title="MOBILE CONTROLS" icon={<Target size={14} />}>
              <CtrlRow k="Left stick" d="Move; direction picks attack angle" />
              <CtrlRow k="Swipe upper" d="Camera" />
              <CtrlRow k="SLASH / HEAVY" d="Attack buttons" />
              <CtrlRow k="BLOCK" d="Hold to block; catch the instant to parry" />
              <CtrlRow k="DODGE / RUN" d="Dodge roll / sprint" />
              <CtrlRow k="SHOVE" d="Two hands — breaks a guard; by the fire, a kill" />
              <CtrlRow k="POWER" d="Class ability" />
            </Section>

            <Section title="COMBAT ARTS" icon={<Flame size={14} />}>
              <div className="flex flex-col gap-1.5">
                <Tip text="Parry: begin blocking at the instant the enemy strikes to stagger them — then punish." />
                <Tip text="Combos: chaining hits builds up to 60% bonus damage. Don't leave gaps." />
                <Tip text="Heavy attacks smash guards and stagger — except a Huscarl under SHIELD WALL." />
                <Tip text="Dodge grants i-frames. Roll through the blow, strike the recovery." />
                <Tip text="Stamina regenerates when you stop attacking and sprinting. Exhaustion is death." />
                <Tip text="Flank: attacks only land facing forward. Circle behind for clean kills." />
                <Tip text="Strike magnetism nudges your aim toward foes near your crosshair — trust it." />
              </div>
            </Section>

            <Section title="WARRIORS OF THE REALM" icon={<Shield size={14} />}>
              <div className="flex flex-col">
                {WARRIOR_INFO.map((w) => {
                  const s = WARRIOR_STATS[w.id];
                  return (
                    <div key={w.id} className="border-b border-stone-100/10 py-3 last:border-0 last:pb-0 first:pt-0">
                      <div className="flex items-center gap-2 text-sm font-bold text-amber-200"><w.Icon size={14} className="shrink-0" /> {w.name}</div>
                      <div className="mt-1 text-xs leading-snug text-stone-400">{w.desc}</div>
                      <div className="mt-1.5 text-[10px] font-bold tracking-[0.15em] text-purple-300">ABILITY — {s.ability}</div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
        </ContentWrap>
      )}

      {screen === "muster" && (
        <ContentWrap wide>
          <ScreenHead
            onBack={() => setScreen("training")}
            overline="TESTGROUNDS · THE MUSTER"
            title="BEFORE STEEL IS DRAWN"
            lede="Set the odds, choose your blade, dress for the fight. Nothing begins until you say so."
          />

          {/* YOUR WARRIOR — the same live mannequin the lobby shows */}
          <WarriorPanel
            warriorClass={soloClass}
            appearance={profile.appearance}
            name={playerName.trim() || "Trainee"}
            note="Armour, helm, cloak and paint carry into the testgrounds exactly as you see them here."
            onCustomise={() => openArmoury("muster")}
          />

          <section className="flex flex-col gap-3">
            <h2 className="section-title"><Swords size={12} className="shrink-0" /> CHOOSE WARRIOR</h2>
            <ClassGrid selected={soloClass} onSelect={setSoloClass} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="section-title"><Bot size={12} className="shrink-0" /> THE OPPOSITION</h2>
            <div className="card flex flex-col gap-5 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-[12rem] flex-1">
                  <div className="text-sm font-bold text-stone-100">HOW MANY</div>
                  <div className="mt-1 text-[11px] leading-snug text-stone-400">
                    {soloBots === 0
                      ? "An empty ring — walk, swing and roll with nobody swinging back."
                      : "They respawn where they fell — the trial ends when you leave it."}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button onClick={() => setSoloBots((n) => Math.max(MIN_AI, n - 1))} disabled={soloBots <= MIN_AI}
                    aria-label="Fewer AI warriors" className="btn-step">
                    <Minus size={18} />
                  </button>
                  <div className="font-display w-10 text-center text-3xl text-amber-200">{soloBots}</div>
                  <button onClick={() => setSoloBots((n) => Math.min(MAX_AI, n + 1))} disabled={soloBots >= MAX_AI}
                    aria-label="More AI warriors" className="btn-step">
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <div className="divider" />

              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-sm font-bold text-stone-100">HOW GOOD</div>
                  <div className="mt-1 text-[11px] text-stone-400">Every AI in the ring fights at this skill.</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {AI_DIFFICULTIES.map((d) => (
                    <button key={d.id} onClick={() => setSoloDifficulty(d.id)}
                      className={`card card-interactive border-l-4 p-3.5 text-left ${d.tint} ${soloDifficulty === d.id ? "card-selected" : ""}`}>
                      <div className="font-display text-sm tracking-wider text-stone-100">{d.name}</div>
                      <div className="mt-1 text-[10px] leading-snug text-stone-400">{d.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* the fight is always one press away, pinned for thumbs */}
          <div className="action-bar">
            <div className="action-bar-row">
              <button data-snd="confirm" onClick={() => handleSolo()} disabled={busy}
                className="btn-primary flex-1 !min-h-[3.5rem] !text-base">
                <Swords size={18} /> {busy ? "SUMMONING..." : "DRAW STEEL"}
              </button>
              <button onClick={() => setScreen("training")} aria-label="Back to training" className="btn-ghost !px-4">
                <ArrowLeft size={18} />
              </button>
            </div>
            <p className="text-center text-xs text-stone-400">
              {soloBots} {soloBots === 1 ? "AI warrior" : "AI warriors"} at {soloDifficulty} skill,
              against your <span className="font-bold capitalize text-amber-300">{soloClass}</span>.
            </p>
          </div>
        </ContentWrap>
      )}

      {screen === "profile" && (
        <ContentWrap wide>
          <BackButton onClick={() => setScreen("landing")} />

          {/* THE SAME SPLIT THE LOBBY USES, AND THE SAME SIDE FOR THE SAME THING.
              The rail is always YOU — in the lobby that is the warrior everyone
              will see, here it is the man whose record this is. Keeping the rule
              constant across the journey is the point: a player who has learned
              where to look in one screen has learned it in all of them. Left is
              the record, which is what grows.
              At 34rem this whole screen was a thin ribbon down the middle of a
              1440px window with two thirds of it empty, which is what "the
              screens feel really boring" looks like in a screenshot. */}
          <div className="rail-grid rail-grid-lead">
          <div className="rail-col rail-sticky">
            {/* WHO THE RECORD BELONGS TO. The masthead every other screen has,
                which this one did not: the heading was a bare `text-white`
                instead of the struck-gilt `.screen-head h1`, so the one screen
                named after the player was the one screen not written in the
                game's own hand. */}
            <div className="card card-noble flex flex-col items-center gap-3 p-6 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-[rgba(217,164,65,0.7)] bg-[radial-gradient(circle_at_50%_24%,rgba(96,78,54,0.85),rgba(16,12,9,0.94)_72%)] shadow-[inset_0_1px_2px_rgba(246,221,160,0.22),0_0_45px_rgba(217,164,65,0.18)]">
                <Medal size={40} className="text-[#f6dda0]" />
              </div>
              <div className="screen-head screen-head-center">
                <h1>{playerName || "Unnamed Warrior"}</h1>
              </div>
              <div className="knot-band w-full max-w-[11rem]" />
              <div>
                <div className="label-overline">{getLevelTitle(profile.level)}</div>
                <div className="mt-1.5 text-xs text-stone-500">Level {profile.level}</div>
              </div>

              {/* XP SITS WITH THE LEVEL IT FEEDS. It used to be the first thing
                  in the left column, above the first heading — a bar with two
                  numbers over it and nothing saying what it was, which reads as
                  a stray progress indicator rather than as this man's standing.
                  Sunk track, struck-metal fill: the same read as `.seg`, so a
                  bar that fills and a control that is chosen belong to one
                  object. It was a flat grey line with a Tailwind gradient. */}
              <div className="mt-1 flex w-full flex-col gap-1.5">
                <div className="h-3 w-full overflow-hidden rounded-full border border-[rgba(217,164,65,0.28)] bg-black/55 shadow-[inset_0_2px_5px_rgba(0,0,0,0.6)]">
                  <div className="h-full rounded-full bg-[linear-gradient(180deg,rgba(255,236,190,0.45),rgba(255,236,190,0)_46%),linear-gradient(180deg,#c9761d,#8a4408)] shadow-[inset_0_1px_0_rgba(255,240,200,0.45)] transition-[width]"
                    style={{ width: `${Math.min(100, (profile.xp / xpForLevel(profile.level + 1)) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-stone-500">
                  <span className="tabular-nums">{profile.xp} XP</span>
                  <span className="tabular-nums">{xpForLevel(profile.level + 1)} to rise</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button onClick={() => openArmoury("profile")} className="btn-primary w-full !min-h-[3.5rem]">
                <Shirt size={16} /> OPEN THE ARMOURY
              </button>
              <button onClick={() => setScreen("training")} className="btn-ghost w-full !min-h-[3.5rem]">
                <Crosshair size={15} /> ENTER TESTGROUNDS
              </button>
            </div>
          </div>

          <div className="rail-col">

          <div className="flex flex-col gap-4">
            <h2 className="section-title"><Swords size={12} className="shrink-0" /> THE RECKONING</h2>
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <ProfStat Icon={Coins} val={profile.gold} label="Gold" tone="won" />
              <ProfStat Icon={Sparkles} val={profile.honour} label="Honour" tone="won" />
              <ProfStat Icon={Trophy} val={profile.wins} label="Victories" tone="won" />
              <ProfStat Icon={Swords} val={profile.matches} label="Battles" tone="tally" />
              <ProfStat Icon={Skull} val={profile.kills} label="Kills" tone="blood" />
              <ProfStat Icon={Heart} val={profile.deaths} label="Deaths" tone="blood" />
            </div>
            <div className="text-center text-xs leading-relaxed text-stone-500">
              K/D <span className="tabular-nums">{profile.deaths > 0 ? (profile.kills / profile.deaths).toFixed(2) : profile.kills}</span> · Win rate <span className="tabular-nums">{profile.matches > 0 ? Math.round((profile.wins / profile.matches) * 100) : 0}%</span> · <span className="tabular-nums">{profile.unlocked.length - freeCosmeticIds().length}</span> unlocks earned
            </div>
          </div>

          <TheKeep
            link={link}
            code={profile.recoveryCode ?? ""}
            onRestore={handleRestore}
            onSay={say}
          />

          <Section title="SOUND" icon={<Volume2 size={15} />}>
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs leading-relaxed text-stone-400">
                {muted
                  ? "The hall is silent. Nothing in this game is told by sound alone."
                  : "Struck metal and low wood, synthesised as you play — no download."}
              </div>
              <SoundToggle muted={muted} onToggle={toggleMute} className="shrink-0" />
            </div>
          </Section>

          </div>{/* /rail-col — the record */}

          </div>{/* /rail-grid */}
        </ContentWrap>
      )}
    </MenuShell>
  );
}

// ---------------- components ----------------

// Every screen sits inside this. The gutter, the safe areas and the backdrop
// are decided here once so no screen can invent its own edge spacing.
//
// The banner lives here too, and that is a fix rather than tidiness: it used to
// be rendered inside the menu block alone, so a purchase that failed in the
// armoury — or a lobby that lost the link — said nothing at all. A message a
// player cannot see is the same as no message.
function MenuShell({ children, art = "hall", notice, onDismiss, muted, onMute }: {
  children: React.ReactNode; art?: "hero" | "hall" | "none";
  notice?: Notice | null; onDismiss?: () => void;
  muted?: boolean; onMute?: () => void;
}) {
  return (
    <div className="shell">
      {onMute && <SoundToggle muted={muted === true} onToggle={onMute} className="fixed right-3 top-3 z-40" />}
      {art !== "none" && (
        <div className={`backdrop ${art === "hero" ? "backdrop-hero" : "backdrop-hall"}`}>
          {/* The canvas field replaces `.embers`, which was eight CSS dots on a
              26-second loop — see HeroBackdrop for why that read as a still
              image. Landing only: the other screens want a quiet ground behind
              a lot of reading, and a hall on the horizon behind the armoury
              would be competing with the mannequin. */}
          {art === "hero" && <HeroBackdrop />}
        </div>
      )}
      {notice && (
        <div role="status" className="fixed left-1/2 top-4 z-50 w-[92%] max-w-sm -translate-x-1/2">
          <button onClick={onDismiss} className={`card animate-fadeIn w-full !min-h-0 px-5 py-3 text-center text-sm font-bold shadow-2xl backdrop-blur ${
            notice.tone === "good"
              ? "!border-amber-400/70 !bg-amber-950/85 text-amber-100"
              : "!border-red-600/70 !bg-red-950/85 text-red-200"
          }`}>
            {notice.text}
          </button>
        </div>
      )}
      <div className="shell-inner">{children}</div>
    </div>
  );
}

// The centred column. `wide` is for screens that put two things side by side
// on a large viewport; everything else stays at a reading measure so a 1440px
// desktop does not stretch a list of four items across the whole window.
function ContentWrap({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`wrap ${wide ? "wrap-wide" : ""} screen`}>{children}</div>;
}

// One masthead treatment for every screen, so a heading is never just the next
// element after whatever preceded it.
function ScreenHead({ overline, title, lede, center, onBack, aside }: {
  overline?: string; title: string; lede?: string; center?: boolean;
  onBack?: () => void; aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {onBack && <BackButton onClick={onBack} />}
      <div className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-4 ${center ? "justify-center" : ""}`}>
        {/* The min-width forces an aside onto its own line on a phone rather
            than squeezing the lede into a 3-word column beside it. */}
        <div className={`screen-head min-w-[18rem] flex-1 ${center ? "screen-head-center" : ""}`}>
          {overline && <div className="label-overline">{overline}</div>}
          <h1>{title}</h1>
          {/* Only under a centred masthead: off to one side the plait has no
              axis to sit on and reads as a stray rule. */}
          {center && <div className="knot-band w-full max-w-[16rem]" />}
          {lede && <p>{lede}</p>}
        </div>
        {aside}
      </div>
    </div>
  );
}

// The lobby and the muster show the identical "this is you" block. Shared so
// the two cannot drift apart, since they are the same promise made twice.
function WarriorPanel({ warriorClass, appearance, name, note, onCustomise, stack }: {
  warriorClass: WarriorClass; appearance: Appearance; name: string;
  note: string; onCustomise: () => void;
  /**
   * Keep the mannequin above the words at every width instead of turning to a
   * row at `sm`. For the lobby's 23rem rail, where a 42% stage is about 9rem
   * across and the warrior in it stops being legible as a warrior — the panel
   * exists to show a player what everyone else will see of him, and a figure
   * too small to read defeats the only thing it is for.
   */
  stack?: boolean;
}) {
  const row = stack ? "" : "sm:flex-row sm:gap-6";
  const col = stack ? "" : "sm:items-start sm:text-left";
  return (
    <div className={`card card-noble card-glow flex flex-col items-center gap-4 p-5 sm:p-6 ${row}`}>
      <div className={`w-full ${stack ? "" : "sm:w-[42%] sm:shrink-0"}`}>
        <CharacterPreview warriorClass={warriorClass} appearance={appearance} height={stack ? 260 : 210} />
      </div>
      <div className={`flex min-w-0 flex-1 flex-col items-center gap-2 text-center ${col}`}>
        <div className="label-overline">YOUR WARRIOR</div>
        <div className="font-display truncate text-2xl text-amber-100">{name}</div>
        <div className="text-sm capitalize text-stone-300">{warriorClass}</div>
        <div className="text-[10px] font-bold tracking-[0.15em] text-purple-300">
          ABILITY — {WARRIOR_STATS[warriorClass].ability}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-stone-400">{note}</p>
        <button onClick={onCustomise} className="btn-primary mt-2 !min-h-[2.75rem] !px-5 !text-sm">
          <Shirt size={15} /> CUSTOMISE
        </button>
      </div>
    </div>
  );
}

/**
 * The only visible surface the whole profile feature has.
 *
 * There is no account, no email and no password anywhere in this game, so the
 * four words below are the entire difference between changing your phone and
 * losing everything you earned. They are therefore given the treatment the war
 * code gets — the largest type on the screen, in a gilt setting — rather than
 * being filed under settings, and they are shown as four numbered stones
 * because the realistic recovery is somebody reading them aloud into a group
 * chat, not copying a string.
 *
 * When there is no database the panel says so plainly instead of hiding. A
 * player whose gold is device-local needs to know it *before* he clears his
 * browser, and there is nothing for him to write down.
 */
function TheKeep({ link, code, onRestore, onSay }: {
  link: Link; code: string;
  onRestore: (code: string) => Promise<string | null>;
  onSay: (text: string, tone?: "bad" | "good") => void;
}) {
  const [entering, setEntering] = useState(false);
  const [typed, setTyped] = useState("");
  const [trying, setTrying] = useState(false);
  const [refusal, setRefusal] = useState("");
  const [copied, setCopied] = useState(false);

  const words = code.split(/\s+/).filter(Boolean);

  const copy = () => {
    navigator.clipboard?.writeText(code)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => onSay("This browser would not let us copy — write the words down instead."));
  };

  const submit = async () => {
    if (!typed.trim() || trying) return;
    setTrying(true);
    const failed = await onRestore(typed);
    setTrying(false);
    setRefusal(failed ?? "");
    if (!failed) { setTyped(""); setEntering(false); }
  };

  return (
    <section className="flex flex-col gap-3">
      {/* The heading has to be true in both states: there are no words to
          promise when there is no database keeping them. */}
      <h2 className="section-title">
        <KeyRound size={12} className="shrink-0" />
        {link === "server" ? "THE WORDS THAT BRING YOU BACK" : "WHERE YOUR HOARD IS KEPT"}
      </h2>

      {link === "reaching" && (
        <div className="card animate-pulse px-4 py-5 text-center text-[13px] text-stone-400">
          Reaching the war rolls…
        </div>
      )}

      {link === "local" && (
        <div className="card flex flex-col gap-2.5 p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <CloudOff size={16} className="shrink-0 text-stone-400" />
            <span className="badge-stone">KEPT ON THIS DEVICE</span>
          </div>
          <p className="text-[13px] leading-relaxed text-stone-300/90">
            No war rolls are being kept today. Your gold, your kit and your record live in
            this browser alone — clear it, or change phone, and they are gone. There is
            nothing to write down, and nothing you can do about it from here.
          </p>
        </div>
      )}

      {link === "server" && words.length > 0 && (
        <div className="warcode-frame card-noble flex flex-col gap-4 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-2.5">
            {words.map((w, i) => (
              <div key={`${w}-${i}`} className="relative flex min-h-[3.25rem] items-center justify-center rounded-lg border border-amber-300/30 bg-black/45 px-2 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]">
                <span className="absolute left-2 top-1 text-[9px] font-bold text-amber-200/35">{i + 1}</span>
                {/* Cinzel is a capitals face, so the words are set as capitals
                    rather than being shown lowercase in a font that has no
                    lowercase to show. */}
                <span className="font-display text-center text-[clamp(0.95rem,4.4vw,1.35rem)] uppercase leading-none tracking-[0.08em] text-amber-100">{w}</span>
              </div>
            ))}
          </div>
          <div className="knot-band mx-auto w-full max-w-[15rem]" />
          <button onClick={copy} className="btn-primary w-full !min-h-[3.25rem]">
            {copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "WORDS COPIED!" : "COPY THE WORDS"}
          </button>
          <p className="text-[11px] leading-relaxed text-stone-400">
            Say them, screenshot them, or send them to yourself. Anyone who types these four
            words becomes you — gold, kit and all — so keep them the way you would keep a key.
          </p>
        </div>
      )}

      {link === "server" && (
        entering ? (
          <div className="card animate-fadeIn flex flex-col gap-3 p-4 sm:p-5">
            <label htmlFor="recovery-words" className="label-overline">THE FOUR WORDS</label>
            <input
              id="recovery-words"
              type="text"
              value={typed}
              onChange={(e) => { setTyped(e.target.value.substring(0, 80)); setRefusal(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              placeholder="leaf sapling wolf glass"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="input-frame text-center"
            />
            {refusal && <p className="text-center text-[12px] font-bold text-red-300">{refusal}</p>}
            <p className="text-[11px] leading-relaxed text-stone-400">
              Capitals, hyphens and typos are forgiven. This device becomes that warrior, and
              the one you left behind is signed out.
            </p>
            <div className="flex gap-2.5">
              <button onClick={() => { void submit(); }} disabled={trying} className="btn-primary flex-1 !min-h-[3.25rem] !text-sm">
                {trying ? "SEARCHING…" : "BRING IT BACK"}
              </button>
              <button onClick={() => { setEntering(false); setRefusal(""); }} aria-label="Cancel recovery" className="btn-ghost !px-4">
                <ArrowLeft size={15} />
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEntering(true)} className="btn-ghost w-full !min-h-[3.25rem] !text-sm">
            <KeyRound size={15} /> I HAVE FOUR WORDS
          </button>
        )
      )}
    </section>
  );
}

/**
 * Colour per axis. This is the only thing about a stat bar that is a decision
 * rather than a measurement, so it is the only thing left in this file.
 */
const BAR_COLOUR: Record<StatAxis, string> = {
  HEALTH: "bg-emerald-500",
  SPEED: "bg-sky-400",
  DAMAGE: "bg-red-500",
  DEFENCE: "bg-amber-400",
};

function ClassGrid({ selected, onSelect, compact }: {
  selected: WarriorClass | undefined; onSelect: (c: WarriorClass) => void;
  /**
   * Stay two-up at every width. The four-across row is right when this grid
   * owns the page; inside the lobby's 23rem rail it would give each warrior
   * about 5rem, which is narrower than the longest name on the roster and would
   * set every stat bar to a stub. A card that cannot be read is not a chooser.
   * (That name was "RUNEKEEPER" when this was written and is "BERSERKER" now —
   * the measurement is the LONGEST label, not any one word, so it is written
   * that way rather than left naming a string that has since changed.)
   */
  compact?: boolean;
}) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${compact ? "" : "lg:grid-cols-4"}`}>
      {WARRIOR_INFO.map((w) => {
        const stats = WARRIOR_STATS[w.id];
        const isSel = selected === w.id;
        const WIcon = w.Icon;
        return (
          <button key={w.id} onClick={() => onSelect(w.id)}
            className={`card card-interactive flex flex-col p-3.5 text-left sm:p-4 ${isSel ? "card-selected" : ""}`}>
            <div className={`medallion mb-3 ${isSel ? "!border-amber-500 !text-amber-300" : ""}`}><WIcon size={17} /></div>
            <div className="font-display text-sm tracking-wider text-amber-100">{w.name}</div>
            <div className="mt-1 text-[10px] leading-snug text-stone-400">{w.desc}</div>
            {/*
              FOUR BARS, NO CEILINGS TYPED IN. Every maximum is `Math.max` over
              the roster being drawn (`cardBars`), so the leader on each axis
              fills his bar exactly and nobody overflows. The four numbers that
              used to sit here — 150, 100, 84, 80 — were the roster's maxima on
              the day they were written and two of them were stale after the
              class rework: 158 health clamped at 150, and a 5.6 stride and a
              5.0 stride BOTH clamped at 100, so the runekeeper and the warden
              drew the same full speed bar while SPEED is what the runekeeper is
              for. Colour is the only thing this file still decides.
            */}
            <div className="mt-3 flex flex-col gap-1.5">
              {cardBars(WARRIOR_STATS, w.id).map((b) => (
                <StatBar key={b.axis} label={b.label} frac={b.frac} text={b.text} cls={BAR_COLOUR[b.axis]} />
              ))}
            </div>
            <div className="mt-3 text-[9px] font-bold tracking-[0.15em] text-purple-300">{stats.ability}</div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------- rounds ----------------

// What a format means, in the words a player would use. The mode matters
// because a war band scores by side and a duel does not.
function roundsBlurb(bestOf: number, mode: string): string {
  const team = mode === "war_band";
  if (bestOf <= 1) return "One round decides everything. Fall once and the match is over.";
  const need = Math.ceil(bestOf / 2);
  // The tiebreak is stated here because the lobby is the only place a player
  // reads the rules before they cost him anything. Two men level on rounds is
  // the ordinary result of a free-for-all, not an edge case.
  return `First ${team ? "war band" : "warrior"} to ${need} round${need === 1 ? "" : "s"} takes the match — so it can end ${need}\u20130. `
    + `Level on rounds, the most kills wins; level on both and it is a draw. Gold and glory are paid at the end.`;
}

function RoundPicker({ value, onChange }: { value: BestOf; onChange: (n: BestOf) => void }) {
  return (
    <div className="seg" role="group" aria-label="Rounds in the match">
      {ROUND_OPTIONS.map((n) => (
        <button key={n} onClick={() => onChange(n)} aria-pressed={value === n}
          className={`seg-item flex-col gap-0.5 ${value === n ? "seg-item-active" : ""}`}>
          <span className="text-lg leading-none">{n}</span>
          <span className="text-[8.5px] font-bold leading-none tracking-[0.18em] opacity-80">
            {n === 1 ? "ROUND" : "ROUNDS"}
          </span>
        </button>
      ))}
    </div>
  );
}

// One round: an empty gilt setting, or the stone sitting in it.
function Pips({ won, of, blue }: { won: number; of: number; blue?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: Math.max(1, of) }, (_, i) => (
        <span key={i} className={`pip ${i < won ? (blue ? "pip-won pip-won-blue" : "pip-won") : ""}`} />
      ))}
    </span>
  );
}

// The match score, read straight off the server's snapshot. `roundScoreBy`
// says whether the keys of roundWins are men or sides, so this never has to
// infer the shape of the match from its mode.
function RoundTally({ roomState, playerId, noRound }: { roomState: RoomState; playerId: string; noRound?: boolean }) {
  const of = roomState.roundTarget || 1;
  const wins = roomState.roundWins || {};
  const round = roomState.roundIndex || 1;
  // The break card is already headed with the round; repeating it inside the
  // tally reads as two different numbers rather than one.
  const counter = noRound ? null : <span className="text-stone-500">ROUND {round}/{roomState.bestOf}</span>;

  if (roomState.roundScoreBy === "team") {
    const mine = roomState.players[playerId]?.team;
    return (
      <div className="round-hud">
        <span className={mine === "red" ? "text-amber-200" : "text-stone-400"}>RED</span>
        <Pips won={wins.red || 0} of={of} />
        {counter ?? <span className="text-stone-600">·</span>}
        <Pips won={wins.blue || 0} of={of} blue />
        <span className={mine === "blue" ? "text-amber-200" : "text-stone-400"}>BLUE</span>
      </div>
    );
  }

  // Free-for-all: your own tally, and the man to beat if it is not you.
  const lead = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
  const leadName = lead && lead[1] > 0 && lead[0] !== playerId ? roomState.players[lead[0]]?.name : null;
  return (
    <div className="round-hud">
      {counter}
      <span className="text-amber-200">YOU</span>
      <Pips won={wins[playerId] || 0} of={of} />
      {leadName && (
        <>
          <span className="text-stone-600">·</span>
          <span className="max-w-[6rem] truncate text-stone-400">{leadName}</span>
          <Pips won={lead[1]} of={of} />
        </>
      )}
    </div>
  );
}

/**
 * The three victory emotes, as a row of buttons. This is the touch path — the
 * bound keys are the desktop's — and it lives on the two surfaces where a man
 * can be SEEN performing it: the round-end beat with the arena still up, and
 * the summary tableau. Never the combat HUD (mid-fight both thumbs are spoken
 * for, and a flourish is something you do over a man rather than instead of
 * blocking one) and never over the break card's scrim, which is where it used
 * to be and where nobody could see a thing.
 * The server validates and throttles every press, so these can be plain.
 */
/**
 * Three flourishes, and the list never changes — so it is built ONCE at module
 * scope rather than rebuilt on every render of a row that sits on the
 * round-break card and the summary. Three objects is not a cost worth a note on
 * its own; what it is worth is not handing a new array identity to a `map` on a
 * component that re-renders behind a live fight.
 */
const EMOTE_ITEMS: Array<{ id: EmoteId; label: string; Icon: typeof Swords }> = [
  { id: "raise", label: "RAISE", Icon: Swords },
  { id: "boss", label: "BOSS", Icon: Shield },
  { id: "taunt", label: "TAUNT", Icon: Flag },
];

function EmoteRow({ onEmote }: { onEmote: (emote: EmoteId) => void }) {
  const items = EMOTE_ITEMS;
  return (
    <div className="pointer-events-auto flex items-center justify-center gap-2">
      {items.map(({ id, label, Icon }) => (
        <button key={id} onClick={() => onEmote(id)} data-snd="tap"
          aria-label={`Emote: ${label.toLowerCase()}`}
          className="flex min-h-[2.75rem] items-center gap-1.5 rounded-lg border border-amber-800/60 bg-stone-900/85 px-3 py-1.5 text-[10px] font-bold tracking-[0.18em] text-amber-200/90 backdrop-blur transition hover:border-amber-500 hover:text-amber-100 active:scale-95">
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );
}

/**
 * HOW LONG THE ARENA IS LEFT ALONE after a round before the break card covers
 * it. `ROUND_BREAK` in engine.mjs is five seconds, so this spends the first two
 * of them on the fight that just finished and leaves the card its countdown.
 *
 * Not read from the wire and deliberately not mirrored from the server's five:
 * this is a beat in the client's presentation, and the only thing it must not do
 * is outlive the break. The `left > 2` guard below is what enforces that, so a
 * late joiner or a slow socket gets the card immediately rather than a hold that
 * runs past the bell.
 *
 * 2950 -> 4000, AND IT IS NO LONGER A NUMBER TYPED HERE. The round break now
 * carries the slow-motion replay of the kill that ended the round
 * (`src/game/replay.mjs`, wired in `GameCanvas`), and the arena has to be left
 * alone for the whole of it or the break card comes down over the replay. So
 * this is `REPLAY.wall * 1000` — 4000 ms — and `REPLAY.wall` is itself derived
 * from the server's `ROUND_BREAK` of 5 s with one second held back so the
 * countdown is still dealt on time.
 *
 * WHAT THE BREAK NOW COSTS, spelled out because the honest version of this is a
 * budget and not a reassurance. The break is the same 5 s it always was; what
 * changed is what is inside it:
 *
 *   before   2.95 s  round-beat camera over the corpse, at life speed
 *            2.05 s  break card and countdown
 *   after    4.00 s  the replay: 0.92 s of run-up + 1.08 s of collapse,
 *                    2.00 s of fight shown over 4.00 s of wall clock
 *            1.00 s  break card and countdown
 *
 * The card loses 1.05 s and never less than its countdown — see the `left > 1`
 * guard below, which was `left > 2` and had to move with this or it would have
 * capped the hold at 3.0 s and cut the replay off a second early. Nothing on
 * the server waits on any of it.
 *
 * 2200 -> 2950 WITH `ROUND_HOLD.total` IN src/game/deathcam.mjs, which is the
 * round camera's clock and plays inside exactly this window. The camera's beat
 * opens with a still frame while the dying man falls, and the collapse got
 * longer when it got its weight — over the seven kinds of death
 * `node tools/freezetest.mjs --phases=collapse` drives, the worst of them
 * outlasts the 0.45 s the still beat used to be by most of a second. THE
 * FIGURE IS NOT WRITTEN DOWN HERE: that harness prints its own range and this
 * file measures none of it. (This sentence carried "1.25 s" for a round, which
 * is a number the named harness does not print.) The two numbers
 * are not wired together — deathcam.mjs belongs to another unit — and
 * tools/deathcamtest.mjs fails if they stop agreeing, so change one and the
 * harness will tell you about the other.
 */
const ROUND_HOLD_MS = REPLAY.wall * 1000;

/**
 * The end of a round, in two beats.
 *
 * IT WAS ONE, AND THE FLOURISH WAS IN THE WRONG ONE. The owner: *"Emote option
 * is in next round coming screen where you can't actually really see any players
 * or even emote & even if you don't win the round you see it"*. Every word of
 * that was literally true. The row was inside the break card below, which is
 * drawn over a full-viewport `bg-black/55` scrim, at the moment `GameCanvas` has
 * already put the camera on the wide lobby establishing orbit. The press DID
 * reach the rig and the man DID perform it — `GameCanvas` drains emotes through
 * the whole intermission and poses the bodies for exactly this reason — and
 * there was no one able to see any of it, including the man pressing. And it was
 * offered to the men who had just lost the round as readily as the one who won.
 *
 * `docs/WHAT-THIS-GAME-IS.md` §5.4 names what it was supposed to be: *"the
 * round-end beat where the victor emotes and everyone watches"* — one of three
 * things it files under **being seen**. So the fix is not to delete the row:
 *
 *   BEAT ONE — the arena, unscrimmed. The dead are lying where they fell, the
 *     standing are breathing, the verdict is one line across the top and nothing
 *     else is drawn. ONLY the man (or the band) who took the round is offered
 *     the flourish, and only while he is on his feet.
 *   BEAT TWO — the break card, as it always was, with the countdown. No emote
 *     row: by then the scrim is down and there is nothing to see.
 *
 * WHAT THIS DOES NOT DO, and it is HALF THE ASK, so it is written down rather
 * than left to be discovered. `tools/roundbeat.mjs` was written to photograph
 * this screen — nothing in the repo could, because `raiseMoot` pins every
 * harness match to a single round and a single round has no intermission — and
 * the pictures say the camera is still wrong. Through beat one the rig is
 * easing out of the fight's follow-cam toward the lobby orbit, which is aimed at
 * the WORLD ORIGIN, and the world origin is where the bonfire is. Two of three
 * captures came back as a screenful of flame with one corpse's arm in it; the
 * third happened to catch a body. Nothing is aimed at the victor, and "the men
 * are in frame" would have been a comfortable thing to write and untrue.
 *
 * So: this beat fixes WHO is offered the flourish and WHETHER anything covers
 * the arena while it plays. It does NOT fix what the lens is pointed at, and
 * until it does, "everyone watches" is not delivered. That needs a rig mode
 * that holds on the round's victor, which lives in `GameCanvas`/`render` —
 * another unit's files this pass — so it is NOT BUILT and is the next step.
 */
function RoundBreak({ roomState, playerId, onEmote }: { roomState: RoomState; playerId: string; onEmote: (emote: EmoteId) => void }) {
  const [now, setNow] = useState(() => Date.now());
  // When THIS round ended, by the client's own clock. The component is mounted
  // by the flip into "intermission" and unmounted by the countdown that follows,
  // so it is a fresh mount every round and this needs no reset.
  const [endedAt] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const r = roomState.lastRound;
  const left = Math.max(0, Math.ceil(((roomState.nextRoundAt || 0) - now) / 1000));
  const won = r && !r.draw && (r.winnerId === playerId || (r.winnerTeam && roomState.players[playerId]?.team === r.winnerTeam));
  const standing = roomState.players[playerId]?.state !== "dead";
  const verdict = !r || r.draw ? "NO MAN LEFT STANDING" : won ? "THE ROUND IS YOURS" : `${r.winnerName} TAKES IT`;

  // The card never gets less than its countdown: if the break is already nearly
  // spent when this mounts, there is no beat to hold and we go straight to it.
  // `left > 1` and not `> 2`: the hold is now the replay's 4.0 s and the guard
  // is what stops it outliving the break, so it has to leave the card the one
  // second `REPLAY.wall` held back rather than the two the old 2.95 s beat did.
  // A late joiner or a slow socket still gets the card immediately.
  if (now - endedAt < ROUND_HOLD_MS && left > 1) {
    return (
      /* `pt-[6.6rem]` clears the round tally the game screen keeps pinned at
         top-[4.6rem] — a `.round-hud` pill is about 1.4rem tall, so the verdict
         starts just under it and the two read as one column: the score, then
         what just happened. The bottom is free by construction: `GameHud` only
         raises the touch cluster while `isFighting`, and this is an
         intermission, so the flourish row has the thumb to itself. */
      <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between p-4 pt-[6.6rem]">
        <div className="animate-fadeIn flex flex-col items-center gap-1 text-center">
          <div className="label-overline">ROUND {r?.index ?? roomState.roundIndex} OF {roomState.bestOf}</div>
          <div className="font-display text-xl leading-tight text-amber-100 sm:text-2xl"
            style={{ textShadow: "0 2px 24px rgba(0,0,0,0.9), 0 0 26px rgba(217,164,65,0.35)" }}>
            {verdict}
          </div>
        </div>
        {/* THE VICTOR ONLY, AND ONLY ON HIS FEET. A war band's round is won by a
            side, so `won` is true for every man on it — the band celebrates
            together, which is what the wall in the summary tableau is also for.
            A corpse is refused by the server anyway (`handleEmote`), so offering
            him a button would be offering him a dead one. */}
        {won && standing && (
          <div className="animate-fadeIn mx-auto w-full max-w-md">
            <EmoteRow onEmote={onEmote} />
          </div>
        )}
      </div>
    );
  }

  return (
    /* `data-break-card` is a NAMED HOOK, and it is here because a harness had
       been finding this card by its scrim colour — `.bg-black/55` — under a
       comment claiming that class was "the ONLY thing that draws it". It is
       also on every kill-feed row (GameHud.tsx:596), the ability-cooldown pill
       (GameHud.tsx:623) and the XP track above (page.tsx:1931), so the query
       matched mid-fight and `roundbeat` photographed a fight and called it a
       break card. A harness that finds a component by a utility class is
       coupled to the palette; this attribute is what it is allowed to look
       for. Same arrangement as `data-ledger` on the summary rows. */
    <div data-break-card
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-6">
      <div className="card card-noble card-glow animate-fadeIn flex w-full max-w-sm flex-col items-center gap-3 p-6 text-center">
        <div className="label-overline">ROUND {r?.index ?? roomState.roundIndex} OF {roomState.bestOf}</div>
        <div className="font-display text-2xl leading-tight text-amber-100" style={{ textShadow: "0 0 26px rgba(217,164,65,0.35)" }}>
          {verdict}
        </div>
        <div className="knot-band w-full max-w-[13rem]" />
        <RoundTally roomState={roomState} playerId={playerId} noRound />
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-stone-400">
          <Hourglass size={12} className="text-amber-400" />
          NEXT ROUND IN {left}
        </div>
      </div>
    </div>
  );
}

/**
 * A ledger row as the server now sends it.
 *
 * `place` and `roundsWon` are put on every row by `buildLedger` in engine.mjs,
 * which is also what puts `results` in placement order before it leaves. They
 * are widened in here rather than added to `MatchResult` in `game/types.ts`
 * because that file belongs to another unit this pass; folding these two fields
 * into the shared interface is the tidy-up this leaves behind.
 */
type LedgerRow = MatchEndData["results"][number] & { place: number; roundsWon: number };

/**
 * The end-of-match summary, over the staged tableau. Rocket League's trick,
 * kept whole: the picture behind this is the GAME — the victor and the wall,
 * or the duel's corpse — so this overlay owns only the top and bottom bands of
 * the screen and leaves the middle to the stage. Designed at 390x844 first:
 * the verdict up top, a compact ledger and the two ways out under the thumb.
 *
 * THE ROWS ARE NOT SORTED HERE ANY MORE. They used to be — `sort((a, b) =>
 * b.score - a.score)`, with score exactly kills x 100 — and that single line is
 * what the owner photographed: two men level on kills tied exactly, the sort was
 * stable, and the man who had won the extra round was printed second under a man
 * he had beaten and beside a smaller pile of coins. The order is the server's
 * answer now (engine.mjs `buildLedger`), arrived at by the same rule that names
 * the match winner, and `place` rides on the row so a genuine tie can print two
 * #1s instead of inventing a loser.
 */
/**
 * WHERE THIS FIGHT IS. One line, and it is the front half of the loop the
 * `WarLine` below closes: named ground before the blow, banked points after it.
 *
 * `holder` is who holds it as the war front last said — so the line reads as a
 * claim on somebody rather than as a place name, which is the whole difference
 * between a map and a backdrop.
 */
function GroundLine({ territory }: { territory?: { name: string; native: string; holder: string } | null }) {
  if (!territory) return null;
  const PEOPLE: Record<string, string> = {
    saxon: "the Anglo-Saxons", norse: "the Norse",
    briton: "the Britons", pict: "the Picts",
  };
  const held = PEOPLE[territory.holder];
  return (
    <div className="mt-2 flex flex-col items-center gap-0.5" data-ground={territory.name}>
      <div className="label-overline !text-[9px] text-amber-400/70">FOUGHT OVER</div>
      <div className="font-display text-sm tracking-[0.18em] text-amber-200">{territory.name.toUpperCase()}</div>
      {held && <div className="text-[10px] text-stone-400">{held} hold it</div>}
    </div>
  );
}

/**
 * One line under the verdict, and it is the only place the war layer touches a
 * player who is not looking at the map.
 *
 * It renders NOTHING until the server has spoken, because the banking is a
 * database round trip the match does not wait for — a placeholder would flash
 * and be replaced, and a war line that flickers is worse than one that arrives.
 */
function WarLine({ war, onSwear }: { war: WarOutcomeMsg | null; onSwear?: () => void }) {
  if (!war) return null;
  const PEOPLE: Record<string, string> = {
    saxon: "THE WEST SAXONS", norse: "THE DANELAW",
    briton: "THE BRITONS", pict: "THE PICTS",
  };
  // The territory's real name, read out of `war.mjs` rather than kept as a
  // second table here: sixteen names in two places is fifteen chances to drift.
  const ground = war.territoryId ? (territory(war.territoryId)?.name ?? war.territoryId) : null;
  if (war.kind === "banked" && war.people) {
    // THE GROUND CHANGED HANDS ON HIS POINTS. A territory flips on somebody's
    // last point and until now that man heard nothing — `war_flips` was
    // written, the map's dispatch list read it days later, and the moment
    // itself belonged to no one. This is the loudest thing this screen says,
    // and it should be: it is the whole promise of the map, arriving.
    if (war.flip) {
      const took = PEOPLE[war.flip.to] ?? war.flip.to.toUpperCase();
      const lost = PEOPLE[war.flip.from] ?? war.flip.from.toUpperCase();
      return (
        <div className="flex flex-col items-center gap-1" data-war="flip">
          <div className="font-display animate-pulse text-[13px] tracking-[0.3em] text-amber-300"
            style={{ textShadow: "0 2px 14px rgba(0,0,0,0.9)" }}>
            {`${(ground ?? "THE GROUND").toUpperCase()} HAS FALLEN`}
          </div>
          <div className="badge-garnet !text-[10px]">{`${took} TAKE IT FROM ${lost} — YOUR +${war.points} CARRIED IT`}</div>
        </div>
      );
    }
    return (
      <div className="badge-garnet !text-[10px]" data-war="banked">
        {`+${war.points} TO ${PEOPLE[war.people] ?? war.people.toUpperCase()}`}
        {ground ? ` · ${ground.toUpperCase()}` : ""}
      </div>
    );
  }
  // THE ONE REFUSAL WITH A WAY OUT gets a button; the rest get a sentence.
  // Swearing is a choice the player can make from here, and making him go and
  // find the map to discover that is how a war layer stays unplayed.
  if (war.kind === "unsworn") {
    return (
      <button onClick={onSwear} data-war="unsworn"
        className="badge-stone pointer-events-auto !text-[10px] transition hover:!text-amber-200">
        THIS COUNTED FOR NOBODY — SWEAR TO A PEOPLE
      </button>
    );
  }
  if (war.kind === "guest") {
    return <div className="badge-stone !text-[10px]" data-war="guest">FOUGHT AS A STRANGER — NO NAME IN THE LEDGER</div>;
  }
  // `no_points`, `already` and `unavailable` are not the player's doing and
  // there is nothing for him to press, so they say the true thing quietly.
  if (war.kind === "no_points") {
    return <div className="badge-stone !text-[10px]" data-war="no_points">NO DEEDS TO CARRY TO THE WAR</div>;
  }
  return <div className="badge-stone !text-[10px]" data-war={war.kind}>THE LEDGER IS SHUT — THIS FIGHT WILL NOT COUNT</div>;
}

function MatchSummary({ data, playerId, payState, waiting, war, onEmote, onFightAgain, onLeave, onSwear }: {
  data: MatchEndData;
  playerId: string;
  payState: "none" | "asking" | "paid" | "unpaid";
  waiting: boolean;
  /** What the fight did to the war, for this man. `null` until the server says. */
  war: WarOutcomeMsg | null;
  /** Offered only when the reason he counted for nobody is that he never swore. */
  onSwear?: () => void;
  /** Absent when this player is a corpse on the stage — the dead don't jeer. */
  onEmote?: (emote: EmoteId) => void;
  onFightAgain: () => void;
  onLeave: () => void;
}) {
  const rows = data.results as LedgerRow[];
  const mine = rows.find((r) => r.id === playerId);
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between p-4 pt-7 sm:p-6">
      {/* A SCRIM, BECAUSE A TEXT SHADOW IS NOT CONTRAST.
          The owner: "the text on end screen the yellow is sometimes hard to
          read & blended into the background of the arena". It is amber type on
          an arena lit by a low sun — the two are the same hue, and a shadow
          only darkens the pixels immediately under a glyph, which does nothing
          when the glyph and the ground behind it are both bright.
          What fixes text over ARBITRARY imagery is a ground of its own. This is
          a gradient rather than a panel so it has no edge to notice, it is
          behind the words and in front of the fight, and it is tall enough to
          cover the whole top cluster including the war line. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-black/75 via-black/45 to-transparent sm:h-60" />
      <div className="animate-fadeIn relative flex flex-col items-center gap-1.5 text-center">
        <div className="label-overline">BATTLE COMPLETE</div>
        {/* Near-white rather than amber-100. Over a warm arena an amber
            headline is the same hue as its background; the glow stays because
            it is what makes it feel lit, but the type itself has to be the one
            thing in the frame that is NOT the fire's colour. */}
        <h1 className="font-display text-2xl leading-tight text-[#f6f1e6] sm:text-4xl"
          style={{ textShadow: "0 2px 24px rgba(0,0,0,0.95), 0 0 30px rgba(255,180,60,0.35)" }}>
          {data.winnerKind === "none" || data.winnerName === "Draw"
            ? "BLOOD SPILT — A DRAW"
            : `${data.winnerName.toUpperCase()} PREVAILS`}
        </h1>
        {/* WHAT THIS FIGHT DID TO THE WAR.
            The loop has always worked — `tools/warflow.mjs` proves it 28/28
            against a real database — and the game never said so, which is
            indistinguishable from it being broken. This is the line that was
            missing, and it is shown for the REFUSALS as loudly as for the win:
            the whole point is that a man who counted for nobody finds out. */}
        <WarLine war={war} onSwear={onSwear} />
        {/* WON ON KILLS, SAID OUT LOUD. Two men level on rounds is the common
            shape of an eight-man free-for-all, and the man who lost it that way
            is owed the reason — otherwise the summary reads as arbitrary. Only
            shown when it actually decided the match; on a rounds win it would
            be noise. */}
        {data.winnerBy === "kills" && data.winnerKind !== "none" && (
          <div className="badge-garnet !text-[10px]">LEVEL ON ROUNDS — TAKEN ON KILLS</div>
        )}
        {data.winnerBy === "draw" && data.winnerKind === "none" && (
          <div className="badge-stone !text-[10px]">LEVEL ON ROUNDS AND ON KILLS</div>
        )}
        {/* `isWinner` and not an id match: a war band is won by a side, and
            every man on it won it. */}
        {mine?.isWinner && (
          <div className="font-display animate-pulse text-sm tracking-[0.35em] text-[#ffd45e]"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.95), 0 2px 14px rgba(0,0,0,0.9)" }}>VICTORY IS YOURS</div>
        )}
        <MatchTally data={data} playerId={playerId} />
      </div>

      <div className="pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-2">
        {/* The flourish, performed live on the tableau behind these numbers.
            The stage shares the fight's rigs, so the press plays mid-portrait. */}
        {onEmote && <EmoteRow onEmote={onEmote} />}
        <div className="card !bg-stone-950/85 flex max-h-[34vh] flex-col p-2 backdrop-blur">
          {/* THE COLUMN HEADS, AND THEY ARE HERE FOR THE MIDDLE ONE. The owner:
              "rounds won should be recorded somehow for all to see in the
              table". A bare number in a column nobody has named is not
              recorded, it is decoration — and this one decides the placement
              and the purse to its right, so it is the column that most needs
              saying out loud. Outside the scroller so it does not slide away
              under an eight-man moot. */}
          <div className="flex items-center gap-2.5 border-b border-amber-900/40 px-2.5 pb-1 text-[8px] font-bold uppercase leading-none tracking-[0.16em] text-stone-500">
            <div className="w-6 shrink-0">#</div>
            <div className="min-w-0 flex-1">WARRIOR</div>
            <div className="w-7 shrink-0 text-center">RNDS</div>
            <div className="w-16 shrink-0 text-right">PAY</div>
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto pt-1">
            {rows.map((r) => (
              /* The three data hooks are for `summaryflow`, and they exist
                 because the engine-side gate (`tools/tiebreak.mjs`) cannot see
                 this file at all: it proves the SERVER ranks correctly, and a
                 client that quietly re-sorted its own copy — which is exactly
                 what this component did until today — would sail straight past
                 it. They let the harness read the printed table back and hold it
                 against the wire. */
              <div key={r.id} data-ledger={r.id} data-place={r.place} data-rounds={r.roundsWon}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 ${
                  r.isWinner ? "bg-amber-900/30" : r.id === playerId ? "bg-sky-950/40" : ""
                }`}>
                {/* The server's `place`, not the row index. They differ exactly
                    when two men are level on rounds AND on kills: both are #1,
                    both are paid the same, and the table says so rather than
                    picking one of them out of the room's join order. */}
                <div className="font-display w-6 shrink-0 text-lg leading-none text-stone-500">#{r.place}</div>
                <div className="min-w-0 flex-1">
                  <div className={`flex items-center gap-1.5 text-[13px] font-bold leading-tight ${r.isWinner ? "text-amber-200" : "text-stone-100"}`}>
                    <span className="truncate">{r.name}</span>
                    {r.isWinner && <Crown size={12} className="shrink-0 text-amber-400" />}
                  </div>
                  <div className="text-[10px] leading-tight text-stone-400">{r.kills}K / {r.deaths}D · {Math.round(r.damage)} dmg</div>
                </div>
                {/* Gilt when he won any, and dead stone when he won none — the
                    column has to read at a glance as the reason the row is where
                    it is, which is the whole of what the owner asked for. */}
                <div className={`font-display w-7 shrink-0 text-center text-base leading-none ${
                  r.roundsWon > 0 ? "text-amber-300" : "text-stone-600"
                }`}>{r.roundsWon}</div>
                <div className="w-16 shrink-0 text-right text-[11px] font-bold leading-tight">
                  <div className="text-amber-300">+{r.xpEarned} XP</div>
                  <div className="flex items-center justify-end gap-1 text-yellow-500"><Coins size={9} />+{r.goldEarned}</div>
                </div>
              </div>
            ))}
            {/* The pay is the server's to give. When it does not arrive the
                honest thing is to say so on the screen that shows the number,
                not to quietly print a total that includes it. */}
            {payState === "unpaid" && (
              <div className="px-2.5 py-1 text-[11px] leading-snug text-red-300/90">
                This pay has not reached the war rolls — your hoard is unchanged.
              </div>
            )}
            {payState === "asking" && (
              <div className="animate-pulse px-2.5 py-1 text-[10px] tracking-[0.18em] text-stone-400">WEIGHING THE PAY…</div>
            )}
          </div>
        </div>
        <div className="flex gap-2.5">
          <button onClick={onFightAgain} disabled={waiting} data-snd="confirm"
            className="btn-primary min-w-0 flex-1 whitespace-nowrap !min-h-[3.5rem] !px-3 !text-[13px] sm:!text-sm">
            {waiting
              ? <span className="animate-pulse tracking-[0.14em]">MUSTERING…</span>
              : <><Swords size={16} className="shrink-0" /> FIGHT AGAIN</>}
          </button>
          <button onClick={onLeave} data-snd="back"
            className="btn-ghost min-w-0 flex-1 whitespace-nowrap !min-h-[3.5rem] !px-3 !text-[13px] sm:!text-sm">
            LEAVE
          </button>
        </div>
      </div>
    </div>
  );
}

// The same score, after the last round, where it explains the result rather
// than tracking it.
function MatchTally({ data, playerId }: { data: MatchEndData; playerId: string }) {
  const of = data.roundTarget || 1;
  const wins = data.roundWins || {};
  if ((data.bestOf || 1) <= 1) return null;
  if (data.roundScoreBy === "team") {
    return (
      <div className="round-hud">
        <span className={data.winnerTeam === "red" ? "text-amber-200" : "text-stone-400"}>RED</span>
        <Pips won={wins.red || 0} of={of} />
        <span className="text-stone-500">BEST OF {data.bestOf}</span>
        <Pips won={wins.blue || 0} of={of} blue />
        <span className={data.winnerTeam === "blue" ? "text-amber-200" : "text-stone-400"}>BLUE</span>
      </div>
    );
  }
  return (
    <div className="round-hud">
      <span className="text-stone-500">BEST OF {data.bestOf}</span>
      <span className="text-amber-200">YOUR ROUNDS</span>
      <Pips won={wins[playerId] || 0} of={of} />
      <span className="text-stone-500">· {data.roundsPlayed} FOUGHT</span>
    </div>
  );
}

function LandingStat({ value, label, cls = "text-amber-100" }: { value: string; label: string; cls?: string }) {
  return (
    <div className="min-w-0 px-1 text-center">
      <div className={`font-display text-sm ${cls}`}>{value}</div>
      <div className="truncate text-[9px] uppercase tracking-[0.16em] text-stone-500">{label}</div>
    </div>
  );
}

function LinkPill({ mode }: { mode: "ws" | "http" | null }) {
  if (!mode) return null;
  return (
    <div className="badge-sky !text-[9px] !px-2.5 !py-1 flex items-center gap-1.5">
      <RadioTower size={10} />
      <span className="tracking-[0.15em] font-bold">{mode === "ws" ? "WAR-LINK: LIGHTNING" : "WAR-LINK: HORN"}</span>
    </div>
  );
}

/**
 * One bar on a class card.
 *
 * It takes a FRACTION, not a value and a ceiling, and that is the whole repair.
 * The old signature was `(value, max)` with the maxima written into the four
 * call sites, and it defended itself with `Math.min(100, ...)` — which is how a
 * stale ceiling stopped being a bar drawn past its track (obvious, fixed in an
 * afternoon) and became two different warriors drawn identically (invisible,
 * shipped for a release). There is nothing to clamp now: `cardBars` divides by
 * the roster's own maximum, so `frac` is in [0, 1] by construction and the
 * leader on each axis is the man whose bar is full.
 */
function StatBar({ label, frac, text, cls }: { label: string; frac: number; text: string; cls: string }) {
  return (
    <div className="flex items-center gap-1.5" title={`${label} — ${text}`}>
      <span className="text-[8px] text-stone-500 w-6 font-bold">{label}</span>
      <div className="flex-1 h-1.5 bg-stone-700/80 rounded-full overflow-hidden"
        role="img" aria-label={`${label}, ${text}`}>
        <div className={`h-full ${cls} rounded-full`} style={{ width: `${frac * 100}%` }} />
      </div>
    </div>
  );
}

/**
 * One tap, everywhere, and it looks the same everywhere. `data-snd="none"`
 * keeps the delegated tap off it: a button that silences the game must not make
 * a noise on the way, and un-silencing it says `confirm` for itself.
 */
function SoundToggle({ muted, onToggle, className = "" }: {
  muted: boolean; onToggle: () => void; className?: string;
}) {
  return (
    <button
      onClick={onToggle}
      data-snd="none"
      aria-pressed={muted}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}
      title={muted ? "Sound off — tap for sound" : "Sound on — tap to silence"}
      className={`flex h-11 w-11 items-center justify-center rounded-lg border backdrop-blur transition ${
        muted
          ? "border-stone-600 bg-stone-900/90 text-stone-500 hover:text-stone-300"
          : "border-amber-700/70 bg-stone-900/90 text-amber-400 hover:border-amber-500 hover:text-amber-300"
      } ${className}`}
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} data-snd="back" className="btn-back">
      <ArrowLeft size={16} /> BACK
    </button>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card px-5 py-4 sm:px-6 sm:py-5">
      <div className="section-title !text-amber-300 mb-3">{icon} {title}</div>
      {children}
    </div>
  );
}

function CtrlRow({ k, d }: { k: string; d: string }) {
  return (
    <div className="ctrl-row">
      <span className="kbd">{k}</span>
      <span className="text-[13px] text-stone-300/90 leading-snug">{d}</span>
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return <div className="tip-row">{text}</div>;
}

/**
 * One figure from a warrior's record.
 *
 * `tone` is THREE VALUES AND NOT SIX FREE COLOURS, and the difference is the
 * whole point. This grid used to be `text-yellow-400`, `text-purple-400`,
 * `text-emerald-400`, `text-white`, `text-red-400` and `text-stone-400` — six
 * hues, one per tile, none of them from the game's palette: yellow-400 is not
 * gilt and red-400 is not garnet. `globals.css` sets the rule ("three metals and
 * one stone, and no fourth accent hue anywhere in the menus") and this one
 * screen broke it six ways, which is most of why the Saga read as a settings
 * page with a serif heading rather than as a page of the same chronicle.
 *
 * Colour still carries meaning here — this is information, not decoration — but
 * it groups rather than labels, so the eye reads three kinds of fact instead of
 * six unrelated ones:
 *   won   — what he has taken: gold, honour, victories. Gilt.
 *   blood — what it cost: kills, deaths. Garnet.
 *   tally — a plain count that is neither: battles. Vellum.
 */
function ProfStat({ Icon, val, label, tone }: {
  Icon: typeof Swords; val: number; label: string; tone: "won" | "blood" | "tally";
}) {
  const ink = tone === "won" ? "text-[#f6dda0]" : tone === "blood" ? "text-[#c8323c]" : "text-[#ddd3bd]";
  return (
    <div className="card flex flex-col items-center gap-1 px-2 py-4 text-center">
      <div className={`flex items-center justify-center gap-1.5 text-xl font-bold tabular-nums ${ink}`}>
        <Icon size={15} className="opacity-80" />{val}
      </div>
      <div className="text-[10px] tracking-wide text-stone-400">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The armoury's cards
// ---------------------------------------------------------------------------

/**
 * A card's photograph of the thing it sells.
 *
 * Returns the data URL once the stage's forge has drawn it, and null until
 * then. The subscription is one shared watcher per card — `requestThumb` is
 * idempotent and cheap, so calling it on every render is correct and is what
 * makes a card that was mounted before the GL context existed fill itself in
 * when the context arrives.
 */
function useCosmeticThumb(spec: Parameters<typeof requestThumb>[0]): string | null {
  // Every field the picture depends on, flattened so the effect can depend on
  // a value rather than on an object `specForOption` mints fresh each render.
  const a = spec.appearance;
  const key = [
    spec.warriorClass, spec.slot, spec.faceSeed,
    a.helm, a.hairStyle, a.hairColor, a.beardStyle, a.beardColor,
    a.cloak, a.armorColor, a.warPaint,
  ].join("|");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const ask = () => {
      const got = requestThumb(spec);
      if (got && alive) setUrl(got);
      return got;
    };
    if (ask()) return () => { alive = false; };
    // The forge publishes under its OWN cache key, which is deliberately
    // narrower than this one — a cloak cannot change a portrait — so a card
    // re-asks on every publish rather than matching keys. Ten cards times ten
    // publishes is a hundred map lookups, once, per slot opened.
    const stop = watchThumbs(() => { ask(); });
    // And a poll, because the cards paint before the GL context exists: the
    // preview is behind `next/dynamic`, so on the first frame of this screen
    // there is no forge to queue against and nothing will ever publish.
    const retry = setInterval(ask, 400);
    return () => { alive = false; stop(); clearInterval(retry); };
    // `spec` is `key` in object form; depending on both would rebuild the
    // subscription on every render for no change in what is being asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

/**
 * How loud a card is, by what it costs.
 *
 * The owner's read: "nothing distinguishes a 30-gold item from a 2400-gold
 * one." A ladder that all looks the same is not a ladder — and the top of this
 * one is a single item at 2400 gold, which the pricing comment in `ARMOURY`
 * calls "a season's goal rather than a purchase". It gets a setting to match.
 */
function costTier(cost: number): { ring: string; label: string; labelCls: string } {
  if (cost === 0) return { ring: "border-stone-100/12", label: "FREE", labelCls: "text-stone-400" };
  if (cost < 100) return { ring: "border-stone-100/15", label: "", labelCls: "" };
  if (cost < 400) return { ring: "border-amber-800/50", label: "", labelCls: "" };
  if (cost < 1000) return { ring: "border-amber-600/60", label: "WAR-GEAR", labelCls: "text-amber-500/90" };
  return { ring: "border-yellow-500/70", label: "A JARL'S PRICE", labelCls: "text-yellow-400" };
}

function CosmeticCard({
  opt, owned, equipped, staged, slotStaged, affordable, cls, faceSeed, base, onPick,
}: {
  opt: ArmouryOption;
  /** True of what the PROFILE wears, whatever is on the mannequin. A shop that
   *  hides what you already own the moment you try something else on is a shop
   *  you cannot back out of. */
  equipped: boolean;
  /** True of the option currently on the mannequin. */
  staged: boolean;
  /** True when ANY option in this slot is staged — so the equipped one can
   *  keep its badge while losing the selection ring. */
  slotStaged: boolean;
  owned: boolean; affordable: boolean;
  cls: WarriorClass; faceSeed: number; base: Appearance;
  onPick: () => void;
}) {
  const spec = specForOption(cls, faceSeed, base, opt.slot, opt.value);
  const thumb = useCosmeticThumb(spec);
  const tier = costTier(opt.cost);
  const swatch = typeof opt.value === "number"
    ? `#${opt.value.toString(16).padStart(6, "0")}`
    : null;

  // The card's own name, spelled out rather than left to be scraped off the
  // badges and the price row. Two reasons, and the second one cost a gate:
  //
  //   - a screen reader reading "EQUIPPED Bare Head IN YOUR KIT" is reading a
  //     layout, not an item;
  //   - `tools/cheattest.mjs` finds the buy button with
  //     `getByRole("button", { name: /EQUIP/ })`, and a card whose accessible
  //     name began "EQUIPPED" matched it FIRST. The run clicked a helmet
  //     instead of the till, no purchase was attempted, no refusal banner
  //     appeared, and the assertion that the shop refuses a doctored purse
  //     failed with `null`. The economy was never at risk — the row was
  //     untouched — but the gate could not see that, which is the same thing.
  //     "Worn" carries the meaning without carrying the substring.
  const label = [
    opt.label,
    owned ? "in your kit" : opt.cost === 0 ? "free" : `${opt.cost} gold`,
    equipped ? "worn now" : null,
    staged ? "on the mannequin" : null,
    !owned && !affordable ? "not enough gold" : null,
  ].filter(Boolean).join(" — ");

  return (
    <button
      onClick={onPick}
      aria-label={label}
      aria-pressed={staged || (equipped && !slotStaged)}
      className={`card card-interactive flex flex-col overflow-hidden !p-0 text-left ${
        staged || (equipped && !slotStaged) ? "card-selected" : tier.ring
      } ${!owned && !affordable ? "opacity-65" : ""}`}
    >
      {/* THE PICTURE. Same materials, same lights, same environment map as the
          mannequin — a card and the stage beside it disagreeing about what an
          item looks like would be worse than a glyph. */}
      <div
        className="relative aspect-square w-full shrink-0 overflow-hidden"
        style={{ background: "radial-gradient(80% 70% at 50% 82%, #1b1013 0%, #07070a 72%)" }}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : swatch ? (
          // A colour has no silhouette by construction — the audit says so of
          // all twelve hair and beard colours — so its card is honestly a
          // swatch while the head behind it renders.
          <div className="flex h-full w-full items-center justify-center">
            <span className="h-1/2 w-1/2 rounded-full border-2 border-stone-500/70 shadow-inner"
              style={{ backgroundColor: swatch }} />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="h-6 w-6 animate-pulse rounded-full bg-stone-100/10" />
          </div>
        )}
        {staged && !equipped ? (
          <span className="absolute left-1 top-1 rounded bg-amber-400/30 px-1.5 py-0.5 text-[7.5px] font-bold tracking-[0.12em] text-amber-200">
            ON HIM
          </span>
        ) : equipped ? (
          <span className="absolute left-1 top-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-[7.5px] font-bold tracking-[0.12em] text-black">
            EQUIPPED
          </span>
        ) : owned ? (
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[7.5px] font-bold tracking-[0.12em] text-stone-300">
            OWNED
          </span>
        ) : null}
        {!owned && !affordable && (
          <span className="absolute right-1 top-1 rounded bg-black/75 p-1 text-stone-400">
            <Lock size={10} />
          </span>
        )}
      </div>

      {/* THE FACTS. Name, price, and what it is — a card that says only
          "Owned — tap to preview" tells a player nothing he can spend on. */}
      <div className="flex min-h-[4.25rem] flex-1 flex-col gap-1 p-2">
        <div className="line-clamp-2 text-[11.5px] font-bold leading-tight text-stone-100">{opt.label}</div>
        <div className="mt-auto flex items-center justify-between gap-1">
          {owned ? (
            <span className="text-[9.5px] font-bold tracking-[0.1em] text-emerald-400/90">IN YOUR KIT</span>
          ) : (
            <span className={`flex items-center gap-1 text-[11px] font-bold ${affordable ? "text-yellow-400" : "text-stone-500"}`}>
              <Coins size={11} /> {opt.cost}
            </span>
          )}
          {tier.label && !owned && (
            <span className={`shrink-0 text-[7px] font-bold tracking-[0.12em] ${tier.labelCls}`}>{tier.label}</span>
          )}
        </div>
      </div>
    </button>
  );
}

/** The bill. One component, shown beside the stage on a desktop and in a
 *  fixed bar under the thumb on a phone. */
function StagedBill({ cost, gold, buying, onBuy, onClear }: {
  cost: number; gold: number; buying: boolean; onBuy: () => void; onClear: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] tracking-widest text-stone-400">COST TO UNLOCK</div>
        <div className={`flex items-center gap-1.5 text-lg font-bold ${gold >= cost ? "text-yellow-400" : "text-red-400"}`}>
          <Coins size={14} /> {cost}
        </div>
      </div>
      <div className="flex gap-2.5">
        <button onClick={onBuy} disabled={buying} className="btn-primary flex-1 !min-h-[3rem] !text-sm">
          {buying ? "ASKING THE ROLLS…" : <><Check size={15} /> EQUIP{cost > 0 ? " & BUY" : ""}</>}
        </button>
        <button onClick={onClear} aria-label="Discard try-on" className="btn-ghost !px-4">
          <ArrowLeft size={15} />
        </button>
      </div>
    </div>
  );
}
