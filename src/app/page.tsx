"use client";
import React, { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import {
  Swords, Target, Scroll, ArrowLeft, Copy, Share2, Crown,
  Shield, Wind, Sparkles, Check, Lock, Coins, User, Skull,
  Ghost, Flame, Eye, Shirt, ChevronRight, Trophy, Medal, Heart,
  Hammer, Users, DoorOpen, Crosshair, Bot, BotMessageSquare, RadioTower, Minus, Plus,
  Flag, Hourglass
} from "lucide-react";
import type {
  GamePlayer, WarriorClass, GameMode, Team, BestOf, RoundResult, RoundScoreBy, MatchEndData,
} from "../game/types";
import { WARRIOR_STATS, ARENA_NAMES, getLevelTitle, xpForLevel, ROUND_OPTIONS, DEFAULT_BEST_OF } from "../game/types";
import {
  ARMOURY, freeCosmeticIds, defaultAppearance, migrateAppearance, type Appearance,
} from "../game/client/characters";
import { Transport } from "../game/client/transport";
import { getHandedness, getServerHandedness, subscribeHandedness } from "../game/client/input";
import dynamic from "next/dynamic";

const GameCanvas = dynamic(() => import("../game/client/GameCanvas"), { ssr: false });
const CharacterPreview = dynamic(() => import("../game/client/CharacterPreview"), { ssr: false });

type Screen = "landing" | "create" | "join" | "lobby" | "game" | "results" | "training" | "muster" | "profile" | "armoury";

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
}

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
const EDGE_ACTIONS = ["attack", "heavyAttack", "dodge", "ability", "block"] as const;

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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkMode, setLinkMode] = useState<"ws" | "http" | null>(null);
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [copied, setCopied] = useState(false);
  const [armouryTab, setArmouryTab] = useState(0);
  const [staged, setStaged] = useState<Record<string, { id: string; cost: number; slot: string; value: string | number }>>({});
  const [previewClass, setPreviewClass] = useState<WarriorClass>("warden");

  const transportRef = useRef<Transport | null>(null);
  const screenRef = useRef(screen); screenRef.current = screen;
  const playerIdRef = useRef(playerId); playerIdRef.current = playerId;
  const profileRef = useRef(profile); profileRef.current = profile;
  const busyRef = useRef(busy); busyRef.current = busy;
  const lastInputSentRef = useRef(0);
  const heldActionsRef = useRef<Record<string, boolean>>({});
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("bretwalda_name");
    if (saved) setPlayerName(saved);
    const savedProfile = localStorage.getItem("bretwalda_profile");
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        // Migrated on the way in, not on the way out: the armoury decides what is
        // equipped by matching the stored value against the catalog's, so a
        // finish that was re-graded between releases would show as owning nothing
        // and charge the player a second time for kit he already has.
        const merged = { ...DEFAULT_PROFILE, ...parsed, unlocked: parsed.unlocked ?? freeCosmeticIds() };
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
  }, []);

  const saveProfile = useCallback((updates: Partial<ProfileData>) => {
    setProfile((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem("bretwalda_profile", JSON.stringify(next));
      profileRef.current = next;
      return next;
    });
  }, []);

  const showError = useCallback((msg: string) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(""), 4000);
  }, []);

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
        if ((msg.data as { state?: string })?.state === "lobby" && screenRef.current === "results") setScreen("lobby");
        break;
      }
      case "countdown": {
        const d = msg.data as unknown as RoomState;
        if (d.players) setRoomState(d);
        else setRoomState((prev) => prev ? { ...prev, state: "countdown", countdown: (msg.data?.countdown as number) || 0 } : prev);
        setBusy(false);
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
        if (myResult) {
          const p = profileRef.current;
          const xpNew = p.xp + myResult.xpEarned;
          saveProfile({
            kills: p.kills + myResult.kills, deaths: p.deaths + myResult.deaths,
            matches: p.matches + 1, wins: p.wins + (myResult.isWinner ? 1 : 0),
            honour: p.honour + (myResult.isWinner ? 12 : 3) + myResult.kills * 2,
            xp: xpNew, gold: p.gold + myResult.goldEarned,
            level: Math.max(p.level, Math.floor(1 + Math.sqrt(xpNew / 100))),
          });
        }
        setTimeout(() => setScreen("results"), 2200);
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
  }, [saveProfile, showError]);

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
    const ok = await ensureTransport();
    if (!ok) { setBusy(false); return; }
    sendMsg("create", { name: playerName, mode: selectedMode, bestOf, appearance: profileRef.current.appearance });
  }, [playerName, selectedMode, bestOf, ensureTransport, sendMsg, showError]);

  const handleJoin = useCallback(async () => {
    if (!playerName.trim()) { showError("Enter your warrior name first!"); return; }
    if (!joinCode.trim()) { showError("Enter a room code!"); return; }
    setBusy(true);
    localStorage.setItem("bretwalda_name", playerName);
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

  const stagedCost = useCallback(() => {
    let total = 0;
    for (const slot of Object.keys(staged)) {
      const s = staged[slot];
      // if already equipped, skip; if owned, free
      const cur = equippedValue(slot);
      if (cur === s.value) continue;
      if (!profile.unlocked.includes(s.id)) total += s.cost;
    }
    return total;
  }, [staged, equippedValue, profile.unlocked]);

  const hasChanges = Object.keys(staged).some((s) => equippedValue(s) !== staged[s].value);

  const stageItem = useCallback((opt: { id: string; cost: number; slot: string; value: string | number }) => {
    setStaged((prev) => ({ ...prev, [opt.slot]: { ...opt } }));
  }, []);

  const clearStaged = useCallback(() => setStaged({}), []);

  const applyStaged = useCallback(() => {
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
    if (prevScreen === "lobby" || screenRef.current === "lobby") {
      sendMsg("set_appearance", { appearance: ap });
    }
    setStaged({});
  }, [staged, stagedCost, saveProfile, sendMsg, prevScreen, showError]);

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

  // ==================== GAME ====================
  if (screen === "game") {
    return (
      <div className="fixed inset-0 bg-black">
        <GameCanvas playerId={playerId} roomState={roomState} onSendInput={handleSendInput} />
        {/* The score of the match, over the fight. A best-of is worth nothing
            if a player cannot see where he stands in it, and the HUD proper
            only knows about this round. Sits below the health bar the HUD
            owns, and never takes a pointer event off the controls. */}
        {roomState && roomState.mode !== "solo" && (roomState.bestOf ?? 1) > 1 && roomState.state !== "lobby" && (
          <div className="pointer-events-none absolute left-1/2 top-[4.6rem] z-20 -translate-x-1/2">
            <RoundTally roomState={roomState} playerId={playerId} />
          </div>
        )}
        {roomState?.state === "intermission" && <RoundBreak roomState={roomState} playerId={playerId} />}
        {/* Centred on a desktop; on a phone it moves to the movement thumb's
            corner and mirrors with the rest of the controls. Centred, it
            straddles the line the touch scheme splits the screen on and leaves
            a 108px-wide patch of "a drag here does nothing" in the free-look
            half — see docs/MOBILE-CONTROLS.md. The short label is what lets it
            clear the split outright rather than nearly. */}
        {roomState?.mode === "solo" && (
          <button
            onClick={() => { leaveRoom(); setScreen("muster"); }}
            className={`absolute top-3 ${lefty ? "right-3" : "left-3"} sm:left-1/2 sm:right-auto sm:-translate-x-1/2 mt-16 z-30 px-3 py-2 sm:px-5 sm:py-2.5 bg-stone-900/90 hover:bg-red-950 border border-stone-600 hover:border-red-700 rounded-lg text-xs sm:text-sm font-bold tracking-wider text-stone-200 transition flex items-center gap-2 backdrop-blur`}
          >
            <DoorOpen size={15} /> <span className="sm:hidden">END</span><span className="hidden sm:inline">END SESSION</span>
          </button>
        )}
      </div>
    );
  }

  // ==================== RESULTS ====================
  if (screen === "results" && matchResults) {
    const mine = matchResults.results.find((r) => r.id === playerId);
    return (
      <MenuShell art="hall">
        <ContentWrap>
          <div className="card card-noble card-glow flex flex-col items-center gap-3 p-5 text-center sm:p-6">
            <Trophy className="text-amber-400" size={40} />
            <div className="label-overline">BATTLE COMPLETE</div>
            <h1 className="font-display text-2xl text-amber-100 sm:text-4xl" style={{ textShadow: "0 0 30px rgba(255,180,60,0.4)" }}>
              {matchResults.winnerKind === "none" || matchResults.winnerName === "Draw"
                ? "BLOOD SPILT — A DRAW"
                : `${matchResults.winnerName} PREVAILS`}
            </h1>
            {/* `isWinner` and not an id match: a war band is won by a side, and
                every man on it won it. */}
            {mine?.isWinner && (
              <div className="font-display animate-pulse text-sm tracking-[0.35em] text-yellow-400">VICTORY IS YOURS</div>
            )}
            <div className="knot-band w-full max-w-xs" />
            <MatchTally data={matchResults} playerId={playerId} />
          </div>

          <div className="flex flex-col gap-2.5">
            {[...matchResults.results].sort((a, b) => b.score - a.score).map((r, i) => (
              <div key={r.id} className={`card flex items-center gap-3.5 px-4 py-3.5 ${
                r.isWinner ? "!border-amber-500/70 !bg-amber-900/25" : r.id === playerId ? "!border-sky-600/60 !bg-sky-950/30" : ""
              }`}>
                <div className="font-display w-8 shrink-0 text-2xl text-stone-500">#{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className={`flex items-center gap-2 font-bold ${r.isWinner ? "text-amber-200" : "text-stone-100"}`}>
                    <span className="truncate">{r.name}</span> {r.isWinner && <Crown size={14} className="shrink-0 text-amber-400" />}
                  </div>
                  <div className="mt-0.5 text-xs text-stone-400">{r.kills}K / {r.deaths}D · {Math.round(r.damage)} damage</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold text-amber-300">+{r.xpEarned} XP</div>
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-xs text-yellow-500"><Coins size={10} />+{r.goldEarned}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Both labels stay on one line at 390px: "BACK TO / LOBBY" over two
              rows makes the pair look like different-sized buttons. */}
          <div className="flex gap-3">
            <button onClick={() => setScreen("lobby")} className="btn-primary min-w-0 flex-1 whitespace-nowrap !min-h-[3.5rem] !px-3 !text-[13px] sm:!text-sm">BACK TO LOBBY</button>
            <button onClick={() => { leaveRoom(); setScreen("landing"); }} className="btn-ghost min-w-0 flex-1 whitespace-nowrap !min-h-[3.5rem] !px-3 !text-[13px] sm:!text-sm">LEAVE</button>
          </div>
        </ContentWrap>
      </MenuShell>
    );
  }

  // ==================== LOBBY ====================
  if (screen === "lobby" && roomState) {
    const isHost = roomState.hostId === playerId;
    const playersList = Object.values(roomState.players);
    const maxP = roomState.mode === "honour_duel" ? 2 : 8;
    const botCount = playersList.filter((p) => p.id.startsWith("bot_")).length;

    return (
      <MenuShell art="hall">
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
              <button onClick={() => sendMsg("ready")}
                className={`min-w-0 flex-1 whitespace-nowrap !min-h-[3.5rem] !px-3 !text-[13px] sm:!text-base ${
                  roomState.players[playerId]?.ready
                    ? "btn-primary !border-emerald-400/60 !bg-emerald-700 !shadow-[0_0_28px_rgba(16,150,90,0.45)]"
                    : "btn-ghost"
                }`}>
                {roomState.players[playerId]?.ready ? "READY — SKAL!" : "READY UP"}
              </button>
              {isHost && (
                <button onClick={() => sendMsg("start")} className="btn-primary min-w-0 flex-1 whitespace-nowrap !min-h-[3.5rem] !px-3 !text-[13px] sm:!text-base">
                  <Swords size={18} className="shrink-0" /> START
                </button>
              )}
              <button onClick={() => { leaveRoom(); setScreen("landing"); }} aria-label="Leave room" className="btn-danger shrink-0 !px-3">
                <ArrowLeft size={18} />
              </button>
            </div>
            {!isHost && <p className="text-center text-xs text-stone-500">Waiting for host to start the battle...</p>}
          </div>
        </ContentWrap>
      </MenuShell>
    );
  }

  // ==================== ARMOURY (with live try-on mannequin) ====================
  if (screen === "armoury") {
    const slot = ARMOURY[armouryTab];
    const cost = stagedCost();
    return (
      <MenuShell>
        <ContentWrap wide>
          <ScreenHead
            onBack={() => { clearStaged(); setScreen(prevScreen); }}
            title="THE ARMOURY"
            lede="Try everything on before you buy. Gold is earned in battle — never bought."
            aside={
              <div className="card flex shrink-0 items-center gap-2.5 !border-yellow-600/50 px-4 py-2.5">
                <Coins size={17} className="text-yellow-500" />
                <span className="text-xl font-bold text-yellow-400">{profile.gold}</span>
              </div>
            }
          />

          <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
            {/* ===== TRY-ON MANNEQUIN ===== */}
            <div className="lg:w-[42%] lg:shrink-0">
              <div className="card card-glow flex flex-col gap-3 p-4 lg:sticky lg:top-4">
                <div className="section-title"><Eye size={12} className="shrink-0" /> PREVIEW — TRY IT ON</div>
                <CharacterPreview warriorClass={previewClass} appearance={previewAppearance()} height={320} />
                {/* class picker for the mannequin */}
                <div className="grid grid-cols-4 gap-2">
                  {WARRIOR_INFO.map((w) => (
                    <button key={w.id} onClick={() => setPreviewClass(w.id)}
                      className={`card card-interactive flex flex-col items-center justify-center gap-1 py-2 ${previewClass === w.id ? "card-selected" : ""}`}>
                      <w.Icon size={15} className={previewClass === w.id ? "text-amber-300" : "text-stone-400"} />
                      {/* Full name, not a 5-char slice: "HUSCA / WARDE / RUNEK / BERSE"
                          read as truncation bugs, and the chip is wide enough for
                          the longest of them at this size. */}
                      <span className="text-[8px] font-bold leading-none tracking-wide text-stone-300">{w.name}</span>
                    </button>
                  ))}
                </div>
                {/* staged action bar */}
                {hasChanges && (
                  <div className="animate-fadeIn flex flex-col gap-2.5 border-t border-stone-100/10 pt-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] tracking-widest text-stone-400">COST TO UNLOCK</div>
                      <div className={`flex items-center gap-1.5 text-lg font-bold ${profile.gold >= cost ? "text-yellow-400" : "text-red-400"}`}>
                        <Coins size={14} /> {cost}
                      </div>
                    </div>
                    <div className="flex gap-2.5">
                      <button onClick={applyStaged} className="btn-primary flex-1 !min-h-[3rem] !text-sm">
                        <Check size={15} /> EQUIP{cost > 0 ? " & BUY" : ""}
                      </button>
                      <button onClick={clearStaged} aria-label="Discard try-on" className="btn-ghost !px-4">
                        <ArrowLeft size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ===== ITEMS ===== */}
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="tab-strip">
                {ARMOURY.map((s, i) => (
                  <button key={s.slot} onClick={() => setArmouryTab(i)} className={`tab-item ${armouryTab === i ? "tab-item-active" : ""}`}>
                    {s.label.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {slot.options.map((opt) => {
                  const owned = isUnlocked(opt.id);
                  const equipped = equippedValue(opt.slot) === opt.value && !staged[opt.slot];
                  const stagedNow = staged[opt.slot]?.value === opt.value;
                  const affordable = profile.gold >= opt.cost;
                  return (
                    <button key={opt.id} onClick={() => stageItem(opt)}
                      className={`card card-interactive flex min-h-[4rem] items-center gap-3.5 p-3 text-left ${
                        equipped || stagedNow ? "card-selected" : !owned && !affordable ? "opacity-70" : ""
                      }`}>
                      {typeof opt.value === "number" ? (
                        <div className="h-10 w-10 shrink-0 rounded-full border-2 border-stone-500 shadow-inner"
                          style={{ backgroundColor: `#${opt.value.toString(16).padStart(6, "0")}` }} />
                      ) : (
                        <div className="medallion !h-10 !w-10 shrink-0">
                          {opt.slot === "helm" ? <Shield size={15} /> :
                            opt.slot === "cloak" ? <Shirt size={15} /> :
                            opt.slot === "warPaint" ? <Eye size={15} /> :
                            opt.slot === "beard" ? <Ghost size={15} /> : <User size={15} />}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        {/* Two lines, not one with an ellipsis: the most
                            expensive helm in the game was rendering as
                            "The Sutton Hoo H…". */}
                        <div className="line-clamp-2 text-sm font-bold leading-snug text-stone-100">{opt.label}</div>
                        <div className="mt-0.5 text-[10px] text-stone-400">
                          {equipped ? "EQUIPPED" : stagedNow ? "ON MANNEQUIN — equip above" : owned ? "Owned — tap to preview" : opt.cost === 0 ? "Free" : `${opt.cost} gold`}
                        </div>
                      </div>
                      {equipped ? <Check size={16} className="shrink-0 text-amber-400" /> :
                        stagedNow ? <Eye size={15} className="shrink-0 text-amber-400" /> :
                        !owned && (affordable ? <Coins size={14} className="shrink-0 text-yellow-500" /> : <Lock size={14} className="shrink-0 text-stone-500" />)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="text-center text-xs leading-relaxed text-stone-500">
            Tapping items dresses the mannequin. Only press EQUIP &amp; BUY when you love the look — nothing is charged until then.
          </p>
        </ContentWrap>
      </MenuShell>
    );
  }

  // ==================== MENUS ====================
  return (
    <MenuShell art={screen === "landing" ? "hero" : "hall"}>
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%]">
          <div className="card !border-red-600/70 !bg-red-950/85 backdrop-blur px-5 py-3 text-center text-red-200 text-sm font-bold shadow-2xl animate-fadeIn">
            {error}
          </div>
        </div>
      )}

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
            <div className="grid grid-cols-3 gap-2.5">
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
            </div>

            <div className="card grid grid-cols-3 divide-x divide-stone-100/10 !bg-stone-950/70 py-3">
              <LandingStat value={`Lv.${profile.level}`} label={getLevelTitle(profile.level)} />
              <LandingStat value={String(profile.gold)} label="GOLD" cls="text-yellow-400" />
              <LandingStat value={String(profile.wins)} label="VICTORIES" cls="text-emerald-400" />
            </div>
          </div>

          <p className="text-center text-[11px] leading-relaxed text-stone-300/60" style={{ textShadow: "0 1px 3px black" }}>
            Plays on phones, tablets &amp; desktops.<br />
            WASD + mouse on desktop · touch controls on mobile.
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

          <button onClick={handleCreate} disabled={busy} className="btn-primary w-full !min-h-[3.75rem] !text-lg">
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
            <button onClick={handleJoin} disabled={busy} className="btn-primary w-full !min-h-[3.75rem] !text-lg">
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
            <Section title="DESKTOP CONTROLS" icon={<Swords size={14} />}>
              <CtrlRow k="WASD" d="Move" />
              <CtrlRow k="Mouse" d="Camera (over-shoulder)" />
              <CtrlRow k="Left Click" d="Attack — direction follows movement keys" />
              <CtrlRow k="E / V" d="Heavy attack — breaks blocks" />
              <CtrlRow k="Right Click" d="Block (hold); perfect timing = parry" />
              <CtrlRow k="Space" d="Dodge roll — brief invincibility" />
              <CtrlRow k="Shift" d="Sprint" />
              <CtrlRow k="Q" d="Class ability" />
            </Section>

            <Section title="MOBILE CONTROLS" icon={<Target size={14} />}>
              <CtrlRow k="Left stick" d="Move; direction picks attack angle" />
              <CtrlRow k="Swipe upper" d="Camera" />
              <CtrlRow k="SLASH / HEAVY" d="Attack buttons" />
              <CtrlRow k="BLOCK" d="Hold to block; catch the instant to parry" />
              <CtrlRow k="DODGE / RUN" d="Dodge roll / sprint" />
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
              <button onClick={() => handleSolo()} disabled={busy}
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
function MenuShell({ children, art = "hall" }: { children: React.ReactNode; art?: "hero" | "hall" | "none" }) {
  return (
    <div className="shell">
      {art !== "none" && (
        <div className={`backdrop ${art === "hero" ? "backdrop-hero" : "backdrop-hall"}`}>
          {art === "hero" && <div className="embers" />}
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

// The breath between rounds. The sim is stopped and the dead are lying where
// they fell, so this is the only thing on screen that moves — hence the count,
// which is also the promise that the match has not simply hung.
function RoundBreak({ roomState, playerId }: { roomState: RoomState; playerId: string }) {
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
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-stone-400">
          <Hourglass size={12} className="text-amber-400" />
          NEXT ROUND IN {left}
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

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn-back">
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
