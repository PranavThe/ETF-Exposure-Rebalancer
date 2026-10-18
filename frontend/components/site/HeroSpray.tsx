"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
  born: number;
  lifetime: number;
};

/** A sparse, outward-moving spray behind the hero content. */
export default function HeroSpray() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !hero || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let particles: Particle[] = [];
    let frame = 0;
    let width = 0;
    let height = 0;
    let lastEmission = -Infinity;
    let lastPointer: { x: number; y: number } | null = null;

    function clear() {
      cancelAnimationFrame(frame);
      frame = 0;
      particles = [];
      lastPointer = null;
      context!.clearRect(0, 0, width, height);
    }

    function resize() {
      const bounds = hero!.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width;
      height = bounds.height;
      canvas!.width = Math.round(width * scale);
      canvas!.height = Math.round(height * scale);
      context!.setTransform(scale, 0, 0, scale, 0, 0);
      clear();
    }

    function draw(now: number) {
      context!.clearRect(0, 0, width, height);
      particles = particles.filter((particle) => now - particle.born < particle.lifetime);

      for (const particle of particles) {
        const age = now - particle.born;
        const progress = age / particle.lifetime;
        const travel = 1 - Math.pow(1 - progress, 3);
        const opacity = Math.min(age / 70, 1) * Math.pow(1 - progress, 1.5);

        context!.beginPath();
        context!.arc(
          particle.x + particle.dx * travel,
          particle.y + particle.dy * travel,
          particle.radius * (1 - progress * 0.3),
          0,
          Math.PI * 2,
        );
        context!.fillStyle = `rgba(167, 139, 250, ${opacity * 0.8})`;
        context!.fill();
      }

      // Sleep once the last dot fades; pointer movement wakes the animation.
      frame = particles.length ? requestAnimationFrame(draw) : 0;
    }

    function onPointerMove(event: PointerEvent) {
      if (reducedMotion.matches || event.pointerType === "touch") return;

      const now = performance.now();
      if (now - lastEmission < 45) return;

      const bounds = hero!.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      if (lastPointer && Math.hypot(x - lastPointer.x, y - lastPointer.y) < 3) return;

      lastEmission = now;
      lastPointer = { x, y };

      // Spread each burst around a full circle, independently of cursor direction.
      const rotation = Math.random() * Math.PI * 2;
      for (let i = 0; i < 3; i++) {
        const angle = rotation + (i * Math.PI * 2) / 3 + (Math.random() - 0.5) * 0.8;
        const offset = 6 + Math.random() * 20;
        const distance = 30 + Math.random() * 75;
        particles.push({
          x: x + Math.cos(angle) * offset,
          y: y + Math.sin(angle) * offset,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          radius: 1 + Math.random() * 1.2,
          born: now,
          lifetime: 700 + Math.random() * 650,
        });
      }

      particles = particles.slice(-90);
      if (!frame) frame = requestAnimationFrame(draw);
    }

    function onPointerLeave() {
      lastPointer = null;
    }

    function onVisibilityChange() {
      if (document.hidden) clear();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(hero);
    resize();
    hero.addEventListener("pointermove", onPointerMove, { passive: true });
    hero.addEventListener("pointerleave", onPointerLeave);
    reducedMotion.addEventListener("change", clear);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clear();
      observer.disconnect();
      hero.removeEventListener("pointermove", onPointerMove);
      hero.removeEventListener("pointerleave", onPointerLeave);
      reducedMotion.removeEventListener("change", clear);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
