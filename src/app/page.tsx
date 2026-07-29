"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Swords, Target, Scroll, ArrowLeft, Copy, Share2, Crown,
  Shield, Wind, Sparkles, Check, Lock, Coins, User, Skull,
  Ghost, Flame, Eye, Shirt, ChevronRight, Trophy, Medal, Heart,
  Hammer, Users, DoorOpen, Crosshair, Bot, BotMessageSquare, RadioTower, Minus, Plus
} from "lucide-react";
import type { GamePlayer, WarriorClass, GameMode, Team } from "../game/types";
import { WARRIOR_STATS, ARENA_NAMES, getLevelTitle, xpForLevel } from "../game/types";
import {
  ARMOURY, freeCosmeticIds, defaultAppearance, type Appearance,
} from "../game/client/characters";
import { Transport } from "../game/client/transport";
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
}

interface MatchResults {
  winnerId: string | null; winnerName: string;
  results: Array<{
    id: string; name: string; kills: number; deaths: number;
    damage: number; score: number; isWinner: boolean;
    xpEarned: number; goldEarned: number;
  }>;
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
const MIN_AI = 1;
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
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [matchResults, setMatchResults] = useState<MatchResults | null>(null);
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
        setProfile({ ...DEFAULT_PROFILE, ...parsed, unlocked: parsed.unlocked ?? freeCosmeticIds() });
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
      case "match_end": {
        const d = msg.data as unknown as MatchResults;
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
    sendMsg("create", { name: playerName, mode: selectedMode, appearance: profileRef.current.appearance });
  }, [playerName, selectedMode, ensureTransport, sendMsg, showError]);

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

  // ==================== GAME ====================
  if (screen === "game") {
    return (
      <div className="fixed inset-0 bg-black">
        <GameCanvas playerId={playerId} roomState={roomState} onSendInput={handleSendInput} />
        {roomState?.mode === "solo" && (
          <button
            onClick={() => { leaveRoom(); setScreen("muster"); }}
            className="absolute top-3 left-1/2 -translate-x-1/2 mt-16 z-30 px-5 py-2.5 bg-stone-900/90 hover:bg-red-950 border border-stone-600 hover:border-red-700 rounded-lg text-sm font-bold tracking-wider text-stone-200 transition flex items-center gap-2 backdrop-blur"
          >
            <DoorOpen size={15} /> END SESSION
          </button>
        )}
      </div>
    );
  }

  // ==================== RESULTS ====================
  if (screen === "results" && matchResults) {
    return (
      <MenuShell art="hall">
        <ContentWrap>
          <div className="text-center mb-8">
            <Trophy className="text-amber-400 mx-auto mb-4" size={44} />
            <div className="label-overline mb-2">BATTLE COMPLETE</div>
            <h1 className="font-display text-3xl sm:text-4xl text-amber-100" style={{ textShadow: "0 0 30px rgba(255,180,60,0.4)" }}>
              {matchResults.winnerName === "Draw" ? "BLOOD SPILT — A DRAW" : `${matchResults.winnerName} PREVAILS`}
            </h1>
            {matchResults.winnerId === playerId && (
              <div className="text-yellow-400 animate-pulse tracking-[0.35em] mt-2.5 text-sm font-display">VICTORY IS YOURS</div>
            )}
          </div>

          <div className="space-y-3.5 mb-8">
            {matchResults.results.sort((a, b) => b.score - a.score).map((r, i) => (
              <div key={r.id} className={`card flex items-center gap-4 px-5 py-4 ${
                r.isWinner ? "!border-amber-500/70 !bg-amber-900/25" : r.id === playerId ? "!border-sky-600/60 !bg-sky-950/30" : ""
              }`}>
                <div className="font-display text-2xl text-stone-500 w-9">#{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className={`font-bold flex items-center gap-2 truncate ${r.isWinner ? "text-amber-200" : "text-stone-100"}`}>
                    {r.name} {r.isWinner && <Crown size={14} className="text-amber-400 shrink-0" />}
                  </div>
                  <div className="text-xs text-stone-400 mt-0.5">{r.kills}K / {r.deaths}D · {Math.round(r.damage)} damage</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-amber-300 text-sm font-bold">+{r.xpEarned} XP</div>
                  <div className="text-yellow-500 text-xs flex items-center gap-1 justify-end mt-0.5"><Coins size={10} />+{r.goldEarned}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setScreen("lobby")} className="btn-primary flex-1">BACK TO LOBBY</button>
            <button onClick={() => { leaveRoom(); setScreen("landing"); }} className="btn-ghost flex-1">LEAVE</button>
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
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2.5">
              <LinkPill mode={linkMode} />
            </div>
            <div className="label-overline mb-2.5">
              {roomState.mode === "honour_duel" ? "HONOUR DUEL" : roomState.mode === "blood_moot" ? "BLOOD MOOT" : "WAR BAND"}
            </div>
            <h1 className="font-display text-3xl text-amber-100 tracking-wider mb-6" style={{ textShadow: "0 0 24px rgba(255,180,60,0.3)" }}>
              {ARENA_NAMES[roomState.arena as keyof typeof ARENA_NAMES] || roomState.arena}
            </h1>
            {/* INVITE — the cornerstone: caption + one-tap actions */}
            <div className="card card-glow max-w-md mx-auto px-6 py-5 mb-3">
              <div className="label-overline !text-[9px] mb-2">WAR CODE</div>
              <div className="font-mono text-4xl font-bold text-amber-300 tracking-[0.3em] mb-4" style={{ textShadow: "0 0 22px rgba(255,190,70,0.5)" }}>{roomCode}</div>
              <div className="flex gap-2 justify-center flex-wrap">
                <button onClick={handleCopyLink} className="btn-primary !py-2.5 !px-5 text-sm flex items-center gap-2">
                  {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "LINK COPIED!" : "COPY INVITE LINK"}
                </button>
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <button onClick={handleShare} className="btn-info !py-2.5 !px-5 text-sm flex items-center gap-2">
                    <Share2 size={15} /> SHARE
                  </button>
                )}
              </div>
              <div className="text-[11px] text-stone-400 mt-3.5 leading-relaxed">
                Tap <span className="text-amber-300 font-bold">COPY INVITE LINK</span> and paste it in your group chat —<br />
                friends open it and join instantly, no code typing.
              </div>
              <div className="mt-2.5 text-[10px] font-mono text-stone-500 break-all px-2">{shareUrl()}</div>
            </div>
          </div>

          {/* warriors */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="section-title"><User size={12} /> WARRIORS <span className="text-stone-500 normal-case tracking-normal">{playersList.length}/{maxP}</span></h2>
              {isHost && (
                <div className="flex items-center gap-2">
                  <select
                    value={botDifficulty}
                    onChange={(e) => setBotDifficulty(e.target.value as "recruit" | "warrior" | "jarl")}
                    className="bg-stone-900 text-stone-300 text-xs border border-stone-600 rounded-md px-2 py-1.5 focus:outline-none focus:border-amber-600"
                  >
                    <option value="recruit">AI: Recruit</option>
                    <option value="warrior">AI: Warrior</option>
                    <option value="jarl">AI: Jarl</option>
                  </select>
                  <button onClick={() => sendMsg("add_bot", { difficulty: botDifficulty })}
                    className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1.5">
                    <Bot size={13} /> ADD AI
                  </button>
                  {botCount > 0 && (
                    <button onClick={() => sendMsg("remove_bot")}
                      className="btn-ghost !py-1.5 !px-3 text-xs flex items-center gap-1.5">
                      <Minus size={13} /> REMOVE
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3">
              {playersList.map((p) => {
                const info = WARRIOR_INFO.find((w) => w.id === p.warriorClass);
                const WIcon = info?.Icon ?? Swords;
                const isBot = p.id.startsWith("bot_");
                return (
                  <div key={p.id} className={`card flex items-center gap-4 px-4 py-3.5 ${p.ready ? "!border-emerald-700/50 !bg-emerald-950/25" : ""}`}>
                    <div className={`medallion ${isBot ? "!text-stone-400" : ""}`}>
                      {isBot ? <BotMessageSquare size={16} /> : <WIcon size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold flex items-center gap-2 flex-wrap">
                        <span className="truncate">{p.name}</span>
                        {p.id === roomState.hostId && <Crown size={13} className="text-amber-400 shrink-0" />}
                        {p.id === playerId && <span className="badge-sky">YOU</span>}
                        {isBot && <span className="badge-stone">AI</span>}
                      </div>
                      <div className="text-[11px] text-stone-400 capitalize mt-0.5">
                        {p.warriorClass}{(p as GamePlayer & { appearance?: Appearance }).appearance && !isBot ? " · customised" : ""}
                      </div>
                    </div>
                    {roomState.mode === "war_band" && (
                      <div className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wider ${
                        p.team === "red" ? "bg-red-900/70 text-red-100" : p.team === "blue" ? "bg-sky-900/70 text-sky-100" : "bg-stone-800 text-stone-400"
                      }`}>{p.team === "none" ? "NO TEAM" : p.team.toUpperCase()}</div>
                    )}
                    <div className={`w-3.5 h-3.5 rounded-full border-2 ${p.ready ? "bg-emerald-400 border-emerald-300" : "bg-stone-700 border-stone-600"}`} />
                  </div>
                );
              })}
            </div>
          </section>

          {/* YOUR WARRIOR — live preview */}
          <section className="mb-10">
            <div className="card card-glow p-4 flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-[46%]">
                <CharacterPreview
                  warriorClass={roomState.players[playerId]?.warriorClass ?? "warden"}
                  appearance={profile.appearance}
                  height={200}
                />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <div className="label-overline mb-1.5">YOUR WARRIOR</div>
                <div className="font-display text-2xl text-amber-100">{playerName || "Warrior"}</div>
                <div className="text-sm text-stone-300 capitalize mt-0.5">{roomState.players[playerId]?.warriorClass ?? "warden"}</div>
                <p className="text-xs text-stone-400 mt-2 leading-relaxed">
                  This is exactly how you appear to everyone in battle — armour, helm, cloak and paint.
                </p>
                <button onClick={() => openArmoury("lobby")} className="btn-primary !py-2.5 !px-5 text-sm mt-3.5 inline-flex items-center gap-2">
                  <Shirt size={15} /> CUSTOMISE
                </button>
              </div>
            </div>
          </section>

          {/* class select */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="section-title"><Swords size={12} /> CHOOSE WARRIOR</h2>
              <button onClick={() => openArmoury("lobby")} className="text-amber-400 hover:text-amber-300 text-xs font-bold flex items-center gap-1.5 transition">
                <Shirt size={13} /> EDIT APPEARANCE <ChevronRight size={12} />
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {WARRIOR_INFO.map((w) => {
                const stats = WARRIOR_STATS[w.id];
                const isSel = roomState.players[playerId]?.warriorClass === w.id;
                const WIcon = w.Icon;
                return (
                  <button key={w.id}
                    onClick={() => sendMsg("select_class", { warriorClass: w.id })}
                    className={`card card-interactive p-4 text-left ${isSel ? "card-selected" : ""}`}>
                    <div className={`medallion mb-2.5 ${isSel ? "!border-amber-500 !text-amber-300" : ""}`}><WIcon size={17} /></div>
                    <div className="font-display text-sm text-amber-100 tracking-wider">{w.name}</div>
                    <div className="text-[10px] text-stone-400 mt-1 leading-snug">{w.desc}</div>
                    <div className="mt-3 space-y-1.5">
                      <StatBar label="HP" value={stats.maxHealth} max={150} cls="bg-emerald-500" />
                      <StatBar label="SPD" value={stats.moveSpeed * 20} max={100} cls="bg-sky-400" />
                      <StatBar label="ATK" value={stats.attackDamage * 3} max={84} cls="bg-red-500" />
                      <StatBar label="DEF" value={stats.blockReduction * 100} max={80} cls="bg-amber-400" />
                    </div>
                    <div className="mt-2.5 text-[9px] text-purple-300 tracking-[0.15em] font-bold">{stats.ability}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* teams */}
          {roomState.mode === "war_band" && (
            <section className="mb-10">
              <h2 className="section-title mb-3"><Users size={12} /> CHOOSE TEAM</h2>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setSelectedTeam("red"); sendMsg("select_team", { team: "red" }); }}
                  className={`card card-interactive py-4 font-bold tracking-wider ${selectedTeam === "red" ? "!border-red-500/70 !bg-red-950/40" : ""}`}>
                  RED WAR BAND
                </button>
                <button onClick={() => { setSelectedTeam("blue"); sendMsg("select_team", { team: "blue" }); }}
                  className={`card card-interactive py-4 font-bold tracking-wider ${selectedTeam === "blue" ? "!border-sky-500/70 !bg-sky-950/40" : ""}`}>
                  BLUE WAR BAND
                </button>
              </div>
            </section>
          )}

          {/* actions — pinned bottom on mobile for thumb reach */}
          <div className="sticky bottom-3 mt-8 pt-3 bg-gradient-to-t from-black/80 via-black/60 to-transparent -mx-1 px-1 pb-1">
            <div className="flex gap-2.5">
              <button onClick={() => sendMsg("ready")}
                className={`flex-1 py-4 rounded-xl font-bold text-lg transition tracking-wider ${
                  roomState.players[playerId]?.ready
                    ? "bg-emerald-700 hover:bg-emerald-600 text-white shadow-[0_0_28px_rgba(16,150,90,0.45)]"
                    : "btn-ghost"
                }`}>
                {roomState.players[playerId]?.ready ? "READY — SKAL!" : "READY UP"}
              </button>
              {isHost && (
                <button onClick={() => sendMsg("start")} className="btn-primary flex-1 !py-4 !text-lg flex items-center justify-center gap-2">
                  <Swords size={18} /> START
                </button>
              )}
              <button onClick={() => { leaveRoom(); setScreen("landing"); }} className="btn-danger !px-4">
                <ArrowLeft size={18} />
              </button>
            </div>
            {!isHost && <p className="text-stone-500 text-xs text-center mt-2.5">Waiting for host to start the battle...</p>}
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
          <BackButton onClick={() => { clearStaged(); setScreen(prevScreen); }} />
          <div className="flex items-start justify-between gap-4 flex-wrap mt-5 mb-8">
            <div>
              <h1 className="font-display text-3xl text-amber-100">THE ARMOURY</h1>
              <p className="text-stone-400 text-sm mt-1.5">Try everything on before you buy. Gold is earned in battle — never bought.</p>
            </div>
            <div className="card flex items-center gap-2.5 px-5 py-2.5 !border-yellow-600/50">
              <Coins size={17} className="text-yellow-500" />
              <span className="text-yellow-400 font-bold text-xl">{profile.gold}</span>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4">
            {/* ===== TRY-ON MANNEQUIN ===== */}
            <div className="lg:w-[46%] shrink-0">
              <div className="card card-glow p-4 sticky top-4">
                <div className="section-title mb-2"><Eye size={12} /> PREVIEW — TRY IT ON</div>
                <CharacterPreview warriorClass={previewClass} appearance={previewAppearance()} height={320} />
                {/* class picker for the mannequin */}
                <div className="grid grid-cols-4 gap-1.5 mt-3">
                  {WARRIOR_INFO.map((w) => (
                    <button key={w.id} onClick={() => setPreviewClass(w.id)}
                      className={`card card-interactive py-1.5 flex flex-col items-center gap-0.5 ${previewClass === w.id ? "card-selected" : ""}`}>
                      <w.Icon size={13} className={previewClass === w.id ? "text-amber-300" : "text-stone-400"} />
                      <span className="text-[8px] font-bold tracking-wider text-stone-300">{w.name.slice(0, 5)}</span>
                    </button>
                  ))}
                </div>
                {/* staged action bar */}
                {hasChanges && (
                  <div className="mt-3.5 flex items-center gap-2 animate-fadeIn">
                    <div className="flex-1 text-center">
                      <div className="text-[10px] text-stone-400 tracking-widest">COST TO UNLOCK</div>
                      <div className={`font-bold text-lg flex items-center justify-center gap-1 ${profile.gold >= cost ? "text-yellow-400" : "text-red-400"}`}>
                        <Coins size={14} /> {cost}
                      </div>
                    </div>
                    <button onClick={applyStaged} className="btn-primary flex-1 !py-2.5 text-sm flex items-center justify-center gap-2">
                      <Check size={15} /> EQUIP{cost > 0 ? " & BUY" : ""}
                    </button>
                    <button onClick={clearStaged} className="btn-ghost !py-2.5 !px-3 text-sm">
                      <ArrowLeft size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ===== ITEMS ===== */}
            <div className="flex-1 min-w-0">
              <div className="tab-strip mb-4">
                {ARMOURY.map((s, i) => (
                  <button key={s.slot} onClick={() => setArmouryTab(i)} className={`tab-item ${armouryTab === i ? "tab-item-active" : ""}`}>
                    {s.label.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3">
                {slot.options.map((opt) => {
                  const owned = isUnlocked(opt.id);
                  const equipped = equippedValue(opt.slot) === opt.value && !staged[opt.slot];
                  const stagedNow = staged[opt.slot]?.value === opt.value;
                  const affordable = profile.gold >= opt.cost;
                  return (
                    <button key={opt.id} onClick={() => stageItem(opt)}
                      className={`card card-interactive flex items-center gap-4 p-3.5 text-left ${
                        equipped || stagedNow ? "card-selected" : !owned && !affordable ? "opacity-70" : ""
                      }`}>
                      {typeof opt.value === "number" ? (
                        <div className="w-10 h-10 rounded-full border-2 border-stone-500 shrink-0 shadow-inner"
                          style={{ backgroundColor: `#${opt.value.toString(16).padStart(6, "0")}` }} />
                      ) : (
                        <div className="medallion !w-10 !h-10 shrink-0">
                          {opt.slot === "helm" ? <Shield size={15} /> :
                            opt.slot === "cloak" ? <Shirt size={15} /> :
                            opt.slot === "warPaint" ? <Eye size={15} /> :
                            opt.slot === "beard" ? <Ghost size={15} /> : <User size={15} />}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-stone-100 text-sm">{opt.label}</div>
                        <div className="text-[10px] text-stone-400 mt-0.5">
                          {equipped ? "EQUIPPED" : stagedNow ? "ON MANNEQUIN — equip above" : owned ? "Owned — tap to preview" : opt.cost === 0 ? "Free" : `${opt.cost} gold`}
                        </div>
                      </div>
                      {equipped ? <Check size={16} className="text-amber-400 shrink-0" /> :
                        stagedNow ? <Eye size={15} className="text-amber-400 shrink-0" /> :
                        !owned && (affordable ? <Coins size={14} className="text-yellow-500 shrink-0" /> : <Lock size={14} className="text-stone-500 shrink-0" />)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="text-stone-500 text-xs text-center mt-6">
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
        <div className="min-h-full flex flex-col">
          {/* HERO AREA over artwork */}
          <div className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-10">
            <div className="text-center mb-12">
              <div className="flex items-center justify-center gap-3 text-amber-300/90 mb-4">
                <span className="ornament-line" />
                <Swords size={14} />
                <span className="font-display text-[10px] tracking-[0.55em]">ANGLO-SAXON ARENA</span>
                <Swords size={14} />
                <span className="ornament-line" />
              </div>
              <h1 className="title-hero font-display text-[13vw] leading-none sm:text-7xl">BRETWALDA</h1>
              <h2 className="font-display text-2xl sm:text-4xl text-red-400 tracking-[0.3em] mt-1.5" style={{ textShadow: "0 0 35px rgba(230,60,40,0.55), 0 2px 6px rgba(0,0,0,0.8)" }}>
                BLOOD MOOT
              </h2>
              <p className="text-stone-300/90 text-sm sm:text-[15px] mt-4 max-w-md mx-auto leading-relaxed text-center" style={{ textShadow: "0 1px 4px black" }}>
                Sword fighting in Dark Age Britain. Send a code, choose a warrior, fight — no downloads.
              </p>
            </div>

            <div className="w-full max-w-sm flex flex-col gap-4">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.substring(0, 20))}
                placeholder="Enter warrior name..."
                className="input-frame text-center text-lg"
              />
              <button onClick={() => setScreen("create")} disabled={busy}
                className="btn-primary !py-4 !text-xl w-full flex items-center justify-center gap-2.5 animate-glow">
                <Swords size={20} /> CREATE BATTLE
              </button>
              <button onClick={() => setScreen("join")} disabled={busy}
                className="btn-ghost !py-4 !text-xl w-full flex items-center justify-center gap-2.5">
                <Users size={20} /> JOIN BATTLE
              </button>
              <div className="grid grid-cols-3 gap-3 mt-1">
                <button onClick={() => setScreen("training")} className="mini-nav">
                  <Crosshair size={18} className="text-amber-400" />
                  <span>Training</span>
                  <span className="text-[9px] text-emerald-400 font-normal">vs AI</span>
                </button>
                <button onClick={() => openArmoury("landing")} className="mini-nav">
                  <Shirt size={18} className="text-amber-400" />
                  <span>Armoury</span>
                  <span className="text-[9px] text-stone-400 font-normal">customise</span>
                </button>
                <button onClick={() => setScreen("profile")} className="mini-nav">
                  <Scroll size={18} className="text-amber-400" />
                  <span>Saga</span>
                  <span className="text-[9px] text-stone-400 font-normal">profile</span>
                </button>
              </div>
              <div className="card !bg-stone-950/75 backdrop-blur px-4 py-3 text-center text-xs text-stone-300">
                Lv.{profile.level} {getLevelTitle(profile.level)}
                <span className="mx-2 text-stone-600">·</span>
                <Coins size={11} className="inline text-yellow-500 -mt-0.5" /> {profile.gold} gold
                <span className="mx-2 text-stone-600">·</span>
                {profile.wins} victories
              </div>
            </div>
          </div>

          <div className="pt-4 pb-8 text-center text-xs text-stone-300/70 max-w-xs mx-auto leading-relaxed" style={{ textShadow: "0 1px 3px black" }}>
            Plays on phones, tablets & desktops.<br />WASD + mouse on desktop · touch controls on mobile.
          </div>
        </div>
      )}

      {screen === "create" && (
        <ContentWrap>
          <div className="py-8">
            <BackButton onClick={() => setScreen("landing")} />
            <div className="text-center my-8">
              <div className="label-overline mb-2.5">SELECT GAME MODE</div>
              <h1 className="font-display text-3xl text-white">CREATE BATTLE</h1>
            </div>

            <div className="space-y-5 mb-9">
              {([
                { id: "honour_duel" as GameMode, name: "HONOUR DUEL", desc: "1v1 single combat. Prove your worth.", players: "2 players", Icon: Swords, tint: "text-amber-400" },
                { id: "blood_moot" as GameMode, name: "BLOOD MOOT", desc: "Free for all. Last warrior standing.", players: "2-8 players", Icon: Skull, tint: "text-red-400" },
                { id: "war_band" as GameMode, name: "WAR BAND", desc: "Team battles. Shield-friends together.", players: "2v2 · 3v3 · 4v4", Icon: Users, tint: "text-sky-400" },
              ]).map((mode) => (
                <button key={mode.id}
                  onClick={() => setSelectedMode(mode.id)}
                  className={`card card-interactive w-full p-5 text-left ${selectedMode === mode.id ? "card-selected" : ""}`}>
                  <div className="flex items-center gap-4">
                    <div className={`medallion !w-12 !h-12 ${mode.tint}`}><mode.Icon size={22} /></div>
                    <div className="flex-1">
                      <div className="font-display text-lg text-amber-100 tracking-wider">{mode.name}</div>
                      <div className="text-sm text-stone-300/90 mt-0.5">{mode.desc}</div>
                      <div className="text-[11px] text-stone-400 mt-0.5">{mode.players}</div>
                    </div>
                    <ChevronRight size={18} className={selectedMode === mode.id ? "text-amber-400" : "text-stone-500"} />
                  </div>
                </button>
              ))}
            </div>

            <button onClick={handleCreate} disabled={busy} className="btn-primary w-full !py-4 !text-lg">
              {busy ? "SUMMONING..." : "CREATE ROOM"}
            </button>
          </div>
        </ContentWrap>
      )}

      {screen === "join" && (
        <ContentWrap>
          <div className="py-8">
            <BackButton onClick={() => setScreen("landing")} />
            {inviteCode && (
              <div className="card card-glow !border-amber-500/60 mt-4 p-4 text-center animate-fadeIn">
                <div className="flex items-center justify-center gap-2 text-amber-300 font-display tracking-widest text-sm mb-1">
                  <Swords size={15} /> YOU ARE SUMMONED <Swords size={15} />
                </div>
                <p className="text-stone-300 text-sm">A friend invites you to <span className="font-mono text-amber-300 font-bold">{inviteCode}</span>.<br />Enter your name, grab your blade, and tap JOIN.</p>
              </div>
            )}
            <div className="text-center my-8">
              <div className="label-overline mb-2.5">ENTER ROOM CODE</div>
              <h1 className="font-display text-3xl text-white">JOIN BATTLE</h1>
            </div>

            <div className="space-y-5">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().substring(0, 15))}
                onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                placeholder="e.g. WESSEX82"
                className="input-frame text-center !text-2xl font-mono !tracking-[0.3em]"
              />
              <button onClick={handleJoin} disabled={busy} className="btn-primary w-full !py-4 !text-lg">
                {busy ? "ANSWERING..." : "JOIN"}
              </button>
              <p className="text-stone-400 text-xs text-center leading-relaxed">
                Got the link in your group chat? Just open it — the code fills in itself.
              </p>
            </div>
          </div>
        </ContentWrap>
      )}

      {screen === "training" && (
        <ContentWrap>
          <div className="py-6">
            <BackButton onClick={() => setScreen("landing")} />
            <div className="my-6">
              <div className="label-overline mb-1.5">PRACTICE THE BLADE</div>
              <h1 className="font-display text-3xl text-amber-100">TRAINING GROUNDS</h1>
            </div>

            {/* ===== TESTGROUNDS: fight AI ===== */}
            <div className="card !border-emerald-700/60 !bg-gradient-to-br !from-emerald-950/50 !to-stone-900 p-5 mb-8 card-glow-green">
              <div className="flex items-center gap-2.5 mb-1.5">
                <Crosshair size={17} className="text-emerald-400" />
                <h2 className="font-display text-lg text-emerald-200 tracking-wider">TESTGROUNDS — FIGHT THE AI</h2>
              </div>
              <p className="text-xs text-stone-300/90 mb-5 leading-relaxed">
                Sharpen your skills alone against AI warriors. Enemies respawn — fight until you return stronger.
              </p>

              <button onClick={() => setScreen("muster")} disabled={busy}
                className="btn-primary w-full !py-3.5 flex items-center justify-center gap-2.5">
                <Users size={17} /> MUSTER THE TESTGROUNDS
              </button>
              <p className="text-[11px] text-stone-400 mt-2.5 leading-relaxed text-center">
                Choose how many AI you face and how good they are, pick your warrior,
                dress him in the armoury — then draw steel when you are ready.
              </p>

              <div className="flex items-center gap-3 my-5">
                <span className="flex-1 h-px bg-stone-700/70" />
                <span className="text-[10px] tracking-[0.3em] text-stone-500 font-bold">OR SPAR AT ONCE</span>
                <span className="flex-1 h-px bg-stone-700/70" />
              </div>

              <div className="space-y-3.5">
                {AI_DIFFICULTIES.map((d) => (
                  <button key={d.id} onClick={() => quickSpar(d)} disabled={busy}
                    className={`card card-interactive w-full p-4 flex items-center gap-4 text-left border-l-4 ${d.tint}`}>
                    <div className="flex-1">
                      <div className="font-display tracking-wider text-stone-100">{d.name}</div>
                      <div className="text-[11px] text-stone-400 mt-0.5">{d.bots} AI · {d.desc}</div>
                    </div>
                    <Swords size={16} className="text-stone-400" />
                  </button>
                ))}
              </div>
              {busy && <div className="text-center text-amber-300 text-sm mt-3 animate-pulse">Summoning opponents...</div>}
            </div>

            {/* ===== Controls reference ===== */}
            <div className="space-y-5">
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
                <CtrlRow k="Swipe upper area" d="Camera" />
                <CtrlRow k="SLASH / HEAVY" d="Attack buttons" />
                <CtrlRow k="BLOCK" d="Hold to block; catch the instant to parry" />
                <CtrlRow k="DODGE / RUN" d="Dodge roll / sprint" />
                <CtrlRow k="POWER" d="Class ability" />
              </Section>

              <Section title="COMBAT ARTS" icon={<Flame size={14} />}>
                <Tip text="Parry: begin blocking at the instant the enemy strikes to stagger them — then punish." />
                <Tip text="Combos: chaining hits builds up to 60% bonus damage. Don't leave gaps." />
                <Tip text="Heavy attacks smash guards and stagger — except a Huscarl under SHIELD WALL." />
                <Tip text="Dodge grants i-frames. Roll through the blow, strike the recovery." />
                <Tip text="Stamina regenerates when you stop attacking and sprinting. Exhaustion is death." />
                <Tip text="Flank: attacks only land facing forward. Circle behind for clean kills." />
                <Tip text="Strike magnetism nudges your aim toward foes near your crosshair — trust it." />
              </Section>

              <Section title="WARRIORS OF THE REALM" icon={<Shield size={14} />}>
                {WARRIOR_INFO.map((w) => {
                  const s = WARRIOR_STATS[w.id];
                  return (
                    <div key={w.id} className="py-2.5 border-b border-stone-800/60 last:border-0">
                      <div className="flex items-center gap-2 font-bold text-amber-200 text-sm"><w.Icon size={14} /> {w.name}</div>
                      <div className="text-xs text-stone-400 mt-1">{w.desc}</div>
                      <div className="text-[10px] text-purple-300 mt-1 tracking-[0.15em] font-bold">ABILITY — {s.ability}</div>
                    </div>
                  );
                })}
              </Section>
            </div>
          </div>
        </ContentWrap>
      )}

      {screen === "muster" && (
        <ContentWrap wide>
          <div className="py-6">
            <BackButton onClick={() => setScreen("training")} />
            <div className="my-6">
              <div className="label-overline mb-1.5">TESTGROUNDS · THE MUSTER</div>
              <h1 className="font-display text-3xl text-amber-100">BEFORE STEEL IS DRAWN</h1>
              <p className="text-stone-400 text-sm mt-2 leading-relaxed">
                Set the odds, choose your blade, dress for the fight. Nothing begins until you say so.
              </p>
            </div>

            {/* YOUR WARRIOR — the same live mannequin the lobby shows */}
            <section className="mb-8">
              <div className="card card-glow p-4 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-full sm:w-[46%]">
                  <CharacterPreview warriorClass={soloClass} appearance={profile.appearance} height={200} />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <div className="label-overline mb-1.5">YOUR WARRIOR</div>
                  <div className="font-display text-2xl text-amber-100">{playerName.trim() || "Trainee"}</div>
                  <div className="text-sm text-stone-300 capitalize mt-0.5">{soloClass}</div>
                  <div className="text-[10px] text-purple-300 mt-1 tracking-[0.15em] font-bold">
                    ABILITY — {WARRIOR_STATS[soloClass].ability}
                  </div>
                  <p className="text-xs text-stone-400 mt-2 leading-relaxed">
                    Armour, helm, cloak and paint carry into the testgrounds exactly as you see them here.
                  </p>
                  <button onClick={() => openArmoury("muster")} className="btn-primary !py-2.5 !px-5 text-sm mt-3.5 inline-flex items-center gap-2">
                    <Shirt size={15} /> CUSTOMISE
                  </button>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="section-title mb-3"><Swords size={12} /> CHOOSE WARRIOR</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {WARRIOR_INFO.map((w) => {
                  const stats = WARRIOR_STATS[w.id];
                  const isSel = soloClass === w.id;
                  const WIcon = w.Icon;
                  return (
                    <button key={w.id} onClick={() => setSoloClass(w.id)}
                      className={`card card-interactive p-4 text-left ${isSel ? "card-selected" : ""}`}>
                      <div className={`medallion mb-2.5 ${isSel ? "!border-amber-500 !text-amber-300" : ""}`}><WIcon size={17} /></div>
                      <div className="font-display text-sm text-amber-100 tracking-wider">{w.name}</div>
                      <div className="text-[10px] text-stone-400 mt-1 leading-snug">{w.desc}</div>
                      <div className="mt-3 space-y-1.5">
                        <StatBar label="HP" value={stats.maxHealth} max={150} cls="bg-emerald-500" />
                        <StatBar label="SPD" value={stats.moveSpeed * 20} max={100} cls="bg-sky-400" />
                        <StatBar label="ATK" value={stats.attackDamage * 3} max={84} cls="bg-red-500" />
                        <StatBar label="DEF" value={stats.blockReduction * 100} max={80} cls="bg-amber-400" />
                      </div>
                      <div className="mt-2.5 text-[9px] text-purple-300 tracking-[0.15em] font-bold">{stats.ability}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mb-8">
              <h2 className="section-title mb-3"><Bot size={12} /> THE OPPOSITION</h2>
              <div className="card p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-bold text-stone-100 text-sm">HOW MANY</div>
                    <div className="text-[11px] text-stone-400 mt-0.5">
                      They respawn where they fell — the trial ends when you leave it.
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => setSoloBots((n) => Math.max(MIN_AI, n - 1))} disabled={soloBots <= MIN_AI}
                      aria-label="Fewer AI warriors" className="btn-ghost !py-2.5 !px-3.5">
                      <Minus size={16} />
                    </button>
                    <div className="w-10 text-center font-display text-3xl text-amber-200">{soloBots}</div>
                    <button onClick={() => setSoloBots((n) => Math.min(MAX_AI, n + 1))} disabled={soloBots >= MAX_AI}
                      aria-label="More AI warriors" className="btn-ghost !py-2.5 !px-3.5">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>

                <div className="h-px bg-stone-700/60 my-4" />

                <div className="font-bold text-stone-100 text-sm mb-0.5">HOW GOOD</div>
                <div className="text-[11px] text-stone-400 mb-3">Every AI in the ring fights at this skill.</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {AI_DIFFICULTIES.map((d) => (
                    <button key={d.id} onClick={() => setSoloDifficulty(d.id)}
                      className={`card card-interactive p-3.5 text-left border-l-4 ${d.tint} ${soloDifficulty === d.id ? "card-selected" : ""}`}>
                      <div className="font-display tracking-wider text-stone-100 text-sm">{d.name}</div>
                      <div className="text-[10px] text-stone-400 mt-1 leading-snug">{d.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* the fight is always one press away, pinned for thumbs */}
            <div className="sticky bottom-3 mt-8 pt-3 bg-gradient-to-t from-black/80 via-black/60 to-transparent -mx-1 px-1 pb-1">
              <div className="flex gap-2.5">
                <button onClick={() => handleSolo()} disabled={busy}
                  className="btn-primary flex-1 !py-4 !text-lg flex items-center justify-center gap-2">
                  <Swords size={18} /> {busy ? "SUMMONING..." : "DRAW STEEL"}
                </button>
                <button onClick={() => setScreen("training")} className="btn-ghost !px-4">
                  <ArrowLeft size={18} />
                </button>
              </div>
              <p className="text-stone-400 text-xs text-center mt-2.5">
                {soloBots} {soloBots === 1 ? "AI warrior" : "AI warriors"} at {soloDifficulty} skill,
                against your <span className="text-amber-300 font-bold capitalize">{soloClass}</span>.
              </p>
            </div>
          </div>
        </ContentWrap>
      )}

      {screen === "profile" && (
        <ContentWrap>
          <div className="py-8">
            <BackButton onClick={() => setScreen("landing")} />
            <div className="text-center my-8">
              <div className="w-24 h-24 mx-auto rounded-full bg-stone-900 border-2 border-amber-600/70 flex items-center justify-center mb-4 shadow-[0_0_45px_rgba(255,170,50,0.2)]">
                <Medal size={40} className="text-amber-400" />
              </div>
              <h1 className="font-display text-3xl text-white">{playerName || "Unnamed Warrior"}</h1>
              <div className="text-amber-400 text-sm tracking-[0.25em] mt-1.5">{getLevelTitle(profile.level)}</div>
              <div className="text-stone-500 text-xs mt-0.5">Level {profile.level}</div>
            </div>

            <div className="mb-6 px-1">
              <div className="flex justify-between text-xs text-stone-400 mb-1.5">
                <span>XP {profile.xp}</span><span>Next: {xpForLevel(profile.level + 1)}</span>
              </div>
              <div className="w-full h-3 bg-stone-800/90 rounded-full overflow-hidden border border-stone-600/60">
                <div className="h-full bg-gradient-to-r from-amber-600 to-amber-300 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (profile.xp / xpForLevel(profile.level + 1)) * 100)}%` }} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <ProfStat Icon={Coins} val={profile.gold} label="Gold" cls="text-yellow-400" />
              <ProfStat Icon={Sparkles} val={profile.honour} label="Honour" cls="text-purple-400" />
              <ProfStat Icon={Trophy} val={profile.wins} label="Victories" cls="text-emerald-400" />
              <ProfStat Icon={Swords} val={profile.matches} label="Battles" cls="text-white" />
              <ProfStat Icon={Skull} val={profile.kills} label="Kills" cls="text-red-400" />
              <ProfStat Icon={Heart} val={profile.deaths} label="Deaths" cls="text-stone-400" />
            </div>

            <div className="text-stone-500 text-xs text-center mb-6">
              K/D {profile.deaths > 0 ? (profile.kills / profile.deaths).toFixed(2) : profile.kills} · Win rate {profile.matches > 0 ? Math.round((profile.wins / profile.matches) * 100) : 0}% · {profile.unlocked.length - freeCosmeticIds().length} unlocks earned
            </div>

            <button onClick={() => openArmoury("profile")} className="btn-primary w-full flex items-center justify-center gap-2">
              <Shirt size={16} /> OPEN THE ARMOURY
            </button>
            <button onClick={() => setScreen("training")} className="btn-ghost w-full mt-3 flex items-center justify-center gap-2">
              <Crosshair size={15} /> ENTER TESTGROUNDS
            </button>
          </div>
        </ContentWrap>
      )}
    </MenuShell>
  );
}

// ---------------- components ----------------
function MenuShell({ children, art = "hall" }: { children: React.ReactNode; art?: "hero" | "hall" | "none" }) {
  return (
    <div className="fixed inset-0 overflow-y-auto overscroll-contain select-none app-bg-v2"
      style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}>
      {art === "hero" && (
        <div className="fixed inset-0 pointer-events-none">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url(/images/hero-bg.jpg)", opacity: 0.85 }}
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,8,6,0.5) 0%, rgba(10,8,6,0.1) 42%, rgba(10,8,6,0.9) 100%)" }} />
        </div>
      )}
      {art === "hall" && (
        <div className="fixed inset-0 pointer-events-none">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-[0.22]"
            style={{ backgroundImage: "url(/images/hall-banner.jpg)" }}
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(12,10,8,0.4) 0%, rgba(12,10,8,0.92) 70%)" }} />
        </div>
      )}
      <div className="relative min-h-full px-5 sm:px-8 pb-32 z-10" style={{ paddingTop: "max(2.75rem, calc(env(safe-area-inset-top) + 1.75rem))" }}>{children}</div>
    </div>
  );
}

function ContentWrap({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto ${wide ? "max-w-3xl" : "max-w-xl"} space-y-8`}>{children}</div>
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
    <button onClick={onClick} className="flex items-center gap-2 text-stone-400 hover:text-amber-300 transition text-sm font-bold tracking-wider py-1">
      <ArrowLeft size={16} /> BACK
    </button>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="text-amber-300 font-bold mb-3 flex items-center gap-2.5 text-sm tracking-[0.2em] font-display">{icon} {title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function CtrlRow({ k, d }: { k: string; d: string }) {
  return (
    <div className="flex gap-3 items-baseline">
      <span className="text-amber-300 font-mono text-xs min-w-[118px] shrink-0">{k}</span>
      <span className="text-stone-300/90 text-xs leading-relaxed">{d}</span>
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return <div className="text-xs text-stone-200/85 leading-relaxed py-1 border-l-2 border-amber-700/80 pl-3">{text}</div>;
}

function ProfStat({ Icon, val, label, cls }: { Icon: typeof Swords; val: number; label: string; cls: string }) {
  return (
    <div className="card p-4.5 text-center">
      <div className={`text-xl font-bold ${cls} flex items-center justify-center gap-1.5`}><Icon size={15} />{val}</div>
      <div className="text-[10px] text-stone-400 mt-1 tracking-wide">{label}</div>
    </div>
  );
}
