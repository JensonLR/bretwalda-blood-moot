"use client";
// The renderer's orchestrator. It owns the canvas, the WebGL context, React
// state and player input, and drives the modules in src/game/client/render.
// Nothing here knows how anything looks — see render/README.md for who owns
// what and the order they run in.
import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { WARRIOR_STATS, type GamePlayer, type AttackDirection, type AttackPhase, type MatchEndData, type EmoteId, type HitZone } from "../types";
import GameHud from "./GameHud";
import { getFeel, sampleInput, useTouchControls, type MobileFlags } from "./input";
import { setTeamContrast } from "./characters";
import { underGrace } from "@/game/grace.mjs";
import { roundBoundary } from "@/game/roundreset.mjs";
import { createDeathCamera, createRoundCamera } from "@/game/deathcam.mjs";
import { createReplayBuffer, createKillReplay, REPLAY, runUpOf,
  type ReplayPlayer } from "@/game/replay.mjs";
import { createSpectateAim } from "@/game/spectate.mjs";
import {
  resolveQuality, configureRenderer,
  type FrameContext, type Mood, type QualitySettings,
} from "./render/quality";
import { createTextureLibrary, type TextureLibrary } from "./render/textures";
import { createMaterialLibrary, type MaterialLibrary } from "./render/materials";
import { createSky, type SkyHandle } from "./render/sky";
import { createLighting, type LightingHandle } from "./render/lighting";
import { createWorld, type WorldHandle } from "./render/world";
import { createVfx, type VfxHandle } from "./render/vfx";
import { createPostFx, type PostFxHandle } from "./render/postfx";
import { createCameraRig, type CameraRig, type PhotoFraming } from "./render/camera";
import { createHud3d, type Hud3D } from "./render/hud3d";
import { createAudio, type AudioHandle, type WireHitType, type ScoreScene } from "./render/audio";
import {
  createWarriorRig, createMotion, stepWarriorTransform, poseWarrior, triggerEmote,
  type WarriorRig, type WarriorMotion, type AnimHooks,
} from "./render/anim";
import { getBindings } from "./bindings";
import { createSummary, type SummaryHandle } from "./render/summary";
// THE GROUNDS THIS BUILD CAN DRAW. Imported for their side effect: a ground
// module calls `registerGround` at import time, and nothing else in the tree
// references `PICT_MOOR_GROUND`, so without this line the moor is dealt by the
// engine, sent over the wire and then silently replaced by the village at
// `createWorld`'s fallback. `tools/warsay.mjs` cannot catch that — it checks
// the server's table — so the import is named here rather than left implicit.
import "@/game/client/render/moor";
import "@/game/client/render/fort";
import "@/game/client/render/camp";
import "@/game/client/render/dyke";
// The camera obeys the same solid law the feet do (8.7): the ground's own
// obstacle table — the one `resolveSolids` walks for movement — is handed to
// the rig so the boom pulls in at a post instead of clipping through it.
import { GROUNDS } from "@/game/grounds.mjs";
import { solidsOf, playBound } from "@/game/solidground.mjs";

/**
 * How far the build has got. `done` is the weight of the stages that have
 * *landed*; `label` is the stage now being made. `done === total` means the
 * arena stands and the next frame the loop draws is the game.
 */
export interface ForgeProgress {
  done: number;
  total: number;
  label: string;
  /** Index of the stage being made, or `stages` once they have all landed. */
  stage: number;
  stages: number;
}

type ForgeSink = (p: ForgeProgress) => void;

interface GameCanvasProps {
  playerId: string;
  roomState: RoomState | null;
  onSendInput: (input: Record<string, unknown>) => void;
  /**
   * The server's `match_end` verdict, while the end-of-match summary should be
   * on stage. Null the rest of the time — page.tsx clears it the moment a next
   * match starts or the player walks away, and that clearing is what strikes
   * the set.
   */
  matchEnd?: MatchEndData | null;
  /**
   * Called as each build stage lands, so whoever mounted this can hold a
   * loading screen in front of the canvas. Optional on purpose: /shot mounts
   * the same component and wants no chrome at all — and its absence is what
   * keeps the build inside the mount task (see the note on the init effect).
   */
  onForge?: ForgeSink;
  /**
   * A bound emote key went down. The canvas only reports the press — page.tsx
   * owns the transport, and the server owns whether anyone hears it.
   */
  onEmote?: (emote: EmoteId) => void;
  /**
   * The First Moot's rite has left its MOVE beat (learned, or skipped), and
   * the staged foe should now walk in. Same division of labour as `onEmote`:
   * the HUD reports the rite's moment, page.tsx owns the transport and sends
   * `add_bot`, the engine deals the latecomer a real spawn. Fired at most
   * once per mount, only in solo, only while a rite is actually running.
   */
  onMootFoe?: () => void;
  /**
   * Whether the STAGE would honour a flourish from the local player, pushed up
   * so the button and the thing that honours it stop being two different
   * answers. Fired only on a change — this is evaluated every frame.
   */
  onCanEmote?: (can: boolean) => void;
  /**
   * THE SLOW-MOTION REPLAY OF THE LAST KILL, reported outward so the surface
   * can hold its own beat back and offer a skip. `null` when nothing is
   * playing. `skip` is `replay.mjs`'s own — there is one definition of when a
   * replay ends and this is a handle on it, not a second copy.
   */
  onReplay?: (s: { playing: boolean; atEnd: boolean; skip: () => void } | null) => void;
  /**
   * THE CLIP (backlog 7.9). Every kill replay records itself to WebM through
   * the replay's own tuned lens — the deathcam IS the camera work, which is
   * the owner's whole bar for this feature. Called with a save-to-disk
   * function once a clip is ready, and with null when a new fight makes the
   * old clip stale. Absent on browsers without MediaRecorder, and never
   * armed on the low tier — a phone that can barely draw the fight must not
   * also encode it.
   */
  onClip?: (save: (() => void) | null) => void;
  /**
   * Emote relays from the server, pushed by page.tsx and drained by the frame
   * loop, which is the only thing that can reach the rigs. A ref'd array for
   * the same reason roomState rides a ref: a flourish must not rebuild the
   * animation frame callback.
   */
  emoteFeed?: { current: Array<{ playerId: string; emote: EmoteId }> };
  /**
   * THE SERVER'S `hit` MESSAGES, and this canvas had never read one.
   *
   * Everything it knew about a blow it derived from a snapshot delta — inside
   * `if (p.health < slot.prevHp - 0.5)` — which is a branch three of the wire's
   * seven hit kinds can never enter, because a parry, a shove and a knockdown
   * all carry `damage: 0`. The parry is the game's hero sound, `soundtest`
   * grades it on five claims, and it had never played for anybody. The same call
   * site also passed no `weapon`, so every blow in the game was synthesised as a
   * sword whatever swung it.
   *
   * Pushed by page.tsx and drained by the frame loop, for the same reason
   * `emoteFeed` is: a blow must not rebuild the animation frame callback, and
   * only the loop can reach the rigs to find out where the men are standing.
   */
  hitFeed?: { current: WireHitMessage[] };
}

/**
 * One `hit` payload, exactly as docs/WIRE-PROTOCOL.md describes it. Not every
 * field is used here — `health`, `direction` and `hitstop` are already read off
 * the snapshot — but the ones that decide what a blow SOUNDS like are, and they
 * exist nowhere else.
 */
export interface WireHitMessage {
  type: WireHitType;
  attackerId?: string;
  targetId?: string;
  damage?: number;
  hitZone?: HitZone | null;
  riposte?: boolean;
}

/**
 * Hands the main thread back between stages and returns once the browser has
 * had its chance to put pixels up.
 *
 * `requestAnimationFrame` alone resolves too early — its callback runs before
 * the paint — so the timeout scheduled from inside the frame is what waits for
 * it. And rAF alone is not safe either: it is throttled to nothing in a
 * backgrounded tab, which is exactly where a player who opens an invite link
 * and flicks to the group chat leaves this build. Whichever arm lands first
 * resolves; the other becomes a no-op. Neither arm can wedge the build.
 */
function yieldToPaint(): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    requestAnimationFrame(() => { setTimeout(done, 0); });
    setTimeout(done, 100);
  });
}

interface RoomState {
  code: string;
  mode: string;
  state: string;
  arena: string;
  /**
   * The named ground this match is fought over. Read here for one thing only —
   * whose colours the moot flies — so it is optional and everything downstream
   * falls back when it is absent, which is what a training bout looks like.
   */
  territory?: { id: string; name: string; native: string; holder: string } | null;
  players: Record<string, GamePlayer>;
  hostId: string;
  countdown: number;
  matchTimer: number;
  killFeed: Array<{ killerName: string; victimName: string; timestamp: number }>;
  lastStandTriggered: boolean;
  /**
   * Which round of the match this is, 1-based, 0 in a lobby. It rides on every
   * snapshot `serializeRoom` sends and it is the only thing on the wire that
   * says a round has been dealt — which is what the arena has to be emptied on.
   * Optional here because the per-second countdown ticks are thin: they carry a
   * number and nothing else, and `roundBoundary` has the phase edge as its
   * backstop for exactly that case.
   */
  roundIndex?: number;
  /**
   * HOW MANY AUTHORITATIVE SNAPSHOTS HAVE LANDED. Stamped by `page.tsx` in the
   * message handler — the only place in the client that can see whether a
   * committed room record came off a whole-room broadcast or off a message with
   * no positions on it. See `stampSnapshot` there, and `wireEpochRef` below.
   */
  wireSeq?: number;
}

/** Everything the render modules build, held together so teardown is one call. */
interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  quality: QualitySettings;
  textures: TextureLibrary;
  materials: MaterialLibrary;
  sky: SkyHandle;
  lighting: LightingHandle;
  world: WorldHandle;
  vfx: VfxHandle;
  postfx: PostFxHandle;
  rig: CameraRig;
  hud: Hud3D;
  audio: AudioHandle;
}

/** Per-warrior client state that is not the server's business. */
interface WarriorSlot {
  rig: WarriorRig;
  motion: WarriorMotion;
  prevHp: number;
  prevState: string;
  /** Seconds since this warrior's last dust puff. Per-body, not per-frame. */
  dustTick: number;
  /** Seconds until his next footfall. Cadence follows the gait, not the frame. */
  stepTick: number;
  /** Last frame's `abilityActive`, so the signature fires once and not per-frame. */
  prevAbility: boolean;
  /**
   * Last frame's `attackPhase`. The whoosh is fired on the windup -> contact
   * edge, which is the instant the server resolves the blow, so this is what
   * makes it fire once per stroke rather than once per snapshot.
   */
  prevPhase: AttackPhase | null;
}

export default function GameCanvas({ playerId, roomState, onSendInput, matchEnd, onForge, onEmote, onCanEmote, onReplay, emoteFeed, hitFeed, onMootFoe, onClip }: GameCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [glError, setGlError] = useState<string | null>(null);

  const stageRef = useRef<Stage | null>(null);
  const warriorsRef = useRef<Map<string, WarriorSlot>>(new Map());
  const focusRef = useRef(new THREE.Vector3());
  // Set once at init when a capture has aimed the camera; keeps the per-frame
  // mode selection from stamping "follow" back over it every frame.
  const photoFramedRef = useRef(false);

  // The loop is started once; the network state it reads lives in refs so a
  // packet does not tear down and rebuild the animation frame callback.
  const roomStateRef = useRef<RoomState | null>(roomState);
  /**
   * How many authoritative snapshots have reached this component. Rides into
   * the frame as `ctx.wireEpoch`; see the field's note in `quality.ts` for why
   * the interpolator cannot work it out for itself.
   *
   * CARRIED, NOT COUNTED, AND THAT IS THE REPAIR. This used to be `++` on a
   * `useEffect` keyed on `[roomState]` — one advance per committed room record.
   * The argument was that `page.tsx` parses a fresh object for every
   * `game_state`, so a new reference is a new packet. True, and incomplete: a
   * new reference is not ONLY a packet. `emote`, `last_stand` and a bare
   * `countdown` tick each commit a fresh record built by spreading the last one
   * and changing a field, with no player positions anywhere in the message, and
   * every one of them advanced this counter. `ingestNet` then read the advance
   * as an authoritative "he is exactly here" for every still man in the room
   * and put a phantom sample on his interpolation grid — a whole 50 ms slot
   * against a wire that had not moved.
   *
   * Measured by `tools/janktest.mjs --phases=epoch` on the build before this
   * change: 596 advances / 598 snapshots on a quiet wire, 602 / 597 with an
   * emote pressed every 600 ms. Seven phantom advances, one per flourish the
   * server relayed. The intermission branch further down is the worst of it —
   * its own comment says "the wire is static here", and it is exactly where the
   * break card puts the emote buttons, so there the true packet count is ZERO.
   *
   * `page.tsx` now stamps the packet number onto the record itself, so this
   * reads it rather than deriving it. Same effect, same commit-once timing, and
   * a record that was not a packet arrives carrying the number it already had.
   */
  const wireEpochRef = useRef(0);
  const sendInputRef = useRef(onSendInput);
  // The verdict rides a ref for the same reason roomState does: the loop reads
  // it, and a match ending must not rebuild the animation frame callback.
  const matchEndRef = useRef<MatchEndData | null>(matchEnd ?? null);
  const summaryRef = useRef<SummaryHandle | null>(null);
  /**
   * The round the last frame believed it was in. Two fields off the wire and
   * nothing else — see `@/game/roundreset.mjs`, which owns what a change in them
   * means. A ref rather than state because the loop is the only reader and a
   * round starting must not rebuild the animation frame callback.
   */
  const roundPhaseRef = useRef<{ state: string | null; roundIndex: number } | null>(null);
  /**
   * The death camera. All of the deciding is in `@/game/deathcam.mjs`, so
   * `tools/deathcamtest.mjs` drives the same module the player does rather than
   * a model of it — the arrangement `roundreset.mjs` already uses, and for the
   * same reason: a decision that only a browser can reach is a decision that
   * drifts. Everything below is transport.
   */
  const deathCamRef = useRef(createDeathCamera());
  /**
   * THE ROUND'S FINAL DEATH — the beat every man in the room watches, winner
   * and losers alike. Same file, same geometry, a different camera and a
   * different clock; see the header of `deathcam.mjs` for why they are two and
   * which one outranks which.
   */
  const roundCamRef = useRef(createRoundCamera());
  /**
   * THE SLOW-MOTION REPLAY OF THE LAST KILL — the ring, and the clock that
   * reads it. Both live in `@/game/replay.mjs` for the reason the two cameras
   * above do: `tools/replaytest.mjs` drives the same module the player does,
   * and a decision that only a browser can reach is a decision that drifts.
   *
   * The ring is allocated ONCE, here, and never grows: 57,600 bytes of typed
   * arrays for eight seats and five seconds at the server's own 20 Hz. Nothing
   * in the record path allocates. See `replaytest` §5.
   */
  const replayBufRef = useRef(createReplayBuffer());
  // The clip's machinery (7.9): the live recorder, its chunks, the finished
  // blob, and a STABLE save function handed out through `onClip` — stable so
  // the page can hold it in state without identity churn.
  const clipRecRef = useRef<MediaRecorder | null>(null);
  const clipChunksRef = useRef<Blob[]>([]);
  const clipRef = useRef<Blob | null>(null);
  const onClipRef = useRef(onClip);
  useEffect(() => { onClipRef.current = onClip; });
  const saveClipRef = useRef(() => {
    const blob = clipRef.current;
    if (!blob || typeof document === "undefined") return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bretwalda-clip.webm";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  });
  const killReplayRef = useRef(createKillReplay());
  /** The men of one recorded frame, rebuilt into this and reused. */
  const replayOutRef = useRef<ReplayPlayer[]>([]);
  /**
   * THE RECORDER'S CLOCK, and it is not the render clock.
   *
   * `docs/REPLAY.md` §5 said to stamp frames with "the SERVER's clock". There
   * is no such clock on this side of the wire — `engine.simTime()` is the
   * host's and `serializeRoom` does not publish it — so this is written down
   * rather than quietly substituted. What the ring actually needs is one stamp
   * per SNAPSHOT, monotonic, in real seconds, and shared with `deathAtRef`
   * below; the client's own `performance.now()` sampled on the frame a packet
   * lands is all three. What it must NOT be is the render clock sampled every
   * frame, which would write the same snapshot into the ring three times over
   * and make a 20 Hz recording out of a 60 Hz one.
   *
   * `wireEpoch` is the packet number `page.tsx` stamps on the record itself —
   * the same number the interpolator rides — so "has a snapshot landed" is
   * asked once in this component and answered the same way twice.
   */
  const replayEpochRef = useRef(-1);
  /**
   * ...and WHAT took the man who fell last. The run-up is as long as the swing
   * it has to contain, and the fire swings nothing: `runUpOf` gives 0.92 s for
   * steel and 0.75 s for a burn, and the 0.17 s difference is spent at the far
   * end putting the body on the turf. `freezetest --phases=collapse` lands a
   * burn at 1.17 s, the slowest landing in the game, and a 1.08 s tail left it
   * still in the air — which is the corpse-frozen-part-way picture this whole
   * branch is about.
   */
  const deathCauseRef = useRef<string | null>(null);
  /** Real seconds at which the last recorded snapshot landed. */
  const replayStampRef = useRef(0);
  /** And the stamp on the packet that first showed the round's last fall. */
  const deathAtRef = useRef(0);
  /** What the surface was last told, so it is told again only on a change. */
  const replayToldRef = useRef(false);
  /**
   * HOW MANY FRAMES OF REPLAY THIS CLIENT HAS ACTUALLY DRAWN, for the readback
   * below and for nothing else. A DOM poll cannot count frames — it samples at
   * 50 ms while the beat runs at whatever the box renders — and "did he see the
   * replay" is a question about frames. `tools/replayshot.mjs` reads it.
   */
  const replayDrawnRef = useRef(0);
  /**
   * Where the lens points when you are dead and not following a teammate. All
   * of the deciding is in `@/game/spectate.mjs`, so `tools/spectatetest.mjs`
   * drives the same module the player does instead of a copy of it.
   */
  const spectateAimRef = useRef(createSpectateAim());
  /**
   * The array handed to it, reused every frame. A brawl is eight men and this
   * runs at 60 Hz; a fresh array and eight fresh objects per frame is 480
   * allocations a second for a lens that needs none. R12 stage 4.
   */
  const spectateMenRef = useRef<{ id: string; team: string; dead: boolean; x: number; z: number }[]>([]);
  /**
   * EVERY warrior's cut, keyed by the man it was taken out of, and kept live
   * rather than as a snapshot. `cut.stump` is a node parented into the body and
   * `cut.part` is the free piece, so reading their world matrices each frame is
   * how the lens follows a wound that is falling and a head that is still
   * rolling. Snapshotting the separation frame instead would aim the camera at
   * where the man used to be standing, which is the exact bug `vfx.ts` already
   * fixed for the blood.
   *
   * A MAP AND NO LONGER ONE ENTRY. It held the local warrior's cut alone,
   * because the only lens that cared was his own. The round beat watches
   * SOMEBODY ELSE die, so the wound it is looking for belongs to whoever fell
   * last — and a second ref for "the other man's cut" would be the same
   * derivation written twice, which is the fault `docs/PROCESS.md` has recorded
   * five times in `characters.ts` alone. One store, keyed by who it came off.
   */
  const seversRef = useRef<Map<string, { stump: THREE.Object3D; part: THREE.Object3D; sign: number }>>(new Map());
  /**
   * The last man to fall, and the man who felled him — tracked off the snapshots
   * as they arrive, because the wire has no "who died last" field and the tick a
   * round ends IS the tick the last man falls (`checkRoundEnd` runs inside the
   * same step). Whatever this holds when the room turns to the break is the death
   * that ended the round.
   *
   * Two men dying on the same tick is a DRAW and the server awards nothing; the
   * later entry in iteration order wins here, which is arbitrary and is the only
   * arbitrary thing in this feature. It is a shot of one of the two bodies rather
   * than of the right one, in a case the sim itself calls undecided.
   */
  const lastFallRef = useRef<{ id: string; killerId: string | null } | null>(null);
  /** What each man's state was on the previous snapshot, so a fall is an EDGE. */
  const deadWasRef = useRef<Map<string, boolean>>(new Map());
  // Initialised from the first render's prop rather than filled in by an
  // effect: the build reads it on mount, before any effect that assigns it
  // would have run, and a build that could not see its consumer would silently
  // decide it had none and stop yielding.
  const onForgeRef = useRef(onForge);
  useEffect(() => {
    roomStateRef.current = roomState;
    // `?? wireEpochRef.current` and not `?? 0`: a caller that never stamps —
    // any embedder of this component that is not `page.tsx` — then holds the
    // epoch STILL rather than pinning it to zero, and a held epoch is read as a
    // silent wire, which is the conservative answer and the pre-fix behaviour
    // for an unchanged record.
    wireEpochRef.current = roomState?.wireSeq ?? wireEpochRef.current;

    // ---- THE REPLAY RING, AND IT IS RECORDED HERE AND NOT IN THE FRAME LOOP ----
    //
    // THIS WAS IN THE RENDER LOOP AND IT WAS WRONG, and only the browser said
    // so. The recorder fired once per rAF frame on which the packet number had
    // changed, which caps the recording at the RENDER rate: on a healthy client
    // 60 fps comfortably covers a 20 Hz wire, and on a struggling one it does
    // not. Measured by `tools/replayseen.mjs` against the real client on this
    // box's software rasteriser, the ring held **16 frames spanning 45.08 s** —
    // one sample every three seconds, a slideshow — where it should hold 100
    // frames spanning 5. Every headless number was green: `replaytest` calls
    // `record()` itself, once per simulated tick, so it can never see this.
    //
    // A recording is a property of the WIRE, not of how fast this machine can
    // draw. This effect runs once per committed room record, which is once per
    // message, whatever the frame rate is doing — so the ring fills at the
    // server's rate on a phone that is dropping frames, which is exactly the
    // machine whose owner most wants to see what just happened.
    //
    // The epoch guard stays and still earns its place: `emote`, `last_stand`
    // and a bare `countdown` each commit a fresh record built by spreading the
    // last one, with no player positions on it. `wireSeq` is what tells a
    // packet from a re-commit, and recording a re-commit would push real fight
    // frames out of the ring in favour of duplicates — worst during the break,
    // where the true packet count is ZERO.
    const seq = roomState?.wireSeq;
    if (roomState && seq !== undefined && seq !== replayEpochRef.current) {
      replayEpochRef.current = seq;
      replayStampRef.current = performance.now() / 1000;
      replayBufRef.current.record(replayStampRef.current, Object.values(roomState.players));
    }
  }, [roomState]);
  useEffect(() => { sendInputRef.current = onSendInput; }, [onSendInput]);
  useEffect(() => { matchEndRef.current = matchEnd ?? null; }, [matchEnd]);
  // Held in a ref rather than read from the effect's closure: a parent that
  // rebuilds this callback every render must not tear the arena down and build
  // it again, which is what listing it in the effect's deps would do.
  useEffect(() => { onForgeRef.current = onForge; }, [onForge]);
  // Same argument, for the emote press and the emote relay.
  const onEmoteRef = useRef(onEmote);
  useEffect(() => { onEmoteRef.current = onEmote; }, [onEmote]);
  const onCanEmoteRef = useRef(onCanEmote);
  useEffect(() => { onCanEmoteRef.current = onCanEmote; }, [onCanEmote]);
  const onReplayRef = useRef(onReplay);
  useEffect(() => { onReplayRef.current = onReplay; }, [onReplay]);
  /** Last value pushed, so a per-frame reading becomes a per-change callback. */
  const canEmoteRef = useRef<boolean | null>(null);
  const emoteFeedRef = useRef(emoteFeed);
  useEffect(() => { emoteFeedRef.current = emoteFeed; }, [emoteFeed]);
  const hitFeedRef = useRef(hitFeed);
  useEffect(() => { hitFeedRef.current = hitFeed; }, [hitFeed]);

  const hitStopRef = useRef(0);
  const animRef = useRef(0);
  const lastTimeRef = useRef(0);
  const isMobile = useRef(false);
  const lastDirRef = useRef<AttackDirection>("right");

  const inputState = useRef({
    keys: new Set<string>(),
    // Presses seen since the last sample. A tap shorter than one 60 Hz poll
    // would otherwise be invisible, and a dodge is exactly what a player
    // stabs at fastest. Cleared by the sampler, not by keyup.
    tapped: new Set<string>(),
    mouseDown: false,
    rightMouseDown: false,
  });
  // Split out of inputState because the HUD reads it to draw the "click to take
  // up your weapon" prompt.
  const pointerLockedRef = useRef(false);

  const mobileFlags = useRef({ attack: false, heavy: false, block: false, dodge: false, ability: false, sprint: false, shove: false });
  const setFlag = useCallback((flag: keyof MobileFlags, value: boolean) => {
    mobileFlags.current[flag] = value;
  }, []);
  const touch = useTouchControls(useCallback((deltaX: number) => {
    // `look`, not `yaw +=`: a look the PLAYER asked for is offered to the lock
    // before it lands, so it becomes the flick that takes the next man instead
    // of a shove the lock spends the next three frames undoing. See the note on
    // CameraRig.look and routeLook in input.ts.
    if (stageRef.current) stageRef.current.rig.look(deltaX * 0.01);
  }, []));

  // ---------- stage init ----------
  //
  // The arena is built in named stages that report as they land, rather than
  // in one synchronous block. The work and its order are untouched; the only
  // change is that there is a boundary between the pieces, so the main thread
  // can be handed back in between and a consumer can be told where the build
  // has got to. Done in one block it is seconds of arithmetic on a phone with
  // nothing painted at all, which is indistinguishable from a hang.
  //
  // Three rules hold this together, and each one is a bill already paid:
  //
  //  - **With no consumer, nothing yields.** /shot mounts this component with
  //    no `onForge` and counts settle frames from the moment it mounts, so a
  //    build spread over eight animation frames would eat the frame budget its
  //    poses converge in. With no consumer the loop never awaits at all, and
  //    the whole build lands inside the mount task exactly as it did before.
  //  - **`done` only advances on work that has finished.** The label names the
  //    stage being made, but the number behind it is the weight of the stages
  //    already standing. A bar fed from this cannot claim ground it has not
  //    taken.
  //  - **`window.__forgeStages` grows only when a stage lands**, with what it
  //    cost. The first attempt at this was believed because its screen was
  //    drawing something; it sat at stage zero for seven minutes. A timeline
  //    that only grows on completion is what proves the build, and it can be
  //    read on a real device instead of inherited from this box.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const globals = window as unknown as Record<string, unknown>;
    const warriors = warriorsRef.current;

    // A build that is cancelled mid-flight still has to give back whatever it
    // had already made — a stage that lands after the unmount is holding real
    // GPU memory. Every stage pushes its own release the moment it lands, and
    // cleanup runs them in reverse: a handle gives back what it was built on.
    let cancelled = false;
    let failed = false;
    const disposers: Array<() => void> = [];

    // Resolved once, before the first stage, and never re-read: the yielding
    // behaviour must not change halfway through a build. `__forgeProgress` is
    // the same hook by another door, for a harness that has to watch the build
    // without a React parent to hang a callback on.
    const hook = globals.__forgeProgress;
    const sink: ForgeSink | null =
      onForgeRef.current ?? (typeof hook === "function" ? (hook as ForgeSink) : null);

    // Everything the stages write into. Declared out here rather than threaded
    // through arguments so the bodies below read as the single block they were.
    let renderer!: THREE.WebGLRenderer;
    let scene!: THREE.Scene;
    let quality!: QualitySettings;
    let textures!: TextureLibrary;
    let materials!: MaterialLibrary;
    let rig!: CameraRig;
    let postfx!: PostFxHandle;
    let sky!: SkyHandle;
    let lighting!: LightingHandle;
    let world!: WorldHandle;
    let vfx!: VfxHandle;
    let hud!: Hud3D;
    let audio!: AudioHandle;

    // The stages, and what each costs as a share of the whole. Measured rather
    // than assumed: an evenly-spaced bar over stages this uneven lies twice,
    // racing the cheap half and then appearing to stall on the arena. The
    // shares are CPU cost, which is the right basis for every stage but the
    // first — waking the forge is a WebGL handshake that costs seconds under a
    // software rasteriser and milliseconds on real silicon, so it is weighted
    // for the phone the game is played on rather than for the box that timed it.
    const steps: ReadonlyArray<{ label: string; weight: number; run: () => void }> = [
      {
        label: "WAKING THE FORGE", weight: 6, run: () => {
          isMobile.current = "ontouchstart" in window || navigator.maxTouchPoints > 0;
          quality = resolveQuality();
          try {
            // Context MSAA only earns its keep when the beauty pass reaches the
            // canvas. With the composer up, the only thing the default framebuffer
            // ever sees is a fullscreen quad, and a 4x resolve of that is pure cost —
            // SMAA/FXAA in the chain is what resolves the geometry edges.
            renderer = new THREE.WebGLRenderer({
              canvas,
              antialias: quality.antialias && !quality.postProcessing,
              powerPreference: "high-performance",
            });
          } catch {
            setGlError("Your device's browser could not start 3D graphics (WebGL). Try Chrome, Safari, or updating your OS.");
            failed = true;
            return;
          }
          disposers.push(() => renderer.dispose());
          // Recover gracefully if the GPU context is lost (common on mobile when switching tabs)
          canvas.addEventListener("webglcontextlost", onContextLost);
          canvas.addEventListener("webglcontextrestored", onContextRestored);
          disposers.push(() => {
            canvas.removeEventListener("webglcontextlost", onContextLost);
            canvas.removeEventListener("webglcontextrestored", onContextRestored);
          });
          renderer.setSize(window.innerWidth, window.innerHeight);
          configureRenderer(renderer, quality);
          scene = new THREE.Scene();
        },
      },
      {
        label: "GRINDING PIGMENT AND DYE", weight: 3, run: () => {
          // The team palette is chosen BEFORE any dye is ground (8.9's
          // colour-blind ruling): THE FEEL's high-contrast switch lands at
          // the forge, exactly like the tiers, and this is the forge.
          setTeamContrast(getFeel().teamContrast);
          textures = createTextureLibrary(renderer, quality);
          // Every surface materials.ts asks for is generated on the next line,
          // which is why these are one stage and not two: splitting them would
          // put a boundary where there is no work on one side of it.
          materials = createMaterialLibrary(textures, quality);
          disposers.push(() => { materials.dispose(); textures.dispose(); });
        },
      },
      {
        label: "SETTING THE GRADE", weight: 8, run: () => {
          rig = createCameraRig(quality, { aspect: window.innerWidth / window.innerHeight });
          // postfx first: it owns renderer.toneMappingExposure, and sky.ts encodes
          // its fog and clear colours against that value from its own constructor.
          postfx = createPostFx(renderer, scene, rig.camera, quality);
          disposers.push(() => { postfx.dispose(); rig.dispose(); });
        },
      },
      {
        label: "RAISING THE SKY", weight: 18, run: () => {
          // sky pushes its PMREM into the material library itself, on every rebake —
          // a one-shot setEnvironment here would go stale the first time the mood
          // changes and every metal in the arena would reflect a dead texture.
          sky = createSky(scene, renderer, materials, quality);
          disposers.push(() => sky.dispose());
        },
      },
      {
        label: "LIGHTING THE TORCHES", weight: 1, run: () => {
          // Hand the rig both bodies and let it decide which one the shadows hang on;
          // naming a field for the role rather than the body is what let a sunset ship
          // with every shadow pointing at the sun.
          lighting = createLighting(scene, quality, {
            moon: sky.moonDirection, moonColor: sky.moonColor,
            sun: sky.sunDirection, sunColor: sky.sunColor,
          });
          disposers.push(() => lighting.dispose());
        },
      },
      {
        label: "RAISING THE MOOT", weight: 55, run: () => {
          // THE ROOM'S OWN GROUND, AND WHOSE COUNTRY IT IS.
          //
          // `opts` was never passed at all, so `room.arena` — a field the
          // server has always sent — was ignored, and a second ground could
          // have been registered, dealt and served without this line ever
          // drawing it. The holder rides along so the moot flies the colours of
          // whoever holds the territory being fought over; both fall back
          // safely, which is what a training bout and the shot harness get.
          const room = roomStateRef.current;
          world = createWorld(scene, materials, quality, {
            ground: room?.arena,
            holder: room?.territory?.holder,
          });
          disposers.push(() => world.dispose());
          // The jank strip photographed the follow camera inside a palisade
          // post (8.7). The rig gets this ground's solids AND its play bound
          // — the same table and the same ring the engine's movement
          // resolves against (the palisade is the BOUND, not an obstacle
          // row), so what blocks a stride blocks the lens and there is one
          // opinion about what is solid.
          const groundSpec = GROUNDS[room?.arena ?? ""];
          rig.setOccluders(solidsOf(groundSpec), playBound(groundSpec));
        },
      },
      {
        label: "KINDLING THE FIRES", weight: 8, run: () => {
          // vfx after world, and not only for draw order: it finds the arena's fires
          // by reading the props world.ts has already built, and it lands its blood
          // and its bounces on world.ts's terrain rather than on y = 0, which stopped
          // being the ground the moment the arena got a bank and a ditch.
          vfx = createVfx(scene, textures, quality, {
            groundAt: world.heightAt,
            // Blood on the glass. `vfx` decides WHEN — it is the module that
            // knows where every wound and the camera are — and `postfx` draws
            // it, because a thing in front of the lens can only live in the pass
            // that owns the frame. `postfx` is built two stages above this one,
            // so the reference is live rather than deferred through the stage.
            onLensBlood: (s, u, v) => postfx.lensBlood(s, u, v),
          });
          disposers.push(() => vfx.dispose());
        },
      },
      {
        label: "HANGING THE BANNERS", weight: 1, run: () => {
          hud = createHud3d(scene, quality);
          disposers.push(() => {
            warriors.forEach((slot, id) => { hud.detach(id); slot.rig.dispose(); });
            warriors.clear();
            hud.dispose();
          });

          // The haze picks up the arena's real hero fire rather than sky.ts's
          // documented guess at where it is, so moving the bonfire moves the glow it
          // throws into the air with it. Chosen by reach rather than by index — the
          // torches are built first and the ordering of that list is world.ts's
          // business, not ours.
          const at = new THREE.Vector3();
          let hero: THREE.PointLight | null = null;
          for (const light of world.pointLights) {
            if (!hero || light.distance > hero.distance) hero = light;
          }
          // Costs nothing and creates no AudioContext — see the head of
          // audio.ts. The graph is not built until a real user gesture, and
          // every call into the handle before that emits nothing at all.
          audio = createAudio(quality);
          disposers.push(() => audio.dispose());

          if (hero) {
            hero.getWorldPosition(at);
            sky.setHazeLight({ position: at, color: hero.color.clone(), gain: 1 });
            // The same fire again, to the ear. Copied rather than passed: `at`
            // is scratch and the bed holds this for the life of the arena.
            audio.setBonfire({ x: at.x, y: at.y, z: at.z });
            // The same fire, told to the light rig. lighting.ts carries the hearth's
            // wide pool because it is built before world.ts and cannot be handed a
            // light that does not exist yet; without this it pools at a documented
            // default at the arena origin, which is right only for as long as nobody
            // moves the bonfire.
            lighting.setHearth(at);
          }

          // Photo mode (/shot) pins the camera yaw so captures are reproducible.
          const photoCam = globals.__photoCam;
          if (typeof photoCam === "number") rig.yaw = photoCam;
          // A capture may also aim the camera outright, which is the only way to see
          // a warrior's front — every play mode is over his shoulder.
          const framing = globals.__photoFraming as PhotoFraming | undefined;
          if (framing?.position && framing?.target) {
            rig.setPhotoFraming(framing);
            photoFramedRef.current = true;
          }
        },
      },
    ];

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setGlError("Graphics paused — tap anywhere to resume the battle.");
    };
    const onContextRestored = () => setGlError(null);

    const total = steps.reduce((sum, s) => sum + s.weight, 0);
    // Only ever appended to by a stage that has finished. This is the evidence,
    // not the decoration: a build that is stuck shows a short list that stops
    // growing, and it can be read off a real device.
    const marks: Array<{ label: string; ms: number; at: number }> = [];
    globals.__forgeStages = marks;

    const build = async () => {
      const t0 = performance.now();
      let done = 0;
      for (let i = 0; i < steps.length; i++) {
        if (cancelled) return;
        const step = steps[i];
        // The label is the thing being made; the number is what already stands.
        sink?.({ done, total, label: step.label, stage: i, stages: steps.length });
        if (sink) await yieldToPaint();
        if (cancelled) return;
        const started = performance.now();
        step.run();
        // A forge that would not wake has nothing to build on. The message is
        // already on screen; the remaining stages would only throw.
        if (failed) return;
        marks.push({
          label: step.label,
          ms: Math.round(performance.now() - started),
          at: Math.round(performance.now() - t0),
        });
        done += step.weight;
      }
      if (cancelled) return;

      // Committed in one piece after the last stage, never across a yield: the
      // frame loop reads `stageRef` and a half-wired stage is a torn frame.
      const stage: Stage = { renderer, scene, quality, textures, materials, sky, lighting, world, vfx, postfx, rig, hud, audio };
      stageRef.current = stage;
      disposers.push(() => { stageRef.current = null; });
      wireInput();
      sink?.({ done: total, total, label: "THE MOOT IS SET", stage: steps.length, stages: steps.length });
    };

    // input listeners
    const wireInput = () => {
    const inp = inputState.current;
    const mouseDelta = { x: 0, y: 0 };
    // "Press anything to skip." Bound to the raw device edges rather than to the
    // 60 Hz input sampler, because the sampler only runs in the fighting states
    // and a dead man is not in one — the same reason the emote press is wired
    // here. A held key does not re-skip; there is nothing left to skip.
    // Both cameras, one press. "Press anything to skip" cannot mean "skip the
    // one you happen to be inside" — a player who taps out of the round beat and
    // then finds his own hold still running would read the control as broken.
    const skipDeathCam = () => { deathCamRef.current.skip(); roundCamRef.current.skip(); };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (!e.repeat) skipDeathCam();
      inp.keys.add(k);
      // Auto-repeat is a held key, not a fresh press; latching it would fire a
      // dodge every time the OS repeated the keystroke.
      if (!e.repeat) {
        inp.tapped.add(k);
        // Emotes are not part of the input message — the sim never reads them —
        // so the press goes out on its own edge, here, where it also works in
        // the intermission and over the summary, which the 60 Hz sampler
        // (fighting states only) never covers.
        const b = getBindings();
        const em: EmoteId | null = b.emote1.includes(e.code) ? "raise"
          : b.emote2.includes(e.code) ? "boss"
          : b.emote3.includes(e.code) ? "taunt" : null;
        if (em) onEmoteRef.current?.(em);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => inp.keys.delete(e.key.toLowerCase());
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) inp.mouseDown = true;
      if (e.button === 2) inp.rightMouseDown = true;
      skipDeathCam();
      if (!pointerLockedRef.current && !isMobile.current) canvas.requestPointerLock?.();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) inp.mouseDown = false;
      if (e.button === 2) inp.rightMouseDown = false;
    };
    const onCtx = (e: Event) => e.preventDefault();
    const onPLChange = () => { pointerLockedRef.current = document.pointerLockElement === canvas; };
    const onMM = (e: MouseEvent) => {
      if (pointerLockedRef.current) { mouseDelta.x += e.movementX; mouseDelta.y += e.movementY; }
    };
    const onResize = () => {
      rig.setViewport(window.innerWidth, window.innerHeight);
      renderer.setSize(window.innerWidth, window.innerHeight);
      postfx.setSize(window.innerWidth, window.innerHeight);
    };
    // The phone's half of "press anything". The touch pads live in their own
    // React layer over the canvas and never reach `mousedown`, so a thumb
    // anywhere on the glass is caught here — passive, because this listener
    // only ever reads.
    const onTouch = () => skipDeathCam();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onCtx);
    document.addEventListener("pointerlockchange", onPLChange);
    canvas.addEventListener("mousemove", onMM);
    window.addEventListener("resize", onResize);
    globals.__bretwalda_mouse = mouseDelta;

    disposers.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("touchstart", onTouch);
      canvas.removeEventListener("mousedown", onMouseDown);
      // FROM THE WINDOW, where it was added — a mouse released off the canvas
      // still ends the swing, which is why the add is on window; removing it
      // from the canvas (as this line did) leaked one window listener per
      // canvas mount, every match. react-doctor found it.
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("pointerlockchange", onPLChange);
      canvas.removeEventListener("mousemove", onMM);
      window.removeEventListener("resize", onResize);
    });
    };

    void build();

    return () => {
      cancelled = true;
      // Reverse of the order they were made in: a handle gives back what it
      // was built on top of. Whatever the build had reached is what is here.
      for (const release of disposers.reverse()) release();
      stageRef.current = null;
    };
  }, []);

  // ------- haptics (mobile rumble) -------
  const rumble = useCallback((pattern: number | number[]) => {
    try { if (isMobile.current && navigator.vibrate) navigator.vibrate(pattern); } catch { /* ok */ }
  }, []);

  // ---------- main loop ----------
  useEffect(() => {
    let running = true;
    // Scratch for the one consumer that must NOT see `wireEpoch`. Made once
    // and refilled; see the summary call below for why it is stripped.
    const summaryCtx = {} as FrameContext;

    const loop = (time: number) => {
      if (!running) return;
      animRef.current = requestAnimationFrame(loop);

      // The frame's REAL length, before the simulation clamp below. Nothing
      // that integrates may use it; the two things that measure a WALL budget
      // must — see the replay clock's `s.wall`. A renderer at 0.66 Hz was
      // otherwise being told every frame that a twentieth of a second had
      // passed, and a four-second replay took two minutes of the player's life.
      const wallDt = (time - (lastTimeRef.current || time)) / 1000;
      const rawDt = Math.min(wallDt, 0.05);
      lastTimeRef.current = time;
      // Hit-stop: brief slow-mo on heavy impacts for punch
      let dt = rawDt;
      if (hitStopRef.current > 0) {
        hitStopRef.current -= rawDt;
        dt = rawDt * 0.22;
      }

      const stage = stageRef.current;
      if (!stage) return;

      const roomState = roomStateRef.current;
      const localPlayer = roomState?.players[playerId];
      const mood: Mood = roomState?.lastStandTriggered ? "lastStand" : "dusk";

      const ctx: FrameContext = {
        dt,
        rawDt,
        time: performance.now() / 1000,
        camera: stage.rig.camera,
        focus: focusRef.current,
        localId: playerId,
        localState: localPlayer?.state ?? null,
        mood,
        quality: stage.quality,
        wireEpoch: wireEpochRef.current,
      };

      stage.world.update(dt, ctx);
      stage.sky.update(dt, ctx);
      stage.lighting.update(dt, ctx);

      // Before the first packet the camera holds its opening position; there is
      // nothing to look at yet.
      if (!roomState) {
        stage.vfx.update(dt, ctx);
        stage.audio.update(dt, ctx);
        stage.postfx.render(dt, ctx);
        return;
      }

      // ---------- the round boundary ----------
      //
      // The owner's report: "when loading into a second round blood floating in
      // mid air." It is the countdown flash again in a different organ — an
      // effect the client owns whose ending condition the server owns. The sim
      // ends a round, waits out the break, stands everyone up on a fresh ring
      // and starts the next one; vfx.ts was never told, and a ground stain
      // lives twenty-six seconds, a pool seventy, and a mark of blood stuck to
      // a man's skin thirty — all of them longer than the five-second break.
      // The marks on skin are stored in the local frame of the spine bone, so
      // they are redrawn at chest height wherever that bone has got to, which
      // is the "mid air" half of what he saw.
      //
      // Ahead of every branch below — summary, lobby, intermission and fight —
      // because a round can be dealt into any of them and the arena has to be
      // clean before anything draws. `roundBoundary` is shared with
      // `tools/goretest.mjs`, so what this frame calls a new round and what the
      // harness asserts about one are the same function.
      const phase = { state: roomState.state, roundIndex: roomState.roundIndex ?? 0 };
      if (roundBoundary(roundPhaseRef.current, phase)) {
        stage.vfx.clearBattle();
        // The same seam, for the same reason. A new round stands every man up
        // whole; a hold still running on the last round's corpse and a stump
        // node from a body that has been put back together are both leftovers
        // of exactly the kind `clearBattle` exists to take.
        //
        // `roundBoundary` fires on the round INDEX going up or on the edge into
        // the countdown — never on the edge into the break — so the beat below
        // arms inside the break and is torn down here, one round later, rather
        // than being reset on the frame it was armed.
        deathCamRef.current.reset();
        roundCamRef.current.reset();
        killReplayRef.current.reset();
        spectateAimRef.current.reset();
        seversRef.current.clear();
        lastFallRef.current = null;
        deadWasRef.current.clear();
      }
      roundPhaseRef.current = phase;

      // WHO FELL LAST, tracked on the EDGE and not read off the wire, because
      // the wire has no such field and adding one is the server's business.
      // `checkRoundEnd` runs inside the same simulation step as the blow, so the
      // packet that first reports the break is the packet that first reports the
      // fall: whatever this holds when the room turns to `intermission` is the
      // death that ended the round.
      for (const id of Object.keys(roomState.players)) {
        const dead = roomState.players[id].state === "dead";
        // `=== false` and not `!`: a man first seen already dead — a late join, a
        // reconnect — never manufactures a fall that this client did not watch.
        if (dead && deadWasRef.current.get(id) === false) {
          lastFallRef.current = { id, killerId: roomState.players[id].lastHitBy || null };
          // WHEN, on the recorder's own clock. `runRoundCam` needs only WHO
          // fell; a replay needs the moment, and the only moment that can be
          // read off this wire is the stamp of the packet that first showed him
          // dead. `REPLAY.pre` is measured backwards from here, and it is sized
          // (0.92 s) as the longest a swing can be between starting and its
          // contact window closing — so the blow is inside the window even
          // though this stamp is its trailing edge and not its instant.
          deathAtRef.current = replayStampRef.current;
          deathCauseRef.current = roomState.players[id].deathCause ?? null;
        }
        deadWasRef.current.set(id, dead);
      }

      // A warrior's client half, built on first sight. Shared by the fight
      // loop and the summary path: a canvas that mounts straight into a
      // finished room — the /shot harness stages exactly that — has never
      // built a rig, and a summary with nobody on it is a landscape.
      const ensureSlot = (p: GamePlayer): WarriorSlot => {
        let slot = warriorsRef.current.get(p.id);
        if (!slot) {
          const rig = createWarriorRig(stage.scene, p, stage.materials, stage.quality);
          stage.hud.attach(p.id, p.name, rig.group, p.id === playerId, rig.headTop);
          slot = {
            rig, motion: createMotion(p), prevHp: p.health, prevState: p.state,
            dustTick: 0, stepTick: 0, prevAbility: p.abilityActive,
            prevPhase: p.attackPhase ?? null,
          };
          warriorsRef.current.set(p.id, slot);
        }
        return slot;
      };

      /**
       * THE DEATH CAMERA. Called on the fight path AND on the round-break path,
       * and that is not belt and braces — it is the case. `checkRoundEnd` fires
       * on the tick the last man falls, so in an honour duel the very packet
       * that first reports YOUR death is already `intermission`. A hold wired
       * only into the fighting branch would never once run in the mode the owner
       * plays.
       *
       * Returns true when it has taken the lens, and the caller leaves it alone.
       * It cannot take anything else: it sends no input, moves no body, and
       * ends inside the break the server was already taking (3.1 s of hold in a
       * 5 s break, both measured in `tools/deathcamtest.mjs`).
       */
      /**
       * One man's body and wound as the RIG has them this frame — where the
       * collapse has actually carried him, not where the last packet put him.
       * Shared by both cameras, because "where is the wound on this man" has one
       * answer and two readers, and two derivations of it would let the hold and
       * the beat disagree about the same corpse.
       */
      const bodyOf = (id: string) => {
        const slot = warriorsRef.current.get(id);
        if (!slot) return null;
        const g = slot.rig.group;
        g.updateWorldMatrix(true, false);
        const body = { x: g.position.x, y: g.position.y, z: g.position.z };
        let wound: { x: number; y: number; z: number } | null = null;
        let spray: { x: number; y: number; z: number } | null = null;
        let part: { x: number; y: number; z: number } | null = null;
        const cut = seversRef.current.get(id);
        // A stump whose part has left the scene has been reclaimed by the pool
        // (`Severance.release`), and a stump with no parent is a rig that has
        // been torn down. Either way there is no wound to look at any more.
        if (cut && cut.stump.parent) {
          cut.stump.updateWorldMatrix(true, false);
          const e = cut.stump.matrixWorld.elements;
          wound = { x: e[12], y: e[13], z: e[14] };
          const s = cut.sign;
          const l = Math.hypot(e[4], e[5], e[6]) || 1;
          spray = { x: (e[4] * s) / l, y: (e[5] * s) / l, z: (e[6] * s) / l };
          if (cut.part.parent) {
            cut.part.updateWorldMatrix(true, false);
            const pe = cut.part.matrixWorld.elements;
            part = { x: pe[12], y: pe[13], z: pe[14] };
          }
        }
        return { body, wound, spray, part };
      };

      /** Put a shot from either camera on the rig, and take the ear with it. */
      const aimAt = (shot: { position: [number, number, number]; target: [number, number, number]; fov: number }) => {
        // `summary` mode with `from` and `to` at the same point is the rig's
        // "put the lens exactly here and look exactly there" — no shake, no bob,
        // no lock reticle, which are all wrong over a corpse. The easing and the
        // hold are `deathcam.mjs`'s, per frame, because that is the part worth
        // asserting and `camera.ts` owns none of it.
        stage.rig.setSummaryShot({ from: shot.position, to: shot.position, target: shot.target, fov: shot.fov, seconds: 1 });
        stage.rig.setMode("summary");
        // The ear goes with the eye. Without this the mix keeps panning around
        // the arena centre while the picture is two metres from a stump.
        focusRef.current.set(shot.target[0], 0, shot.target[2]);
      };

      const runDeathCam = (): boolean => {
        const cam = deathCamRef.current;
        const state = roomState.state;
        const live = state === "fighting" || state === "last_stand" || state === "intermission";
        // A man on his feet has no wound to follow, and this is cleared BEFORE
        // the body is read rather than after. The solo mode respawns every five
        // seconds forever, so without it the stump from the last death would
        // still be the camera's idea of where he is opened.
        if (localPlayer && localPlayer.state !== "dead") seversRef.current.delete(playerId);
        const mine = localPlayer ? bodyOf(playerId) : null;
        if (!localPlayer || !mine) { cam.reset(); return false; }

        const killerId = localPlayer.lastHitBy;
        const killer = killerId ? roomState.players[killerId] : null;
        const shot = cam.update(dt, {
          dead: localPlayer.state === "dead",
          live,
          camera: stage.rig.camera.position,
          body: mine.body, wound: mine.wound, spray: mine.spray, part: mine.part,
          killer: killer ? { x: killer.position.x, y: killer.position.y, z: killer.position.z } : null,
          groundAt: stage.world.heightAt,
        });
        if (!shot) return false;
        aimAt(shot);
        return true;
      };

      /**
       * THE ROUND'S FINAL DEATH, on everybody's screen.
       *
       * The owner: "everyone should see death camera for final death winner &
       * all losers." So there is no `dead` here and its absence is the feature —
       * this is the camera the man who WON gets, and he is the man the death
       * camera could never reach.
       *
       * `own` is the death camera's answer for THIS frame and is handed straight
       * through: the precedence rule lives in `deathcam.mjs` and is enforced
       * once, so the order these two are called in cannot decide the outcome.
       * Called every frame of the break whatever `own` says, because the beat
       * arms on an EDGE and an edge nobody looks at is an edge that is missed.
       */
      const runRoundCam = (own: boolean): boolean => {
        const cam = roundCamRef.current;
        // The break, and only the break. `countdown` is the next round being
        // dealt and `finished` is the match summary's, which stages its own
        // tableau — see the deferral on `tools/deathcamtest.mjs`'s verdict line.
        // The break, and — since the replay landed — the match's own last
        // death as well. `finished` used to be excluded here with the note
        // "the match summary's, which stages its own tableau"; that was true
        // and it is exactly the hole `docs/BACKLOG.md` 2.6 names, because the
        // tableau stages the VICTOR and the death was never shown at all. The
        // summary is now held back while a match-ending replay runs (see the
        // replay clock above), so for those frames there is no tableau to
        // fight over and this beat has the lens.
        const ended = roomState.state === "intermission" || killReplayRef.current.playing;
        const fell = lastFallRef.current;
        const him = fell ? bodyOf(fell.id) : null;
        const killer = fell && fell.killerId ? roomState.players[fell.killerId] : null;
        const shot = cam.update(dt, {
          ended,
          live: ended,
          own,
          body: him ? him.body : null,
          wound: him ? him.wound : null,
          spray: him ? him.spray : null,
          part: him ? him.part : null,
          killer: killer ? { x: killer.position.x, y: killer.position.y, z: killer.position.z } : null,
          camera: stage.rig.camera.position,
          groundAt: stage.world.heightAt,
        });
        if (!shot) return false;
        aimAt(shot);
        return true;
      };

      // Emote relays, drained on whichever path is posing bodies this frame.
      // The trigger goes to the rig's motion — the performance is the
      // animator's — and the voice fires here, beside it, so the flourish is
      // never carried in sound alone or in picture alone.
      //
      // `allowed` is the summary's veto and nothing else's: the stage lays most
      // of the moot out dead, and the server cannot refuse those men — it has
      // already rolled the room back to a lobby where everyone is idle again.
      const drainEmotes = (allowed?: (id: string) => boolean) => {
        const feed = emoteFeedRef.current?.current;
        if (!feed || feed.length === 0) return;
        for (const ev of feed.splice(0, feed.length)) {
          if (allowed && !allowed(ev.playerId)) continue;
          const p = roomState.players[ev.playerId];
          const slot = p ? ensureSlot(p) : warriorsRef.current.get(ev.playerId);
          if (!slot) continue;
          triggerEmote(slot.motion, ev.emote);
          const at = slot.rig.group.position;
          stage.audio.emote({
            position: { x: at.x, y: 1.4, z: at.z },
            local: ev.playerId === playerId,
            emote: ev.emote,
            shield: !!slot.rig.shield,
          });
        }
      };

      // The end of the match: the arena stays up and render/summary.ts stages
      // the men who fought it — victor centre, the wall behind him, a duel's
      // corpse left where it fell. Held on the VERDICT rather than the room
      // state because the server rolls the room back to "lobby" ten seconds
      // in, and the picture must hold until the player actually leaves it; a
      // "countdown" (next match starting under the summary) breaks it anyway.
      // ---- THE REPLAY CLOCK ----
      //
      // Asked EVERY frame and asked HERE, above the summary branch, because it
      // arms on the rising edge of "the round is over" and the match summary
      // returns out of this function. An edge nobody looks at is an edge that
      // is missed, and at match end that edge IS the feature: the room goes
      // `fighting` -> `finished` in one tick with no break at all, which is
      // why the last death of a match was seen by nobody and why
      // `docs/BACKLOG.md` 2.6 has stood open.
      //
      // `own` is the death camera's own answer and not a second copy of the
      // rule — but it is LAST FRAME's answer, because `runDeathCam` is called
      // below inside the branch this may divert. That is a sixtieth of a
      // second of lag on a precedence test that is asked over a whole beat, and
      // it is written down rather than hidden.
      //
      // AND AT MATCH END THAT LAG WAS THE WHOLE DEFECT. This comment used to
      // end "at match end the point is moot: the summary branch resets the
      // death camera, so `holding` is already false by the time a `finished`
      // edge arrives." That was false on the only frame that matters. The
      // summary branch is BELOW this call and cannot have run yet on the edge
      // frame, and what actually ends the hold is `runDeathCam`'s own `live`,
      // which excludes `finished` — also below this call. So on the `finished`
      // edge `holding` still carries the answer from the previous frame, and
      // for any viewer who died inside the last `DEATH_HOLD.total` (3.35 s) of
      // the match that answer is `true`. `replay.mjs` refused on it, and
      // "armed-and-refused is still armed" made the refusal permanent: he got
      // the results panel and no replay and no SKIP, which is exactly the beat
      // the owner asked for and the one BACKLOG 2.6 was opened about.
      //
      // The rule now lives where precedence lives — `replay.mjs` ignores `own`
      // when `end` is set, because a hold cannot survive the transition that
      // sets it. Nothing here manufactures a second copy of the death camera's
      // arming rule to get a fresher answer; the module is simply told which
      // ending it is in, which it already needed for `atEnd`.
      // `tools/replaytest.mjs` §4 sweeps the gap between the viewer's death and
      // the room ending and gates every value of it.
      const replayOwn = deathCamRef.current.holding;
      const fellNow = lastFallRef.current;
      const ring = replayBufRef.current;
      const replayFrame = killReplayRef.current.update(dt, {
        // The countdown's clock, unclamped and un-hit-stopped. `dt` above is
        // still what the animator is stepped with.
        wall: wallDt,
        ended: roomState.state === "intermission" || roomState.state === "finished",
        end: roomState.state === "finished",
        own: replayOwn,
        deathAt: deathAtRef.current,
        cause: deathCauseRef.current,
        // Is there a death to show, and is the ring still holding the run-up to
        // it. A replay that opens PART WAY THROUGH the killing swing is the one
        // thing this feature exists not to do, so it refuses rather than
        // showing a short one.
        ready: !!fellNow && ring.first !== null
          && ring.first <= deathAtRef.current - runUpOf(deathCauseRef.current),
      });
      const replaying = killReplayRef.current.playing;
      if (replayFrame) replayDrawnRef.current++;
      // A READBACK FOR `tools/replayseen.mjs`, the same shape of hook
      // `camera.ts` hangs on the window for `cameratest` and `audio.ts` for
      // `phonesound`. Nothing in the game reads it.
      //
      // It exists because the first browser run of that harness came back RED
      // with every headless number green, and the DOM alone could not say WHY:
      // "no skip appeared" is the same observation whether the clock never
      // armed, armed and was outranked, or armed with an empty ring. These
      // five fields are the arming decision's own inputs and its answer.
      if (typeof window !== "undefined") {
        (window as unknown as Record<string, unknown>).__bretwaldaReplay = {
          playing: replaying,
          atEnd: killReplayRef.current.atEnd,
          elapsed: killReplayRef.current.elapsed,
          drawn: replayDrawnRef.current,
          frames: ring.frames,
          held: ring.first === null ? -1 : (ring.last ?? 0) - ring.first,
          deathAt: deathAtRef.current,
          cause: deathCauseRef.current,
          ready: !!fellNow && ring.first !== null
          && ring.first <= deathAtRef.current - runUpOf(deathCauseRef.current),
          own: replayOwn,
          state: roomState.state,
          at: replayFrame ? replayFrame.at : null,
        };
      }
      if (replaying !== replayToldRef.current) {
        replayToldRef.current = replaying;
        onReplayRef.current?.(replaying
          ? { playing: true, atEnd: killReplayRef.current.atEnd, skip: () => killReplayRef.current.skip() }
          : null);
        // THE CLIP (7.9): the replay records itself. Armed on the replay's
        // opening frame, stopped on its last; the deathcam's lens does the
        // camera work, which is the owner's whole bar. Low tier never
        // records — encoding beside a fight it can barely draw is how a
        // phone turns a replay into a slideshow.
        if (replaying) {
          const cv = canvasRef.current;
          // `__forceClip` is the harness door, same shape as `__photoCam`:
          // on the GPU-less capture box medium starves the replay itself and
          // low never arms by the policy line below, so without a door the
          // recorder MACHINERY could never be judged — only asserted. The
          // policy stays this one readable line; the door bypasses only it.
          const forced = (window as unknown as Record<string, unknown>).__forceClip === true;
          const canRecord = cv && typeof MediaRecorder !== "undefined"
            && typeof (cv as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }).captureStream === "function"
            && (ctx.quality.tier !== "low" || forced);
          if (canRecord) {
            try {
              const stream = (cv as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream(30);
              const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
                .find((m) => MediaRecorder.isTypeSupported(m));
              const rec = new MediaRecorder(stream, mime
                ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
              clipChunksRef.current = [];
              rec.ondataavailable = (e) => { if (e.data.size > 0) clipChunksRef.current.push(e.data); };
              rec.onstop = () => {
                const blob = new Blob(clipChunksRef.current, { type: rec.mimeType || "video/webm" });
                clipChunksRef.current = [];
                // A clip of nothing is not a clip: a few KB means the stream
                // never carried a frame, and offering it would hand the
                // player an unplayable file with the game's name on it.
                if (blob.size > 16384) {
                  clipRef.current = blob;
                  onClipRef.current?.(saveClipRef.current);
                  // A readback for `tools/replayseen.mjs`, the same shape as
                  // `__bretwaldaReplay` below. Nothing in the game reads it.
                  (window as unknown as Record<string, unknown>).__bretwaldaClip =
                    { bytes: blob.size, mime: blob.type };
                }
              };
              rec.start(250);
              clipRecRef.current = rec;
            } catch { clipRecRef.current = null; }
          }
        } else if (clipRecRef.current) {
          try { if (clipRecRef.current.state === "recording") clipRecRef.current.stop(); } catch { /* gone */ }
          clipRecRef.current = null;
        }
      }

      const verdict = matchEndRef.current;
      // AND THE SUMMARY WAITS FOR IT. This is the whole of the match-end half:
      // `render/summary.ts` takes the lens for the victor's portrait on the
      // same frame the match ends, and it took it from the last death of the
      // match. While a match-ending replay is running the tableau is simply not
      // built yet, so control falls through to the branch below — `finished` is
      // not a fight state — and that is where the replay is drawn.
      const isSummary = verdict !== null && roomState.mode !== "solo" &&
        (roomState.state === "finished" || roomState.state === "lobby") &&
        !replaying;
      if (isSummary) {
        // The match tableau owns the lens from here, and it aims the same rig
        // through the same `summary` mode the hold does. Cleared rather than
        // left to time out, or a hold armed on the killing blow of the last
        // round would spend the first seconds of the portrait fighting
        // `render/summary.ts` for the camera every frame. The round beat goes
        // the same way and for the same reason: the match summary IS the
        // round-end beat for the round that ends a match, it stages the victor
        // rather than the corpse, and two cameras on one lens is the thing this
        // whole feature is careful not to be.
        deathCamRef.current.reset();
        roundCamRef.current.reset();
        spectateAimRef.current.reset();
        for (const p of Object.values(roomState.players)) ensureSlot(p);
        // The portrait owns the whole frame: no floating names, no health
        // bars over men the match has already judged. Cleared on the way out
        // so the rematch gets its plates back without rebuilding one of them.
        stage.hud.setSuppressed(true);
        summaryRef.current ??= createSummary({
          scene: stage.scene,
          rig: stage.rig,
          groundAt: stage.world.heightAt,
          douse: (id) => {
            stage.vfx.setBurning(id, false, 0, false);
            stage.audio.setBurning(id, false, 0, false, { x: 0, y: 0, z: 0 });
          },
        });
        // THE SUMMARY IS HANDED A CONTEXT WITH NO WIRE ON IT.
        //
        // `wireEpoch` tells the interpolator that an unchanged record is a
        // fresh authoritative sample rather than silence (see `quality.ts`).
        // That is right for a live fight and it is not this stage's bargain:
        // the podium record is deliberately FROZEN, the men are carried to
        // marks by this module, and `summary.ts` calls `cutNetHistory` at the
        // moments it wants the wire forgotten. Leaving the epoch on would put
        // this stage's behaviour under a mechanism no summary harness has
        // measured, to buy nothing the staging does not already do.
        //
        // Reversible on purpose, and the argument for reversing it is real:
        // confirming a frozen man drives his segment velocity to ZERO, which
        // is the exact failure `cutNetHistory` exists to prevent. If the
        // podium is ever revisited, hand it `ctx` whole and delete this.
        //
        // Mutated in place rather than spread: a fresh object here would be an
        // allocation every frame of the summary, and this screen holds for
        // several seconds.
        Object.assign(summaryCtx, ctx);
        summaryCtx.wireEpoch = undefined;
        summaryRef.current.update(dt, summaryCtx, roomState, verdict, warriorsRef.current, playerId);
        // A press from the summary surface plays on the staged tableau — the
        // motion is shared, so the flourish lands on the man mid-portrait. It
        // is drained AFTER the stage has been built, because who is standing is
        // the stage's answer and it is what decides whose press is honoured.
        drainEmotes((id) => summaryRef.current?.canPerform(id) ?? true);
        // THE BUTTON ASKS WHAT THE STAGE ANSWERS. `MatchSummary` used to render
        // the flourish row unconditionally — `{onEmote && <EmoteRow/>}`, with no
        // reference to whether the man could actually perform — while the stage
        // refused every press from anyone it had not stood up. Two sources of
        // truth for one question, so a corpse on the summary was shown three
        // buttons that did nothing, and "vetoed" is indistinguishable from
        // "broken" to the player pressing them. It also made summaryflow's war
        // band check fail about half the time, which is how it surfaced: the
        // answer depended on which side the local man happened to be on.
        const can = summaryRef.current?.canPerform(playerId) ?? true;
        if (can !== canEmoteRef.current) { canEmoteRef.current = can; onCanEmoteRef.current?.(can); }
        stage.rig.update(dt, ctx);
        stage.vfx.update(dt, ctx);
        stage.audio.update(dt, ctx);
        stage.hud.update(dt, ctx);
        stage.postfx.render(dt, ctx);
        return;
      }
      summaryRef.current?.reset();
      stage.hud.setSuppressed(false);
      // ...AND OFF THE STAGE, THE FIGHT'S OWN RULE, PUSHED FROM THE SAME PLACE.
      //
      // `summary.ts`'s `canPerform` states the law: "Before the stage exists
      // nobody has been judged yet, and the fight's own rule — the server
      // refuses a dead man's emote — is the right one to fall back to. AFTER
      // IT, STANDING IS THE PERMISSION." Only the first half was ever pushed
      // up. `page.tsx` supplied the second by ANDing the wire's own
      // `state !== "dead"` onto the button — which is right during a fight and
      // wrong the moment the stage exists, because the podium deliberately
      // stands the honoured few up and the wire still calls the fallen ones
      // dead. A man who placed top three and is standing on the podium was
      // refused his flourish, and `summaryflow` caught it as
      // `localStanding=true wire=dead emoteButtons=0`.
      //
      // So the whole answer is decided HERE, where both halves are in scope,
      // and the page renders what it is told. One question, one owner.
      {
        const alive = roomState.players[playerId]?.state !== "dead";
        if (alive !== canEmoteRef.current) { canEmoteRef.current = alive; onCanEmoteRef.current?.(alive); }
      }

      // Between matches the camera takes the slow establishing orbit and
      // nothing else runs — no input, no sim, no feedback.
      const isFight = roomState.state === "fighting" || roomState.state === "last_stand" || roomState.state === "countdown";
      if (!isFight) {
        // The round break keeps the bodies live rather than frozen mid-tick:
        // the fallen stay down, the standing breathe, and a victory emote
        // relayed during the break — which is where the touch surface offers
        // it — plays on the man who pressed it. The wire is static here (the
        // sim only broadcasts while fighting), so this is pure animation.
        if (replayFrame) {
          // ---- THE LAST KILL, AGAIN, AT HALF SPEED ----
          //
          // THE ANIMATOR IS STEPPED WITH THE REPLAY'S dt AND NOTHING ELSE IS.
          // `replayFrame.dt` is this frame's wall dt already multiplied by
          // `REPLAY.rate`, and slow motion is a property of every clock a body
          // rides on, not of the positions alone: `replaytest` §1 measured
          // 83.27 degrees of error on a knee from getting exactly this wrong.
          // The world, the sky, the fires and the HUD below keep the frame's
          // real `dt` — a bonfire at half speed is not slow motion, it is a
          // broken bonfire.
          const rdt = replayFrame.dt;
          const wasTime = ctx.time;
          ctx.time = replayFrame.at;
          const out = replayOutRef.current;
          const n = ring.readInto(replayFrame.at, out);
          for (let i = 0; i < n; i++) {
            const rp = out[i] as unknown as GamePlayer;
            // The men on screen are the men who were in the fight, so their
            // rigs already exist. A recorded record is NOT a whole
            // `GamePlayer` — it carries the fields `anim.ts` reads and no name,
            // no stamina, no ready flag — so it must never be handed to
            // `ensureSlot`, which would build a rig and a name plate out of it.
            const slot = warriorsRef.current.get(rp.id);
            if (!slot) continue;
            stepWarriorTransform(slot.rig, slot.motion, rp, rdt, ctx);
            // NO `onSever`. The rig puts itself back together and re-cuts on
            // its own — `poseWarrior` calls `reassemble(rig)` on any frame the
            // man is not dead, which clears `gore.done` — but the VFX side does
            // not: `animHooks.onSever` spawns blood, a decal and a stump
            // through `stage.vfx`, and a replayed death would spray the arena a
            // second time over the first spray. Only `groundAt` is passed, so
            // a severed piece still lands on the bank rather than through it.
            poseWarrior(slot.rig, slot.motion, rp, rdt, ctx, { groundAt: stage.world.heightAt });
            // AND THE PLATE OVER HIM SHOWS THE RECORDED BAR, not the live one.
            // The plate is anchored to the rig's own matrix (`hud3d.ts:1817`)
            // so it already follows the recorded body; its HEALTH would
            // otherwise still read the wire, and the wire says every man in
            // this replay is dead. A full bar over a man about to be cut open
            // is the point of the beat — a zero over him is the plate calling
            // the recording a lie.
            stage.hud.setHealth(rp.id, rp.health, rp.maxHealth);
            slot.prevHp = rp.health;
            slot.prevState = rp.state;
          }
          ctx.time = wasTime;
        } else if (roomState.state === "intermission") {
          drainEmotes();
          for (const p of Object.values(roomState.players)) {
            const slot = ensureSlot(p);
            stepWarriorTransform(slot.rig, slot.motion, p, dt, ctx);
            poseWarrior(slot.rig, slot.motion, p, dt, ctx, { groundAt: stage.world.heightAt });
            slot.prevHp = p.health;
            slot.prevState = p.state;
            slot.prevPhase = p.attackPhase ?? null;
          }
        }
        // AFTER the bodies have been posed, so the lens is aimed at the frame
        // the corpse is in rather than at the one it was in last tick — and
        // ahead of the lobby orbit, because in a duel the packet that reports
        // your death has already turned the room to `intermission` and this
        // branch is where the whole hold AND the whole round beat play out.
        //
        // Both cameras are ticked every frame and only one can take the lens.
        // The beat is asked even when the hold has already answered, because it
        // arms on an edge and refuses on `own` — an edge nobody offers it is an
        // edge it never sees, and the beat would then arm a frame late for a man
        // whose hold was skipped.
        if (photoFramedRef.current) {
          stage.rig.setMode("lobby");
        } else {
          const own = runDeathCam();
          const beat = runRoundCam(own);
          if (!own && !beat) stage.rig.setMode("lobby");
        }
        stage.rig.update(dt, ctx);
        // vfx owns the bonfire and the torches now, so it runs on both early-out
        // paths as well: without this the moot's fires freeze mid-lick in the
        // lobby and between rounds, which is precisely when the establishing
        // orbit is looking straight at them. It runs after the camera rather
        // than up beside world/sky because every quad it draws is billboarded
        // against this frame's view.
        stage.vfx.update(dt, ctx);
        // The bonfire is the arena's only continuous voice and it burns through
        // the lobby and the intermission for the same reason vfx runs here: the
        // establishing orbit is looking straight at it.
        stage.audio.update(dt, ctx);
        // AND THE NAME PLATES, which this branch did not look at until now.
        //
        // `stage.hud.update` was called in exactly two places — the match
        // summary above and the fight path below — so on `lobby`,
        // `intermission` and `finished` every plate kept the transform, the
        // visibility and the alpha it had on the last FIGHTING frame while the
        // camera went on to the death hold, the round beat, the match-end
        // replay and the lobby orbit. A plate frozen facing where the camera
        // used to be is seen off-axis, which is the tilt; once the lens has
        // swung past ninety degrees it is seen from BEHIND, and the name
        // material is `THREE.DoubleSide` (`hud3d.ts:864`), so the back of a
        // plate is the man's name printed backwards. That is the `blidoebood`
        // in `art/defects/nameplate-mirrored-last-replay-1.png`.
        //
        // PRE-EXISTING — `origin/main` has the same two call sites and the same
        // gap — but the match-end replay is the longest the camera has ever
        // moved while the HUD was not looking, so it is where it photographed
        // itself, and it is the one beat on this branch a player is asked to sit
        // and watch. Fixed here rather than filed.
        //
        // AND IT IS A PICTURE DECISION, not a sign flip: ticking this decides
        // WHICH SCREENS SHOW NAME PLATES. The round break and the match-end
        // replay get live plates, which is what the two frames in `art/defects/`
        // were taken to compare. The LOBBY does not: it has never drawn a plate
        // before a first fight and the establishing orbit is a landscape, not a
        // roster. `setSuppressed` is the summary branch's own control, used the
        // same way and cleared the same way, so the next fight gets its plates
        // back without rebuilding one of them.
        stage.hud.setSuppressed(roomState.state === "lobby");
        stage.hud.update(dt, ctx);
        stage.postfx.render(dt, ctx);
        return;
      }

      const players = roomState.players;

      // Input sampling and mouse look live on the 60 Hz timer at the bottom of
      // this effect, not here — see the note there.

      // ===== warriors =====
      // One hooks object for the whole frame rather than one per warrior. Every
      // callback closes over `stage` alone, so there is nothing per-warrior in
      // here to capture — and a brawl poses eight bodies a frame.
      const animHooks: AnimHooks = {
        // The arena's own height field, so a severed limb lands on the bank
        // rather than through it. anim.ts falls back to a raycast without it.
        groundAt: stage.world.heightAt,
        // The one place the cut's frame crosses from the body to the blood.
        // Every field is passed through untouched: derive the wound twice and
        // the spray and the stump disagree about where the man was opened.
        onSever: (cut, victim) => {
          stage.vfx.severed({
            position: cut.wound,
            direction: cut.spray,
            radius: cut.radius,
            stump: cut.stump,
            piece: cut.part,
            zone: cut.zone,
            // A body cut in two opens the whole trunk; a forearm opens a wrist.
            power: (cut.seam === "waist" ? 1.55 : 1) * (victim.deathHeavy ? 1.15 : 1),
          });
          // The bone and the tear, on the same frame and from the same cut, so
          // the thing the gore pass was built for stops landing in silence.
          stage.audio.sever({
            position: cut.wound,
            zone: cut.zone,
            power: (cut.seam === "waist" ? 1.55 : 1) * (victim.deathHeavy ? 1.15 : 1),
          });
          // And the lens, from the same cut and not from a second derivation of
          // it. EVERY man's, keyed by whose body it came out of — it used to be
          // the local warrior's alone, on the argument that "nobody else's death
          // moves your camera", and that argument is exactly the hole the owner
          // reported: the death that ends the round moves everybody's.
          //
          // The SIGN is all that is kept of the spray: `cut.spray` is the world
          // direction at the instant of separation, and a world direction is
          // wrong one frame later when the corpse has begun to roll. What stays
          // true is which way along the stump's own Y the wound faces, which is
          // the same trick `vfx.ts:axisSignFor` uses to keep a jet on a falling
          // body.
          cut.stump.updateWorldMatrix(true, false);
          const e = cut.stump.matrixWorld.elements;
          const sign = e[4] * cut.spray.x + e[5] * cut.spray.y + e[6] * cut.spray.z >= 0 ? 1 : -1;
          seversRef.current.set(victim.id, { stump: cut.stump, part: cut.part, sign });
        },
        onBladeTrail: (pos, cls) => {
          stage.vfx.trail({
            position: pos,
            color: cls === "runekeeper" ? 0x66c8ff : 0xe8ecff,
            count: 3, spread: 1.2, up: 1.4, gravity: 3,
          });
        },
      };

      drainEmotes();

      const activeIds = new Set<string>();
      for (const id of Object.keys(players)) {
        const p = players[id];
        activeIds.add(id);

        const slot = ensureSlot(p);

        const attacker = p.lastHitBy ? players[p.lastHitBy] : undefined;
        stepWarriorTransform(slot.rig, slot.motion, p, dt, ctx, attacker);
        const at = slot.rig.group.position;

        // The flame is the server's, not ours. The hazard sits half a metre
        // inside the visible fire so that clipping its edge is free, so a client
        // that decided who was alight from where a rig is standing would disagree
        // with the sim exactly at the boundary the sim was tuned to be forgiving
        // at. Three fields off the snapshot, nothing derived.
        stage.vfx.setBurning(id, p.burning === true, p.burnTimer ?? 0, p.burnInside === true);
        // The same three wire fields to the ear, every frame, alight or not —
        // audio.ts holds the same contract vfx does and puts out a burner that
        // stops being mentioned.
        stage.audio.setBurning(id, p.burning === true, p.burnTimer ?? 0, p.burnInside === true, { x: at.x, y: 1.0, z: at.z });

        // ---- COMBAT VOICE ----
        // Every branch below sits beside the vfx call that draws the same
        // moment, on purpose: nothing here is the only evidence a thing
        // happened, and a player with the sound off loses no information.
        //
        // THE WHOOSH IS NOT THE CLICK. A stroke is windup 0.40 / contact 0.15 /
        // recovery 0.45 of one clock and the server resolves the blow at the
        // windup/contact boundary, so a whoosh fired the instant the state
        // turned "attacking" played a quarter of a second of air BEFORE the
        // blade was moving and then fell silent through the part where it
        // actually passes. It is fired on the phase edge the server itself
        // crosses, which is the same instant `processAttack` runs. The weight
        // of the blow is `swingHeavy` off the wire — no longer inferred from
        // how far a timer had decayed by the frame the state arrived.
        const phase = p.attackPhase ?? null;
        if (slot.prevPhase !== "contact" && phase === "contact") {
          stage.audio.swing({
            position: { x: at.x, y: 1.3, z: at.z },
            local: id === playerId,
            warriorClass: p.warriorClass,
            heavy: p.swingHeavy === true,
          });
        }
        // A server that never sends a phase — an older build behind a cached
        // client — still gets a voice, on the edge it used to get one.
        if (phase === null && slot.prevState !== "attacking" && p.state === "attacking") {
          const speed = WARRIOR_STATS[p.warriorClass]?.attackSpeed ?? 0.7;
          stage.audio.swing({
            position: { x: at.x, y: 1.3, z: at.z },
            local: id === playerId,
            warriorClass: p.warriorClass,
            heavy: p.attackTimer > speed * 1.08,
          });
        }
        slot.prevPhase = phase;

        // HITSTOP, taken off the wire rather than invented here. The server
        // freezes both fighters for `HITSTOP.light`/`.heavy` and reports the
        // remainder on every snapshot; the client's own slow-mo used three
        // hand-picked numbers that agreed with none of them, so the frame
        // un-froze while the sim was still holding the man still — which is
        // exactly the "blow passes through" the weight pass was for. Re-taken
        // every tick with a max, so the freeze the eye sees ends when the
        // freeze the sim is running ends.
        if (id === playerId && (p.hitstop ?? 0) > 0) {
          hitStopRef.current = Math.max(hitStopRef.current, p.hitstop ?? 0);
        }
        if (slot.prevState !== "blocking" && p.state === "blocking") {
          stage.audio.block({ position: { x: at.x, y: 1.2, z: at.z }, local: id === playerId, raise: true });
        }
        if (slot.prevState !== "dodging" && slot.prevState !== "rolling" && (p.state === "dodging" || p.state === "rolling")) {
          stage.audio.dodge({ position: { x: at.x, y: 0.9, z: at.z }, local: id === playerId });
        }
        // THE WIND-UP ONLY. The grunt IS the audible half of the tell and it has
        // to fire on the state edge, on the shover, whether or not anybody is
        // inside the arc — a shove thrown at air is exactly the read the tell
        // exists to give. The DRIVE used to be scheduled inside the same call,
        // 0.30 s later, which meant a shove that connected with nothing still
        // put a body thump into the mix. The engine broadcasts `type:"shove"`
        // when it resolves the contact and only then; the drain after this loop
        // voices that half, on the man who actually took it.
        if (slot.prevState !== "shoving" && p.state === "shoving") {
          stage.audio.shove({ position: { x: at.x, y: 1.2, z: at.z }, local: id === playerId, shield: !!slot.rig.shield, phase: "windup" });
        }
        if (!slot.prevAbility && p.abilityActive) {
          stage.audio.ability({ position: { x: at.x, y: 1.2, z: at.z }, local: id === playerId, warriorClass: p.warriorClass });
        }
        slot.prevAbility = p.abilityActive;

        // Footfall on the gait's own cadence rather than the frame's, and on
        // the terrain the height field already describes — the bank is drier
        // than the ditch and the arena has both.
        //
        // Gated on the wire VELOCITY, not on the locomotion state names: state
        // is one channel carrying two facts (see the note in anim.ts) and a
        // guarded or staggered man translating with it said "blocking", so his
        // feet were silent while the animator now steps them. Same predicate as
        // the animator's: any travel outside the states whose layers own the
        // legs outright.
        const stepSpeed = Math.hypot(p.velocity?.x || 0, p.velocity?.z || 0);
        const stepping = stepSpeed > 1.0 && p.state !== "dead" && p.state !== "attacking" &&
          p.state !== "dodging" && p.state !== "rolling" && p.state !== "ability" && p.state !== "shoving";
        if (stepping) {
          slot.stepTick -= dt;
          if (slot.stepTick <= 0) {
            slot.stepTick = stepSpeed > 5.2 ? 0.30 : stepSpeed > 3.6 ? 0.40 : 0.54;
            stage.audio.footfall({
              position: { x: at.x, y: 0.1, z: at.z },
              local: id === playerId,
              ground: stage.world.heightAt(at.x, at.z),
              weight: stepSpeed > 5.2 ? 1 : stepSpeed > 3.6 ? 0.6 : 0.35,
            });
          }
        } else {
          slot.stepTick = 0;
        }

        // ---- HIT FEEDBACK (damage numbers + rumble + hit-stop) ----
        // Fire is not a blow. Burning drains 22 hp/s against 20 Hz snapshots, so
        // an unguarded gate here spends a blood gout and a damage number twenty
        // times a second on a man who was never struck — aimed, worse, by
        // whichever `lastHitBy` was last written. He is on fire; the flames are
        // the feedback. A blow landed *while* he burns is lost with it, and that
        // is the cheap side of the trade: four seconds of standing in a bonfire
        // is not where a player is reading damage numbers.
        if (p.health < slot.prevHp - 0.5 && !p.burning) {
          const dmg = Math.round(slot.prevHp - p.health);
          // The line from the man who swung to the man who took it. Without it
          // blood fans off in a random direction and a cleaving blow reads the
          // same as a graze from the other side.
          const away = attacker
            ? { x: at.x - attacker.position.x, y: 0.12, z: at.z - attacker.position.z }
            : undefined;
          stage.vfx.wound({
            position: { x: at.x, y: 1.4, z: at.z },
            damage: dmg,
            direction: away,
            // The zone only exists on the record once he is down; a survivable
            // blow has no location on the wire and gets the generic spatter.
            zone: p.state === "dead" ? (p.deathZone ?? undefined) : undefined,
            fatal: p.state === "dead",
          });
          // A blocked blow throws steel off steel, not blood: the kind is the only
          // thing that tells the two apart, and the server already said which it was.
          stage.vfx.burst({ position: { x: at.x, y: 1.5, z: at.z }, color: 0xffe28a, count: 7, spread: 7, up: 5, gravity: 8, kind: "spark" });
          // NO SOUND IS MADE HERE ANY MORE, and the removal is the fix.
          //
          // This block used to call `audio.hit()` with a type GUESSED from the
          // health delta and the blocking flag — `dmg >= 22 ? "heavy" : "light"`
          // — while the server had already said which of seven kinds it was, on
          // a message the client did not read. The guess could never produce
          // "parry", "shove" or "knockdown" at all, because those take nothing
          // off and this branch is `p.health < prevHp - 0.5`. It also passed no
          // weapon, so every blow in the game was a sword.
          //
          // The wire drain after this loop voices the blow now. What stays here
          // is everything a DELTA genuinely is the right source for: the number
          // over his head, the blood, the recoil, the camera and the rumble.
          slot.motion.recoil = Math.min(1.6, 0.6 + dmg * 0.03);
          stage.hud.spawnDamageNumber(dmg, { x: at.x, z: at.z }, dmg >= 22);

          // The freeze is NOT set here any more, on either branch. The sim
          // freezes both fighters for a stated number of seconds and puts the
          // remainder on the wire; taking it there means the picture and the
          // simulation come out of the freeze on the same tick instead of the
          // client guessing 45 or 70 ms at a sim holding 60 or 110. Camera
          // kick, hurt grade and rumble stay local — they are flourish, and the
          // freeze is not.
          if (id === playerId) {
            stage.rig.shake(1.1 + dmg * 0.03);
            stage.postfx.hurt(Math.min(1, 0.45 + dmg * 0.02));
            rumble(dmg >= 25 ? [45, 30, 45] : [35]);
          } else if (p.lastHitBy === playerId) {
            // We're the one dealing this blow — feel the impact
            stage.rig.shake(0.35 + dmg * 0.015);
            rumble(dmg >= 25 ? [30] : [18]);
          } else {
            stage.rig.shake(0.28);
          }
        }
        slot.prevHp = p.health;

        if (slot.prevState !== "dead" && p.state === "dead") {
          // A severance brings its own burst from the stump, aimed and sized by
          // the cut — a second generic gout at chest height on top of it is the
          // confetti the panels warned about. This is the fallback for the kills
          // that take nothing off: a torso hit, and every kill on the low tier
          // that would have been a bisection.
          if (p.deathCause !== "fire" && (!p.deathZone || p.deathZone === "torso")) {
            stage.vfx.wound({
              position: { x: at.x, y: 1.3, z: at.z },
              damage: 34,
              zone: p.deathZone ?? undefined,
              fatal: true,
            });
          }
          stage.vfx.burst({ position: { x: at.x, y: 0.5, z: at.z }, color: 0x3a2a20, count: 20, spread: 5, up: 3, kind: "dust" });
          stage.audio.death({
            position: { x: at.x, y: 0.8, z: at.z },
            local: id === playerId,
            cause: p.deathCause ?? null,
          });
          if (p.lastHitBy === playerId) {
            rumble([60, 40, 80]);
            hitStopRef.current = Math.max(hitStopRef.current, 0.11);
          } else if (id === playerId) {
            rumble([80, 60, 120]);
          }
        }
        slot.prevState = p.state;

        // Sprint dust puffs, throttled per warrior — the shared counter this
        // replaces meant eight sprinters kicked up as much dust as one.
        if (p.state === "sprinting") {
          slot.dustTick += dt;
          if (slot.dustTick > 0.28) {
            slot.dustTick = 0;
            stage.vfx.burst({ position: { x: at.x, y: 0.15, z: at.z }, color: 0x8a7c5c, count: 3, spread: 2.2, up: 1.4, gravity: 4, kind: "dust" });
          }
        }

        stage.hud.setHealth(id, p.health, p.maxHealth);
        // The grace mark, straight off the packet in hand — no timer on this
        // side of the wire. `underGrace` is false for every frame of the
        // countdown and true only while the fight is actually running, so the
        // mark ends BECAUSE THE FIGHT STARTED rather than because anything
        // elapsed. See src/game/grace.mjs for the bug this replaces.
        stage.hud.setGuard(id, underGrace(p, roomState.state));

        poseWarrior(slot.rig, slot.motion, p, dt, ctx, animHooks);

        // ability aura
        if (p.abilityActive) {
          const colAura = p.warriorClass === "berserker" ? 0xff3311 : p.warriorClass === "huscarl" ? 0x4488ff : p.warriorClass === "runekeeper" ? 0x6b7280 : 0xffaa33;
          if (Math.floor(ctx.time * 9) % 2 === 0) {
            stage.vfx.burst({ position: { x: at.x, y: 1.3, z: at.z }, color: colAura, count: 2, spread: 1.5, up: 2.6, gravity: 4, kind: "aura" });
          }
        }
      }

      // ---- THE BLOWS, OFF THE WIRE ----
      //
      // Drained here rather than before the loop, because a blow is placed on
      // the man who took it and this is the first point in the frame where the
      // rigs have been stepped to where he now is.
      //
      // THIS IS THE ONLY ROUTE FROM A BLOW TO A SOUND, and until this round
      // there was none: every hit sound came from `p.health < prevHp - 0.5`
      // twenty lines below, which is a branch a zero-damage blow can never
      // enter. Three of the wire's seven kinds carry `damage: 0` — a parry, a
      // shove and a knockdown — so three of the seven had never made a sound
      // for anybody, the parry among them. The health delta still owns the
      // PICTURE (blood, damage numbers, camera kick, rumble), because a delta is
      // exactly what a damage number is; it no longer owns the ear.
      //
      // What the wire has and a delta does not: the true kind, the attacker's
      // class (so an axe stops sounding like a sword), whether the shove landed
      // or was thrown at air, and whether the blow was a riposte.
      {
        const hits = hitFeedRef.current?.current;
        if (hits && hits.length) {
          for (const m of hits.splice(0, hits.length)) {
            const target = m.targetId ? warriorsRef.current.get(m.targetId) : undefined;
            const attacker = m.attackerId ? warriorsRef.current.get(m.attackerId) : undefined;
            // A blow whose target this client has never seen has no position to
            // put it at, and a sound at the origin is worse than no sound.
            if (!target) continue;
            const at = target.rig.group.position;
            stage.audio.hit({
              position: { x: at.x, y: 1.4, z: at.z },
              // MINE means it happened to me. The shover's own grunt is voiced
              // from his state edge above; this is the man who took it.
              local: m.targetId === playerId,
              type: m.type,
              damage: m.damage,
              hitZone: m.hitZone ?? null,
              // The ATTACKER's class. `warriorClass` is on the snapshot and
              // `attackerId` is on the message, so this costs one lookup and it
              // is the whole of "an axe and a seax do not share a spectrum".
              weapon: m.attackerId ? players[m.attackerId]?.warriorClass : undefined,
              riposte: m.riposte === true,
              // A shove driven with a disc of limewood and iron is not a
              // shoulder, and the rig is where that fact lives.
              shield: !!attacker?.rig.shield,
            });
          }
        }
      }

      // cleanup stale
      warriorsRef.current.forEach((slot, id) => {
        if (activeIds.has(id)) return;
        // Put him out before the rig goes. The burner is keyed on the id, not on
        // the object, so a man who leaves mid-burn would otherwise leave his
        // flames hunting for a capsule that no longer exists.
        stage.vfx.setBurning(id, false, 0, false);
        stage.audio.setBurning(id, false, 0, false, { x: 0, y: 0, z: 0 });
        stage.hud.detach(id);
        slot.rig.dispose();
        warriorsRef.current.delete(id);
      });

      // ===== camera =====
      // The hold gets first refusal, and a capture never gives it up: `photo`
      // mode is how `tools/shoot.mjs` aims at a staged death on purpose, and a
      // three-second orbit over the top of that would make every gore sheet
      // irreproducible.
      if (!photoFramedRef.current && runDeathCam()) {
        // taken
      } else if (localPlayer && localPlayer.state !== "dead") {
        const slot = warriorsRef.current.get(playerId);
        focusRef.current.set(
          slot?.motion.rx ?? localPlayer.position.x,
          0,
          slot?.motion.rz ?? localPlayer.position.z,
        );
        stage.rig.setMode(photoFramedRef.current ? "photo" : "follow");
      } else {
        // The hold has run out, been skipped, or never armed. This is where a
        // dead man went straight from the frame he died on before this change.
        //
        // SPECTATING, AND WHAT IT IS ALLOWED TO SHOW HIM.
        //
        // This used to be `focusRef.current.set(0, 0, 0)`, and that line was
        // doing nothing at all: `camera.ts`'s orbit hard-wired both its target
        // and its `lookAt` to the origin and never read the focus. So a dead man
        // watched the centre of the arena until the round ended, whatever was
        // happening and wherever it was happening — and with the last two men
        // fighting at the edge, he watched empty turf while they finished it.
        // That is the whole of "the dead have nothing to do".
        //
        // THE RULE THIS PICKS BY, and it is a competitive rule before it is a
        // camera one: a dead man may be shown what a LIVING man could already
        // see, and nothing else. Two cases, in this order:
        //
        //   1. A LIVING TEAMMATE. Watch him. Everything in that frame is
        //      something his own side already knows, so nothing crosses a line
        //      by being shown to a man on it. This is the honest option in team
        //      play and it is the first choice because it is the better watch.
        //
        //   2. NO LIVING TEAMMATE — a free-for-all, or the last of your side is
        //      down. Then there is no one whose knowledge you may borrow, so
        //      the lens takes the other honest option and becomes a seat at the
        //      ringside: it frames the men still standing from OUTSIDE, at the
        //      height of a man standing there (see camera.ts). It is pointed at
        //      the fight, which is the fix, but it is not given sight through
        //      anything, which is the constraint.
        //
        // In both cases the aim is a position the wire already sent this client
        // for its own drawing — no new information is requested, revealed, or
        // derived. What changes is where the lens looks, not what it knows.
        // THE RULE ITSELF IS NOT HERE ANY MORE, and that is the point. It used
        // to be thirty lines of this component, which meant `spectatetest` had
        // to keep a SECOND COPY of it and said so above its own `focusByRule`:
        // a harness that cannot fail when this code changes is not measuring
        // this code. It lives in `src/game/spectate.mjs` now, both callers
        // import it, and there is one answer to where a dead man looks. What
        // stays here is what only the renderer knows — the SMOOTHED rig
        // position, so the lens rides the same interpolated body the player is
        // watching rather than the last snapshot, which would jog it at the
        // tick rate.
        const me = roomState.players[playerId];
        const spectateMen = spectateMenRef.current;
        let sn = 0;
        for (const id in roomState.players) {
          const q = roomState.players[id];
          const slot = warriorsRef.current.get(id);
          let m = spectateMen[sn];
          if (!m) m = spectateMen[sn] = { id, team: q.team, dead: false, x: 0, z: 0 };
          m.id = id; m.team = q.team; m.dead = q.state === "dead";
          m.x = slot?.motion.rx ?? q.position.x; m.z = slot?.motion.rz ?? q.position.z;
          sn++;
        }
        spectateMen.length = sn;
        const aim = spectateAimRef.current.update(spectateMen,
          me ? { id: playerId, team: me.team } : { id: playerId, team: null });
        focusRef.current.set(aim.x, 0, aim.z);
        stage.rig.setMode(photoFramedRef.current ? "photo" : "spectate");
      }
      stage.rig.update(dt, ctx);

      // Damage flash and the low-health edge are grade inputs now, not a red
      // div over the top of the frame. Both decay inside postfx.
      if (localPlayer) stage.postfx.setPressure(localPlayer.health / localPlayer.maxHealth);

      stage.vfx.update(dt, ctx);
      // THE SCORE'S DRIVER (backlog 7.8). Scene from the room's own state,
      // heat from what the fight is actually doing to the local man: base
      // simmer, the nearest living foe closing (sweep goes as proximity),
      // low health, the last stand. Cheap — one pass over eight men — and
      // said every frame because `setScore` glides rather than jumps.
      {
        let scene: ScoreScene;
        let heat = 0;
        const verdict = matchEndRef.current;
        const st = roomState.state;
        if (verdict) {
          const meTeam = roomState.players[playerId]?.team;
          const won = verdict.winnerKind !== "none" && (verdict.winnerId === playerId
            || (verdict.winnerTeam != null && verdict.winnerTeam === meTeam));
          scene = won ? "victory" : "defeat";
        } else if (st === "fighting" || st === "last_stand") {
          scene = "fight";
          heat = st === "last_stand" ? 0.55 : 0.30;
          if (localPlayer && localPlayer.state !== "dead") {
            let nearest2 = Infinity;
            for (const id in roomState.players) {
              if (id === playerId) continue;
              const q = roomState.players[id];
              if (q.state === "dead") continue;
              if (q.team !== "none" && q.team === localPlayer.team) continue;
              const dx = q.position.x - localPlayer.position.x;
              const dz = q.position.z - localPlayer.position.z;
              const d2 = dx * dx + dz * dz;
              if (d2 < nearest2) nearest2 = d2;
            }
            if (nearest2 < 100) heat += 0.4 * (1 - Math.sqrt(nearest2) / 10);
            if (localPlayer.health < localPlayer.maxHealth * 0.4) heat += 0.2;
          }
        } else if (st === "countdown" || st === "loading") {
          scene = "muster";
        } else {
          scene = "lobby";
          heat = 0.1;
        }
        stage.audio.setScore(scene, Math.min(1, heat));
      }
      // After the camera, like vfx: every pan and attenuation in the mix is
      // taken against THIS frame's view.
      stage.audio.update(dt, ctx);
      stage.hud.update(dt, ctx);

      stage.sky.setMood(mood);
      stage.lighting.setMood(mood);
      stage.world.setMood(mood);
      stage.vfx.setMood(mood);
      stage.postfx.setMood(mood);

      stage.postfx.render(dt, ctx);
    };

    // Input is sampled on its own clock, not inside the frame loop. Sampling in
    // the loop ties input rate to frame rate, so a warrior on a phone holding a
    // steady 15 fps was sending a quarter of the input a desktop sends and
    // fighting at a real disadvantage — a swing pressed and released between
    // two frames was never sampled at all. 60 Hz here regardless of what the
    // GPU manages; the server ticks at 20 and coalesces the rest.
    let lastSample = performance.now();
    const sampleTimer = setInterval(() => {
      const stage = stageRef.current;
      const roomState = roomStateRef.current;
      if (!stage || !roomState) return;
      if (roomState.state !== "fighting" && roomState.state !== "last_stand") return;

      const now = performance.now();
      const dt = Math.min((now - lastSample) / 1000, 0.1);
      lastSample = now;

      const inp = inputState.current;
      // Mouse look is consumed here too, so aim keeps up with the hand instead
      // of with the framerate.
      const mouseDelta = (window as unknown as Record<string, { x: number; y: number }>).__bretwalda_mouse;
      if (!isMobile.current && mouseDelta) {
        // Through `look` so desktop lock-on stops fighting the mouse: this used
        // to be added to the yaw immediately before sampleInput ran the lock's
        // spring, which then took most of it straight back out. The rig hands
        // whatever the lock does not claim on to the yaw.
        stage.rig.look(mouseDelta.x * 0.0048);
        mouseDelta.x = 0; mouseDelta.y = 0;
      }

      const sample = sampleInput(
        {
          isMobile: isMobile.current,
          keys: inp.keys,
          tapped: inp.tapped,
          mouseDown: inp.mouseDown,
          rightMouseDown: inp.rightMouseDown,
          joystick: touch.joystick.current,
          mobile: mobileFlags.current,
        },
        stage.rig, roomState.players, playerId, dt, lastDirRef.current,
      );
      if (sample.pressedAttack) lastDirRef.current = sample.attackDir;
      sendInputRef.current(sample.message);
      // Consumed: the latch exists to survive one poll gap, not to stick.
      inp.tapped.clear();
      const mf = mobileFlags.current;
      mf.heavy = false; mf.dodge = false; mf.ability = false; mf.shove = false;
    }, 16);

    animRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      clearInterval(sampleTimer);
      cancelAnimationFrame(animRef.current);
    };
  }, [playerId, rumble, touch.joystick]);

  return (
    <div ref={rootRef} className="relative w-full h-full select-none" onTouchStart={() => { if (glError) setGlError(null); }} onMouseDown={() => { if (glError) setGlError(null); }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        onTouchStart={touch.onTouchStart}
        onTouchMove={touch.onTouchMove}
        onTouchEnd={touch.onTouchEnd}
      />
      <GameHud
        playerId={playerId}
        roomState={roomState}
        glError={glError}
        isMobile={isMobile}
        pointerLocked={pointerLockedRef}
        mobileFlags={mobileFlags}
        setFlag={setFlag}
        joyOrigin={touch.origin}
        joystickPos={touch.knob}
        onMootFoe={onMootFoe}
      />
    </div>
  );
}
