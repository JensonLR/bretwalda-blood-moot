"use client";
// The renderer's orchestrator. It owns the canvas, the WebGL context, React
// state and player input, and drives the modules in src/game/client/render.
// Nothing here knows how anything looks — see render/README.md for who owns
// what and the order they run in.
import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import type { GamePlayer, AttackDirection } from "../types";
import GameHud from "./GameHud";
import { sampleInput, useTouchControls, type MobileFlags } from "./input";
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
import {
  createWarriorRig, createMotion, stepWarriorTransform, poseWarrior,
  type WarriorRig, type WarriorMotion,
} from "./render/anim";

interface GameCanvasProps {
  playerId: string;
  roomState: RoomState | null;
  onSendInput: (input: Record<string, unknown>) => void;
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
}

/** Per-warrior client state that is not the server's business. */
interface WarriorSlot {
  rig: WarriorRig;
  motion: WarriorMotion;
  prevHp: number;
  prevState: string;
  /** Seconds since this warrior's last dust puff. Per-body, not per-frame. */
  dustTick: number;
}

export default function GameCanvas({ playerId, roomState, onSendInput }: GameCanvasProps) {
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
  useEffect(() => { roomStateRef.current = roomState; }, [roomState]);
  useEffect(() => { sendInputRef.current = onSendInput; }, [onSendInput]);

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

  const mobileFlags = useRef({ attack: false, heavy: false, block: false, dodge: false, ability: false, sprint: false });
  const setFlag = useCallback((flag: keyof MobileFlags, value: boolean) => {
    mobileFlags.current[flag] = value;
  }, []);
  const touch = useTouchControls(useCallback((deltaX: number) => {
    if (stageRef.current) stageRef.current.rig.yaw += deltaX * 0.01;
  }, []));

  // ---------- stage init ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    isMobile.current = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const quality = resolveQuality();

    let renderer: THREE.WebGLRenderer;
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
      return;
    }
    // Recover gracefully if the GPU context is lost (common on mobile when switching tabs)
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      setGlError("Graphics paused — tap anywhere to resume the battle.");
    });
    canvas.addEventListener("webglcontextrestored", () => setGlError(null));
    renderer.setSize(window.innerWidth, window.innerHeight);
    configureRenderer(renderer, quality);

    const scene = new THREE.Scene();
    const textures = createTextureLibrary(renderer, quality);
    const materials = createMaterialLibrary(textures, quality);
    const rig = createCameraRig(quality, { aspect: window.innerWidth / window.innerHeight });
    // postfx first: it owns renderer.toneMappingExposure, and sky.ts encodes
    // its fog and clear colours against that value from its own constructor.
    const postfx = createPostFx(renderer, scene, rig.camera, quality);
    // sky pushes its PMREM into the material library itself, on every rebake —
    // a one-shot setEnvironment here would go stale the first time the mood
    // changes and every metal in the arena would reflect a dead texture.
    const sky = createSky(scene, renderer, materials, quality);
    // Hand the rig both bodies and let it decide which one the shadows hang on;
    // naming a field for the role rather than the body is what let a sunset ship
    // with every shadow pointing at the sun.
    const lighting = createLighting(scene, quality, {
      moon: sky.moonDirection, moonColor: sky.moonColor,
      sun: sky.sunDirection, sunColor: sky.sunColor,
    });
    const world = createWorld(scene, materials, quality);
    // vfx after world, and not only for draw order: it finds the arena's fires
    // by reading the props world.ts has already built, and it lands its blood
    // and its bounces on world.ts's terrain rather than on y = 0, which stopped
    // being the ground the moment the arena got a bank and a ditch.
    const vfx = createVfx(scene, textures, quality, { groundAt: world.heightAt });
    const hud = createHud3d(scene, quality);

    // The haze picks up the arena's real hero fire rather than sky.ts's
    // documented guess at where it is, so moving the bonfire moves the glow it
    // throws into the air with it. Chosen by reach rather than by index — the
    // torches are built first and the ordering of that list is world.ts's
    // business, not ours.
    {
      const at = new THREE.Vector3();
      let hero: THREE.PointLight | null = null;
      for (const light of world.pointLights) {
        if (!hero || light.distance > hero.distance) hero = light;
      }
      if (hero) {
        hero.getWorldPosition(at);
        sky.setHazeLight({ position: at, color: hero.color.clone(), gain: 1 });
        // The same fire, told to the light rig. lighting.ts carries the hearth's
        // wide pool because it is built before world.ts and cannot be handed a
        // light that does not exist yet; without this it pools at a documented
        // default at the arena origin, which is right only for as long as nobody
        // moves the bonfire.
        lighting.setHearth(at);
      }
    }

    // Photo mode (/shot) pins the camera yaw so captures are reproducible.
    const photoGlobals = window as unknown as Record<string, unknown>;
    const photoCam = photoGlobals.__photoCam;
    if (typeof photoCam === "number") rig.yaw = photoCam;
    // A capture may also aim the camera outright, which is the only way to see
    // a warrior's front — every play mode is over his shoulder.
    const framing = photoGlobals.__photoFraming as PhotoFraming | undefined;
    if (framing?.position && framing?.target) {
      rig.setPhotoFraming(framing);
      photoFramedRef.current = true;
    }

    const stage: Stage = { renderer, scene, quality, textures, materials, sky, lighting, world, vfx, postfx, rig, hud };
    stageRef.current = stage;
    const warriors = warriorsRef.current;

    // input listeners
    const inp = inputState.current;
    const mouseDelta = { x: 0, y: 0 };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      inp.keys.add(k);
      // Auto-repeat is a held key, not a fresh press; latching it would fire a
      // dodge every time the OS repeated the keystroke.
      if (!e.repeat) inp.tapped.add(k);
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
    (window as unknown as Record<string, unknown>).__bretwalda_mouse = mouseDelta;

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("pointerlockchange", onPLChange);
      canvas.removeEventListener("mousemove", onMM);
      window.removeEventListener("resize", onResize);

      warriors.forEach((slot, id) => { hud.detach(id); slot.rig.dispose(); });
      warriors.clear();
      hud.dispose();
      postfx.dispose();
      rig.dispose();
      vfx.dispose();
      world.dispose();
      lighting.dispose();
      sky.dispose();
      materials.dispose();
      textures.dispose();
      renderer.dispose();
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
        stage.postfx.render(dt, ctx);
        return;
      }

      // Between matches the camera takes the slow establishing orbit and
      // nothing else runs — no input, no sim, no feedback.
      const isFight = roomState.state === "fighting" || roomState.state === "last_stand" || roomState.state === "countdown";
      if (!isFight) {
        stage.rig.setMode("lobby");
        stage.rig.update(dt, ctx);
        // vfx owns the bonfire and the torches now, so it runs on both early-out
        // paths as well: without this the moot's fires freeze mid-lick in the
        // lobby and between rounds, which is precisely when the establishing
        // orbit is looking straight at them. It runs after the camera rather
        // than up beside world/sky because every quad it draws is billboarded
        // against this frame's view.
        stage.vfx.update(dt, ctx);
        stage.postfx.render(dt, ctx);
        return;
      }

      const players = roomState.players;

      // Input sampling and mouse look live on the 60 Hz timer at the bottom of
      // this effect, not here — see the note there.

      // ===== warriors =====
      const activeIds = new Set<string>();
      for (const id of Object.keys(players)) {
        const p = players[id];
        activeIds.add(id);

        let slot = warriorsRef.current.get(id);
        if (!slot) {
          const rig = createWarriorRig(stage.scene, p, stage.materials, stage.quality);
          stage.hud.attach(id, p.name, rig.group, id === playerId, rig.headTop);
          slot = { rig, motion: createMotion(p), prevHp: p.health, prevState: p.state, dustTick: 0 };
          warriorsRef.current.set(id, slot);
        }

        const attacker = p.lastHitBy ? players[p.lastHitBy] : undefined;
        stepWarriorTransform(slot.rig, slot.motion, p, dt, ctx, attacker);
        const at = slot.rig.group.position;

        // ---- HIT FEEDBACK (damage numbers + rumble + hit-stop) ----
        if (p.health < slot.prevHp - 0.5) {
          const dmg = Math.round(slot.prevHp - p.health);
          stage.vfx.burst({ position: { x: at.x, y: 1.4, z: at.z }, color: 0xd42a1a, count: 16, spread: 5, up: 4.5, kind: "blood" });
          // A blocked blow throws steel off steel, not blood: the kind is the only
          // thing that tells the two apart, and the server already said which it was.
          stage.vfx.burst({ position: { x: at.x, y: 1.5, z: at.z }, color: 0xffe28a, count: 7, spread: 7, up: 5, gravity: 8, kind: "spark" });
          slot.motion.recoil = Math.min(1.6, 0.6 + dmg * 0.03);
          stage.hud.spawnDamageNumber(dmg, { x: at.x, z: at.z }, dmg >= 22);

          if (id === playerId) {
            stage.rig.shake(1.1 + dmg * 0.03);
            stage.postfx.hurt(Math.min(1, 0.45 + dmg * 0.02));
            hitStopRef.current = Math.max(hitStopRef.current, 0.07);
            rumble(dmg >= 25 ? [45, 30, 45] : [35]);
          } else if (p.lastHitBy === playerId) {
            // We're the one dealing this blow — feel the impact
            stage.rig.shake(0.35 + dmg * 0.015);
            hitStopRef.current = Math.max(hitStopRef.current, 0.045);
            rumble(dmg >= 25 ? [30] : [18]);
          } else {
            stage.rig.shake(0.28);
          }
        }
        slot.prevHp = p.health;

        if (slot.prevState !== "dead" && p.state === "dead") {
          stage.vfx.burst({ position: { x: at.x, y: 1.3, z: at.z }, color: 0x881410, count: 34, spread: 7, up: 5.5, kind: "blood" });
          stage.vfx.burst({ position: { x: at.x, y: 0.5, z: at.z }, color: 0x3a2a20, count: 20, spread: 5, up: 3, kind: "dust" });
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

        poseWarrior(slot.rig, slot.motion, p, dt, ctx, {
          onBladeTrail: (pos, cls) => {
            stage.vfx.trail({
              position: pos,
              color: cls === "runekeeper" ? 0x66c8ff : 0xe8ecff,
              count: 3, spread: 1.2, up: 1.4, gravity: 3,
            });
          },
        });

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
        stage.rig.yaw += mouseDelta.x * 0.0048;
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
      mf.heavy = false; mf.dodge = false; mf.ability = false;
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
