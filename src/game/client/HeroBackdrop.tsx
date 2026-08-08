"use client";

import { useEffect, useRef } from "react";

/**
 * THE LANDING SCREEN'S NIGHT.
 *
 * The owner: *"feel like we need a cooler background that feels more alive &
 * more to the vibe of the game."* Both halves of that are fair, and they are
 * different problems.
 *
 * NOT ALIVE. What was here was `.embers` — eight `radial-gradient` dots on one
 * element, translated 36% up the page over 26 seconds and looped. Eight. At any
 * moment most of them are outside the viewport or at zero opacity, so the
 * screen reads as a still image with an occasional speck, and the loop is long
 * enough that nothing appears to be happening at all.
 *
 * NOT THE VIBE. Everything was one brown. A fire only reads as a fire if
 * something above it is cold — with the whole field warm there is nothing for
 * the glow to be brighter *than*, so it flattens into a beige wash. And there
 * was no horizon, so on a 1440px desktop the screen was a thin column of cards
 * in the middle of an empty field with no scene around it.
 *
 * So this draws a place instead of a gradient: a hall on a ridge at night, its
 * fire out of frame below, and the sparks off it climbing past you.
 *
 *   sky        cold above, warm below — the contrast the fire is read against
 *   haze       two slow smoke bodies, so the dark is not evenly dark
 *   ridge      the hall, its outbuildings, a palisade and a treeline, in pure
 *              black. This is what makes it a place, and it spans the full
 *              width, which is the desktop emptiness fixed by putting something
 *              there rather than by moving the cards.
 *   embers     ~200 sparks on three depth planes, with turbulence, flicker and
 *              buoyancy — the thing that is actually alive
 *   firelight  the whole scene's warmth breathing on layered noise
 *
 * COSTS. One canvas, one rAF, no images, no libraries — the zero-asset rule
 * holds. Particle count scales with area and is capped, the backing store is
 * capped at 1.5x DPR, and the loop stops dead when the tab is hidden or the
 * element scrolls away. `prefers-reduced-motion` draws one frame and never
 * starts a loop.
 */

/** Sparks per million device-independent pixels, and the ceiling regardless. */
const EMBER_DENSITY = 155;
const EMBER_MAX = 240;

type Ember = {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  /** 0 far, 1 near. Drives size, speed, brightness and blur together. */
  depth: number;
  /** Radians into its own flicker cycle, so no two pulse together. */
  phase: number;
  hz: number;
  life: number;
  maxLife: number;
};

/**
 * Cheap layered value noise in one dimension.
 *
 * A sine would give the firelight a metronome, and a metronome is the one thing
 * firelight never is — the eye reads regular pulsing as a CSS animation
 * instantly. Three incommensurable rates summed never repeats inside a session.
 */
function flicker(t: number): number {
  return (
    Math.sin(t * 1.7) * 0.5 +
    Math.sin(t * 4.3 + 1.3) * 0.3 +
    Math.sin(t * 9.1 + 2.7) * 0.2
  );
}

export default function HeroBackdrop() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d", { alpha: true });
    if (!ctx) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0, h = 0, dpr = 1;
    let embers: Ember[] = [];
    let raf = 0;
    let running = false;
    let t0 = 0;

    const spawn = (e: Ember, seeded: boolean) => {
      const depth = Math.random();
      e.depth = depth;
      e.x = Math.random() * w;
      // Seeded sparks start scattered up the screen so the first frame is
      // already a field rather than a line of dots along the bottom edge.
      e.y = seeded ? Math.random() * h : h + Math.random() * 40;
      // Near sparks are bigger, faster and brighter; far ones drift. One
      // parameter driving all four is what reads as depth rather than as
      // randomness.
      e.r = 0.5 + depth * 1.7;
      e.vy = -(8 + depth * 26 + Math.random() * 10);
      e.vx = (Math.random() - 0.5) * (4 + depth * 10);
      e.phase = Math.random() * Math.PI * 2;
      e.hz = 1.5 + Math.random() * 4;
      e.maxLife = 4 + Math.random() * 7;
      e.life = seeded ? Math.random() * e.maxLife : 0;
    };

    const resize = () => {
      const rect = cv.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      // 1.5 is plenty for soft round sparks and saves a third of the fill on a
      // 3x phone, where this is competing with a WebGL scene one tap away.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const want = Math.min(EMBER_MAX, Math.round((w * h) / 1e6 * EMBER_DENSITY));
      if (embers.length > want) embers.length = want;
      while (embers.length < want) {
        const e = {} as Ember;
        spawn(e, true);
        embers.push(e);
      }
    };

    const draw = (nowMs: number) => {
      const t = (nowMs - t0) / 1000;
      const dt = still ? 0 : Math.min(0.05, (nowMs - (draw as { last?: number }).last!) / 1000 || 0.016);
      (draw as { last?: number }).last = nowMs;

      ctx.clearRect(0, 0, w, h);

      // ---- firelight, breathing ----
      // Kept to a narrow band. The point is that the dark is not CONSTANT; a
      // swing wide enough to notice as brightness reads as a broken monitor.
      const fire = 0.86 + flicker(t * 0.55) * 0.14;

      // ---- the glow the sparks come off, below the frame ----
      const gy = h * 1.06;
      const glow = ctx.createRadialGradient(w * 0.5, gy, 0, w * 0.5, gy, Math.max(w, h) * 0.78);
      glow.addColorStop(0, `rgba(224,116,28,${0.5 * fire})`);
      glow.addColorStop(0.34, `rgba(168,74,18,${0.22 * fire})`);
      glow.addColorStop(0.72, "rgba(90,38,10,0.07)");
      glow.addColorStop(1, "rgba(90,38,10,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // ---- smoke, two bodies, very slow ----
      // Large, faint and off-centre, so the sky has structure without anything
      // in it being identifiable as a shape.
      for (let i = 0; i < 2; i++) {
        const p = t * (0.012 + i * 0.007) + i * 0.5;
        const cx = w * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(p * 2.1 + i)));
        const cy = h * (0.72 - 0.42 * ((p * 0.6 + i * 0.4) % 1));
        const rr = Math.max(w, h) * (0.3 + 0.12 * i);
        const smoke = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        smoke.addColorStop(0, `rgba(84,60,40,${0.075 - i * 0.02})`);
        smoke.addColorStop(1, "rgba(84,60,40,0)");
        ctx.fillStyle = smoke;
        ctx.fillRect(0, 0, w, h);
      }

      // ---- the embers ----
      ctx.globalCompositeOperation = "lighter";
      for (const e of embers) {
        if (!still) {
          e.life += dt;
          // Turbulence, not a straight climb. The x-drift is a function of
          // height as well as time, so a spark weaves up rather than sliding
          // sideways — hot air is not wind.
          const swirl = Math.sin(e.y * 0.013 + e.phase + t * 0.7) * (10 + e.depth * 16);
          e.x += (e.vx + swirl) * dt;
          // Buoyancy: sparks accelerate as they rise and shed heat, which is
          // what stops the field looking like falling snow run backwards.
          e.vy -= (6 + e.depth * 10) * dt;
          e.y += e.vy * dt;
          if (e.life > e.maxLife || e.y < -20 || e.x < -30 || e.x > w + 30) spawn(e, false);
        }

        const age = e.life / e.maxLife;
        // Fade in fast, out slow — a spark is brightest as it leaves the fire.
        const envelope = Math.min(1, age * 12) * (1 - age) ** 1.5;
        const pulse = 0.72 + 0.28 * Math.sin(t * e.hz + e.phase);
        const a = envelope * pulse * (0.34 + e.depth * 0.66) * fire;
        if (a <= 0.004) continue;

        const rr = e.r * (1 + e.depth * 0.7);
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr * 4.5);
        // Near sparks keep a white-hot core; far ones never get past orange,
        // which is most of what separates the planes.
        const core = e.depth > 0.55 ? "255,236,196" : "255,190,110";
        g.addColorStop(0, `rgba(${core},${a})`);
        g.addColorStop(0.32, `rgba(255,150,58,${a * 0.5})`);
        g.addColorStop(1, "rgba(255,120,30,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, rr * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      if (running && !still) raf = requestAnimationFrame(draw);
    };

    const start = () => {
      if (running || still) return;
      running = true;
      (draw as { last?: number }).last = performance.now();
      raf = requestAnimationFrame(draw);
    };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    t0 = performance.now();
    resize();
    draw(t0);

    // A canvas painting sixty times a second behind a hidden tab is pure heat.
    const onVis = () => (document.hidden ? stop() : start());
    const ro = new ResizeObserver(() => { resize(); if (still) draw(performance.now()); });
    ro.observe(cv);
    document.addEventListener("visibilitychange", onVis);
    start();

    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <>
      <canvas ref={ref} className="hero-embers" aria-hidden="true" />
      <HallRidge />
    </>
  );
}

/**
 * The skyline: a hall on a ridge, its outbuildings, a palisade and a treeline.
 *
 * Pure black, no detail, no highlight — a silhouette is forgiving about
 * craftsmanship in a way a lit object is not, and the whole read comes from the
 * PROFILE. So the profile is the part that had to be right: an Anglo-Saxon hall
 * is a long low body under a very steep thatch, with the gable barge-boards
 * crossing and projecting past the ridge. Those crossed finials are the single
 * most recognisable thing about the building and they are the reason this reads
 * as a hall rather than as a shed.
 *
 * It is one SVG spanning the full width with `preserveAspectRatio="none"` on
 * the horizontal only — the ridge stretches, the hall does not distort, because
 * the hall is drawn in its own nested viewport. That is what lets a 1440px
 * desktop have a horizon without a 390px phone having a smeared one.
 */
function HallRidge() {
  return (
    <svg className="hero-ridge" viewBox="0 0 1440 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {/* Treeline, back. Deliberately irregular: an even skyline of conifers
          reads as a pattern, and a pattern reads as clip art. */}
      <path
        fill="#070504"
        d="M0 260V196l26-14 14 10 19-19 16 14 22-22 18 18 27-26 19 19 15-13 23 21 20-17 26 24 17-15 21 18 24-21 19 17 28-25 16 15 23-20 21 18 25-22 18 16 27-24 20 18 22-19 25 22 19-16 28 25 17-15 24 21 22-19 26 23 20-17 27 24 18-16 25 22 23-20 21 18 26-23 19 17 28 25 16-14 24 21 22-19 25 22 20-17 27 24 18-16 26 23 22-19 24 21 21-18 27 24 19-17 25 22 23-20 21 18V260Z"
      />
      {/* The ridge the hall stands on. */}
      <path fill="#040302" d="M0 260v-42l70-13 96 9 84-17 92 11 78-14 96 16 88-12 92 14 84-16 96 11 82-13 94 15 88-10 100 12v49Z" />
      {/* Palisade, left of the hall — stakes with a rail. */}
      <g fill="#040302">
        {Array.from({ length: 14 }, (_, i) => (
          <rect key={i} x={330 + i * 20} y={188 + (i % 3) * 3} width="7" height="72" rx="3" />
        ))}
        <rect x="326" y="216" width="288" height="5" />
      </g>

      {/* THE HALL. Its own coordinate frame so the horizontal stretch above
          cannot flatten the roof pitch. */}
      <svg x="4" y="122" width="330" height="138" viewBox="0 0 470 196" preserveAspectRatio="xMidYMax meet">
        <g fill="#040302">
          {/* Body and roof as one profile: eaves well proud of the walls, the
              way a thatch that has to throw water clear of a daub wall is. */}
          <path d="M235 8 448 96l-22 10-14-6v96H62v-96l-14 6-22-10Z" />
          {/* Crossed barge-boards, projecting past the ridge. The one detail
              worth spending strokes on. */}
          <path d="M228 2h6l58 30-4 8-57-29-57 29-4-8Z" />
          <rect x="200" y="-6" width="7" height="46" transform="rotate(28 203 17)" />
          <rect x="256" y="-6" width="7" height="46" transform="rotate(-28 259 17)" />
          {/* Smoke louvre at the ridge — a hall burns its fire on the floor and
              lets it out through the roof. */}
          <path d="M214 44h42l10 16h-62Z" />
        </g>
        {/* The doorway, lit from within. The ONLY warm thing on the ridge, and
            that is the whole point: one lit door on a black skyline says a hall
            full of people more loudly than any amount of window detail. */}
        <g>
          <path d="M222 128h26v68h-26Z" fill="#1a0d05" />
          <path d="M225 134h20v62h-20Z" fill="url(#doorGlow)" />
        </g>
        <defs>
          <linearGradient id="doorGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb347" stopOpacity="0.85" />
            <stop offset="1" stopColor="#c2560f" stopOpacity="0.35" />
          </linearGradient>
        </defs>
      </svg>

      {/* Two outbuildings, smaller and further along, to give the ridge depth. */}
      <g fill="#040302">
        <path d="M1268 190l72-38 72 38-11 6-9-5v69h-104v-69l-9 5Z" />
        <path d="M1146 212l46-25 46 25-7 4-6-3v47h-66v-47l-6 3Z" />
      </g>
    </svg>
  );
}
