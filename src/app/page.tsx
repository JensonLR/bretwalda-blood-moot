"use client";
import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import {
  Swords, Target, Scroll, ArrowLeft, Copy, Share2, Crown,
  Shield, Wind, Sparkles, Check, Lock, Coins, User, Skull,
  Ghost, Flame, Eye, Shirt, ChevronRight, Trophy, Medal, Heart,
  Hammer, Users, DoorOpen, Crosshair, Bot, BotMessageSquare, RadioTower, Minus, Plus,
  Flag, Hourglass, KeyRound, CloudOff, Volume2, VolumeX
} from "lucide-react";
import type {
  GamePlayer, WarriorClass, GameMode, Team, BestOf, RoundResult, RoundScoreBy, MatchEndData,
  EmoteId,
} from "../game/types";
import { WARRIOR_STATS, ARENA_NAMES, getLevelTitle, xpForLevel, ROUND_OPTIONS, DEFAULT_BEST_OF } from "../game/types";
import {
  ARMOURY, freeCosmeticIds, defaultAppearance, migrateAppearance,
  type Appearance, type ArmouryOption,
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
  bindingsAreDefault, hydrateBindings, setBindingsPersister,
} from "../game/client/bindings";
import type { ForgeProgress } from "../game/client/GameCanvas";
import {
  bootProfile, bindWarrior, collectPay, buyKit, syncName, recoverProfile,
  syncBindings, noteBindingsSynced, syncMuted, noteMutedSynced, LEGACY_KEY, type ServerProfile,
} from "./profileLink";
// Statically imported, unlike the canvas: this module builds no AudioContext
// until a gesture and pulls in nothing else, so the landing screen pays a
// couple of kilobytes for it and the FIRST tap on the page is already a sound.
import {
  getAudio, subscribeMuted, getMuted, getServerMuted, type UiSound,
} from "../game/client/render/audio";
import dynamic from "next/dynamic";

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

const WARRIOR_INFO: Array<{ id: WarriorClass; name: string; desc: string; Icon: typeof Swords }> = [
  { id: "huscarl", name: "HUSCARL", desc: "Shield & sword. Unbreakable.", Icon: Shield },
  { id: "warden", name: "WARDEN", desc: "Balanced blade. Reliable.", Icon: Swords },
  { id: "runekeeper", name: "RUNEKEEPER", desc: "Twin daggers. Pure speed.", Icon: Wind },
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
  const [playerName, setPlayerName] = useState("");
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
  const [carried, setCarried] = useState<{ gold: number; unlocks: number } | null>(null);

  const transportRef = useRef<Transport | null>(null);
  const screenRef = useRef(screen); screenRef.current = screen;
  const playerIdRef = useRef(playerId); playerIdRef.current = playerId;
  const profileRef = useRef(profile); profileRef.current = profile;
  const busyRef = useRef(busy); busyRef.current = busy;
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
  const [rematchWaiting, setRematchWaiting] = useState(false);
  // The sign-in, as a promise. Anything that must not guess where the gold
  // lives — a purchase, a payout — waits on this rather than reading a link
  // that has not been settled yet and writing to the wrong ledger.
  const bootRef = useRef<Promise<void> | null>(null);
  // Emote relays from the server, queued for the canvas's frame loop — the
  // only thing that can reach the rigs. Drained there, pushed here.
  const emoteFeedRef = useRef<Array<{ playerId: string; emote: EmoteId }>>([]);
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

  const saveProfile = useCallback((updates: Partial<ProfileData>) => {
    setProfile((prev) => {
      const next = { ...prev, ...updates };
      // Still written in server mode, as a mirror rather than as the store: on
      // the day the free-tier database lapses the game degrades to device-local
      // gold, and it should degrade to the player's real total rather than to
      // whatever he had the week the server came up.
      localStorage.setItem(LEGACY_KEY, JSON.stringify(next));
      profileRef.current = next;
      return next;
    });
  }, []);

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
  const adoptBindings = useCallback((p: ServerProfile | null) => {
    if (p?.bindings && Object.keys(p.bindings).length > 0) {
      noteBindingsSynced(p.bindings);
      if (hydrateBindings(p.bindings)) return;
    }
    const mine = getBindings();
    if (!bindingsAreDefault(mine)) void syncBindings(mine);
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
  }, [adoptServer, settleLink, adoptBindings, audio]);

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
        setRoomState(d);
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
        setRoomState(msg.data as unknown as RoomState);
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
        if (d.players) setRoomState(d);
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
        setRoomState(d);
        if (screenRef.current !== "game" && (d.state === "fighting" || d.state === "last_stand")) setScreen("game");
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
        if (d.players) setRoomState(d);
        break;
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
  }, [adoptServer, tallyLocally, showError, settled, sendMsg]);

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
    sendMsg("create", { name: playerName, mode: selectedMode, bestOf, appearance: profileRef.current.appearance });
  }, [playerName, selectedMode, bestOf, ensureTransport, sendMsg, showError]);

  const handleJoin = useCallback(async () => {
    if (!playerName.trim()) { showError("Enter your warrior name first!"); return; }
    if (!joinCode.trim()) { showError("Enter a room code!"); return; }
    setBusy(true);
    localStorage.setItem("bretwalda_name", playerName);
    void syncName(playerName);
    const ok = await ensureTransport();
    if (!ok) { setBusy(false); return; }
    sendMsg("join", { name: playerName, code: joinCode.toUpperCase(), appearance: profileRef.current.appearance });
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
      // and one carrying none is given the table already on it.
      adoptBindings(reply.value.profile);
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
    if (screen !== "game") { setForge(null); setForgeStalled(false); }
  }, [screen]);

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
          onEmote={sendEmote} emoteFeed={emoteFeedRef} />
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
        {matchResults && roomState && roomState.mode !== "solo" &&
          (roomState.state === "finished" || roomState.state === "lobby") && (
          <MatchSummary
            data={matchResults}
            playerId={playerId}
            payState={payState}
            waiting={rematchWaiting}
            onEmote={roomState.players[playerId]?.state !== "dead" ? sendEmote : undefined}
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

          {/* INVITE — this is the whole reason the lobby exists. A second
              player only ever arrives through this block, so it gets the top
              of the screen, the largest type and the widest target. */}
          <div className="warcode-frame card-noble mx-auto flex w-full max-w-md flex-col gap-4 p-5 sm:p-6">
            <div className="flex flex-col items-center text-center">
              <div className="label-overline">WAR CODE</div>
              <div className="warcode mt-2">{roomCode}</div>
              <div className="knot-band mt-1 w-full max-w-[15rem]" />
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
              <p className="text-[11px] leading-relaxed text-stone-400">
                Paste the link in your group chat — friends open it and join
                instantly, with no code to type.
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

          {/* YOUR WARRIOR — live preview */}
          <WarriorPanel
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
                  <CharacterPreview
                    warriorClass={previewClass}
                    appearance={shown}
                    focusSlot={lensSlot}
                    faceSeed={faceSeed}
                    controls
                    height="clamp(232px, 36vh, 340px)"
                  />
                  {/* class picker for the mannequin */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {WARRIOR_INFO.map((w) => (
                      <button key={w.id} onClick={() => setPreviewClass(w.id)}
                        aria-pressed={previewClass === w.id}
                        className={`card card-interactive flex min-h-[2.5rem] flex-col items-center justify-center gap-0.5 py-1.5 ${previewClass === w.id ? "card-selected" : ""}`}>
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
                    equipped={equippedValue(opt.slot) === opt.value && !staged[opt.slot]}
                    staged={staged[opt.slot]?.value === opt.value}
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
            <label className="label-overline block text-center">YOUR WARRIOR NAME</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.substring(0, 20))}
              placeholder="Enter warrior name..."
              className="input-frame text-center text-lg"
            />
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
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
              <label className="label-overline">WARRIOR NAME</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.substring(0, 20))}
                placeholder="Enter warrior name..."
                className="input-frame text-center text-lg"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="label-overline">WAR CODE</label>
              <input
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
              Got the link in your group chat? Just open it — the code fills in itself.
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
        <ContentWrap>
          <BackButton onClick={() => setScreen("landing")} />

          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-amber-600/70 bg-stone-900 shadow-[0_0_45px_rgba(255,170,50,0.2)]">
              <Medal size={40} className="text-amber-400" />
            </div>
            <h1 className="font-display text-3xl text-white">{playerName || "Unnamed Warrior"}</h1>
            <div>
              <div className="text-sm tracking-[0.25em] text-amber-400">{getLevelTitle(profile.level)}</div>
              <div className="mt-1 text-xs text-stone-500">Level {profile.level}</div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs text-stone-400">
              <span>XP {profile.xp}</span><span>Next: {xpForLevel(profile.level + 1)}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full border border-stone-600/60 bg-stone-800/90">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-300 transition-all"
                style={{ width: `${Math.min(100, (profile.xp / xpForLevel(profile.level + 1)) * 100)}%` }} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <ProfStat Icon={Coins} val={profile.gold} label="Gold" cls="text-yellow-400" />
              <ProfStat Icon={Sparkles} val={profile.honour} label="Honour" cls="text-purple-400" />
              <ProfStat Icon={Trophy} val={profile.wins} label="Victories" cls="text-emerald-400" />
              <ProfStat Icon={Swords} val={profile.matches} label="Battles" cls="text-white" />
              <ProfStat Icon={Skull} val={profile.kills} label="Kills" cls="text-red-400" />
              <ProfStat Icon={Heart} val={profile.deaths} label="Deaths" cls="text-stone-400" />
            </div>
            <div className="text-center text-xs leading-relaxed text-stone-500">
              K/D {profile.deaths > 0 ? (profile.kills / profile.deaths).toFixed(2) : profile.kills} · Win rate {profile.matches > 0 ? Math.round((profile.wins / profile.matches) * 100) : 0}% · {profile.unlocked.length - freeCosmeticIds().length} unlocks earned
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

          <div className="flex flex-col gap-3">
            <button onClick={() => openArmoury("profile")} className="btn-primary w-full !min-h-[3.5rem]">
              <Shirt size={16} /> OPEN THE ARMOURY
            </button>
            <button onClick={() => setScreen("training")} className="btn-ghost w-full !min-h-[3.5rem]">
              <Crosshair size={15} /> ENTER TESTGROUNDS
            </button>
          </div>
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
          {art === "hero" && <div className="embers" />}
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
function WarriorPanel({ warriorClass, appearance, name, note, onCustomise }: {
  warriorClass: WarriorClass; appearance: Appearance; name: string;
  note: string; onCustomise: () => void;
}) {
  return (
    <div className="card card-noble card-glow flex flex-col items-center gap-4 p-5 sm:flex-row sm:gap-6 sm:p-6">
      <div className="w-full sm:w-[42%] sm:shrink-0">
        <CharacterPreview warriorClass={warriorClass} appearance={appearance} height={210} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center sm:items-start sm:text-left">
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
            <label className="label-overline">THE FOUR WORDS</label>
            <input
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

function ClassGrid({ selected, onSelect }: { selected: WarriorClass | undefined; onSelect: (c: WarriorClass) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            <div className="mt-3 flex flex-col gap-1.5">
              <StatBar label="HP" value={stats.maxHealth} max={150} cls="bg-emerald-500" />
              <StatBar label="SPD" value={stats.moveSpeed * 20} max={100} cls="bg-sky-400" />
              <StatBar label="ATK" value={stats.attackDamage * 3} max={84} cls="bg-red-500" />
              <StatBar label="DEF" value={stats.blockReduction * 100} max={80} cls="bg-amber-400" />
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
  return `First ${team ? "war band" : "warrior"} to ${need} round${need === 1 ? "" : "s"} takes the match — so it can end ${need}–0. Kills carry across every round; gold and glory are paid at the end.`;
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
 * bound keys are the desktop's — and it lives on the round-break and summary
 * surfaces rather than the combat HUD: mid-fight both thumbs are spoken for,
 * and a flourish is something you do over a man, not instead of blocking one.
 * The server validates and throttles every press, so these can be plain.
 */
function EmoteRow({ onEmote }: { onEmote: (emote: EmoteId) => void }) {
  const items: Array<{ id: EmoteId; label: string; Icon: typeof Swords }> = [
    { id: "raise", label: "RAISE", Icon: Swords },
    { id: "boss", label: "BOSS", Icon: Shield },
    { id: "taunt", label: "TAUNT", Icon: Flag },
  ];
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

// The breath between rounds. The sim is stopped and the dead are lying where
// they fell, so this is the only thing on screen that moves — hence the count,
// which is also the promise that the match has not simply hung.
function RoundBreak({ roomState, playerId, onEmote }: { roomState: RoomState; playerId: string; onEmote: (emote: EmoteId) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const r = roomState.lastRound;
  const left = Math.max(0, Math.ceil(((roomState.nextRoundAt || 0) - now) / 1000));
  const won = r && !r.draw && (r.winnerId === playerId || (r.winnerTeam && roomState.players[playerId]?.team === r.winnerTeam));

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-6">
      <div className="card card-noble card-glow animate-fadeIn flex w-full max-w-sm flex-col items-center gap-3 p-6 text-center">
        <div className="label-overline">ROUND {r?.index ?? roomState.roundIndex} OF {roomState.bestOf}</div>
        <div className="font-display text-2xl leading-tight text-amber-100" style={{ textShadow: "0 0 26px rgba(217,164,65,0.35)" }}>
          {!r || r.draw ? "NO MAN LEFT STANDING" : won ? "THE ROUND IS YOURS" : `${r.winnerName} TAKES IT`}
        </div>
        <div className="knot-band w-full max-w-[13rem]" />
        <RoundTally roomState={roomState} playerId={playerId} noRound />
        {/* Only a man still standing celebrates — the server refuses the dead,
            so the buttons do not offer what the round did not earn. */}
        {roomState.players[playerId]?.state !== "dead" && <EmoteRow onEmote={onEmote} />}
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-stone-400">
          <Hourglass size={12} className="text-amber-400" />
          NEXT ROUND IN {left}
        </div>
      </div>
    </div>
  );
}

/**
 * The end-of-match summary, over the staged tableau. Rocket League's trick,
 * kept whole: the picture behind this is the GAME — the victor and the wall,
 * or the duel's corpse — so this overlay owns only the top and bottom bands of
 * the screen and leaves the middle to the stage. Designed at 390x844 first:
 * the verdict up top, a compact ledger and the two ways out under the thumb.
 */
function MatchSummary({ data, playerId, payState, waiting, onEmote, onFightAgain, onLeave }: {
  data: MatchEndData;
  playerId: string;
  payState: "none" | "asking" | "paid" | "unpaid";
  waiting: boolean;
  /** Absent when this player is a corpse on the stage — the dead don't jeer. */
  onEmote?: (emote: EmoteId) => void;
  onFightAgain: () => void;
  onLeave: () => void;
}) {
  const mine = data.results.find((r) => r.id === playerId);
  const rows = [...data.results].sort((a, b) => b.score - a.score);
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between p-4 pt-7 sm:p-6">
      <div className="animate-fadeIn flex flex-col items-center gap-1.5 text-center">
        <div className="label-overline">BATTLE COMPLETE</div>
        <h1 className="font-display text-2xl leading-tight text-amber-100 sm:text-4xl"
          style={{ textShadow: "0 2px 24px rgba(0,0,0,0.85), 0 0 30px rgba(255,180,60,0.4)" }}>
          {data.winnerKind === "none" || data.winnerName === "Draw"
            ? "BLOOD SPILT — A DRAW"
            : `${data.winnerName.toUpperCase()} PREVAILS`}
        </h1>
        {/* `isWinner` and not an id match: a war band is won by a side, and
            every man on it won it. */}
        {mine?.isWinner && (
          <div className="font-display animate-pulse text-sm tracking-[0.35em] text-yellow-400"
            style={{ textShadow: "0 2px 14px rgba(0,0,0,0.9)" }}>VICTORY IS YOURS</div>
        )}
        <MatchTally data={data} playerId={playerId} />
      </div>

      <div className="pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-2">
        {/* The flourish, performed live on the tableau behind these numbers.
            The stage shares the fight's rigs, so the press plays mid-portrait. */}
        {onEmote && <EmoteRow onEmote={onEmote} />}
        <div className="card !bg-stone-950/85 flex max-h-[34vh] flex-col gap-1 overflow-y-auto p-2 backdrop-blur">
          {rows.map((r, i) => (
            <div key={r.id} className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 ${
              r.isWinner ? "bg-amber-900/30" : r.id === playerId ? "bg-sky-950/40" : ""
            }`}>
              <div className="font-display w-6 shrink-0 text-lg leading-none text-stone-500">#{i + 1}</div>
              <div className="min-w-0 flex-1">
                <div className={`flex items-center gap-1.5 text-[13px] font-bold leading-tight ${r.isWinner ? "text-amber-200" : "text-stone-100"}`}>
                  <span className="truncate">{r.name}</span>
                  {r.isWinner && <Crown size={12} className="shrink-0 text-amber-400" />}
                </div>
                <div className="text-[10px] leading-tight text-stone-400">{r.kills}K / {r.deaths}D · {Math.round(r.damage)} dmg</div>
              </div>
              <div className="shrink-0 text-right text-[11px] font-bold leading-tight">
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

function StatBar({ label, value, max, cls }: { label: string; value: number; max: number; cls: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[8px] text-stone-500 w-6 font-bold">{label}</span>
      <div className="flex-1 h-1.5 bg-stone-700/80 rounded-full overflow-hidden">
        <div className={`h-full ${cls} rounded-full`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
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

function ProfStat({ Icon, val, label, cls }: { Icon: typeof Swords; val: number; label: string; cls: string }) {
  return (
    <div className="card px-2 py-4 text-center">
      <div className={`text-xl font-bold ${cls} flex items-center justify-center gap-1.5`}><Icon size={15} />{val}</div>
      <div className="text-[10px] text-stone-400 mt-1 tracking-wide">{label}</div>
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
  opt, owned, equipped, staged, affordable, cls, faceSeed, base, onPick,
}: {
  opt: ArmouryOption;
  owned: boolean; equipped: boolean; staged: boolean; affordable: boolean;
  cls: WarriorClass; faceSeed: number; base: Appearance;
  onPick: () => void;
}) {
  const spec = specForOption(cls, faceSeed, base, opt.slot, opt.value);
  const thumb = useCosmeticThumb(spec);
  const tier = costTier(opt.cost);
  const swatch = typeof opt.value === "number"
    ? `#${opt.value.toString(16).padStart(6, "0")}`
    : null;

  return (
    <button
      onClick={onPick}
      aria-pressed={equipped || staged}
      className={`card card-interactive flex flex-col overflow-hidden !p-0 text-left ${
        equipped || staged ? "card-selected" : tier.ring
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
        {equipped && (
          <span className="absolute left-1 top-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-[7.5px] font-bold tracking-[0.12em] text-black">
            EQUIPPED
          </span>
        )}
        {!equipped && staged && (
          <span className="absolute left-1 top-1 rounded bg-amber-400/25 px-1.5 py-0.5 text-[7.5px] font-bold tracking-[0.12em] text-amber-200">
            ON HIM
          </span>
        )}
        {owned && !equipped && !staged && (
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[7.5px] font-bold tracking-[0.12em] text-stone-300">
            OWNED
          </span>
        )}
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
