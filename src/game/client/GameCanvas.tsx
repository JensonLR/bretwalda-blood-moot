"use client";
import React, { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { Swords, Hammer, Shield, Wind, Sparkles, Zap } from "lucide-react";
import type { GamePlayer, AttackDirection, WarriorClass } from "../types";
import { WARRIOR_STATS } from "../types";
import {
  buildCharacter, buildWeaponForClass, buildShield,
  defaultAppearance, type Appearance,
} from "./characters";

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

const CLASS_TUNIC: Record<string, number> = {
  huscarl: 0x6a5636,
  warden: 0x5a6630,
  runekeeper: 0x3d3a5c,
  berserker: 0x6e2b26,
};

const CAM_DIST = 4.4;
const CAM_HEIGHT = 2.05;
const CAM_SIDE = 1.0;
const LOOK_AHEAD = 3.6;
const LOOK_HEIGHT = 1.3;

// Smoothed render state per player
interface RenderState {
  rx: number; rz: number;           // render position
  yaw: number;                      // smoothed yaw
  prevHp: number;
  prevState: string;
  leanX: number;                    // visual lean
  recoil: number;                   // hit-pushback impulse
  trailTick: number;
}

export default function GameCanvas({ playerId, roomState, onSendInput }: GameCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const hurtRef = useRef<HTMLDivElement>(null);
  const [glError, setGlError] = useState<string | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const hbRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const renderStatesRef = useRef<Map<string, RenderState>>(new Map());
  const particlesRef = useRef<Array<{ pts: THREE.Points; vels: THREE.Vector3[]; life: number; gravity: number }>>([]);
  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const fogPtsRef = useRef<THREE.Points | null>(null);
  const shakeRef = useRef(0);
  const hurtFlashRef = useRef(0);
  const hitStopRef = useRef(0);
  const lastStandRef = useRef(false);
  const animRef = useRef(0);
  const lastTimeRef = useRef(0);
  const isMobile = useRef(false);
  const lastDirRef = useRef<AttackDirection>("right");
  const fovRef = useRef(55);
  const damageTextsRef = useRef<Array<{ sprite: THREE.Sprite; life: number; vy: number }>>([]);
  const dustTickRef = useRef(0);

  const inputState = useRef({
    keys: new Set<string>(),
    mouseDown: false,
    rightMouseDown: false,
    cameraAngle: Math.PI,
    pointerLocked: false,
  });

  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0, active: false });
  const joystickRef = useRef({ x: 0, y: 0, active: false });
  const joystickTouchRef = useRef<number | null>(null);
  const joystickOriginRef = useRef({ x: 0, y: 0 });
  const cameraDragRef = useRef<{ id: number | null; lastX: number }>({ id: null, lastX: 0 });
  const mobileFlags = useRef({ attack: false, heavy: false, block: false, dodge: false, ability: false, sprint: false });

  const isLowEnd = useRef(false);

  useEffect(() => {
    isMobile.current = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    // Perf auto-detect: small screens & touch = use lighter shadow/pixel budgets
    isLowEnd.current = isMobile.current || window.innerWidth < 900;
  }, []);

  function mat(color: number, rough = 0.8, metal = 0): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  }

  // ---------- scene init ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x38476a, 0.011);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 200);
    camera.position.set(0, 8, 14);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    } catch {
      setGlError("Your device's browser could not start 3D graphics (WebGL). Try Chrome, Safari, or updating your OS.");
      return;
    }
    // Recover gracefully if the GPU context is lost (common on mobile when switching tabs)
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      setGlError("Graphics paused — tap anywhere to resume the battle.");
    });
    canvas.addEventListener("webglcontextrestored", () => {
      setGlError(null);
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(isLowEnd.current ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // ---- Brighter DUSK lighting for readability ----
    const ambient = new THREE.AmbientLight(0x5a6c88, 0.85);
    scene.add(ambient);
    ambientRef.current = ambient;

    const hemi = new THREE.HemisphereLight(0x8fa8c8, 0x4a4030, 0.55);
    scene.add(hemi);

    const moon = new THREE.DirectionalLight(0xcfdcf0, 1.35);
    moon.position.set(12, 26, 9);
    moon.castShadow = true;
    moon.shadow.mapSize.set(isLowEnd.current ? 1024 : 2048, isLowEnd.current ? 1024 : 2048);
    moon.shadow.camera.near = 1; moon.shadow.camera.far = 70;
    moon.shadow.camera.left = -24; moon.shadow.camera.right = 24;
    moon.shadow.camera.top = 24; moon.shadow.camera.bottom = -24;
    moon.shadow.bias = -0.0005;
    scene.add(moon);

    const warmFill = new THREE.DirectionalLight(0xffa85c, 0.4);
    warmFill.position.set(-9, 7, -8);
    scene.add(warmFill);
    const rim = new THREE.DirectionalLight(0x88b8ff, 0.35);
    rim.position.set(0, 8, -14);
    scene.add(rim);

    // ---- Ground with grass/mud mottling ----
    const groundGeo = new THREE.CircleGeometry(21.5, 72);
    {
      const posAttr = groundGeo.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(posAttr.count * 3);
      const c1 = new THREE.Color(0x4a4536);
      const c2 = new THREE.Color(0x3d5231);
      const c3 = new THREE.Color(0x555047);
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i), y = posAttr.getY(i);
        const n = Math.sin(x * 0.75) * Math.cos(y * 0.65) + Math.sin(x * 2.2 + y * 1.8) * 0.6;
        const c = n > 0.25 ? c2 : n < -0.5 ? c3 : c1;
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      groundGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Palisade ring
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const px = Math.cos(a) * 19.6, pz = Math.sin(a) * 19.6;
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.7 + Math.random() * 0.5, 6), mat(0x5a4127, 0.95));
      stake.position.set(px, 1.35, pz);
      stake.castShadow = true;
      scene.add(stake);
      const stakeTip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 5), mat(0x5a4127, 0.95));
      stakeTip.position.set(px, 2.85, pz);
      scene.add(stakeTip);
      // Track binding
      if (i % 2 === 0) {
        const bind = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 4, 8), mat(0x2a2018, 0.98));
        bind.position.set(px, 1.9, pz);
        bind.rotation.y = a;
        scene.add(bind);
      }
    }

    // Torches + lights
    const torchLightIdx: number[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.15;
      const px = Math.cos(a) * 18.2, pz = Math.sin(a) * 18.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), mat(0x4a3018, 0.9));
      pole.position.set(px, 1.7, pz);
      pole.castShadow = true;
      scene.add(pole);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.09, 0.18, 8), mat(0x2a2a2e, 0.5, 0.7));
      cup.position.set(px, 3.36, pz);
      scene.add(cup);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xffbb44, emissive: 0xff7711, emissiveIntensity: 5 }));
      flame.position.set(px, 3.58, pz);
      flame.name = "flame";
      scene.add(flame);
      if (i % 2 === 0) torchLightIdx.push(i);
    }
    for (const i of torchLightIdx) {
      const a = (i / 10) * Math.PI * 2 + 0.15;
      const fl = new THREE.PointLight(0xff8a33, 3.2, 13);
      fl.position.set(Math.cos(a) * 18.2, 3.7, Math.sin(a) * 18.2);
      scene.add(fl);
    }

    // Saxon huts + smoke
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const d = 27 + Math.random() * 4;
      const hut = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.6, 3.4), mat(0x6a553c, 0.95));
      base.position.y = 1.3; base.castShadow = true; hut.add(base);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2.3, 4), mat(0x41301c, 0.98));
      roof.position.y = 3.75; roof.rotation.y = Math.PI / 4; roof.castShadow = true; hut.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.1), mat(0x2a1c0e, 0.95));
      door.position.set(0, 0.8, 1.71);
      hut.add(door);
      hut.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      hut.rotation.y = a + Math.PI;
      scene.add(hut);
    }

    // Rock scatter
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 21.5 + Math.random() * 7;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + Math.random() * 0.7, 0), mat(0x6a7078, 0.98));
      rock.position.set(Math.cos(a) * d, 0.12, Math.sin(a) * d);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      rock.scale.y = 0.55 + Math.random() * 0.5;
      rock.castShadow = true;
      scene.add(rock);
    }

    // Banner poles
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.6, 6), mat(0x4a3018, 0.9));
      pole.position.set(Math.cos(a) * 22.5, 2.8, Math.sin(a) * 22.5);
      pole.castShadow = true;
      scene.add(pole);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.09, 0.09), mat(0x4a3018, 0.9));
      cross.position.set(Math.cos(a) * 22.5, 5.25, Math.sin(a) * 22.5);
      scene.add(cross);
      const cols = [0x8a2530, 0x2c4a8a, 0x8a2530, 0x2c4a8a];
      const banner = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.8, 0.05), mat(cols[i], 0.9));
      banner.position.set(Math.cos(a) * 22.5, 4.25, Math.sin(a) * 22.5);
      banner.castShadow = true;
      banner.name = "banner";
      scene.add(banner);
    }

    // Central bonfire
    {
      const fireBase = new THREE.Group();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.7, 6), mat(0x3a2515, 0.98));
        log.rotation.z = Math.PI / 2 - 0.5;
        log.rotation.y = a;
        log.position.set(Math.cos(a) * 0.6, 0.55, Math.sin(a) * 0.6);
        log.lookAt(0, 2, 0);
        fireBase.add(log);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 10),
        new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff5500, emissiveIntensity: 3.5, transparent: true, opacity: 0.9 }));
      flame.position.y = 1.1;
      flame.name = "flame";
      fireBase.add(flame);
      const fireLight = new THREE.PointLight(0xff8830, 4, 18);
      fireLight.position.y = 1.8;
      fireBase.add(fireLight);
      scene.add(fireBase);
    }

    // ---------- DUSK SKY DOME + MOON ----------
    {
      const skyGeo = new THREE.SphereGeometry(85, 20, 12);
      const pos = skyGeo.attributes.position as THREE.BufferAttribute;
      const cols = new Float32Array(pos.count * 3);
      const horizon = new THREE.Color(0xd97a4a); // ember horizon
      const mid = new THREE.Color(0x5a4a78);
      const zenith = new THREE.Color(0x1c2c52);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 85; // -1..1
        const t = Math.max(0, y);
        const c = new THREE.Color();
        if (t < 0.35) {
          c.lerpColors(horizon, mid, t / 0.35);
        } else {
          c.lerpColors(mid, zenith, (t - 0.35) / 0.65);
        }
        if (y < 0) c.lerpColors(horizon, new THREE.Color(0x0c1424), Math.min(1, -y * 2.4));
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      skyGeo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
      sky.name = "skyDome";
      scene.add(sky);
      // Moon
      const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), new THREE.MeshBasicMaterial({ color: 0xf0e8d8, fog: false }));
      moonDisc.position.set(28, 46, -60);
      moonDisc.lookAt(0, 0, 0);
      scene.add(moonDisc);
      const moonGlow = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: 0xd4dde8, transparent: true, opacity: 0.25, fog: false }));
      moonGlow.position.set(27.8, 46, -59.9);
      moonGlow.lookAt(0, 0, 0);
      scene.add(moonGlow);
    }

    // ---------- ATMOSPHERIC PROPS ----------
    // Runestone with glowing runes (arena north)
    {
      const stone = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 0.6), mat(0x7a7d84, 0.92));
      body.position.y = 1.6;
      body.rotation.z = 0.06;
      body.castShadow = true;
      stone.add(body);
      // Carved rune strips (glowing)
      for (let i = 0; i < 4; i++) {
        const rune = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5 - i * 0.06, 0.62),
          new THREE.MeshStandardMaterial({ color: 0x66c8ff, emissive: 0x2288dd, emissiveIntensity: 2.4, roughness: 0.4 }));
        rune.position.set((i % 2 === 0 ? -0.18 : 0.18) + (Math.random() - 0.5) * 0.12, 2.5 - i * 0.62, 0);
        rune.rotation.z = (Math.random() - 0.5) * 0.5;
        rune.name = "runeGlow";
        stone.add(rune);
      }
      stone.position.set(0, 0, -17);
      scene.add(stone);
    }

    // Shield racks & war gear around the moot
    for (let r = 0; r < 3; r++) {
      const a = (r / 3) * Math.PI * 2 + 0.8;
      const base = { x: Math.cos(a) * 24, z: Math.sin(a) * 24 };
      // Spear bundle
      for (let s = 0; s < 4; s++) {
        const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.4, 5), mat(0x5a3c22, 0.85));
        spear.position.set(base.x + (s - 1.5) * 0.22, 1.6, base.z);
        spear.rotation.z = 0.18 + (Math.random() - 0.5) * 0.1;
        spear.rotation.x = (Math.random() - 0.5) * 0.1;
        spear.castShadow = true;
        scene.add(spear);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 6), mat(0xb8bfc8, 0.2, 0.9));
        tip.position.set(base.x + (s - 1.5) * 0.22 + 0.6, 3.15, base.z);
        scene.add(tip);
      }
    }
    // Barrels & crates
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 22 + Math.random() * 5;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 14), mat(0x6a4a28, 0.9));
      barrel.position.set(Math.cos(a) * d, 0.45, Math.sin(a) * d);
      barrel.castShadow = true;
      scene.add(barrel);
      const band1 = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.035, 6, 18), mat(0x3a3a3e, 0.5, 0.7));
      band1.rotation.x = Math.PI / 2;
      band1.position.copy(barrel.position);
      band1.position.y += 0.25;
      scene.add(band1);
    }
    // Battle debris — broken swords & shields stuck in the ground
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 6 + Math.random() * 8;
      const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.014), mat(0xaab2bc, 0.3, 0.8));
      blade.position.set(bx, 0.34, bz);
      blade.rotation.z = 0.4 + Math.random() * 0.35;
      blade.rotation.y = Math.random() * 2;
      scene.add(blade);
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), mat(0x3a2a18, 0.9));
      hilt.position.set(bx - 0.24, 0.66, bz + 0.03);
      hilt.rotation.z = 0.4;
      scene.add(hilt);
    }
    // Leaning shield
    {
      const lean = buildShield(0x24386a);
      lean.position.set(-12.5, 0.42, 10.5);
      lean.rotation.set(-0.9, 0.6, 0);
      scene.add(lean);
    }
    // Grass tufts
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 19.5 + Math.random() * 8;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5 + Math.random() * 0.5, 5), mat(0x4a5c2e, 0.95));
      tuft.position.set(Math.cos(a) * d, 0.22, Math.sin(a) * d);
      tuft.rotation.z = (Math.random() - 0.5) * 0.3;
      scene.add(tuft);
    }

    // Fog motes
    const fogCount = 220;
    const fogArr = new Float32Array(fogCount * 3);
    for (let i = 0; i < fogCount; i++) {
      fogArr[i * 3] = (Math.random() - 0.5) * 55;
      fogArr[i * 3 + 1] = Math.random() * 3.5;
      fogArr[i * 3 + 2] = (Math.random() - 0.5) * 55;
    }
    const fogGeo = new THREE.BufferGeometry();
    fogGeo.setAttribute("position", new THREE.BufferAttribute(fogArr, 3));
    const fogPts = new THREE.Points(fogGeo, new THREE.PointsMaterial({
      color: 0xaabdd6, size: 0.5, transparent: true, opacity: 0.18, depthWrite: false,
    }));
    scene.add(fogPts);
    fogPtsRef.current = fogPts;

    // input listeners
    const inp = inputState.current;
    const mouseDelta = { x: 0, y: 0 };
    const onKeyDown = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName !== "INPUT") inp.keys.add(e.key.toLowerCase()); };
    const onKeyUp = (e: KeyboardEvent) => inp.keys.delete(e.key.toLowerCase());
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) inp.mouseDown = true;
      if (e.button === 2) inp.rightMouseDown = true;
      if (!inp.pointerLocked && !isMobile.current) canvas.requestPointerLock?.();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) inp.mouseDown = false;
      if (e.button === 2) inp.rightMouseDown = false;
    };
    const onCtx = (e: Event) => e.preventDefault();
    const onPLChange = () => { inp.pointerLocked = document.pointerLockElement === canvas; };
    const onMM = (e: MouseEvent) => {
      if (inp.pointerLocked) { mouseDelta.x += e.movementX; mouseDelta.y += e.movementY; }
    };
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
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
      renderer.dispose();
    };
  }, []);

  // ---------- player mesh ----------
  const createPlayerMesh = useCallback((p: GamePlayer): THREE.Group => {
    const scene = sceneRef.current!;
    const cls = p.warriorClass as WarriorClass;
    const ap: Appearance = (p as GamePlayer & { appearance?: Appearance }).appearance || defaultAppearance(cls);
    const built = buildCharacter(cls, ap, CLASS_TUNIC[cls] ?? 0x5a4a2c);
    const group = built.group;

    group.userData.pivots = {
      rightArm: built.rightArm, leftArm: built.leftArm,
      rightLeg: built.rightLeg, leftLeg: built.leftLeg,
      head: built.head, cloak: built.cloak,
    };

    const rightHandMount = built.rightArm.children[built.rightArm.children.length - 1] as THREE.Group;
    const leftHandMount = built.leftArm.children[built.leftArm.children.length - 1] as THREE.Group;

    const weapon = buildWeaponForClass(cls);
    weapon.name = "weapon";
    rightHandMount.add(weapon);
    group.userData.weapon = weapon;

    if (cls === "runekeeper") {
      const off = buildWeaponForClass("runekeeper");
      off.scale.setScalar(0.9);
      leftHandMount.add(off);
    }
    if (cls === "huscarl") {
      // Carried IN FRONT of the chest, disc plate facing the enemy (+Z)
      const shield = buildShield(ap.cloak !== "none" ? 0x5c2320 : 0x6b4226);
      shield.position.set(-0.14, -0.4, 0.26);
      shield.rotation.set(0.22, 0.16, 0.14);
      built.leftArm.add(shield);
      group.userData.shield = shield;
    }

    // Blob shadow (soft ground contact)
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.025;
    blob.renderOrder = 1;
    blob.name = "blobShadow";
    scene.add(blob);
    group.userData.blob = blob;

    // Health bar
    const hbBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.1),
      new THREE.MeshBasicMaterial({ color: 0x1a0a08, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false })
    );
    hbBg.position.y = 2.55; hbBg.renderOrder = 999;
    group.add(hbBg);
    const hb = new THREE.Mesh(
      new THREE.PlaneGeometry(1.06, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x53d769, side: THREE.DoubleSide, depthTest: false })
    );
    hb.position.y = 2.55; hb.renderOrder = 1000;
    hbRef.current.set(p.id, hb);
    group.add(hb);

    // Name plate
    const nc = document.createElement("canvas");
    nc.width = 256; nc.height = 64;
    const ctx = nc.getContext("2d")!;
    ctx.font = "bold 24px Cinzel, Georgia, serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "black"; ctx.shadowBlur = 8;
    ctx.fillStyle = p.id === playerId ? "#ffd478" : "#f0eadc";
    ctx.fillText(p.name.substring(0, 15), 128, 40);
    const ns = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nc), transparent: true, depthTest: false }));
    ns.position.y = 2.82; ns.scale.set(1.7, 0.42, 1); ns.renderOrder = 1001;
    group.add(ns);

    return group;
  }, [playerId]);

  // ------- haptics (mobile rumble) -------
  const rumble = useCallback((pattern: number | number[]) => {
    try { if (isMobile.current && navigator.vibrate) navigator.vibrate(pattern); } catch { /* ok */ }
  }, []);

  // ---------- particles ----------
  const spawnParticles = useCallback((pos: { x: number; y: number; z: number }, color: number, count: number, spread = 5, up = 4, gravity = 11) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const positions = new Float32Array(count * 3);
    const vels: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
      vels.push(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * up, (Math.random() - 0.5) * spread));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.13, transparent: true, opacity: 1, depthWrite: false }));
    scene.add(pts);
    particlesRef.current.push({ pts, vels, life: 0.5, gravity });
  }, []);

  // ---------- floating damage numbers ----------
  const spawnDamageText = useCallback((amount: number, pos: { x: number; z: number }, big: boolean) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const c = document.createElement("canvas");
    c.width = 112; c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.font = `bold ${big ? 46 : 34}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "black"; ctx.lineWidth = 7;
    ctx.strokeText(String(amount), 56, 46);
    ctx.fillStyle = big ? "#ffb020" : "#f0e8d8";
    ctx.fillText(String(amount), 56, 46);
    const tex = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.position.set(pos.x + (Math.random() - 0.5) * 0.5, 2.0, pos.z + (Math.random() - 0.5) * 0.5);
    sprite.scale.set(1.15, 0.65, 1);
    sprite.renderOrder = 1002;
    scene.add(sprite);
    damageTextsRef.current.push({ sprite, life: 0.85, vy: 1.6 });
  }, []);

  // ---------- main loop ----------
  useEffect(() => {
    let running = true;
    const shortestAngle = (from: number, to: number) => {
      let d = to - from;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    };
    const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
    const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

    const loop = (time: number) => {
      if (!running) return;
      const rawDt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.05);
      lastTimeRef.current = time;
      // Hit-stop: brief slow-mo on heavy impacts for punch
      let dt = rawDt;
      if (hitStopRef.current > 0) {
        hitStopRef.current -= rawDt;
        dt = rawDt * 0.22;
      }
      const t = performance.now() / 1000;

      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!scene || !camera || !renderer) { animRef.current = requestAnimationFrame(loop); return; }

      // Flame + banner life
      scene.traverse((o) => {
        if (o.name === "flame") {
          const s = 1 + Math.sin(t * 11 + o.id) * 0.14 + Math.sin(t * 23) * 0.07;
          o.scale.set(s, 1 + Math.sin(t * 17 + o.id) * 0.18, s);
        } else if (o.name === "banner") {
          o.rotation.y = Math.sin(t * 1.3 + o.id) * 0.16;
          o.rotation.z = Math.sin(t * 0.8 + o.id) * 0.03;
        }
      });

      if (!roomState) { renderer.render(scene, camera); animRef.current = requestAnimationFrame(loop); return; }

      const isFight = roomState.state === "fighting" || roomState.state === "last_stand" || roomState.state === "countdown";
      if (!isFight) {
        inputState.current.cameraAngle += dt * 0.12;
        camera.position.lerp(new THREE.Vector3(Math.sin(inputState.current.cameraAngle) * 16, 6.5, Math.cos(inputState.current.cameraAngle) * 16), 0.06);
        camera.lookAt(0, 1.6, 0);
        renderer.render(scene, camera);
        animRef.current = requestAnimationFrame(loop);
        return;
      }

      const inp = inputState.current;
      const mouseDelta = (window as unknown as Record<string, { x: number; y: number }>).__bretwalda_mouse || { x: 0, y: 0 };

      if (!isMobile.current) {
        inp.cameraAngle += mouseDelta.x * 0.0048;
        mouseDelta.x = 0; mouseDelta.y = 0;
      }

      const players = roomState.players;
      const localPlayer = players[playerId];

      // ===== ATTACK MAGNETISM (soft lock-on assist) =====
      const pressedAttack = isMobile.current ? mobileFlags.current.attack : inp.mouseDown;
      if (pressedAttack && localPlayer && localPlayer.state !== "dead") {
        let best: { angle: number; d: number } | null = null;
        for (const id of Object.keys(players)) {
          if (id === playerId) continue;
          const e = players[id];
          if (e.state === "dead") continue;
          const aa = Math.atan2(e.position.x - localPlayer.position.x, e.position.z - localPlayer.position.z);
          const d = Math.hypot(e.position.x - localPlayer.position.x, e.position.z - localPlayer.position.z);
          if (d > 5.5) continue;
          const da = Math.abs(shortestAngle(inp.cameraAngle, aa));
          if (da < 1.0 && (!best || d < best.d)) best = { angle: aa, d };
        }
        if (best) {
          // Sticky lock: camera swings onto the target so face-off is automatic
          inp.cameraAngle += shortestAngle(inp.cameraAngle, best.angle) * Math.min(1, dt * (isMobile.current ? 14 : 10));
        }
      }

      // Movement — camera-relative (forward = away from camera, screen-right = strafe right)
      let mx = 0, mz = 0; // mx: right positive, mz: BACKWARD positive (W = -1)
      if (isMobile.current) { mx = joystickRef.current.x; mz = joystickRef.current.y; }
      else {
        if (inp.keys.has("w") || inp.keys.has("arrowup")) mz = -1;
        if (inp.keys.has("s") || inp.keys.has("arrowdown")) mz = 1;
        if (inp.keys.has("a") || inp.keys.has("arrowleft")) mx = -1;
        if (inp.keys.has("d") || inp.keys.has("arrowright")) mx = 1;
      }
      const cos = Math.cos(inp.cameraAngle), sin = Math.sin(inp.cameraAngle);
      // forward = (sin, cos) · (-mz); screenRight = (-cos, sin) · mx
      const rotX = -mz * sin - mx * cos;
      const rotZ = -mz * cos + mx * sin;

      // ===== MOBILE: camera auto-follows movement heading =====
      // Left thumb moves AND steers — no second finger needed to turn.
      if (isMobile.current && localPlayer && localPlayer.state !== "dead" && !pressedAttack) {
        const hasMoveInput = Math.abs(mx) > 0.08 || Math.abs(mz) > 0.08;
        if (hasMoveInput) {
          const heading = Math.atan2(rotX, rotZ);
          inp.cameraAngle += shortestAngle(inp.cameraAngle, heading) * Math.min(1, dt * 4.5);
        }
      }

      // Directional attacks follow movement intent
      let attackDir: AttackDirection = lastDirRef.current;
      if (isMobile.current) {
        const jx = joystickRef.current.x, jy = joystickRef.current.y;
        if (jx < -0.5) attackDir = "left";
        else if (jx > 0.5) attackDir = "right";
        else if (jy < -0.5) attackDir = "overhead";
        else if (jy > 0.5) attackDir = "stab";
      } else {
        if (inp.keys.has("a") || inp.keys.has("arrowleft")) attackDir = "left";
        else if (inp.keys.has("d") || inp.keys.has("arrowright")) attackDir = "right";
        else if (inp.keys.has("w") || inp.keys.has("arrowup")) attackDir = "overhead";
        else if (inp.keys.has("s") || inp.keys.has("arrowdown")) attackDir = "stab";
      }
      if (pressedAttack) lastDirRef.current = attackDir;
      // HOLD-TO-SWING: desktop attacks automatically re-fire while LMB is held
      // Server gates by attackTimer; no client reset needed.
      if (pressedAttack && mobileFlags.current) { /* mobile taps handled elsewhere */ }

      // Send input
      if (roomState.state === "fighting" || roomState.state === "last_stand") {
        const mf = mobileFlags.current;
        onSendInput({
          moveX: rotX, moveZ: rotZ, rotationY: inp.cameraAngle,
          sprint: isMobile.current ? mf.sprint : inp.keys.has("shift"),
          attack: pressedAttack,
          heavyAttack: isMobile.current ? mf.heavy : inp.keys.has("e") || inp.keys.has("v"),
          block: isMobile.current ? mf.block : inp.rightMouseDown,
          dodge: isMobile.current ? mf.dodge : inp.keys.has(" "),
          crouch: inp.keys.has("control"),
          ability: isMobile.current ? mf.ability : inp.keys.has("q"),
          attackDir,
        });
        // one-shot actions consumed; SLASH is a flagged hold (dribble-swings while held)
        mf.heavy = false; mf.dodge = false; mf.ability = false;
      }

      // ===== sync player meshes =====
      const activeIds = new Set<string>();
      for (const id of Object.keys(players)) {
        const p = players[id];
        activeIds.add(id);

        let mesh = meshesRef.current.get(id);
        let rs = renderStatesRef.current.get(id);
        if (!mesh || !rs) {
          mesh = createPlayerMesh(p);
          meshesRef.current.set(id, mesh);
          rs = {
            rx: p.position.x, rz: p.position.z, yaw: p.rotation,
            prevHp: p.health, prevState: p.state, leanX: 0, recoil: 0, trailTick: 0,
          };
          renderStatesRef.current.set(id, rs);
          scene.add(mesh);
        }

        // ---- buttery interpolation (dead reckoning) ----
        const estX = p.position.x + (p.velocity?.x || 0) * 0.08;
        const estZ = p.position.z + (p.velocity?.z || 0) * 0.08;
        const posLerp = id === playerId ? 0.4 : 0.24;
        rs.rx += (estX - rs.rx) * posLerp;
        rs.rz += (estZ - rs.rz) * posLerp;

        // recoil impulse appuses position backward
        const recoilTarget = Math.max(0, rs.recoil - dt * 3.2);
        const recoilOffset = (rs.recoil - recoilTarget) * 0.0;
        rs.recoil = recoilTarget;
        void recoilOffset;

        // attacker's position for hit direction
        const attacker = p.lastHitBy ? players[p.lastHitBy] : undefined;
        let hitPushX = 0, hitPushZ = 0;
        if (attacker) {
          const ang = Math.atan2(rs.rx - attacker.position.x, rs.rz - attacker.position.z);
          hitPushX = Math.sin(ang) * rs.recoil * 0.5;
          hitPushZ = Math.cos(ang) * rs.recoil * 0.5;
        }

        mesh.position.x = rs.rx + hitPushX;
        mesh.position.z = rs.rz + hitPushZ;
        rs.yaw += shortestAngle(rs.yaw, p.rotation) * Math.min(1, dt * 14);
        mesh.rotation.y = rs.yaw;

        // ---- blob shadow follows ----
        const blob = mesh.userData.blob as THREE.Mesh | undefined;
        if (blob) { blob.position.x = mesh.position.x; blob.position.z = mesh.position.z; }

        // ---- HIT FEEDBACK (damage numbers + rumble + hit-stop) ----
        if (p.health < rs.prevHp - 0.5) {
          const dmg = Math.round(rs.prevHp - p.health);
          spawnParticles({ x: mesh.position.x, y: 1.4, z: mesh.position.z }, 0xd42a1a, 16, 5, 4.5);
          spawnParticles({ x: mesh.position.x, y: 1.5, z: mesh.position.z }, 0xffe28a, 7, 7, 5, 8);
          rs.recoil = Math.min(1.6, 0.6 + dmg * 0.03);
          spawnDamageText(dmg, { x: mesh.position.x, z: mesh.position.z }, dmg >= 22);

          if (id === playerId) {
            shakeRef.current = Math.max(shakeRef.current, 1.1 + dmg * 0.03);
            hurtFlashRef.current = Math.min(1, 0.45 + dmg * 0.02);
            hitStopRef.current = Math.max(hitStopRef.current, 0.07);
            rumble(dmg >= 25 ? [45, 30, 45] : [35]);
          } else if (p.lastHitBy === playerId) {
            // We're the one dealing this blow — feel the impact
            shakeRef.current = Math.max(shakeRef.current, 0.35 + dmg * 0.015);
            hitStopRef.current = Math.max(hitStopRef.current, 0.045);
            rumble(dmg >= 25 ? [30] : [18]);
          } else {
            shakeRef.current = Math.max(shakeRef.current, 0.28);
          }
        }
        rs.prevHp = p.health;

        // block/defend sparks
        if (rs.prevState !== "blocking" && p.state === "blocking" && attacker) { /* stance takens */ }

        if (rs.prevState !== "dead" && p.state === "dead") {
          spawnParticles({ x: mesh.position.x, y: 1.3, z: mesh.position.z }, 0x881410, 34, 7, 5.5);
          spawnParticles({ x: mesh.position.x, y: 0.5, z: mesh.position.z }, 0x3a2a20, 20, 5, 3);
          if (p.lastHitBy === playerId) {
            rumble([60, 40, 80]);
            hitStopRef.current = Math.max(hitStopRef.current, 0.11);
          } else if (id === playerId) {
            rumble([80, 60, 120]);
          }
        }
        rs.prevState = p.state;

        // Sprint dust puffs
        if (p.state === "sprinting") {
          dustTickRef.current += dt;
          if (dustTickRef.current > 0.28) {
            dustTickRef.current = 0;
            spawnParticles({ x: mesh.position.x, y: 0.15, z: mesh.position.z }, 0x8a7c5c, 3, 2.2, 1.4, 4);
          }
        }

        // Health bar render
        const hb = hbRef.current.get(id);
        if (hb) {
          const pct = Math.max(0, p.health / p.maxHealth);
          hb.scale.x = pct;
          hb.position.x = -(1 - pct) * 0.52;
          (hb.material as THREE.MeshBasicMaterial).color.setHex(pct > 0.55 ? 0x53d769 : pct > 0.25 ? 0xf0c33c : 0xe03a2f);
          hb.lookAt(camera.position);
          const bg = mesh.children.find((c) => Math.abs(c.position.y - 2.55) < 0.01 && c !== hb && c instanceof THREE.Mesh);
          if (bg) bg.lookAt(camera.position);
        }

        // ====== ANIMATION ======
        const piv = mesh.userData.pivots as {
          rightArm: THREE.Group; leftArm: THREE.Group;
          rightLeg: THREE.Group; leftLeg: THREE.Group;
          head: THREE.Group; cloak?: THREE.Group;
        } | undefined;

        if (p.state === "dead") {
          mesh.rotation.z += (Math.PI / 2 - mesh.rotation.z) * Math.min(1, dt * 6);
          mesh.position.y += (-0.55 - mesh.position.y) * Math.min(1, dt * 6);
          rs.leanX *= 0.9;
        } else {
          // ---- lean into movement velocity ----
          const spd = Math.hypot(p.velocity?.x || 0, p.velocity?.z || 0);
          const velAngle = Math.atan2(p.velocity?.x || 0, p.velocity?.z || 0);
          const sideLean = Math.sin(velAngle - rs.yaw) * Math.min(0.16, spd * 0.03);
          rs.leanX += (sideLean - rs.leanX) * Math.min(1, dt * 8);

          const fwdLean = -Math.cos(velAngle - rs.yaw) * Math.min(0.1, spd * 0.018);

          const speedMoving = p.state === "walking" || p.state === "running" || p.state === "sprinting";
          const cycleSpd = p.state === "sprinting" ? 11.5 : p.state === "running" ? 8.5 : 6.5;
          const stride = p.state === "sprinting" ? 0.85 : p.state === "running" ? 0.65 : 0.45;

          if (speedMoving && piv) {
            const phase = Math.sin(t * cycleSpd);
            piv.leftLeg.rotation.x = phase * stride;
            piv.rightLeg.rotation.x = -phase * stride;
            piv.leftArm.rotation.x += ((-phase * stride * 0.5 - 0.14) - piv.leftArm.rotation.x) * Math.min(1, dt * 12);
            if (p.state !== "attacking") {
              piv.rightArm.rotation.x += ((phase * stride * 0.5 - 0.18) - piv.rightArm.rotation.x) * Math.min(1, dt * 12);
            }
            mesh.position.y = Math.abs(Math.sin(t * cycleSpd)) * 0.05;
            if (piv.head) piv.head.rotation.x = p.state === "sprinting" ? 0.08 : 0.02;
            mesh.rotation.z = rs.leanX;
            mesh.rotation.x = fwdLean;
          } else {
            // breathing idle
            const br = Math.sin(t * 1.8 + rs.rx);
            mesh.position.y = br * 0.014;
            mesh.rotation.z = rs.leanX * 0.5;
            mesh.rotation.x = 0;
            if (piv) {
              piv.leftLeg.rotation.x *= 1 - Math.min(1, dt * 10);
              piv.rightLeg.rotation.x *= 1 - Math.min(1, dt * 10);
              if (p.state !== "attacking" && p.state !== "blocking" && p.state !== "staggered") {
                piv.leftArm.rotation.x += (br * 0.05 - 0.12 - piv.leftArm.rotation.x) * Math.min(1, dt * 6);
                piv.rightArm.rotation.x += (Math.sin(t * 1.8 + 0.5) * 0.05 - 0.18 - piv.rightArm.rotation.x) * Math.min(1, dt * 6);
              }
              if (piv.head && p.state !== "staggered") piv.head.rotation.x = br * 0.02;
            }
          }

          // ---- weapon swings: giant telegraphed arcs + body momentum ----
          if (piv && p.state === "attacking") {
            const stats = WARRIOR_STATS[p.warriorClass];
            const dur = stats.attackSpeed;
            const prog = Math.min(1, Math.max(0, 1 - p.attackTimer / (dur || 0.6)));
            // windup (0–35%), strike whip (35–72%), follow-through (72–100%)
            const wind = Math.min(1, prog / 0.35);
            const strike = Math.min(1, Math.max(0, (prog - 0.35) / 0.37));
            const follow = Math.max(0, (prog - 0.72) / 0.28);
            const whip = easeOutBack(strike);
            const recoilAmt = 1 - Math.min(1, follow * 1.4);
            const twist = Math.sin(wind * Math.PI * 0.5) * 0.35;
            if (p.attackDir === "overhead") {
              piv.rightArm.rotation.x = -easeOutCubic(wind) * 2.9 + whip * 2.85 * recoilAmt;
              piv.rightArm.rotation.z = 0.1 * Math.sin(strike * Math.PI);
              piv.head.rotation.x = -wind * 0.15 + follow * 0.1;
              mesh.rotation.y = rs.yaw - twist * 0.35;
              mesh.rotation.x = wind * 0.06 - strike * 0.16;
            } else if (p.attackDir === "left") {
              piv.rightArm.rotation.z = wind * 1.9 - whip * 2.3 * recoilAmt;
              piv.rightArm.rotation.x = -0.88;
              piv.head.rotation.y = twist * 0.5;
              mesh.rotation.y = rs.yaw + twist - whip * 0.55 * recoilAmt;
              mesh.rotation.x = 0;
            } else if (p.attackDir === "right") {
              piv.rightArm.rotation.z = -wind * 1.9 + whip * 2.3 * recoilAmt;
              piv.rightArm.rotation.x = -0.88;
              piv.head.rotation.y = -twist * 0.5;
              mesh.rotation.y = rs.yaw - twist + whip * 0.55 * recoilAmt;
              mesh.rotation.x = 0;
            } else {
              // stab: deep coil then lunge
              piv.rightArm.rotation.x = -1.1 - wind * 0.35 + strike * 0.3 * recoilAmt;
              mesh.rotation.y = rs.yaw + twist * 0.6 - whip * 0.25;
              mesh.rotation.x = 0;
              const weapon = mesh.userData.weapon as THREE.Group | undefined;
              const punch = wind < 1 ? -0.32 * easeOutCubic(wind) : easeOutBack(Math.min(1, strike * 1.7));
              if (weapon) weapon.position.z = punch * 0.9;
            }

            // blade trail sparks mid-strike
            rs.trailTick += dt;
            if (strike > 0 && strike < 0.9 && rs.trailTick > 0.045) {
              rs.trailTick = 0;
              const fx = Math.sin(rs.yaw), fz = Math.cos(rs.yaw);
              spawnParticles(
                { x: mesh.position.x + fx * 1.6, y: 1.7 - strike * 0.6, z: mesh.position.z + fz * 1.6 },
                p.warriorClass === "runekeeper" ? 0x66c8ff : 0xe8ecff, 3, 1.2, 1.4, 3
              );
            }
          } else if (piv && p.state !== "attacking") {
            piv.rightArm.rotation.z *= 1 - Math.min(1, dt * 9);
            if (piv.head) { piv.head.rotation.y *= 1 - Math.min(1, dt * 7); }
            const weapon = mesh.userData.weapon as THREE.Group | undefined;
            if (weapon) weapon.position.z *= 1 - Math.min(1, dt * 8);
            if (!speedMoving) { piv.head.rotation.x += (Math.sin(t * 1.8) * 0.02 - piv.head.rotation.x) * Math.min(1, dt * 7); }
          }

          // Block raise with shield/guard
          if (piv && p.state === "blocking") {
            piv.leftArm.rotation.x += (-1.4 - piv.leftArm.rotation.x) * Math.min(1, dt * 12);
            piv.rightArm.rotation.x += (-0.7 - piv.rightArm.rotation.x) * Math.min(1, dt * 10);
            if (piv.head) piv.head.rotation.x = -0.06;
          }

          // Dodge roll
          if (p.state === "dodging") {
            mesh.rotation.x = 0.55;
            mesh.rotation.z = rs.leanX + 0.2;
            if (piv) { piv.leftLeg.rotation.x = 0.95; piv.rightLeg.rotation.x = -0.95; }
          }

          // Staggered flail
          if (p.state === "staggered" && piv) {
            mesh.position.x += (Math.random() - 0.5) * 0.045;
            piv.head.rotation.x = -0.3 + Math.sin(t * 22) * 0.06;
            piv.leftArm.rotation.x = 0.65;
            piv.rightArm.rotation.x = 0.55;
          }

          // Cloak physics
          if (piv?.cloak) {
            const sway = speedMoving
              ? 0.32 + Math.sin(t * cycleSpd * 0.8) * 0.1
              : 0.1 + Math.sin(t * 1.4) * 0.05;
            piv.cloak.rotation.x += (sway - piv.cloak.rotation.x) * Math.min(1, dt * 7);
          }
        }

        // invincible blink
        mesh.visible = p.invincible ? Math.floor(t * 12) % 2 === 0 : true;

        // ability aura
        if (p.abilityActive) {
          const colAura = p.warriorClass === "berserker" ? 0xff3311 : p.warriorClass === "huscarl" ? 0x4488ff : p.warriorClass === "runekeeper" ? 0x9a55ff : 0xffaa33;
          if (Math.floor(t * 9) % 2 === 0) {
            spawnParticles({ x: mesh.position.x, y: 1.3, z: mesh.position.z }, colAura, 2, 1.5, 2.6, 4);
          }
        }
      }

      // cleanup stale
      meshesRef.current.forEach((m, id) => {
        if (!activeIds.has(id)) {
          const blob = m.userData.blob as THREE.Mesh | undefined;
          if (blob) scene.remove(blob);
          scene.remove(m);
          meshesRef.current.delete(id);
          hbRef.current.delete(id);
          renderStatesRef.current.delete(id);
        }
      });

      // ===== CAMERA (close over-shoulder) =====
      if (localPlayer && localPlayer.state !== "dead") {
        const rs = renderStatesRef.current.get(playerId);
        const baseX = rs?.rx ?? localPlayer.position.x;
        const baseZ = rs?.rz ?? localPlayer.position.z;
        const fwdX = Math.sin(inp.cameraAngle), fwdZ = Math.cos(inp.cameraAngle);
        const rx = fwdZ, rz = -fwdX;
        const damp = Math.min(1, dt * 7);
        const moving = localPlayer.state === "walking" || localPlayer.state === "running" || localPlayer.state === "sprinting";
        const bobFreq = localPlayer.state === "sprinting" ? 5.5 : moving ? 4 : 2.2;
        const bobAmp = localPlayer.state === "idle" ? 0.016 : 0.032;
        const bob = Math.sin(t * bobFreq) * bobAmp;
        camera.position.x += (baseX - fwdX * CAM_DIST + rx * CAM_SIDE - camera.position.x) * damp;
        camera.position.z += (baseZ - fwdZ * CAM_DIST + rz * CAM_SIDE - camera.position.z) * damp;
        camera.position.y += (CAM_HEIGHT + bob - camera.position.y) * Math.min(1, dt * 10);
        camera.lookAt(baseX + fwdX * LOOK_AHEAD, LOOK_HEIGHT + bob * 0.7, baseZ + fwdZ * LOOK_AHEAD);

        const targetFov = localPlayer.state === "sprinting" ? 61 : 55;
        fovRef.current += (targetFov - fovRef.current) * Math.min(1, dt * 5);
        camera.fov = fovRef.current;
        camera.updateProjectionMatrix();
      } else {
        inp.cameraAngle += dt * 0.22;
        camera.position.lerp(new THREE.Vector3(Math.sin(inp.cameraAngle) * 15, 7.5, Math.cos(inp.cameraAngle) * 15), 0.04);
        camera.lookAt(0, 1.4, 0);
      }

      // camera shake
      if (shakeRef.current > 0.01) {
        camera.position.x += (Math.random() - 0.5) * shakeRef.current * 0.12;
        camera.position.y += (Math.random() - 0.5) * shakeRef.current * 0.12;
        shakeRef.current *= 1 - Math.min(0.9, dt * 9);
      } else shakeRef.current = 0;

      // HUD overlays (direct DOM for perf)
      if (vignetteRef.current && localPlayer) {
        const pct = localPlayer.health / localPlayer.maxHealth;
        const low = pct < 0.35 ? (0.35 - pct) / 0.35 : 0;
        const pulse = low * (0.55 + Math.sin(t * 4.5) * 0.2);
        vignetteRef.current.style.opacity = String(Math.min(0.85, pulse + hurtFlashRef.current * 0.4));
      }
      hurtFlashRef.current = Math.max(0, hurtFlashRef.current - dt * 1.6);

      // particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pp = particlesRef.current[i];
        pp.life -= dt;
        if (pp.life <= 0) { scene.remove(pp.pts); particlesRef.current.splice(i, 1); continue; }
        const pos = pp.pts.geometry.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let j = 0; j < pp.vels.length; j++) {
          arr[j * 3] += pp.vels[j].x * dt;
          arr[j * 3 + 1] += pp.vels[j].y * dt;
          arr[j * 3 + 2] += pp.vels[j].z * dt;
          pp.vels[j].y -= pp.gravity * dt;
        }
        pos.needsUpdate = true;
        (pp.pts.material as THREE.PointsMaterial).opacity = pp.life * 2;
      }

      // damage numbers rise & fade
      for (let i = damageTextsRef.current.length - 1; i >= 0; i--) {
        const dt2 = damageTextsRef.current[i];
        dt2.life -= dt;
        if (dt2.life <= 0) {
          scene.remove(dt2.sprite);
          dt2.sprite.material.map?.dispose();
          dt2.sprite.material.dispose();
          damageTextsRef.current.splice(i, 1);
          continue;
        }
        dt2.sprite.position.y += dt2.vy * dt;
        dt2.vy *= 1 - dt * 1.6;
        (dt2.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, dt2.life * 2.4);
      }

      // fog drift
      if (fogPtsRef.current) {
        const fa = fogPtsRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const arr = fa.array as Float32Array;
        for (let i = 0; i < fa.count; i++) {
          arr[i * 3] += Math.sin(t * 0.35 + i) * 0.005;
          arr[i * 3 + 2] += Math.cos(t * 0.3 + i) * 0.005;
        }
        fa.needsUpdate = true;
      }

      // last stand mood
      if (roomState.lastStandTriggered && !lastStandRef.current) {
        lastStandRef.current = true;
        const fog = scene.fog as THREE.FogExp2;
        if (fog) { fog.color.set(0x4a2015); fog.density = 0.016; }
        scene.background = new THREE.Color(0x3a1d12);
        if (ambientRef.current) ambientRef.current.intensity = 0.55;
      } else if (!roomState.lastStandTriggered && lastStandRef.current) {
        lastStandRef.current = false;
        const fog = scene.fog as THREE.FogExp2;
        if (fog) { fog.color.set(0x273548); fog.density = 0.012; }
        scene.background = new THREE.Color(0x2b3a4e);
        if (ambientRef.current) ambientRef.current.intensity = 0.85;
      }

      renderer.render(scene, camera);
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [roomState, playerId, onSendInput, createPlayerMesh, spawnParticles]);

  // ---------- touch (dynamic joystick: thumb lands = joystick born there) ----------
  const [joyOrigin, setJoyOrigin] = useState<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX < window.innerWidth * 0.42 && touch.clientY > window.innerHeight * 0.25 && touch.clientY < window.innerHeight * 0.95) {
        joystickTouchRef.current = touch.identifier;
        joystickOriginRef.current = { x: touch.clientX, y: touch.clientY };
        joystickRef.current = { x: 0, y: 0, active: true };
        setJoyOrigin({ x: touch.clientX, y: touch.clientY });
        setJoystickPos({ x: 0, y: 0, active: true });
      } else if (!cameraDragRef.current.id && touch.clientX > window.innerWidth * 0.55 && touch.clientY < window.innerHeight * 0.62) {
        cameraDragRef.current = { id: touch.identifier, lastX: touch.clientX };
      }
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchRef.current) {
        const dx = (touch.clientX - joystickOriginRef.current.x) / 55;
        const dy = (touch.clientY - joystickOriginRef.current.y) / 55;
        const len = Math.hypot(dx, dy) || 1;
        const cl = Math.min(len, 1);
        const nx = (dx / len) * cl, ny = (dy / len) * cl;
        joystickRef.current = { x: nx, y: ny, active: true };
        setJoystickPos({ x: nx, y: ny, active: true });
      }
      if (touch.identifier === cameraDragRef.current.id) {
        inputState.current.cameraAngle += (touch.clientX - cameraDragRef.current.lastX) * 0.01;
        cameraDragRef.current.lastX = touch.clientX;
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchRef.current) {
        joystickTouchRef.current = null;
        joystickRef.current = { x: 0, y: 0, active: false };
        setJoyOrigin(null);
        setJoystickPos({ x: 0, y: 0, active: false });
      }
      if (touch.identifier === cameraDragRef.current.id) cameraDragRef.current = { id: null, lastX: 0 };
    }
  }, []);

  const localPlayer = roomState?.players[playerId];
  const isAlive = localPlayer && localPlayer.state !== "dead";
  const isFighting = roomState?.state === "fighting" || roomState?.state === "last_stand";
  const hpPct = localPlayer ? Math.max(0, localPlayer.health / localPlayer.maxHealth) : 1;

  return (
    <div ref={rootRef} className="relative w-full h-full select-none" onTouchStart={() => { if (glError) setGlError(null); }} onMouseDown={() => { if (glError) setGlError(null); }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* WebGL error overlay */}
      {glError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-950/95 p-6">
          <div className="max-w-xs text-center">
            <div className="font-display text-amber-400 text-xl mb-2 tracking-wider">GRAPHICS INTERRUPTED</div>
            <p className="text-stone-300 text-sm leading-relaxed">{glError}</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-5 py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg font-bold text-sm tracking-wider">
              RELOAD BATTLE
            </button>
          </div>
        </div>
      )}

      {/* Damage / low-HP vignette */}
      <div ref={vignetteRef} className="absolute inset-0 pointer-events-none z-[5] transition-opacity duration-150"
        style={{
          opacity: 0,
          background: "radial-gradient(ellipse at center, transparent 42%, rgba(160, 20, 10, 0.55) 100%)",
        }} />
      <div ref={hurtRef} className="absolute inset-0 pointer-events-none z-[5]" style={{ opacity: 0 }} />

      {isFighting && localPlayer && (
        <>
          {/* Status HUD */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-10 w-[52vw] max-w-72">
            <div className="text-amber-100/95 text-[11px] font-bold tracking-[0.2em] font-display" style={{ textShadow: "0 1px 5px black" }}>{localPlayer.name}</div>
            <div className="w-full h-3.5 bg-black/70 rounded-md border border-amber-900/70 overflow-hidden shadow-lg">
              <div className="h-full transition-all duration-200"
                style={{
                  width: `${hpPct * 100}%`,
                  background: hpPct > 0.5 ? "linear-gradient(90deg,#2fa245,#5ee06b)" :
                    hpPct > 0.25 ? "linear-gradient(90deg,#c99a22,#f0d048)" : "linear-gradient(90deg,#a12117,#ff4a3a)",
                }} />
            </div>
            <div className="w-full h-1.5 bg-black/70 rounded-md border border-sky-950/70 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-400 to-sky-300 transition-all duration-200"
                style={{ width: `${Math.max(0, (localPlayer.stamina / localPlayer.maxStamina) * 100)}%` }} />
            </div>
          </div>

          {/* Kill feed */}
          <div className="absolute top-3 right-3 flex flex-col gap-1 pointer-events-none z-10">
            {roomState!.killFeed.slice(-5).map((k, i) => (
              <div key={i} className="text-[10px] sm:text-xs bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-md text-white border-l-2 border-red-700/80 animate-fadeIn">
                <span className="text-amber-300 font-bold">{k.killerName}</span>
                <span className="text-stone-400"> slew </span>
                <span className="text-red-300 font-bold">{k.victimName}</span>
              </div>
            ))}
          </div>

          {/* Timer + alive */}
          <div className="absolute top-3 left-3 pointer-events-none z-10">
            <div className="text-amber-100 text-sm font-mono bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-md">
              {Math.floor((roomState?.matchTimer ?? 0) / 60)}:{String(Math.floor((roomState?.matchTimer ?? 0) % 60)).padStart(2, "0")}
            </div>
            <div className="text-[10px] text-amber-200/90 mt-1 tracking-[0.2em] font-bold">
              {Object.values(roomState!.players).filter(p => p.state !== "dead").length} ALIVE
            </div>
          </div>

          {/* Ability cooldown */}
          <div className="absolute bottom-28 sm:bottom-6 left-3 pointer-events-none z-10">
            <div className="bg-black/55 backdrop-blur-sm px-3 py-1.5 rounded-md border border-purple-900/60">
              <div className="text-[9px] text-purple-300 tracking-[0.15em] font-bold">{WARRIOR_STATS[localPlayer.warriorClass].ability}</div>
              <div className="text-amber-300 font-bold text-sm">
                {localPlayer.abilityCooldown > 0 ? `${Math.ceil(localPlayer.abilityCooldown)}s` : "READY"}
              </div>
            </div>
          </div>

          {roomState!.lastStandTriggered && (
            <div className="absolute top-[22%] left-1/2 -translate-x-1/2 pointer-events-none z-10 animate-pulse">
              <div className="font-display text-3xl sm:text-5xl font-bold text-red-500 tracking-[0.35em] text-center"
                style={{ textShadow: "0 0 40px rgba(255,40,20,0.8), 0 2px 6px black" }}>
                LAST STAND
              </div>
            </div>
          )}

          {localPlayer.state === "dead" && (
            <div className="absolute inset-0 bg-gradient-to-t from-red-950/50 via-transparent to-transparent flex items-end justify-center pb-24 pointer-events-none z-10">
              <div className="text-center">
                <div className="font-display text-4xl font-bold text-red-400 mb-1 tracking-[0.2em]" style={{ textShadow: "0 0 25px black" }}>FALLEN</div>
                <div className="text-sm text-stone-300">Spectating the survivors...</div>
              </div>
            </div>
          )}
        </>
      )}

      {roomState?.state === "countdown" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <div className="font-display text-8xl font-bold text-amber-300 animate-pulse"
            style={{ textShadow: "0 0 50px rgba(255,180,60,0.8), 0 4px 10px black" }}>
            {roomState.countdown > 0 ? roomState.countdown : "FIGHT!"}
          </div>
          <div className="text-amber-200/70 text-xs tracking-[0.4em] mt-2 font-display">TO ARMS</div>
        </div>
      )}

      {/* Mobile controls — arc cluster built for one thumb */}
      {isMobile.current && isFighting && isAlive && localPlayer && (
        <>
          {joyOrigin && (
            <div className="absolute pointer-events-none z-10"
              style={{ left: joyOrigin.x - 46, top: joyOrigin.y - 46 }}>
              <div className="w-[92px] h-[92px] rounded-full border-2 border-white/30 bg-black/35 backdrop-blur-sm relative shadow-lg shadow-black/40">
                <div className="absolute w-11 h-11 rounded-full bg-amber-100/80 shadow-md"
                  style={{ left: `${50 + joystickPos.x * 32}%`, top: `${50 + joystickPos.y * 32}%`, transform: "translate(-50%,-50%)" }} />
              </div>
            </div>
          )}

          {/* big primary SLASH - hold for relentless combo swings */}
          <button
            className={`absolute right-4 bottom-10 z-20 w-[84px] h-[84px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
              localPlayer.stamina >= 13 ? (mobileFlags.current.attack ? "bg-red-500 border-amber-300 scale-95" : "bg-red-700/95 active:bg-red-500 border-red-300/80") : "bg-stone-600/60 border-stone-500/40 opacity-70"
            }`}
            onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); mobileFlags.current.attack = true; }}
            onTouchEnd={(e) => { e.stopPropagation(); mobileFlags.current.attack = false; }}>
            <Swords size={28} /><span className="text-[10px] font-bold tracking-wider">{mobileFlags.current.attack ? "SLYING" : "SLASH"}</span>
          </button>

          {/* HEAVY */}
          <button
            className={`absolute right-[112px] bottom-8 z-20 w-[68px] h-[68px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
              localPlayer.stamina >= 22 ? "bg-orange-700/95 active:bg-orange-500 border-orange-300/80" : "bg-stone-600/60 border-stone-500/40 opacity-70"
            }`}
            onTouchStart={(e) => { e.stopPropagation(); mobileFlags.current.heavy = true; }}>
            <Hammer size={22} /><span className="text-[9px] font-bold">HEAVY</span>
          </button>

          {/* BLOCK (hold) */}
          <button
            className="absolute right-4 bottom-[128px] z-20 w-[64px] h-[64px] rounded-full bg-sky-800/95 active:bg-sky-500 text-white border-[3px] border-sky-300/80 flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50"
            onTouchStart={(e) => { e.stopPropagation(); mobileFlags.current.block = true; }}
            onTouchEnd={() => { mobileFlags.current.block = false; }}>
            <Shield size={20} /><span className="text-[9px] font-bold">BLOCK</span>
          </button>

          {/* DODGE */}
          <button
            className={`absolute right-[100px] bottom-[130px] z-20 w-[60px] h-[60px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
              localPlayer.stamina >= 20 ? "bg-emerald-700/95 active:bg-emerald-500 border-emerald-300/80" : "bg-stone-600/60 border-stone-500/40 opacity-70"
            }`}
            onTouchStart={(e) => { e.stopPropagation(); mobileFlags.current.dodge = true; }}>
            <Wind size={19} /><span className="text-[9px] font-bold">DODGE</span>
          </button>

          {/* POWER */}
          <button
            className={`absolute right-[56px] bottom-[212px] z-20 w-[60px] h-[60px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
              localPlayer.abilityCooldown <= 0 ? "bg-violet-700/95 active:bg-violet-500 border-violet-300/80" : "bg-stone-600/60 border-stone-500/40 opacity-70"
            }`}
            onTouchStart={(e) => { e.stopPropagation(); if (localPlayer.abilityCooldown <= 0) mobileFlags.current.ability = true; }}>
            <Sparkles size={20} /><span className="text-[8px] font-bold">
              {localPlayer.abilityCooldown > 0 ? `${Math.ceil(localPlayer.abilityCooldown)}s` : "POWER"}
            </span>
          </button>

          {/* RUN toggle (left side, near joystick) */}
          <button
            className={`absolute left-4 bottom-6 z-20 w-[56px] h-[56px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${mobileFlags.current.sprint ? "bg-amber-500/95 border-amber-200" : "bg-stone-700/95 border-stone-400/70"}`}
            onTouchStart={(e) => { e.stopPropagation(); mobileFlags.current.sprint = !mobileFlags.current.sprint; }}>
            <Zap size={18} /><span className="text-[9px] font-bold">{mobileFlags.current.sprint ? "ON" : "RUN"}</span>
          </button>
        </>
      )}

      {!isMobile.current && isFighting && !inputState.current.pointerLocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 z-10 pointer-events-none">
          <div className="text-white text-lg bg-black/70 px-7 py-3.5 rounded-lg border border-amber-900/60 tracking-wide font-display">
            CLICK TO TAKE UP YOUR WEAPON
          </div>
        </div>
      )}
    </div>
  );
}
