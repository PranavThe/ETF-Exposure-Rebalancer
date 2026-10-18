"use client";

import { useEffect, useRef } from "react";

import { SECTORS, sectorColor } from "@/lib/planner";

// The app's donut, drawn as glowing dots on two tilted rings behind the hero: the inner ring is an
// example portfolio's sector mix now, the outer ring a target that moves between a few example mixes.
// A light wave runs around the rings, dots drift outward while the target moves, and the centre shows
// how closely the two match. The pointer tilts the rings and pushes nearby dots aside.

/** Example mixes in SECTORS order: the example portfolio from the app, then three targets. */
const NOW = normalise([0.526, 0.084, 0.091, 0.066, 0.028, 0.089, 0.061, 0.022, 0.012, 0.01, 0.01, 0.003]);
const TARGETS = [
  [0.426, 0.184, 0.091, 0.066, 0.028, 0.089, 0.061, 0.022, 0.012, 0.01, 0.01, 0.003],
  [0.31, 0.11, 0.13, 0.1, 0.055, 0.09, 0.09, 0.035, 0.025, 0.022, 0.025, 0.008],
  [0.24, 0.14, 0.14, 0.1, 0.07, 0.08, 0.1, 0.04, 0.03, 0.025, 0.03, 0.005],
].map(normalise);

const HOLD_MS = 4600; // each target stays this long
const MORPH_MS = 2400; // then eases into the next
const INTRO_MS = 1800; // dots gather into the rings on load
const STILL_AT = INTRO_MS + 900; // the moment drawn when motion is reduced
const GAP = 0.02; // radians between sector arcs
const INNER = 0.6; // inner ring radius, as a share of the outer one
const DIAL = 1.14; // the tick scale's radius, as a share of the outer ring
const TILT = 1.1; // how far the rings lean back, in radians (0 = facing the viewer)
const WAVE_MS = 6500; // one lap of the light wave
const POINTER_RADIUS = 110;

type Dot = {
  ring: 0 | 1;
  sector: number;
  u: number; // position along its sector's arc, 0..1
  rho: number; // offset across the ring's band, -1..1
  size: number;
  alpha: number;
  phase: number;
  twinkle: number;
  startAngle: number; // where the dot starts before gathering into its ring
  startRadius: number;
  delay: number;
  ox: number; // pointer displacement, eased
  oy: number;
};

type Flow = { sector: number; angle: number; born: number; life: number; drift: number };
type Rect = { left: number; top: number; right: number; bottom: number };
type View = { cx: number; cy: number; radius: number; tilt: number };

function normalise(mix: number[]): number[] {
  const sum = mix.reduce((a, b) => a + b, 0);
  return mix.map((v) => v / sum);
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

/** The target mix at a moment, and whether it is moving. */
function targetAt(time: number): { mix: number[]; moving: boolean } {
  const cycle = HOLD_MS + MORPH_MS;
  const k = Math.floor(time / cycle);
  const into = time - k * cycle;
  const from = TARGETS[k % TARGETS.length];
  const to = TARGETS[(k + 1) % TARGETS.length];
  const p = into < HOLD_MS ? 0 : easeInOut((into - HOLD_MS) / MORPH_MS);
  return { mix: from.map((v, i) => v + (to[i] - v) * p), moving: into >= HOLD_MS };
}

/** Where each sector's arc starts and how wide it is, clockwise from the back of the ring. */
function arcs(mix: number[]): { start: number; span: number }[] {
  const free = Math.PI * 2 - GAP * mix.length;
  let at = -Math.PI / 2;
  return mix.map((share) => {
    const arc = { start: at + GAP / 2, span: share * free };
    at += arc.span + GAP;
    return arc;
  });
}

/** A point on the tilted ring plane, in screen space, with its depth (-1 at the back, 1 at the front). */
function project(view: View, r: number, angle: number) {
  const x = Math.cos(angle) * r;
  const y = Math.sin(angle) * r;
  const scale = 1 / (1 - (y * Math.sin(view.tilt)) / (view.radius * 8));
  return { x: view.cx + x * scale, y: view.cy + y * Math.cos(view.tilt) * scale, depth: Math.sin(angle), scale };
}

/**
 * Ring centre, outer radius, tilt and readout size for the hero: above and right of the headline.
 * The readout always clears the headline's top; on short screens the rings lean back further,
 * and shrink if they must, so they fit the room above it.
 */
function geometry(width: number, height: number, textTop: number) {
  const wide = width >= 1024;
  const mid = width >= 640;
  let radius = wide ? Math.min(width * 0.245, 380) : mid ? Math.min(width * 0.36, 300) : Math.min(width * 0.42, 170);
  const cx = width * (wide ? 0.71 : mid ? 0.62 : 0.56);
  const readout = Math.max(15, radius * 0.1);
  const ideal = wide ? height * 0.29 : mid ? height * 0.22 : radius * DIAL * Math.cos(TILT) * 0.89 + 22;
  const cy = Math.min(ideal, textTop - readout * 1.15 - 12);
  // The back of the dial sits about radius * DIAL * cos(tilt) * 0.89 above the centre.
  const room = (cy - 10) / (radius * DIAL * 0.89);
  let tilt = Math.max(TILT, Math.acos(clamp01(room)));
  if (tilt > 1.3) {
    tilt = 1.3;
    radius = Math.max(60, (cy - 10) / (DIAL * 0.89 * Math.cos(tilt)));
  }
  return { cx, cy, radius, tilt, readout };
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A soft glowing dot per sector colour, drawn scaled for every holding. */
function makeSprites(): HTMLCanvasElement[] {
  return SECTORS.map((s) => {
    // Lift each colour a little so the dots glow on the near-black hero.
    const [r, g, b] = rgb(sectorColor(s)).map((c) => Math.min(255, c + 30));
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 32;
    const sctx = sprite.getContext("2d")!;
    const glow = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
    glow.addColorStop(0.16, `rgba(${r}, ${g}, ${b}, 0.95)`);
    glow.addColorStop(0.32, `rgba(${r}, ${g}, ${b}, 0.28)`);
    glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    sctx.fillStyle = glow;
    sctx.fillRect(0, 0, 32, 32);
    return sprite;
  });
}

function makeDots(radius: number): Dot[] {
  const dots: Dot[] = [];
  const average = NOW.map((_, i) => TARGETS.reduce((sum, t) => sum + t[i], 0) / TARGETS.length);
  const rings: [0 | 1, number[], number][] = [
    [0, NOW, Math.round(radius * 1.5)],
    [1, average, Math.round(radius * 2.2)],
  ];
  for (const [ring, shares, total] of rings) {
    shares.forEach((share, sector) => {
      const n = Math.max(4, Math.round(share * total));
      for (let i = 0; i < n; i++) {
        dots.push({
          ring,
          sector,
          u: (i + 0.15 + Math.random() * 0.7) / n,
          rho: (Math.random() + Math.random() + Math.random() - 1.5) / 1.5,
          size: 0.6 + Math.pow(Math.random(), 2.2) * 1.8,
          alpha: 0.35 + Math.random() * 0.45,
          phase: Math.random() * Math.PI * 2,
          twinkle: 0.6 + Math.random() * 1.6,
          startAngle: Math.random() * Math.PI * 2,
          startRadius: radius * (1.3 + Math.random() * 0.8),
          delay: Math.random() * 700,
          ox: 0,
          oy: 0,
        });
      }
    });
  }
  return dots;
}

/** Dims whatever sits behind the hero's text, so the headline always reads cleanly. */
function textFade(x: number, y: number, rects: Rect[]): number {
  let nearest = Infinity;
  for (const r of rects) {
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    nearest = Math.min(nearest, Math.hypot(dx, dy));
  }
  return 0.18 + 0.82 * clamp01(nearest / 60);
}

export default function HeroRings() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !hero || !ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sprites = makeSprites();
    let width = 0;
    let height = 0;
    let geo = geometry(1, 1, Infinity);
    let dots: Dot[] = [];
    let flows: Flow[] = [];
    let textRects: Rect[] = [];
    let sans = "sans-serif";
    let mono = "monospace";
    let frame = 0;
    let clock = 0; // ms of animation shown so far; it stops while the hero is hidden
    let last = 0;
    let lastDrawn = 0;
    let onScreen = true;
    let flowDebt = 0;
    const pointer = { x: 0, y: 0, active: false };
    const lean = { x: 0, y: 0 }; // eased pointer offset from the ring centre, as a fraction of the hero

    function measure() {
      const box = hero!.getBoundingClientRect();
      textRects = [];
      hero!.querySelectorAll<HTMLElement>("[data-hero-text]").forEach((el) => {
        // Text lines, not the element's box: a balanced headline leaves room to its right.
        const range = document.createRange();
        range.selectNodeContents(el);
        const lines = el.children.length ? [el.getBoundingClientRect()] : Array.from(range.getClientRects());
        for (const r of lines) {
          textRects.push({ left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top });
        }
      });
      const heading = hero!.querySelector("h1");
      if (heading) sans = getComputedStyle(heading).fontFamily;
      mono = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() || "monospace";
      geo = geometry(width, height, Math.min(...textRects.map((r) => r.top)));
    }

    function resize() {
      const box = hero!.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const widthChanged = Math.round(box.width) !== Math.round(width);
      width = box.width;
      height = box.height;
      canvas!.width = Math.round(width * scale);
      canvas!.height = Math.round(height * scale);
      ctx!.setTransform(scale, 0, 0, scale, 0, 0);
      measure();
      if (widthChanged || !dots.length) dots = makeDots(geo.radius);
      if (reducedMotion.matches) draw(STILL_AT);
      else start();
    }

    function draw(time: number) {
      const still = reducedMotion.matches;
      const view: View = {
        cx: geo.cx + lean.x * 16,
        cy: geo.cy + lean.y * 10,
        radius: geo.radius,
        tilt: geo.tilt - lean.y * 0.12,
      };
      const { radius } = view;
      const inner = radius * INNER;
      const intro = still ? 1 : clamp01(time / 900);
      const { mix: target, moving } = targetAt(Math.max(0, time - INTRO_MS));
      const innerArcs = arcs(NOW);
      const outerArcs = arcs(target);
      const turn = lean.x * 0.25;
      const spin0 = (time / 200000) * Math.PI * 2 + turn;
      const spin1 = (time / 160000) * Math.PI * 2 + turn;
      const wave = still ? Math.PI * 0.35 : (time / WAVE_MS) * Math.PI * 2;
      const fade = (x: number, y: number) => textFade(x, y, textRects);

      ctx!.clearRect(0, 0, width, height);
      ctx!.globalCompositeOperation = "source-over";
      ctx!.globalAlpha = 1;

      // A soft haze on the ring plane.
      ctx!.save();
      ctx!.translate(view.cx, view.cy);
      ctx!.scale(1, Math.cos(view.tilt));
      const haze = ctx!.createRadialGradient(0, 0, inner * 0.4, 0, 0, radius * 1.25);
      haze.addColorStop(0, `rgba(122, 115, 240, ${0.03 * intro})`);
      haze.addColorStop(0.55, `rgba(122, 115, 240, ${0.075 * intro})`);
      haze.addColorStop(1, "rgba(122, 115, 240, 0)");
      ctx!.fillStyle = haze;
      ctx!.beginPath();
      ctx!.arc(0, 0, radius * 1.25, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();

      // Guide rings and the dial's ticks, fainter at the back.
      ctx!.lineWidth = 1;
      for (const r of [inner, radius, radius * DIAL]) {
        ctx!.strokeStyle = `rgba(166, 161, 255, ${0.07 * intro})`;
        ctx!.beginPath();
        for (let i = 0; i <= 96; i++) {
          const p = project(view, r, (i / 96) * Math.PI * 2);
          if (i) ctx!.lineTo(p.x, p.y);
          else ctx!.moveTo(p.x, p.y);
        }
        ctx!.stroke();
      }
      for (const front of [false, true]) {
        ctx!.strokeStyle = `rgba(166, 161, 255, ${(front ? 0.2 : 0.09) * intro})`;
        ctx!.beginPath();
        for (let i = 0; i < 120; i++) {
          const a = (i / 120) * Math.PI * 2 + spin1 * 0.5;
          if (Math.sin(a) >= 0 !== front) continue;
          const a1 = project(view, radius * DIAL, a);
          const a2 = project(view, radius * DIAL + (i % 10 === 0 ? 9 : 4), a);
          ctx!.moveTo(a1.x, a1.y);
          ctx!.lineTo(a2.x, a2.y);
        }
        ctx!.stroke();
      }

      // The holdings: glowing dots in their sectors' colours.
      ctx!.globalCompositeOperation = "lighter";
      for (const d of dots) {
        const arc = d.ring ? outerArcs[d.sector] : innerArcs[d.sector];
        const angle = (d.ring ? spin1 : spin0) + arc.start + d.u * arc.span;
        const r = (d.ring ? radius : inner) + d.rho * radius * (d.ring ? 0.06 : 0.055);
        const p = project(view, r, angle);
        let x = p.x;
        let y = p.y;

        const gathered = still ? 1 : easeOut(clamp01((time - d.delay) / INTRO_MS));
        if (gathered < 1) {
          const sx = view.cx + Math.cos(d.startAngle) * d.startRadius;
          const sy = view.cy + Math.sin(d.startAngle) * d.startRadius * 0.6;
          x = sx + (x - sx) * gathered;
          y = sy + (y - sy) * gathered;
        }

        let near = 0;
        if (pointer.active) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < POINTER_RADIUS) {
            near = Math.pow(1 - dist / POINTER_RADIUS, 2);
            d.ox += ((dx / dist) * near * 24 - d.ox) * 0.14;
            d.oy += ((dy / dist) * near * 24 - d.oy) * 0.14;
          }
        }
        if (!near) {
          d.ox *= 0.9;
          d.oy *= 0.9;
        }
        x += d.ox;
        y += d.oy;

        const behind = (((wave - angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const lit = Math.exp(-behind / 0.45);
        const shimmer = still ? 1 : 0.75 + 0.25 * Math.sin(time * 0.001 * d.twinkle + d.phase);
        const depth = 0.42 + 0.58 * ((p.depth + 1) / 2);
        const alpha = Math.min(1, (d.alpha * shimmer * depth + lit * 0.5 + near * 0.45) * gathered * fade(x, y));
        if (alpha < 0.02) continue;
        const size = d.size * p.scale * (1 + lit * 0.6) * 7;
        ctx!.globalAlpha = alpha;
        ctx!.drawImage(sprites[d.sector], x - size / 2, y - size / 2, size, size);
      }

      // Moves: while the target changes, dots drift from the inner ring out to the outer one.
      if (!still && time > INTRO_MS) {
        flowDebt += (moving ? 22 : 3) * (Math.min(Math.max(time - lastDrawn, 0), 50) / 1000);
        while (flowDebt >= 1) {
          flowDebt -= 1;
          let pick = Math.random();
          let sector = 0;
          while (sector < NOW.length - 1 && pick > NOW[sector]) pick -= NOW[sector++];
          const arc = innerArcs[sector];
          flows.push({
            sector,
            angle: arc.start + Math.random() * arc.span,
            born: time,
            life: 1400 + Math.random() * 800,
            drift: (Math.random() - 0.3) * 0.5,
          });
        }
      }
      flows = flows.filter((f) => time - f.born < f.life);
      for (const f of flows) {
        const t = (time - f.born) / f.life;
        const p = project(view, inner + (radius - inner) * easeInOut(t), spin0 + f.angle + f.drift * t);
        const size = 2.2 * p.scale * 7;
        ctx!.globalAlpha = Math.sin(Math.PI * t) * 0.9 * fade(p.x, p.y);
        ctx!.drawImage(sprites[f.sector], p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx!.globalAlpha = 1;
      ctx!.globalCompositeOperation = "source-over";

      // The readout: how closely the target matches now, as the app shows it.
      const distance = NOW.reduce((sum, v, i) => sum + Math.abs(v - target[i]), 0) / 2;
      const size = geo.readout;
      const cx = view.cx;
      const cy = view.cy;
      const shown = intro * fade(cx, cy + size * 0.88);
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      ctx!.fillStyle = `rgba(157, 157, 170, ${0.85 * shown})`;
      ctx!.font = `500 ${Math.max(9, size * 0.3)}px ${mono}`;
      ctx!.fillText("MATCH", cx, cy - size * 0.82);
      ctx!.fillStyle = `rgba(236, 236, 241, ${0.94 * shown})`;
      ctx!.font = `300 ${size}px ${sans}`;
      ctx!.fillText(`${((1 - distance) * 100).toFixed(1)}%`, cx, cy + size * 0.04);
      ctx!.fillStyle = `rgba(131, 131, 142, ${0.8 * shown})`;
      ctx!.font = `400 ${Math.max(8.5, size * 0.26)}px ${mono}`;
      ctx!.fillText("INNER NOW · OUTER TARGET", cx, cy + size * 0.88);
      lastDrawn = time;
    }

    function tick(now: number) {
      const step = last ? Math.min(now - last, 50) : 16;
      last = now;
      clock += step;
      const goal = pointer.active
        ? { x: (pointer.x / width) * 2 - 1, y: Math.max(-1, Math.min(1, (pointer.y - geo.cy) / height)) }
        : { x: 0, y: 0 };
      lean.x += (goal.x - lean.x) * 0.05;
      lean.y += (goal.y - lean.y) * 0.05;
      draw(clock);
      frame = requestAnimationFrame(tick);
    }

    function start() {
      if (frame || reducedMotion.matches || !onScreen || document.hidden) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    }

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      const box = hero!.getBoundingClientRect();
      pointer.x = event.clientX - box.left;
      pointer.y = event.clientY - box.top;
      pointer.active = true;
    }

    function onPointerLeave() {
      pointer.active = false;
    }

    function onMotionChange() {
      stop();
      if (reducedMotion.matches) draw(STILL_AT);
      else start();
    }

    function onVisibilityChange() {
      if (document.hidden) stop();
      else start();
    }

    const sizes = new ResizeObserver(resize);
    sizes.observe(hero);
    const visible = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    visible.observe(hero);
    document.fonts?.ready.then(() => {
      measure();
      if (reducedMotion.matches) draw(STILL_AT);
    });
    hero.addEventListener("pointermove", onPointerMove, { passive: true });
    hero.addEventListener("pointerleave", onPointerLeave);
    reducedMotion.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      sizes.disconnect();
      visible.disconnect();
      hero.removeEventListener("pointermove", onPointerMove);
      hero.removeEventListener("pointerleave", onPointerLeave);
      reducedMotion.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
