"use client";
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import type { WarriorClass } from "../types";
import {
  buildCharacter, buildWeaponForClass, buildShield, type Appearance, defaultAppearance,
} from "./characters";

const CLASS_TUNIC: Record<string, number> = {
  huscarl: 0x6a5636,
  warden: 0x5a6630,
  runekeeper: 0x3d3a5c,
  berserker: 0x6e2b26,
};

export default function CharacterPreview({
  warriorClass,
  appearance,
  height = 240,
  className = "",
}: {
  warriorClass: WarriorClass;
  appearance?: Appearance;
  height?: number;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const charRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const matCache = useRef(new Set<THREE.Material>());

  // Init once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, 1.25, 3.7);
    camera.lookAt(0, 1.18, 0);

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.borderRadius = "12px";
    rendererRef.current = renderer;
    sceneRef.current = scene;

    // Lighting: studio-quality forge glow — face detail pops, armour reads
    scene.add(new THREE.AmbientLight(0xb09880, 1.1));
    const key = new THREE.DirectionalLight(0xfff0d0, 2.2);
    key.position.set(2, 4.5, 3.5);
    key.castShadow = true;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8ab0ff, 1.4);
    rim.position.set(-2.5, 3.5, -4);
    scene.add(rim);
    const under = new THREE.PointLight(0xff8a40, 3, 8);
    under.position.set(0.8, 0.4, 1.6);
    scene.add(under);
    const cool = new THREE.PointLight(0x88b8ff, 1.6, 9);
    cool.position.set(-1.4, 2.2, 1.8);
    scene.add(cool);

    // Display disc
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.35, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: 0x3a3026, roughness: 0.85 })
    );
    disc.position.y = -0.04;
    disc.receiveShadow = true;
    scene.add(disc);
    const rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.28, 0.03, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0xb8862a, roughness: 0.35, metalness: 0.85 })
    );
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = 0.01;
    scene.add(rimRing);

    // Blob shadow
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.65, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    scene.add(blob);

    // Ember particles
    const emberCount = 14;
    const emberArr = new Float32Array(emberCount * 3);
    for (let i = 0; i < emberCount; i++) {
      emberArr[i * 3] = (Math.random() - 0.5) * 2.6;
      emberArr[i * 3 + 1] = Math.random() * 2.4;
      emberArr[i * 3 + 2] = (Math.random() - 0.5) * 2.6;
    }
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute("position", new THREE.BufferAttribute(emberArr, 3));
    const emberPts = new THREE.Points(emberGeo, new THREE.PointsMaterial({
      color: 0xff9a40, size: 0.05, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    scene.add(emberPts);

      let raf = 0;
      let lastT = 0;
      const loop = (t: number) => {
        const dt = Math.min((t - lastT) / 1000, 0.05);
        lastT = t;
        const time = t / 1000;

        if (charRef.current) {
          charRef.current.rotation.y = Math.sin(time * 0.4) * 0.55; // gentle inspect sway instead of spin
          charRef.current.position.y = Math.sin(time * 1.6) * 0.02;
        // sway cloak
        const piv = charRef.current.userData.pivots as { cloak?: THREE.Group } | undefined;
        if (piv?.cloak) piv.cloak.rotation.x = 0.12 + Math.sin(time * 1.3) * 0.04;
      }
      // embers rise
      const pos = emberGeo.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < emberCount; i++) {
        arr[i * 3 + 1] += dt * 0.5;
        if (arr[i * 3 + 1] > 2.6) arr[i * 3 + 1] = 0.1;
      }
      pos.needsUpdate = true;
      emberPts.rotation.y = time * 0.1;

      renderer!.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => {
      const r = mount.getBoundingClientRect();
      camera.aspect = r.width / Math.max(1, r.height);
      camera.updateProjectionMatrix();
      renderer!.setSize(r.width, r.height, false);
    };
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      mount.removeChild(renderer!.domElement);
      renderer!.dispose();
      matCache.current.forEach((m) => m.dispose());
      matCache.current.clear();
      scene.clear();
    };
  }, []);

  // Rebuild character when class/appearance changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (charRef.current) {
      charRef.current.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material;
          matCache.current.delete(m as THREE.Material);
          (m as THREE.Material).dispose();
        }
      });
      scene.remove(charRef.current);
      charRef.current = null;
    }

    const ap = appearance || defaultAppearance(warriorClass);
    const built = buildCharacter(warriorClass, ap, CLASS_TUNIC[warriorClass] ?? 0x5a4a2c);
    const root = built.group;
    root.userData.pivots = { cloak: built.cloak };

    // Weapons
    const rightMount = built.rightArm.children[built.rightArm.children.length - 1] as THREE.Group;
    const weapon = buildWeaponForClass(warriorClass);
    rightMount.add(weapon);
    const leftMount = built.leftArm.children[built.leftArm.children.length - 1] as THREE.Group;
    if (warriorClass === "runekeeper") {
      const off = buildWeaponForClass("runekeeper");
      off.scale.setScalar(0.9);
      leftMount.add(off);
    }
    if (warriorClass === "huscarl") {
      const shield = buildShield(0x6b4226);
      shield.position.set(-0.14, -0.4, 0.26);
      shield.rotation.set(0.22, 0.16, 0.14);
      built.leftArm.add(shield);
    }

    // Collect materials for disposal tracking
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = false;
        matCache.current.add((o as THREE.Mesh).material as THREE.Material);
      }
    });

    root.rotation.y = -0.5;
    scene.add(root);
    charRef.current = root;
  }, [warriorClass, appearance]);

  return (
    <div ref={mountRef} className={className} style={{ height, width: "100%", position: "relative" }} />
  );
}
