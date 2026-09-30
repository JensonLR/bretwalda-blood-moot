"use client";
import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import {
  Swords, Target, Scroll, ArrowLeft, Copy, Share2, Crown, Shield, Sparkles, Check, Lock, Coins,
  User, Skull, Flame, Eye, Shirt, ChevronRight, Trophy, Medal, Heart, Users, DoorOpen, Crosshair,
  Bot, BotMessageSquare, Minus, Plus, Flag, KeyRound, Volume2, Map, Dices,
} from "lucide-react";
import { forgeName } from "@/game/names.mjs";
import type {
  GamePlayer, WarriorClass, GameMode, Team, BestOf, MatchEndData, EmoteId,
} from "../game/types";
import {
  WARRIOR_STATS, ABILITY_LORE, ARMS_LORE, ARENA_NAMES, getLevelTitle, xpForLevel, DEFAULT_BEST_OF,
} from "../game/types";
import { FIRST_MOOT_KEY } from "@/game/firstmoot.mjs";
// The profile marks — backlog 5.5. The set and the unlock rules live in one
// shared module so this screen, the glyph component and `tools/marktest.mjs`
// all read the same law; see the header of `marks.mjs`.
import { MARKS, markOf, markEarned, earnedMark, markHint, markWon, heraldMarks, type MarkFacts } from "@/game/marks.mjs";
import { useFightRail, railStyle, endIsWide } from "@/game/client/fightRail";
import { watchForInstall } from "@/game/client/install";
import { tourIsDue, TOUR_KEY } from "@/game/tour.mjs";
import { browserStore } from "@/game/tuition.mjs";
import { MarkGlyph } from "../game/client/MarkGlyph";
import { StandardGlyph } from "../game/client/StandardGlyph";
import { narrowStandard } from "@/game/standards.mjs";
import {
  ARMOURY, freeCosmeticIds, defaultAppearance, migrateAppearance, isPeople, peopleOf,
  type Allegiance, type Appearance,
} from "../game/client/characters";
// The registry only — a Map, a queue and a set of watchers, with every import
// inside it erased at compile time. The renderer that fills it lives in
// `armouryStage.ts` and arrives with the dynamically imported preview, so the
// landing screen does not download a sky shader to draw an empty card frame.
import { faceSeedFor } from "../game/client/armouryThumbs";
import { Transport } from "../game/client/transport";
import { getHandedness, getServerHandedness, subscribeHandedness } from "../game/client/input";
import {
  labelForAction, labelForCode, loadKeyboardLayout, getBindings, getServerBindings,
  subscribeBindings, bindingsAreDefault, hydrateBindings, setBindingsPersister,
  bindingsTouchedHere,
} from "../game/client/bindings";
import type { ForgeProgress, WireHitMessage } from "../game/client/GameCanvas";
import {
  bootProfile, bindWarrior, collectPay, buyKit, syncName, recoverProfile,
  syncBindings, noteBindingsSynced, syncMuted, noteMutedSynced, syncAppearance, fetchSworn, LEGACY_KEY, type ServerProfile,
} from "./profileLink";
import { readCreds } from "./profileLink";
import Dispatch, { takeCrownNews, takeWatermark } from "../game/client/factionMap/Dispatch";
import type { WarViewData } from "../game/client/factionMap/WarMap";
// Statically imported, unlike the canvas: this module builds no AudioContext
// until a gesture and pulls in nothing else, so the landing screen pays a
// couple of kilobytes for it and the FIRST tap on the page is already a sound.
import {
  getAudio, subscribeMuted, getMuted, getServerMuted, type UiSound,
} from "../game/client/render/audio";
import dynamic from "next/dynamic";
import { territory } from "@/game/war.mjs";

// ---------------------------------------------------------------------------------------------
// THE SCREEN COMPONENTS live in `./ui/`, one file per unit of work, and were moved there verbatim
// (F0). `Page()` below composes them; it no longer defines any. Each import sits behind a comment
// line on purpose: two units editing neighbouring import lines is a git conflict, two units editing
// lines with one unchanged line between them is not.
// ---------------------------------------------------------------------------------------------
// SHARED — ui/shared.ts
import type { RoomState, Link, Notice, WarOutcomeMsg } from "./ui/shared";
import { CharacterPreview, WARRIOR_INFO, roundsBlurb } from "./ui/shared";
// UNIT:T — ui/shell.tsx
import {
  MenuShell, ContentWrap, ScreenHead, LandingStat, TourGuide, SoundToggle, BackButton,
} from "./ui/shell";
// UNIT:L — ui/lobbyParts.tsx
import {
  WarriorPanel, ClassGrid, RoundPicker, LinkPill, Section, CtrlRow, Tip,
} from "./ui/lobbyParts";
// UNIT:S — ui/sagaParts.tsx
import { TheKeep, ProfStat } from "./ui/sagaParts";
// UNIT:A — ui/armouryParts.tsx
import { CosmeticCard, StagedBill } from "./ui/armouryParts";
// UNIT:H — ui/hudParts.tsx
import { RoundTally, RoundBreak, MatchSummary } from "./ui/hudParts";
// UNIT:W — ui/warParts.tsx
import { GroundLine } from "./ui/warParts";
// GLYPHS — empty modules today; each unit turns its own line into a named import in place.
// UNIT:T
import "./glyphs/landing";
// UNIT:L
import "./glyphs/lobby";
// UNIT:A
import "./glyphs/armoury";
// UNIT:S
import "./glyphs/saga";

const GameCanvas = dynamic(() => import("../game/client/GameCanvas"), { ssr: false });
const KeyBindingsPanel = dynamic(
  () => import("../game/client/GameHud").then((m) => m.KeyBindingsPanel),
  { ssr: false },
);

type Screen = "landing" | "create" | "join" | "lobby" | "game" | "training" | "muster" | "profile" | "armoury";

type Difficulty = "recruit" | "warrior" | "jarl";

interface ProfileData {
  name: string; level: number; xp: number; gold: number; honour: number;
  kills: number; deaths: number; wins: number; matches: number;
  unlocked: string[]; appearance: Appearance;
  /** Four words, only ever set by the server. Absent means "kept on this device". */
  recoveryCode?: string;
  /** Seasons crowned Bretwalda. Only ever set by the server; absent under-claims,
   *  which is the marks' own narrowing posture. */
  bretwaldaSeasons?: number[];
  /**
   * WHICH MARKS THIS DEVICE HAS ALREADY ANNOUNCED. Device-local on purpose and
   * never sent: it records what a player has been TOLD, which is a fact about
   * this screen and not about the account. `undefined` is "no record kept" and
   * primes silently — see `heraldMarks`.
   */
  seenMarks?: string[];
}

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

/**
 * For `useSyncExternalStore` over browser stores that never notify (query
 * strings, localStorage keys written by other screens): subscribe to nothing;
 * every render re-reads the snapshot, which is exactly the staleness the old
 * effect mirrors had — without the mirror.
 */
const NO_RESUBSCRIBE = () => () => {};

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
  // Entering a fight forges from nothing. This used to be an effect watching
  // `screen` for the LEAVING edge — a state mirror react-doctor rightly
  // flags — but the observable rule is identical either way round: nothing
  // renders the forge or the muster outside the game screen, so clearing
  // them in the two EVENTS that enter it (the `countdown` and `game_state`
  // arms of the message handler) leaves no frame in which stale values are
  // visible, and no effect cascade.
  const resetForge = useCallback(() => { setForge(null); setForgeStalled(false); setMuster(null); }, []);
  /**
   * THE DISPATCH, ON THE TITLE SCREEN — backlog 5.13 in its own words: "a man
   * who has not opened the map still learns the map moved". The component,
   * the server-minted watermark and the quiet-war-draws-nothing behaviour all
   * live in `factionMap/Dispatch.tsx` and are reused as-is; this screen only
   * fetches the same `/api/war` the map does, in a promise callback, after
   * the landing has painted. The watermark cache is module-level, so a visit
   * that reads the news here and then opens the map sees ONE consistent
   * "since you were away" on both — and the news retires on the next visit,
   * not mid-session.
   */
  const [warDispatch, setWarDispatch] = useState<{
    war: WarViewData; mine: string | null; seen: number | null;
    crownNews: { seasonIndex: number; people: string; name: string | null } | null;
  } | null>(null);
  useEffect(() => {
    fetch("/api/war", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(readCreds() ?? {}),
    })
      .then((res) => res.json() as Promise<{ mode?: string; war?: WarViewData; self?: { allegiance?: string | null } | null }>)
      .then((body) => {
        if (body.mode === "local" || !body.war) return;
        const seen = takeWatermark(
          body.war.season.index,
          body.war.recent.reduce((m, f) => Math.max(m, f.at), 0),
        );
        setWarDispatch({
          war: body.war, mine: body.self?.allegiance ?? null, seen,
          // The crowning rides the same visit as the flips and retires the
          // same way — its own latch, because a fresh season has no flip for
          // the watermark to be raised to. See `takeCrownNews`.
          crownNews: takeCrownNews(body.war.crowns),
        });
      })
      .catch(() => { /* a quiet landing beats a blocked one */ });
  }, []);
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
  /**
   * THE STAKE. Decided here because it is the host's call and it cannot change
   * once men have joined — see `handleCreate` in the engine. Default is the
   * war: a fight that counts is the game's normal case, and the moot is the
   * thing you choose.
   */
  const [friendlyMoot, setFriendlyMoot] = useState(false);
  /** The friendly moot's chosen ground. War rooms never read this. */
  const [friendlyGround, setFriendlyGround] = useState("saxon_village");
  /**
   * The ground this room was raised FOR, when the player came from the map's
   * "fight for this ground". Null is the ordinary case: the engine deals from
   * the contested front.
   */
  const [warTerritory, setWarTerritory] = useState<string | null>(null);
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
  /** The last kill's clip, ready to save (7.9). Null until the canvas says. */
  const [clipSave, setClipSave] = useState<(() => void) | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkMode, setLinkMode] = useState<"ws" | "http" | null>(null);
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  /**
   * THE FIRST MOOT'S DOOR — offered to a warrior with no matches behind him
   * and no rite behind him on this device. The rite store is the browser's,
   * so it is read through `useSyncExternalStore`: the server snapshot says
   * "done" (a server render must not offer a door it cannot see), the client
   * snapshot reads the key, and there is no state to mirror — react-doctor's
   * set-state-in-effect finding here was real, this screen's own save-wipe
   * came from exactly that mirror pattern one hook down.
   */
  const mootDone = useSyncExternalStore(
    NO_RESUBSCRIBE,
    () => { try { return localStorage.getItem(FIRST_MOOT_KEY) === "done"; } catch { return true; } },
    () => true,
  );
  const mootOffered = profile.matches === 0 && !mootDone;
  /** True while the current room IS the First Moot, so the leave path knows
   *  to carry the graduate to the oath rather than back to the hall. */
  const mootSessionRef = useRef(false);
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
  /** THE WAY BACK IN (8.9): this body's private reconnect key, off the join
   *  reply, presented on `rejoin` when the transport relinks. A ref — the
   *  render never reads it, and a credential does not belong in state. */
  const reconnectKeyRef = useRef<string | null>(null);
  /** The room the key belongs to, for the same relink moment. */
  const rejoinCodeRef = useRef<string | null>(null);
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
  const emoteFeedRef = useRef<Array<{ playerId: string; emote: EmoteId; local?: boolean }>>([]);
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
  // THE MENUS' SHARE OF THE SCORE (7.8): the hall gets the drone alone, the
  // lobby the heartbeat; the game screen's canvas takes the wheel per frame.
  // An imperative call, not state — the audio singleton glides on its own.
  useEffect(() => {
    if (screen === "game") return;
    audio.setScore(screen === "lobby" ? "lobby" : "menu", screen === "lobby" ? 0.1 : 0);
  }, [screen, audio]);
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
  //
  // AND NOT ONE KEYSTROKE BEFORE THE DISK HAS BEEN READ. Moving this write
  // out of the state updater (the react-doctor fix above) gave it a mount
  // firing the updater never had: effects run in declaration order, this one
  // sits above the boot reader, and so the first thing a boot did was write
  // DEFAULT_PROFILE over the save and then read its own blank back. Server
  // mode papered over it — `adoptServer` restores from the roll — which left
  // the wipe aimed at exactly the player the mirror exists for: the one with
  // no server. Measured before the fix: seed gold 140 / level 6, one load,
  // read back gold 0 / level 1. The flag flips in the reader below, whether
  // or not the disk held anything, so a fresh device still persists normally
  // from its first real change.
  const diskReadRef = useRef(false);
  useEffect(() => {
    if (!diskReadRef.current) return;
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
      bretwaldaSeasons: p.bretwaldaSeasons ?? [],
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
    const sworn = await fetchSworn();
    const people: Allegiance = isPeople(sworn?.allegiance ?? null) ? (sworn!.allegiance as Allegiance) : "none";
    // The house's standard rides with the oath (Wave F): read off the same
    // reply, narrowed to his own kingdom's list the way the server will narrow
    // it again at the door.
    const standard = narrowStandard(people, sworn?.standard ?? "none");
    const current = peopleOf(profileRef.current.appearance);
    const currentStandard = profileRef.current.appearance?.standard ?? "none";
    if (current === people && currentStandard === standard) return;
    const ap = { ...profileRef.current.appearance, people, standard };
    saveProfile({ appearance: ap });
    transportRef.current?.send({ type: "set_appearance", data: { appearance: ap } });
    // AND TO THE PROFILE, which is the half that was missing. The socket dresses
    // him for the men in this room; this dresses him for the next device he
    // opens the game on. See `syncAppearance`.
    void syncAppearance(ap);
  }, [saveProfile]);

  /**
   * THE MARK — backlog 5.5. What the unlock rules may read, drawn off the
   * profile every render so a level or a win earned this session unlocks its
   * mark the moment the number moves. `sworn` is the livery rather than the
   * database row for the same reason the oath mirror uses it: it is what this
   * device knows, `adoptAllegiance` keeps it honest, and a mark is cosmetic —
   * wrong for a minute after a fresh oath costs nothing and rights itself.
   */
  const markFacts: MarkFacts = {
    level: profile.level, wins: profile.wins, matches: profile.matches,
    sworn: peopleOf(profile.appearance) !== "none",
    crowned: (profile.bretwaldaSeasons?.length ?? 0) > 0,
  };
  // Narrowed on OUR OWN view: a hand-edited localStorage draws the bare shield.
  const myMark = earnedMark(profile.appearance.mark, markFacts).id;
  const pickMark = useCallback((id: string) => {
    // Re-check at press time rather than trusting the tile's disabled state —
    // the rule module is the law, the button is furniture.
    if (earnedMark(id, {
      level: profileRef.current.level, wins: profileRef.current.wins,
      matches: profileRef.current.matches,
      sworn: peopleOf(profileRef.current.appearance) !== "none",
      crowned: (profileRef.current.bretwaldaSeasons?.length ?? 0) > 0,
    }).id !== id) return;
    const ap = { ...profileRef.current.appearance, mark: id };
    saveProfile({ appearance: ap });
    transportRef.current?.send({ type: "set_appearance", data: { appearance: ap } });
    // THE MARK IS THE ONE HE EARNED RATHER THAN BOUGHT, and it was the one that
    // did not survive a second device. See `syncAppearance`.
    void syncAppearance(ap);
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
    let dropped = false;
    // Deferred by one microtask, so nothing here sets state synchronously in
    // the effect body (react-doctor's rule, and the right one: this is the
    // hook whose sibling mirror wiped the save). Behaviourally identical —
    // effects already run after paint, and the disk is read on the next tick,
    // still ahead of anything a human can press.
    void Promise.resolve().then(() => {
    if (dropped) return;
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
        // The free kit is unioned in rather than defaulted in: a save from
        // before a free id existed carries a list without it, and taking that
        // list verbatim showed "-13 unlocks earned" on the Saga — the count
        // subtracts the CURRENT free set from a roll that predates it.
        const merged = {
          ...DEFAULT_PROFILE, ...parsed,
          unlocked: [...new Set([...(parsed?.unlocked ?? []), ...freeCosmeticIds()])],
        };
        setProfile({ ...merged, appearance: migrateAppearance(merged.appearance) });
      } catch { /* ok */ }
    }
    // The disk has now been read (or found empty/unreadable, which is the
    // same promise): from here the mirror above may write. Set outside the
    // parse guard on purpose — a corrupt save must not leave the game unable
    // to persist forever after.
    diskReadRef.current = true;
    // Deep link: ?code=WESSEX82 puts you one tap from battle
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code")?.toUpperCase().substring(0, 15);
    // "FIGHT FOR THIS GROUND", arriving from the map. The map is its own route
    // (/factions), so the handoff is a query param the same way an invite is;
    // it opens CREATE with the ground pinned, and the engine re-validates the
    // id — a stale link is a normal deal, never an error.
    const war = params.get("war");
    if (war) {
      setWarTerritory(war);
      setScreen("create");
      const url = new URL(window.location.href);
      url.searchParams.delete("war");
      window.history.replaceState({}, "", url);
    }
    if (code) {
      setInviteCode(code);
      setJoinCode(code);
      setScreen("join");
    }

    // Sign in behind the landing screen. Nothing waits on this: the player can
    // be typing a name and creating a room before it answers, and if it never
    // answers the game is the one it has always been, with the gold on the
    // device. The one step it must not skip is carrying that gold across.
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
    });
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

  /**
   * THE HERALD — a mark that unlocks says so.
   *
   * The owner: "There's no notification for when you unlock a new mark via an
   * achievement." There was not. `markEarned` was a pure function nobody
   * watched, so the Raven Banner appeared on the record screen whenever the
   * player next happened to scroll to it, silently, weeks after the
   * twenty-fifth win that bought it.
   *
   * WHAT IT WATCHES is the five facts a rule may read, not the mark list: the
   * rules live in `marks.mjs` and this effect must not restate any of them.
   * `heraldMarks` owns the difference and owns the priming, and returns the
   * same array when nothing changed so an idle screen never writes.
   *
   * ONE LINE FOR MANY. A restore onto a fresh device lands a season's worth of
   * progress in one packet and can earn a dozen rules at once; a dozen banners
   * teaches a player to dismiss the banner. Two or fewer are named, more are
   * counted, and either way the pips on the tiles are the durable half — the
   * banner is 3.2 seconds and the record screen is not.
   */
  const [freshMarks, setFreshMarks] = useState<string[]>([]);
  /** Which mark's line is open below the grid. Not the WORN mark: a locked one
   *  can be asked about, which is most of the point. */
  const [markPeek, setMarkPeek] = useState<string | null>(null);
  useEffect(() => {
    const p = profileRef.current;
    const { fresh, seen } = heraldMarks(p.seenMarks, {
      level: p.level, wins: p.wins, matches: p.matches,
      sworn: peopleOf(p.appearance) !== "none",
      crowned: (p.bretwaldaSeasons?.length ?? 0) > 0,
    });
    // Identity, not length: `heraldMarks` hands back the very array it was
    // given when there is nothing to add, so this is the whole no-op guard.
    if (seen === p.seenMarks) return;
    saveProfile({ seenMarks: seen });
    if (!fresh.length) return;
    setFreshMarks((prev) => [...new Set([...prev, ...fresh])]);
    // No sound of its own: `say`'s "good" tone already rings `confirm`, and a
    // second cue on the same frame is two sounds, not one louder one.
    say(fresh.length === 1
      ? `A NEW MARK — ${markOf(fresh[0]).name}. ${markWon(markOf(fresh[0]))}`
      : fresh.length === 2
        ? `TWO NEW MARKS — ${markOf(fresh[0]).name} and ${markOf(fresh[1]).name}.`
        : `${fresh.length} NEW MARKS. They are waiting on your record.`, "good");
  }, [profile.level, profile.wins, profile.matches, profile.appearance,
      profile.bretwaldaSeasons, profile.seenMarks, saveProfile, say]);

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
        reconnectKeyRef.current = (d as { reconnectKey?: string }).reconnectKey ?? null;
        rejoinCodeRef.current = d.code;
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
        // SEATED (7.9b): the room this join landed in is already fighting, so
        // the snapshot's state says anything but "lobby" and this man is on
        // the bench. Straight to the game screen — the canvas draws the
        // fight it was just handed and the spectate lens engages off his own
        // absence from `players`. Routing him through the lobby would flash
        // an invite screen for a battle he cannot be invited to.
        if (d.state !== "lobby") { resetForge(); setScreen("game"); }
        else setScreen("lobby");
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
        setClipSave(null);
        resetForge();
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
          resetForge();
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
      // THE LINK IS BACK (8.9) — a synthetic event from the transport's own
      // retry, never off the wire. The session is new, so the man walks back
      // into his held body with the key his old link was handed at join; a
      // refusal (the grace ran out) comes back as the engine's own error
      // sentence, and his honest next move is a plain join — the bench.
      case "relink": {
        if (rejoinCodeRef.current && reconnectKeyRef.current) {
          sendMsg("rejoin", { code: rejoinCodeRef.current, key: reconnectKeyRef.current });
        }
        break;
      }
      case "error": {
        setBusy(false);
        const code = msg.data?.code as string | undefined;
        const inMenu = screenRef.current === "landing" || screenRef.current === "create" || screenRef.current === "join" || screenRef.current === "training" || screenRef.current === "muster" || screenRef.current === "profile" || screenRef.current === "armoury";
        // During gameplay or lobby, silently swallow transient link errors —
        // the transports keep the session alive; don't scare the player.
        if (inMenu || busyRef.current) {
          showError((msg.data?.message as string) || "The moot went quiet — try that once more.");
        } else if (code === "lost") {
          // soft banner only if we genuinely need action
          showError("Link flickered — try re-entering the room if things look wrong.");
        }
        break;
      }
    }
  }, [adoptServer, tallyLocally, showError, settled, sendMsg, stampSnapshot, resetForge]);

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
  // THE PWA SHELL's worker (8.9): registered once, fire-and-forget. The
  // worker caches nothing (see public/sw.js for why a live-wire game must
  // not) — it exists so the install prompt has a worker to point at.
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* not offered: fine */ });
    }
  }, []);

  // AND THE EARNED HALF OF IT. `beforeinstallprompt` fires early, once, and is
  // never replayed — a listener attached when the summary mounts would miss it
  // every time — so the handle is captured at boot and the browser's own banner
  // suppressed with it. `install.ts` decides when it may be spent, and the rule
  // is the backlog's own: never at first load, after a won match.
  useEffect(() => watchForInstall(), []);

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
    // IT PLAYS ON HIS OWN SCREEN BEFORE IT LEAVES THE MACHINE.
    //
    // The owner: the emotes are "really low budget, lazy & laggy". The lag was
    // literal and it was a whole round trip: the press went to the server, the
    // server relayed it to everyone INCLUDING the man who pressed it, and only
    // then did his own body move. On a good link that is a tenth of a second
    // between the button going down and the arm going up; on a bad one it is
    // half. A flourish is the one thing in this game with no simulation behind
    // it — the sim never reads it, `emote` is not in the input message — so
    // there is nothing to predict WRONG. It goes in the feed now, locally,
    // first; the relay that comes back is dropped for our own id (see the
    // canvas's `drainEmotes`) so the performance is not restarted mid-gesture.
    emoteFeedRef.current.push({ playerId: playerId, emote, local: true });
    sendMsg("emote", { emote });
  }, [sendMsg, playerId]);

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
    // A deliberate leave surrenders the way back in (8.9): a later link
    // flicker must not march the man back into a fight he walked out of.
    reconnectKeyRef.current = null;
    rejoinCodeRef.current = null;
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
    sendMsg("create", {
      name: playerName, mode: selectedMode, bestOf,
      appearance: profileRef.current.appearance, awaitLoad: true,
      // The stake and, when the player came from the map, the ground. The
      // engine validates the territory id and decides everything downstream —
      // the client only ever ASKS.
      friendly: friendlyMoot,
      territoryId: warTerritory ?? undefined,
      // A friendly moot may choose its ground (validated server-side); a war
      // room never sends one — the map or the deal names it.
      arena: friendlyMoot ? friendlyGround : undefined,
    });
  }, [playerName, selectedMode, bestOf, friendlyMoot, friendlyGround, warTerritory, ensureTransport, sendMsg, showError]);

  /**
   * FIND A FIGHT — backlog 4.7. One press: the engine seats you in the
   * fullest open public room or founds one, you arrive ready, and the muster
   * starts itself when a second stranger lands. No code, no lobby ritual.
   */
  const handleQuick = useCallback(async () => {
    if (!playerName.trim()) { showError("Enter your warrior name first!"); return; }
    setBusy(true);
    localStorage.setItem("bretwalda_name", playerName);
    void syncName(playerName);
    const ok = await ensureTransport();
    if (!ok) { setBusy(false); return; }
    sendMsg("quickplay", {
      name: playerName,
      appearance: profileRef.current.appearance, awaitLoad: true,
    });
  }, [playerName, ensureTransport, sendMsg, showError]);

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
      case "weapon": return ap.weapon ?? "weapon_issued";
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
        case "weapon": ap.weapon = String(s.value); break;
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
        case "weapon": ap.weapon = String(s.value); break;
      }
    }
    saveProfile({ appearance: ap, unlocked, gold: p.gold - cost });
    // A purchase writes the row through `/api/profile/purchase`; RE-EQUIPPING
    // something already owned costs nothing and went nowhere. Both paths land
    // here, so both persist from here.
    void syncAppearance(ap);
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
  // The other two rungs of the movement-side rail. See `fightRail.ts` — this
  // file owns END and the mute toggle, GameHud owns the graphics pad and the
  // First Moot's skip, and one rule places all four.
  const rail = useFightRail();
  const soloEnd = roomState?.mode === "solo";


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
          onEmote={sendEmote} onCanEmote={setCanEmote} onReplay={setReplay} emoteFeed={emoteFeedRef} hitFeed={hitFeedRef}
          // The staged foe (8.5). Only for a rite entered through THE FIRST
          // MOOT door — that session starts with an empty ring on purpose. A
          // player who chose zero bots in TRAINING chose an empty ring and
          // keeps it; the HUD's callback fires either way, the guard is here.
          // `hold: true` is the pell (engine `botThink`): he walks in for THE
          // BLADE and stands there. The owner: "We don't want them just dying
          // constantly while trying to figure it out."
          onMootFoe={() => { if (mootSessionRef.current) sendMsg("add_bot", { difficulty: "recruit", hold: true }); }}
          // And he is armed when the rite reaches THE SHIELD, whose whole
          // subject is a blow arriving. One message, once, host only.
          onMootArm={() => { if (mootSessionRef.current) sendMsg("arm_bots"); }}
          onMootHold={(hold) => { if (mootSessionRef.current) sendMsg("hold_bots", { hold }); }}
          // THE RITE ENDS IN THE WAR ROOM. The owner: "then it should take you
          // to the WAR ROOM to choose your kingdom rather than muster
          // training." It used to wait for him to LEAVE the fight, which meant
          // the journey's last step was a menu he had to find on his own —
          // and a man who kept playing the solo ring never reached it at all.
          // Same handoff, fired on the rite's own finish.
          onMootDone={() => {
            if (!mootSessionRef.current) return;
            mootSessionRef.current = false;
            // The third act is owed from here — see `tour.mjs`. Written now
            // rather than on his return, because the return is a full page
            // navigation out of `/factions` and this component will not exist
            // to remember anything.
            tourIsDue(browserStore(TOUR_KEY).save);
            leaveRoom(); setMatchResults(null);
            window.location.href = "/factions?oath=first";
          }}
          onClip={(f) => setClipSave(() => f)} />
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
            <div className="text-[10px] font-bold tracking-[0.25em] text-[var(--ink-faint)]">
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
            <div className="mt-2 text-[10px] font-bold tracking-[0.25em] text-[var(--ink-faint)]">
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
            place — and that is ALL this does.

            It used to also `leaveRoom(); setMatchResults(null);
            setScreen("landing")`, reading the owner's "just take them to the
            lobby" as the destination of the SKIP button rather than of the
            match. That threw the player out of the match at the one moment he
            had most reason to stay: the summary below is gated on
            `!replay?.playing`, so ending the replay is already the route to
            it, and clearing `matchResults` on the way past meant a man who
            pressed SKIP never saw his placement, his rounds, his kills, his
            damage, his +XP or his +gold — the whole ledger at
            `MatchSummary`, and the war line with it. A button labelled SKIP
            skips the thing it is drawn over. The two ways out of the match are
            FIGHT AGAIN and LEAVE, and they live on the summary where a player
            can read what he won before he chooses. */}
        {replay?.playing && replay.atEnd && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-end justify-center p-6 pb-10">
            <button
              onClick={() => replay.skip()}
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
            marks={Object.fromEntries(Object.values(roomState.players).map((p) =>
              [p.id, (p as GamePlayer & { appearance?: Appearance }).appearance?.mark]))}
            onSaveClip={clipSave}
            standards={Object.fromEntries(Object.values(roomState.players).map((p) => {
              const ap = (p as GamePlayer & { appearance?: Appearance }).appearance;
              return [p.id, { people: ap?.people, standard: ap?.standard }];
            }))}
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
            // `canEmote` is now the WHOLE answer, pushed by GameCanvas: the
            // stage's `canPerform` once a stage exists, the fight's own
            // dead-man rule before it. This line used to AND the wire's
            // `state !== "dead"` on top, which quietly re-created the two
            // sources of truth the note above is about — and refused a man
            // the podium had stood up, because the wire still called him dead.
            onEmote={canEmote ? sendEmote : undefined}
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
            onLeave={() => {
              leaveRoom(); setMatchResults(null);
              // The First Moot's second act: the fight is behind him, the
              // profile now exists (it is minted at match end — the oath
              // route itself demands one), so the graduate is carried to the
              // kingdoms to swear. Everyone else goes back to the hall.
              if (mootSessionRef.current) {
                mootSessionRef.current = false;
                window.location.href = "/factions?oath=first";
                return;
              }
              setScreen("landing");
            }}
          />
        )}
        {/* Centred on a desktop; on TOUCH it moves to the movement thumb's
            corner and mirrors with the rest of the controls. Centred, it
            straddles the line the touch scheme splits the screen on and leaves
            a 108px-wide patch of "a drag here does nothing" in the free-look
            half — see docs/MOBILE-CONTROLS.md.

            BY POINTER, NOT BY WIDTH. This used to centre at Tailwind's `sm:`
            (>=640px), which asks "is the window wide" when the touch scheme
            asks "is this a thumb". A Z Fold's inner screen is both — 841 CSS px
            wide AND coarse-pointer — and the centred button sat in the
            free-look half eating drags: touchtest at --w 841 --h 757 read 223
            sampled points dead on the aim side, all of them this button, which
            is the owner's playtester's "hit boxes were slightly rough" on that
            exact hardware.

            AND IT IS DECIDED IN `railStyle`, NOT HERE. It was a
            `pointer-fine:left-1/2 -translate-x-1/2` class pair, and when the
            rail landed it started returning an inline `left` — which beats any
            class. The `left:50%` was overridden and the TRANSFORM was not, so
            the button rendered at 12 px and was then pulled half its own width
            further left: END SESSION hung off the left edge of every desktop
            screen, reading "…D SESSION". A rung's position has one owner and
            it is the file that owns the rail. */}
        {/* Sound, over the fight: the one place a player wants it off in a
            hurry is the one place he cannot reach a menu.

            It sits on the MOVEMENT side, under the END button, and that is not
            a taste — touchtest measured 80 sampled points on the free-look side
            that this button swallowed. Free look is a drag anywhere on that
            half of the screen, so anything opaque parked there is a patch of
            dead camera. See docs/MOBILE-CONTROLS.md. */}
        {/* …EXCEPT over the summary. The owner photographed the toggle sitting
            ON the war banner at phone width — the summary's text runs to the
            left edge exactly where the fight parked this button. With results
            up the fight is over, free look with it, so the movement-side
            argument dies and the toggle takes the corner every MENU gives it. */}
        <SoundToggle muted={muted} onToggle={toggleMute}
          style={matchResults && !replay?.playing ? undefined : railStyle("sound", rail, lefty, soloEnd)}
          className={matchResults && !replay?.playing ? "absolute right-3 top-3 z-40" : "z-30"} />
        {roomState?.mode === "solo" && (
          <button
            onClick={() => {
              // A MAN IN THE RITE LEAVES BY THE RITE'S OWN DOOR. END from a
              // First Moot room used to drop him on the testgrounds' spar-setup
              // screen — a configuration form, to a player who has not yet been
              // told what a moot is — and leave the session flag set behind him.
              // The rite's exit is the war room, with the third act armed, and
              // it is the same exit whether he finished or walked out.
              if (mootSessionRef.current) {
                mootSessionRef.current = false;
                tourIsDue(browserStore(TOUR_KEY).save);
                leaveRoom(); setMatchResults(null);
                window.location.href = "/factions?oath=first";
                return;
              }
              leaveRoom(); setScreen("muster");
            }}
            data-snd="back"
            style={railStyle("end", rail, lefty, soloEnd)}
            className="z-30 px-3 py-2 sm:px-5 sm:py-2.5 bg-stone-900/90 hover:bg-red-950 border border-stone-600 hover:border-red-700 rounded-lg text-xs sm:text-sm font-bold tracking-wider text-[#e7dfc9] transition flex items-center gap-2 backdrop-blur"
          >
            {/* The LABEL follows the same rule as the position, from the same
                predicate. It used to be a `pointer-fine:` class pair, which
                asked only about the pointer — so a folded desktop window kept
                the 159 px "END SESSION" in a column laid out for a 96 px
                button and drove it through the graphics pad. */}
            <DoorOpen size={15} /> {endIsWide(rail) ? "END SESSION" : "END"}
          </button>
        )}
      </div>
    );
  }

  // ==================== LOBBY ====================
  if (screen === "lobby" && roomState) {
    const isHost = roomState.hostId === playerId;
    const playersList = Object.values(roomState.players);
    const maxP = roomState.mode === "honour_duel" ? 2 : roomState.mode === "the_burh" ? 4 : 8;
    const botCount = playersList.filter((p) => p.id.startsWith("bot_")).length;

    return (
      <MenuShell art="hall" notice={notice} onDismiss={() => setNotice(null)} muted={muted} onMute={toggleMute}>
        <ContentWrap wide>
          {/* header */}
          <div className="flex flex-col items-center gap-2.5 text-center">
            <LinkPill mode={linkMode} />
            <div className="label-overline">
              {roomState.mode === "honour_duel" ? "HONOUR DUEL" : roomState.mode === "blood_moot" ? "BLOOD MOOT" : roomState.mode === "the_burh" ? "THE BURH" : roomState.mode === "tournament_moot" ? "TOURNAMENT MOOT" : "WAR BAND"}
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
              <GroundLine territory={roomState.territory} friendly={roomState.friendly}
                arena={roomState.arena}
                humans={Object.keys(roomState.players).filter((id) => !id.startsWith("bot_")).length} />
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
              {/* Narrow on phones, on purpose: the fixed sound toggle owns the
                  top-right corner, and this panel can sit at the top of the
                  scroll — the 8.4 sweep caught this line's tail underneath it.
                  A narrower centred measure clears both corners and reads as
                  typesetting rather than as a dodge. */}
              <p className="mx-auto max-w-[17.5rem] text-[11px] leading-relaxed text-[var(--ink-dim)] sm:max-w-none">
                Send this link and they join straight into your war band —
                no code to type, nothing to install.
              </p>
              <div className="link-preview">{shareUrl()}</div>
            </div>
          </div>

          {/* THE FORMAT — the host's, and the server's answer is what is drawn:
              the picker reads roomState, never a local copy, so every man in
              the lobby sees the same format at the same moment. THE BURH has
              no format to pick: the stand IS the format, one continuous
              fight, and the engine forces bestOf 1 — so the card says what
              the mode is instead of offering a dial that does nothing. */}
          <section className="flex flex-col gap-3">
            <h2 className="section-title"><Flag size={12} className="shrink-0" /> THE FORMAT</h2>
            {roomState.mode === "the_burh" ? (
              <div className="card flex items-center gap-3 px-4 py-3">
                <span className="cabochon" />
                <span className="font-display text-sm tracking-wider text-amber-100">ONE STAND</span>
                <span className="text-[11px] text-[var(--ink-dim)]">
                  Waves of the here, each larger and harder. The fallen rise between waves;
                  the stand ends when the whole party is down at once.
                </span>
              </div>
            ) : roomState.mode === "tournament_moot" ? (
              /* Same reasoning as the burh: the BRACKET is the format —
                 every duel one fall, winners advance — and the engine
                 forces bestOf 1, so no dial is offered. */
              <div className="card flex items-center gap-3 px-4 py-3">
                <span className="cabochon" />
                <span className="font-display text-sm tracking-wider text-amber-100">THE BRACKET</span>
                <span className="text-[11px] text-[var(--ink-dim)]">
                  Duels of one fall each; win and advance. Four men or more, and the
                  hall watches every fight it is not in — the final most of all.
                </span>
              </div>
            ) : isHost ? (
              <div className="card flex flex-col gap-3 p-4">
                <RoundPicker
                  value={(roomState.bestOf as BestOf) || DEFAULT_BEST_OF}
                  onChange={(n) => sendMsg("set_rounds", { bestOf: n })}
                />
                <p className="text-[11px] leading-relaxed text-[var(--ink-dim)]">
                  {roundsBlurb(roomState.bestOf || 1, roomState.mode)}
                </p>
              </div>
            ) : (
              <div className="card flex items-center gap-3 px-4 py-3">
                <span className="cabochon" />
                <span className="font-display text-sm tracking-wider text-amber-100">
                  {(roomState.bestOf || 1) > 1 ? `BEST OF ${roomState.bestOf}` : "SINGLE ROUND"}
                </span>
                <span className="text-[11px] text-[var(--ink-dim)]">{roundsBlurb(roomState.bestOf || 1, roomState.mode)}</span>
              </div>
            )}
          </section>

          {/* warriors */}
          <section className="flex flex-col gap-3">
            {/* Stacked on a phone: side by side, the title shrinks under the
                controls and its player count disappears behind the select. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4">
              <h2 className="section-title min-w-0 sm:flex-1"><User size={12} className="shrink-0" /> WARRIORS <span className="tracking-normal text-[var(--ink-faint)]">{playersList.length}/{maxP}</span></h2>
              {/* No AI row in the burh: the waves own every bot, and a lobby
                  offering ADD AI for the mode that spawns its own enemies
                  would be selling a lever wired to nothing. */}
              {isHost && roomState.mode !== "the_burh" && (
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
                    <div className={`medallion ${isBot ? "!text-[var(--ink-dim)]" : ""}`}>
                      {isBot ? <BotMessageSquare size={16} /> : <WIcon size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold">
                        <span className="truncate">{p.name}</span>
                        {/* His mark, exactly as his client declared it — the
                            `appearance.people` trust model, see `marks.mjs`. */}
                        <MarkGlyph id={(p as GamePlayer & { appearance?: Appearance }).appearance?.mark} size={13} className="text-amber-300/90" />
                        {/* His house's standard, on the same trust model. */}
                        <StandardGlyph people={(p as GamePlayer & { appearance?: Appearance }).appearance?.people} id={(p as GamePlayer & { appearance?: Appearance }).appearance?.standard} size={13} className="text-[#f0e4c8]/90" />
                        {p.id === roomState.hostId && <Crown size={13} className="shrink-0 text-amber-400" />}
                        {p.id === playerId && <span className="badge-sky">YOU</span>}
                        {isBot && <span className="badge-stone">AI</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] capitalize text-[var(--ink-dim)]">
                        {p.warriorClass}{(p as GamePlayer & { appearance?: Appearance }).appearance && !isBot ? " · customised" : ""}
                      </div>
                    </div>
                    {roomState.mode === "war_band" && (
                      <div className={`shrink-0 rounded px-2.5 py-1 text-[10px] font-bold tracking-wider ${
                        p.team === "red" ? "bg-red-900/70 text-red-100" : p.team === "blue" ? "bg-sky-900/70 text-sky-100" : "bg-stone-800 text-[var(--ink-dim)]"
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
                  <div className="text-[13px] font-bold text-[var(--ink)]">Waiting for a second warrior</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-[var(--ink-faint)]">
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
            arms={roomState.players[playerId]?.arms}
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
            {/* THE ARMS (7.7b): the selected class's two weapons, the server's
                own choice highlighted — `arms` is replicated sim state, so
                the cards read what the engine holds, never a local copy. The
                class picker above re-arms to the new class's default, which
                these cards then show. */}
            {(() => {
              const myClass = roomState.players[playerId]?.warriorClass;
              if (!myClass) return null;
              const rows = ARMS_LORE[myClass];
              const held = roomState.players[playerId]?.arms ?? rows[0].id;
              return (
                <div className="grid grid-cols-2 gap-3">
                  {rows.map((r) => (
                    <button key={r.id} data-arms={r.id}
                      onClick={() => sendMsg("select_class", { warriorClass: myClass, arms: r.id })}
                      className={`card card-interactive p-3 text-left ${held === r.id ? "card-selected" : ""}`}>
                      <div className="font-display text-[13px] tracking-wider text-amber-100">{r.name}</div>
                      <div className="mt-1 text-[11px] leading-snug text-[var(--ink)]/90">{r.blurb}</div>
                    </button>
                  ))}
                </div>
              );
            })()}
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
            {/* WAR PARTY — backlog 4.7b. A private lobby of two to four IS the
                party (the code was the invite); this is the host taking
                everyone to the public war in one press. Strangers fill the
                remaining seats and the muster starts itself. Hidden outside
                2-4 because the engine refuses those sizes with its own
                sentences and a button that mostly errors is a trap. */}
            {(() => {
              const humans = Object.keys(roomState.players).filter((id) => !id.startsWith("bot_")).length;
              return isHost && !roomState.public && roomState.mode === "blood_moot"
                && humans >= 2 && humans <= 4 && (
                <div className="action-bar-row mb-2">
                  <button data-snd="confirm" onClick={() => sendMsg("war_party")}
                    className="btn-ghost min-w-0 flex-1 whitespace-nowrap !min-h-[3rem] !px-3 !text-[12px] sm:!text-sm !border-amber-600/50">
                    <Flame size={16} className="shrink-0" /> TAKE THE PARTY TO WAR — FIGHT STRANGERS AS {humans}
                  </button>
                </div>
              );
            })()}
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
            {!isHost && <p className="text-center text-xs text-[var(--ink-faint)]">Waiting for host to start the battle...</p>}
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
                <span className="text-[8.5px] font-bold tracking-[0.16em] text-[var(--ink-faint)]">
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
                  {/* `pr-11` below lg: while this bar is STUCK at the top of a
                      phone screen, the fixed sound toggle floats over its
                      top-right corner — the 8.4 sweep photographed the class
                      name half under it. The inset keeps the row's content
                      left of the toggle's ground; desktop pins the panel at
                      top-4 where nothing overlaps. */}
                  <div className="flex items-baseline justify-between gap-3 pr-11 lg:pr-0">
                    <div className="section-title !mb-0"><Eye size={12} className="shrink-0" /> {slot.label.toUpperCase()}</div>
                    <span className="shrink-0 text-[9px] font-bold tracking-[0.14em] text-[var(--ink-faint)]">
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
                        <w.Icon size={13} className={previewClass === w.id ? "text-amber-300" : "text-[var(--ink-dim)]"} />
                        <span className="text-[7.5px] font-bold leading-none tracking-wide text-[var(--ink)]">{w.name}</span>
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

              <p className="text-center text-xs leading-relaxed text-[var(--ink-faint)]">
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
      {/* THE THIRD ACT — see `TourGuide` and `src/game/tour.mjs`. Landing only
          and with no other panel over it: the five doors it names are on this
          screen and nowhere else, and a ring drawn round a button behind a
          modal is a ring round a button nobody can press. Mounted rather than
          gated on a flag here because the module itself answers "is this device
          owed a walk" — a stranger, a veteran and a garbled record all get
          nothing, and only a device the rite marked DUE sees anything at all. */}
      {screen === "landing" && !keysOpen && <TourGuide onDone={() => setNotice(null)} />}
      {screen === "landing" && (
        // Centred as a whole rather than as a stack of centred children, so the
        // title and the controls stay one composition from 390px to 1440px.
        <div className="wrap flex min-h-[calc(100dvh-6rem)] max-w-[34rem] flex-col justify-center gap-8 py-6 sm:gap-10">
          <div className="text-center">
            {/* The owner's winged-helm mark — the game's one binary asset, by
                their explicit instruction. Served from public/brand/, already
                centred on the helm's own symmetry axis. A plain img on
                purpose: next/image would route the game's one static brand
                asset through the optimizer for zero benefit — it is already
                sized, local and above the fold on a page with no other
                images competing for bandwidth. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              /* THE MARK AT THE SIZE IT IS SHOWN. The source is 501x808 and
                 this draws it 128 px tall — 391 KB for 128 px, and on a
                 landing page whose whole payload is 1.66 MB that was near a
                 quarter of everything a first visitor downloaded. The 320 px
                 copy covers this at 2.5x pixel density and costs 93 KB. The
                 full-size original stays where it is: `opengraph-image.tsx`
                 reads it for the social card, which is drawn at 1200x630 and
                 wants every pixel. */
              src="/brand/helm-mark-320.png"
              alt=""
              draggable={false}
              className="mx-auto mb-4 h-24 w-auto select-none sm:h-32"
              style={{
                filter:
                  "drop-shadow(0 0 26px rgba(255,190,80,0.30)) drop-shadow(0 2px 6px rgba(0,0,0,0.85))",
              }}
            />
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
              className="mx-auto mt-5 max-w-[26rem] text-[15px] leading-relaxed text-[#e9dcbb]/95"
              style={{ textShadow: "0 1px 4px black" }}
            >
              Dark Age Britain is at war. Raise a blood moot, send the word, and fight for your kingdom.
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
            {/* THE FIRST MOOT leads for a new arrival — the owner's ruling
                that replaced the campaign: learn the fight, then choose your
                kingdom, one flow. It stops being offered the moment either
                half is behind him (a match played, or the rite done/skipped
                on this device); FIND A FIGHT then takes the lead back. */}
            {mootOffered && (
              <button data-snd="confirm" disabled={busy}
                // ZERO bots, and that is the staging (backlog 8.5, the owner:
                // "the tutorial needs to be staged"): the rite opens on an
                // EMPTY ring, the MOVE beat is learned in peace, and the foe
                // walks in when the rite reaches STRIKE — `onMootFoe` below
                // sends `add_bot` and the engine deals the latecomer a real
                // spawn. Learn to stand before someone is swinging at you.
                onClick={() => { mootSessionRef.current = true; void handleSolo("recruit", 0); }}
                className="btn-primary animate-glow w-full !min-h-[3.75rem] !text-lg">
                <Flame size={20} /> THE FIRST MOOT
              </button>
            )}
            {mootOffered && (
              <p className="-mt-1.5 text-center text-xs text-[rgba(238,226,204,0.6)]">
                Learn the fight. Then choose your kingdom.
              </p>
            )}
            <button data-snd="confirm" data-tour="fight" onClick={handleQuick} disabled={busy}
              className={`${mootOffered ? "btn-ghost" : "btn-primary animate-glow"} w-full !min-h-[3.75rem] !text-lg`}>
              <Swords size={20} /> FIND A FIGHT
            </button>
            <button data-tour="create" onClick={() => setScreen("create")} disabled={busy}
              className="btn-ghost w-full !min-h-[3.75rem] !text-lg">
              <Swords size={20} /> CREATE BATTLE
            </button>
            <button onClick={() => setScreen("join")} disabled={busy}
              className="btn-ghost w-full !min-h-[3.75rem] !text-lg">
              <Users size={20} /> JOIN BATTLE
            </button>
          </div>

          {/* What moved while you were away — draws nothing when the war is
              quiet or unread, so the landing pays no height for a slow wire. */}
          {warDispatch && (
            <div className="mx-auto w-full max-w-[26rem]">
              <Dispatch war={warDispatch.war} mine={warDispatch.mine} seen={warDispatch.seen}
                crownNews={warDispatch.crownNews} />
            </div>
          )}

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
              <button data-tour="training" onClick={() => setScreen("training")} className="mini-nav">
                <Crosshair size={19} className="text-amber-400" />
                <span>Training</span>
                <span className="text-[9px] font-normal text-emerald-400">vs AI</span>
              </button>
              <button data-tour="armoury" onClick={() => openArmoury("landing")} className="mini-nav">
                <Shirt size={19} className="text-amber-400" />
                <span>Armoury</span>
                <span className="text-[9px] font-normal text-[var(--ink-dim)]">customise</span>
              </button>
              <button data-tour="saga" onClick={() => setScreen("profile")} className="mini-nav">
                <Scroll size={19} className="text-amber-400" />
                <span>Saga</span>
                <span className="text-[9px] font-normal text-[var(--ink-dim)]">profile</span>
              </button>
              <button onClick={() => setKeysOpen(true)} className="mini-nav">
                <KeyRound size={19} className="text-amber-400" />
                <span>Keys</span>
                <span className="text-[9px] font-normal text-[var(--ink-dim)]">rebind</span>
              </button>
            </div>

            <div className="card grid grid-cols-3 divide-x divide-stone-100/10 !bg-stone-950/70 py-3">
              {/* The mark rides with the level it was mostly earned by — the
                  landing's one glimpse of it; the picker is on the Saga. */}
              <LandingStat label={getLevelTitle(profile.level)}
                value={<span className="inline-flex items-center gap-1">
                  {myMark !== "none" && <MarkGlyph id={myMark} size={13} className="text-amber-300" />}
                  Lv.{profile.level}
                </span>} />
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
                    <div className="mt-1 text-[11px] leading-relaxed text-[var(--ink)]/90">
                      {carried.gold} gold{carried.unlocks > 0 ? ` and ${carried.unlocks} pieces of kit` : ""} carried
                      onto the war rolls. It is kept for you now — see the Saga for the four words that bring it back.
                    </div>
                  </div>
                </div>
              </button>
            )}
          </div>

          <p className="text-center text-[11px] leading-relaxed text-[var(--ink)]/60" style={{ textShadow: "0 1px 3px black" }}>
            Plays on phones, tablets &amp; desktops.<br />
            {moveKeys} + mouse on desktop · touch controls on mobile.
          </p>
          {/* The build stamp — which commit this device is actually running.
              Exists because a defect was once argued blind against a device on
              a stale deploy; see next.config.ts. Dim on purpose: a serial
              number, not a feature. */}
          <p className="text-center text-[9px] tracking-[0.18em] text-[var(--ink-faint)]/70" style={{ textShadow: "0 1px 3px black" }}>
            BUILD {process.env.NEXT_PUBLIC_BUILD_SHA ?? "unstamped"}
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
            {/* EACH SHAPE SAYS WHAT IT MEANS FOR THE WAR, in its own line.
                The owner: "how does an 8 player FFA score against the war" —
                and if he has to ask, the screen was not saying it. The stakes
                are the engine's real arithmetic (turnout 2 · kill 1 · victory
                12), phrased as what a player DOES: a duel is a challenge whose
                winner carries the day, a moot is a raid where every sworn man
                banks his own deeds, a war band is the shield-walls meeting —
                every man on the winning side banks the victory. */}
            {([
              { id: "honour_duel" as GameMode, name: "HONOUR DUEL", desc: "1v1 single combat. Prove your worth.",
                stake: "A challenge over the border — the victor carries the day for his people.",
                players: "2 players", Icon: Swords, tint: "text-amber-400" },
              { id: "blood_moot" as GameMode, name: "BLOOD MOOT", desc: "Free for all. Last warrior standing.",
                stake: "A raid — every sworn man banks his own deeds; the last one standing banks the victory.",
                players: "2-8 players", Icon: Skull, tint: "text-red-400" },
              { id: "war_band" as GameMode, name: "WAR BAND", desc: "Team battles. Shield-friends together.",
                stake: "Shield-walls meet — every man on the winning side banks the victory. The war's heaviest blows.",
                players: "2v2 · 3v3 · 4v4", Icon: Users, tint: "text-sky-400" },
              { id: "the_burh" as GameMode, name: "THE BURH", desc: "Hold the ground together against waves of the here.",
                stake: "A stand, not a raid — the here banks nothing and takes no ground. Glory is how long you hold.",
                players: "1-4 defenders", Icon: Flame, tint: "text-orange-400" },
              { id: "tournament_moot" as GameMode, name: "TOURNAMENT MOOT", desc: "Bracketed duels. Win and advance; the hall watches the final.",
                stake: "A moot of champions — every duel is one fall, and the bracket crowns one man for his people.",
                players: "4-8 duellists", Icon: Crown, tint: "text-yellow-300" },
            ]).map((mode) => (
              <button key={mode.id}
                onClick={() => setSelectedMode(mode.id)}
                className={`card card-interactive w-full p-4 text-left sm:p-5 ${selectedMode === mode.id ? "card-selected" : ""}`}>
                <div className="flex items-center gap-4">
                  <div className={`medallion !h-12 !w-12 ${mode.tint}`}><mode.Icon size={22} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display tracking-wider text-amber-100">{mode.name}</div>
                    <div className="mt-1 text-[13px] leading-snug text-[var(--ink)]/90">{mode.desc}</div>
                    {!friendlyMoot && (
                      <div className="mt-1 text-[11px] leading-snug text-amber-400/70">{mode.stake}</div>
                    )}
                    <div className="mt-1 text-[11px] tracking-wide text-[var(--ink-faint)]">{mode.players}</div>
                  </div>
                  <ChevronRight size={18} className={`shrink-0 ${selectedMode === mode.id ? "text-amber-400" : "text-[var(--ink-faint)]"}`} />
                </div>
              </button>
            ))}
          </div>

          {/* THE STAKE — the one choice that decides whether the war watches.
              Two cards and not a toggle row, because this is the biggest choice
              on the screen and it reads as two different evenings: fight for
              your people, or fight your friends with nothing on it. Locked at
              creation — the engine refuses to change it once men have joined,
              so nobody discovers mid-lobby that the fight stopped counting. */}
          <section className="flex flex-col gap-3">
            <h2 className="section-title"><Flag size={12} className="shrink-0" /> WHAT IS AT STAKE</h2>
            {warTerritory && !friendlyMoot && (
              <div className="badge-garnet self-start !text-[10px]" data-pinned={warTerritory}>
                RAISED FOR {(territory(warTerritory)?.name ?? warTerritory).toUpperCase()} — THIS ROOM FIGHTS THERE
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button onClick={() => setFriendlyMoot(false)}
                className={`card card-interactive p-4 text-left ${!friendlyMoot ? "card-selected" : ""}`}>
                <div className="font-display text-sm tracking-wider text-amber-100">FOR THE WAR</div>
                <div className="mt-1 text-[12px] leading-snug text-[var(--ink)]/90">
                  The fight is dealt a contested ground. Sworn men bank their deeds to their
                  people&rsquo;s claim on it — win it, and the map remembers.
                </div>
              </button>
              <button onClick={() => { setFriendlyMoot(true); setWarTerritory(null); }}
                className={`card card-interactive p-4 text-left ${friendlyMoot ? "card-selected" : ""}`}>
                <div className="font-display text-sm tracking-wider text-amber-100">A FRIENDLY MOOT</div>
                <div className="mt-1 text-[12px] leading-snug text-[var(--ink)]/90">
                  No ground at stake, nothing banked, no liveries — every man in the kit he
                  bought. For settling things among friends.
                </div>
              </button>
            </div>
            {/* THE ONE ROOM THAT CHOOSES ITS GROUND — the owner, 24 Aug 2026:
                "maybe choice to choose map location for certain scenarios?"
                This is the scenario. A war room never shows this: the map or
                the deal names its ground, because a ground is a people's
                country and naming it is the war's job. The friendly moot has
                nothing at stake, so friends pick where they meet. */}
            {friendlyMoot && (
              <div className="flex flex-col gap-2">
                <div className="label-overline !text-[10px] text-[var(--ink-dim)]">WHERE YOU MEET</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    { id: "saxon_village", name: "The Village", hint: "firelit timber & thatch" },
                    { id: "pict_moor", name: "The Moor", hint: "heather, standing stones" },
                    { id: "roman_fort", name: "The Old Fort", hint: "ruined stone, high ground" },
                    { id: "danelaw_camp", name: "The Winter Camp", hint: "frozen fen, a beached ship" },
                    { id: "offa_dyke", name: "The Dyke", hint: "open march, the great earthwork" },
                  ]).map((g) => (
                    <button key={g.id} onClick={() => setFriendlyGround(g.id)}
                      className={`card card-interactive p-3 text-left ${friendlyGround === g.id ? "card-selected" : ""}`}>
                      <div className="font-display text-[12px] tracking-wider text-amber-100">{g.name}</div>
                      <div className="mt-0.5 text-[10px] leading-snug text-[var(--ink-faint)]">{g.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* One life was the whole match before this control existed. It is
              set here rather than only in the lobby because the host decides
              the shape of the fight at the same moment he decides its mode. */}
          <section className="flex flex-col gap-3">
            <h2 className="section-title"><Flag size={12} className="shrink-0" /> HOW LONG IS THE FIGHT</h2>
            {/* The burh and the tournament OWN their formats — the stand is
                the waves, the moot is the bracket, and the engine forces
                bestOf 1 for both — so the dial is not offered where it would
                be wired to nothing. */}
            {selectedMode === "the_burh" || selectedMode === "tournament_moot" ? (
              <div className="card flex items-center gap-3 px-4 py-3">
                <span className="cabochon" />
                <span className="text-[11px] leading-relaxed text-[var(--ink-dim)]">
                  {selectedMode === "the_burh"
                    ? "One stand: waves of the here until the whole party is down at once."
                    : "The bracket is the format: duels of one fall each, win and advance, one champion."}
                </span>
              </div>
            ) : (
              <div className="card flex flex-col gap-3 p-4">
                <RoundPicker value={bestOf} onChange={setBestOf} />
                <p className="text-[11px] leading-relaxed text-[var(--ink-dim)]">{roundsBlurb(bestOf, selectedMode)}</p>
              </div>
            )}
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
              <p className="text-sm leading-relaxed text-[var(--ink)]">
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
            <p className="text-center text-xs leading-relaxed text-[var(--ink-dim)]">
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
                <p className="text-[13px] leading-relaxed text-[var(--ink)]/90">
                  Sharpen your skills alone against AI warriors. Enemies respawn — fight until you return stronger.
                </p>
              </div>

              <div>
                <button onClick={() => setScreen("muster")} disabled={busy}
                  className="btn-primary w-full whitespace-nowrap !min-h-[3.5rem] !px-3 !text-[13px] sm:!text-[0.95rem]">
                  <Users size={17} className="shrink-0" /> MUSTER THE TESTGROUNDS
                </button>
                <p className="mt-2.5 text-center text-[11px] leading-relaxed text-[var(--ink-dim)]">
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
                      <div className="font-display tracking-wider text-[var(--ink-bright)]">{d.name}</div>
                      <div className="mt-1 text-[11px] leading-snug text-[var(--ink-dim)]">{d.bots} AI · {d.desc}</div>
                    </div>
                    <Swords size={16} className="shrink-0 text-[var(--ink-dim)]" />
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
                      <div className="mt-1 text-xs leading-snug text-[var(--ink-dim)]">{w.desc}</div>
                      <div className="mt-1.5 text-[10px] font-bold tracking-[0.15em] text-purple-300">ABILITY — {s.ability}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-[var(--ink-soft)]">{ABILITY_LORE[w.id]}</div>
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
                  <div className="text-sm font-bold text-[var(--ink-bright)]">HOW MANY</div>
                  <div className="mt-1 text-[11px] leading-snug text-[var(--ink-dim)]">
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
                  <div className="text-sm font-bold text-[var(--ink-bright)]">HOW GOOD</div>
                  <div className="mt-1 text-[11px] text-[var(--ink-dim)]">Every AI in the ring fights at this skill.</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {AI_DIFFICULTIES.map((d) => (
                    <button key={d.id} onClick={() => setSoloDifficulty(d.id)}
                      className={`card card-interactive border-l-4 p-3.5 text-left ${d.tint} ${soloDifficulty === d.id ? "card-selected" : ""}`}>
                      <div className="font-display text-sm tracking-wider text-[var(--ink-bright)]">{d.name}</div>
                      <div className="mt-1 text-[10px] leading-snug text-[var(--ink-dim)]">{d.desc}</div>
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
            <p className="text-center text-xs text-[var(--ink-dim)]">
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
              {/* The roundel is the man's crest, so a chosen mark takes it over
                  from the stock medal — the picker below is where it is won. */}
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-[rgba(217,164,65,0.7)] bg-[radial-gradient(circle_at_50%_24%,rgba(96,78,54,0.85),rgba(16,12,9,0.94)_72%)] shadow-[inset_0_1px_2px_rgba(246,221,160,0.22),0_0_45px_rgba(217,164,65,0.18)]">
                {myMark !== "none"
                  ? <MarkGlyph id={myMark} size={44} className="text-[var(--gilt-lit)]" />
                  : <Medal size={40} className="text-[var(--gilt-lit)]" />}
              </div>
              <div className="screen-head screen-head-center">
                <h1>{playerName || "Unnamed Warrior"}</h1>
              </div>
              <div className="knot-band w-full max-w-[11rem]" />
              <div>
                <div className="label-overline">{getLevelTitle(profile.level)}</div>
                <div className="mt-1.5 text-xs text-[var(--ink-faint)]">Level {profile.level}</div>
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
                <div className="flex justify-between text-[11px] text-[var(--ink-faint)]">
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
            <div className="text-center text-xs leading-relaxed text-[var(--ink-faint)]">
              K/D <span className="tabular-nums">{profile.deaths > 0 ? (profile.kills / profile.deaths).toFixed(2) : profile.kills}</span> · Win rate <span className="tabular-nums">{profile.matches > 0 ? Math.round((profile.wins / profile.matches) * 100) : 0}%</span> · <span className="tabular-nums">{profile.unlocked.length - freeCosmeticIds().length}</span> unlocks earned
            </div>
          </div>

          {/* THE MARK — backlog 5.5. A device a man EARNS and wears beside his
              name in every roster; nothing here is bought, which is why this
              lives on the record screen and not in the armoury. A locked tile
              shows what wins it instead of its name — the hint is the whole of
              what a locked tile has to say. Every device is a real find or is
              labelled an invention in `marks.mjs`, the standard the flags
              (`docs/FACTIONS.md` §6) already hold to. */}
          <div className="flex flex-col gap-4">
            <h2 className="section-title"><Flag size={12} className="shrink-0" /> YOUR MARK</h2>
            <div className="grid grid-cols-5 gap-2">
              {MARKS.map((m) => {
                const earned = markEarned(m, markFacts);
                const chosen = myMark === m.id;
                const isNew = freshMarks.includes(m.id);
                const peeked = markPeek === m.id;
                return (
                  <button key={m.id} data-mark={m.id} data-earned={earned ? "1" : "0"}
                    data-fresh={isNew ? "1" : "0"}
                    /* NOT `disabled` any more, and that is the fix rather than an
                       oversight. A locked tile is the one a player most wants to
                       ask a question of — "why haven't I got that one" — and a
                       disabled button answers nothing on a touch screen, where
                       the `title` tooltip that used to carry the provenance
                       cannot be reached at all. Pressing a locked tile now opens
                       its line below instead of doing nothing. Picking is still
                       refused: `pickMark` re-checks the rule at press time and
                       always did — "the rule module is the law, the button is
                       furniture". */
                    onClick={() => {
                      setMarkPeek(peeked ? null : m.id);
                      // Reading the line IS the acknowledgement — the pip goes
                      // when the question it was asking has been answered.
                      if (isNew) setFreshMarks((prev) => prev.filter((id) => id !== m.id));
                      if (earned) pickMark(m.id);
                    }}
                    aria-pressed={chosen}
                    className={`card relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 !p-1.5 text-center transition ${
                      chosen ? "!border-amber-400/80 !bg-amber-950/40 shadow-[0_0_18px_rgba(217,164,65,0.22)]"
                        : peeked ? "!border-amber-700/70"
                          : earned ? "hover:!border-amber-700/60" : "opacity-55 hover:opacity-80"
                    }`}>
                    {m.d
                      ? <MarkGlyph id={m.id} size={24} className={chosen ? "text-amber-200" : earned ? "text-[var(--ink)]" : "text-[var(--ink-faint)]"} />
                      : <span className={`inline-block h-6 w-6 rounded-full border border-dashed ${chosen ? "border-amber-300" : "border-[var(--ink-faint)]"}`} />}
                    <span className={`text-[8px] font-bold uppercase leading-tight tracking-[0.08em] ${
                      earned ? "text-[var(--ink-dim)]" : "text-[var(--ink-faint)]"
                    }`}>{earned ? m.name : markHint(m)}</span>
                    {!earned && <Lock size={9} className="absolute right-1 top-1 text-[var(--ink-faint)]" />}
                    {chosen && <Check size={10} className="absolute right-1 top-1 text-amber-300" />}
                    {/* The durable half of the herald. The banner is 3.2 seconds
                        and a player who was mid-fight when the rule fell never
                        saw it; this pip waits on the record screen until the
                        tile is pressed. Left, because the right corner is spoken
                        for by the lock and the tick. */}
                    {isNew && !chosen && (
                      <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(217,164,65,0.9)]" />
                    )}
                  </button>
                );
              })}
            </div>
            {/* THE LINE — the owner's "or ability to see why or how you got it
                once unlocked". Locked tiles carried their reason and earned ones
                threw it away; both now say it here, in the tense that fits, with
                the find it is drawn from underneath. It replaces a `title`
                attribute, which no phone has ever shown anyone. */}
            {markPeek ? (
              <div className="card !p-3 text-center">
                <div className="font-display text-[13px] uppercase tracking-[0.14em] text-amber-200">
                  {markOf(markPeek).name}
                </div>
                <div className={`mt-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
                  markEarned(markOf(markPeek), markFacts) ? "text-[var(--ink-dim)]" : "text-[var(--ink-faint)]"
                }`}>
                  {markEarned(markOf(markPeek), markFacts)
                    ? markWon(markOf(markPeek))
                    : `Locked — ${markHint(markOf(markPeek)).replace(/\.$/, "")}.`}
                </div>
                <div className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-faint)]">
                  {markOf(markPeek).source}
                </div>
              </div>
            ) : (
              <div className="text-center text-[11px] leading-relaxed text-[var(--ink-faint)]">
                Worn beside your name in every lobby and ledger. Press a mark to
                see what it is and what it costs — every device is a real find of
                the age, or honestly called an invention.
              </div>
            )}
          </div>

          <TheKeep
            link={link}
            code={profile.recoveryCode ?? ""}
            onRestore={handleRestore}
            onSay={say}
          />

          <Section title="SOUND" icon={<Volume2 size={15} />}>
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs leading-relaxed text-[var(--ink-dim)]">
                {muted
                  ? "The hall is silent. Nothing in this game is told by sound alone."
                  : "Struck metal and low wood, forged as you play."}
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
