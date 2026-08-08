"use client";
// The renderer's orchestrator. It owns the canvas, the WebGL context, React
// state and player input, and drives the modules in src/game/client/render.
// Nothing here knows how anything looks — see render/README.md for who owns
// what and the order they run in.
import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { WARRIOR_STATS, type GamePlayer, type AttackDirection, type AttackPhase, type MatchEndData, type EmoteId } from "../types";
import GameHud from "./GameHud";
import { sampleInput, useTouchControls, type MobileFlags } from "./input";
import { underGrace } from "@/game/grace.mjs";
import { roundBoundary } from "@/game/roundreset.mjs";
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
import { createAudio, type AudioHandle } from "./render/audio";
import {
  createWarriorRig, createMotion, stepWarriorTransform, poseWarrior, triggerEmote,
  type WarriorRig, type WarriorMotion, type AnimHooks,
} from "./render/anim";
import { getBindings } from "./bindings";
import { createSummary, type SummaryHandle } from "./render/summary";

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
   * Emote relays from the server, pushed by page.tsx and drained by the frame
   * loop, which is the only thing that can reach the rigs. A ref'd array for
   * the same reason roomState rides a ref: a flourish must not rebuild the
   * animation frame callback.
   */
  emoteFeed?: { current: Array<{ playerId: string; emote: EmoteId }> };
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

export default function GameCanvas({ playerId, roomState, onSendInput, matchEnd, onForge, onEmote, emoteFeed }: GameCanvasProps) {
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
  // Initialised from the first render's prop rather than filled in by an
  // effect: the build reads it on mount, before any effect that assigns it
  // would have run, and a build that could not see its consumer would silently
  // decide it had none and stop yielding.
  const onForgeRef = useRef(onForge);
  useEffect(() => { roomStateRef.current = roomState; }, [roomState]);
  useEffect(() => { sendInputRef.current = onSendInput; }, [onSendInput]);
  useEffect(() => { matchEndRef.current = matchEnd ?? null; }, [matchEnd]);
  // Held in a ref rather than read from the effect's closure: a parent that
  // rebuilds this callback every render must not tear the arena down and build
  // it again, which is what listing it in the effect's deps would do.
  useEffect(() => { onForgeRef.current = onForge; }, [onForge]);
  // Same argument, for the emote press and the emote relay.
  const onEmoteRef = useRef(onEmote);
  useEffect(() => { onEmoteRef.current = onEmote; }, [onEmote]);
  const emoteFeedRef = useRef(emoteFeed);
  useEffect(() => { emoteFeedRef.current = emoteFeed; }, [emoteFeed]);

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
          world = createWorld(scene, materials, quality);
          disposers.push(() => world.dispose());
        },
      },
      {
        label: "KINDLING THE FIRES", weight: 8, run: () => {
          // vfx after world, and not only for draw order: it finds the arena's fires
          // by reading the props world.ts has already built, and it lands its blood
          // and its bounces on world.ts's terrain rather than on y = 0, which stopped
          // being the ground the moment the arena got a bank and a ditch.
          vfx = createVfx(scene, textures, quality, { groundAt: world.heightAt });
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
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
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
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onCtx);
    document.addEventListener("pointerlockchange", onPLChange);
    canvas.addEventListener("mousemove", onMM);
    window.addEventListener("resize", onResize);
    globals.__bretwalda_mouse = mouseDelta;

    disposers.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
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

    const loop = (time: number) => {
      if (!running) return;
      animRef.current = requestAnimationFrame(loop);

      const rawDt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.05);
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
      if (roundBoundary(roundPhaseRef.current, phase)) stage.vfx.clearBattle();
      roundPhaseRef.current = phase;

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
      const verdict = matchEndRef.current;
      const isSummary = verdict !== null && roomState.mode !== "solo" &&
        (roomState.state === "finished" || roomState.state === "lobby");
      if (isSummary) {
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
        summaryRef.current.update(dt, ctx, roomState, verdict, warriorsRef.current, playerId);
        // A press from the summary surface plays on the staged tableau — the
        // motion is shared, so the flourish lands on the man mid-portrait. It
        // is drained AFTER the stage has been built, because who is standing is
        // the stage's answer and it is what decides whose press is honoured.
        drainEmotes((id) => summaryRef.current?.canPerform(id) ?? true);
        stage.rig.update(dt, ctx);
        stage.vfx.update(dt, ctx);
        stage.audio.update(dt, ctx);
        stage.hud.update(dt, ctx);
        stage.postfx.render(dt, ctx);
        return;
      }
      summaryRef.current?.reset();
      stage.hud.setSuppressed(false);

      // Between matches the camera takes the slow establishing orbit and
      // nothing else runs — no input, no sim, no feedback.
      const isFight = roomState.state === "fighting" || roomState.state === "last_stand" || roomState.state === "countdown";
      if (!isFight) {
        stage.rig.setMode("lobby");
        // The round break keeps the bodies live rather than frozen mid-tick:
        // the fallen stay down, the standing breathe, and a victory emote
        // relayed during the break — which is where the touch surface offers
        // it — plays on the man who pressed it. The wire is static here (the
        // sim only broadcasts while fighting), so this is pure animation.
        if (roomState.state === "intermission") {
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
        // The shove's voice fires on the state edge — the windup grunt IS the
        // audible half of the tell, and the drive thump is scheduled inside the
        // synth at the same offset the server resolves the contact.
        if (slot.prevState !== "shoving" && p.state === "shoving") {
          stage.audio.shove({ position: { x: at.x, y: 1.2, z: at.z }, local: id === playerId, shield: !!slot.rig.shield });
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
          // Four events the ear must tell apart without looking, named in the
          // server's own vocabulary: a shield taking it, mail turning it, the
          // blade finding flesh, or steel caught on steel. A man who was
          // guarding when it landed was guarding; the zone is only on the wire
          // once he is down, so a survivable blow is decided by what it took
          // off — a graze turned by armour, or the one that found the gap.
          const guarded = slot.prevState === "blocking" || p.state === "blocking";
          stage.audio.hit({
            position: { x: at.x, y: 1.4, z: at.z },
            local: id === playerId,
            type: guarded ? (dmg >= 22 ? "blocked_heavy" : "blocked") : (dmg >= 22 ? "heavy" : "light"),
            damage: dmg,
            hitZone: p.state === "dead" ? p.deathZone : null,
          });
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
          const colAura = p.warriorClass === "berserker" ? 0xff3311 : p.warriorClass === "huscarl" ? 0x4488ff : p.warriorClass === "runekeeper" ? 0x9a55ff : 0xffaa33;
          if (Math.floor(ctx.time * 9) % 2 === 0) {
            stage.vfx.burst({ position: { x: at.x, y: 1.3, z: at.z }, color: colAura, count: 2, spread: 1.5, up: 2.6, gravity: 4, kind: "aura" });
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
      if (localPlayer && localPlayer.state !== "dead") {
        const slot = warriorsRef.current.get(playerId);
        focusRef.current.set(
          slot?.motion.rx ?? localPlayer.position.x,
          0,
          slot?.motion.rz ?? localPlayer.position.z,
        );
        stage.rig.setMode(photoFramedRef.current ? "photo" : "follow");
      } else {
        focusRef.current.set(0, 0, 0);
        stage.rig.setMode(photoFramedRef.current ? "photo" : "spectate");
      }
      stage.rig.update(dt, ctx);

      // Damage flash and the low-health edge are grade inputs now, not a red
      // div over the top of the frame. Both decay inside postfx.
      if (localPlayer) stage.postfx.setPressure(localPlayer.health / localPlayer.maxHealth);

      stage.vfx.update(dt, ctx);
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
      />
    </div>
  );
}
