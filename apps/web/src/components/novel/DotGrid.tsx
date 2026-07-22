'use client';

import { gsap } from 'gsap';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import styles from './DotGrid.module.css';

type Dot = {
  cx: number;
  cy: number;
  xOffset: number;
  yOffset: number;
  animating: boolean;
};

type PointerState = {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  inside: boolean;
};

type GridSize = {
  width: number;
  height: number;
  dpr: number;
};

export type DotGridProps = {
  dotSize?: number;
  gap?: number;
  baseColor?: string;
  activeColor?: string;
  proximity?: number;
  speedTrigger?: number;
  shockRadius?: number;
  shockStrength?: number;
  maxSpeed?: number;
  resistance?: number;
  returnDuration?: number;
  className?: string;
  style?: CSSProperties;
  interactionTargetRef?: RefObject<HTMLElement | null>;
};

let inertiaPluginRegistered = false;

function ensureInertiaPlugin() {
  if (inertiaPluginRegistered) return;
  gsap.registerPlugin(InertiaPlugin);
  inertiaPluginRegistered = true;
}

function hexToRgb(hex: string) {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16),
  };
}

function throttle(callback: (event: PointerEvent) => void, limit: number) {
  let lastCall = 0;

  return (event: PointerEvent) => {
    const now = performance.now();
    if (now - lastCall < limit) return;
    lastCall = now;
    callback(event);
  };
}

function getCanvasContext(canvas: HTMLCanvasElement) {
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

export function DotGrid({
  dotSize = 16,
  gap = 32,
  baseColor = '#5227FF',
  activeColor = '#5227FF',
  proximity = 150,
  speedTrigger = 100,
  shockRadius = 250,
  shockStrength = 5,
  maxSpeed = 5000,
  resistance = 750,
  returnDuration = 1.5,
  className = '',
  style,
  interactionTargetRef,
}: DotGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const pointerRef = useRef<PointerState>({
    x: 0,
    y: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    inside: false,
  });
  const sizeRef = useRef<GridSize>({ width: 0, height: 0, dpr: 1 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [inViewport, setInViewport] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [gridRevision, setGridRevision] = useState(0);

  const safeDotSize = Math.max(1, dotSize);
  const safeGap = Math.max(0, gap);
  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor]);
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor]);

  const buildGrid = useCallback(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const { width, height } = wrapper.getBoundingClientRect();
    if (width < 1 || height < 1) {
      dotsRef.current = [];
      sizeRef.current = { width: 0, height: 0, dpr: 1 };
      setGridRevision((revision) => revision + 1);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    sizeRef.current = { width, height, dpr };

    const cell = safeDotSize + safeGap;
    const columns = Math.max(1, Math.floor((width + safeGap) / cell));
    const rows = Math.max(1, Math.floor((height + safeGap) / cell));
    const gridWidth = cell * columns - safeGap;
    const gridHeight = cell * rows - safeGap;
    const startX = (width - gridWidth) / 2 + safeDotSize / 2;
    const startY = (height - gridHeight) / 2 + safeDotSize / 2;
    const dots: Dot[] = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        dots.push({
          cx: startX + column * cell,
          cy: startY + row * cell,
          xOffset: 0,
          yOffset: 0,
          animating: false,
        });
      }
    }

    dotsRef.current = dots;
    setGridRevision((revision) => revision + 1);
  }, [safeDotSize, safeGap]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height, dpr } = sizeRef.current;
    if (!width || !height) return;
    const context = getCanvasContext(canvas);
    if (!context) return;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const pointer = pointerRef.current;
    const proximitySquared = proximity * proximity;

    for (const dot of dotsRef.current) {
      const x = dot.cx + dot.xOffset;
      const y = dot.cy + dot.yOffset;
      const distanceSquared = (dot.cx - pointer.x) ** 2 + (dot.cy - pointer.y) ** 2;
      let color = baseColor;

      if (pointer.inside && distanceSquared <= proximitySquared) {
        const distance = Math.sqrt(distanceSquared);
        const progress = 1 - distance / proximity;
        const red = Math.round(baseRgb.r + (activeRgb.r - baseRgb.r) * progress);
        const green = Math.round(baseRgb.g + (activeRgb.g - baseRgb.g) * progress);
        const blue = Math.round(baseRgb.b + (activeRgb.b - baseRgb.b) * progress);
        color = `rgb(${red}, ${green}, ${blue})`;
      }

      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, safeDotSize / 2, 0, Math.PI * 2);
      context.fill();
    }
  }, [activeRgb, baseColor, baseRgb, proximity, safeDotSize]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    buildGrid();
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', buildGrid);
      return () => window.removeEventListener('resize', buildGrid);
    }

    const observer = new ResizeObserver(buildGrid);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [buildGrid]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting), { threshold: 0.01 });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updateVisibility = () => setDocumentVisible(!document.hidden);
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    drawFrame();
    if (reducedMotion || !inViewport || !documentVisible) return undefined;

    const requestFrame = window.requestAnimationFrame?.bind(window);
    const cancelFrame = window.cancelAnimationFrame?.bind(window);
    if (!requestFrame || !cancelFrame) return undefined;

    let animationFrame = 0;
    const animate = () => {
      drawFrame();
      animationFrame = requestFrame(animate);
    };
    animationFrame = requestFrame(animate);

    return () => cancelFrame(animationFrame);
  }, [documentVisible, drawFrame, gridRevision, inViewport, reducedMotion]);

  useEffect(() => {
    if (reducedMotion || !inViewport || !documentVisible) return undefined;
    const interactionTarget = interactionTargetRef?.current ?? wrapperRef.current;
    const grid = wrapperRef.current;
    if (!interactionTarget || !grid) return undefined;

    ensureInertiaPlugin();

    const updatePointer = (event: PointerEvent) => {
      const rect = grid.getBoundingClientRect();
      const inside = event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom;
      if (!inside) {
        pointerRef.current.inside = false;
        return false;
      }

      const pointer = pointerRef.current;
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.inside = true;
      return true;
    };

    const returnDot = (dot: Dot) => {
      gsap.to(dot, {
        xOffset: 0,
        yOffset: 0,
        duration: returnDuration,
        ease: 'elastic.out(1, 0.75)',
        overwrite: true,
        onComplete: () => {
          dot.animating = false;
        },
      });
    };

    const nudgeDot = (dot: Dot, xOffset: number, yOffset: number) => {
      dot.animating = true;
      gsap.killTweensOf(dot);
      gsap.to(dot, {
        inertia: { xOffset, yOffset, resistance },
        onComplete: () => returnDot(dot),
      });
    };

    const onPointerMove = throttle((event) => {
      if (event.pointerType === 'touch' || !updatePointer(event)) return;

      const pointer = pointerRef.current;
      const now = performance.now();
      if (!pointer.lastTime) {
        pointer.lastTime = now;
        pointer.lastX = event.clientX;
        pointer.lastY = event.clientY;
        return;
      }

      const elapsed = Math.max(16, now - pointer.lastTime);
      let velocityX = ((event.clientX - pointer.lastX) / elapsed) * 1000;
      let velocityY = ((event.clientY - pointer.lastY) / elapsed) * 1000;
      let speed = Math.hypot(velocityX, velocityY);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        velocityX *= scale;
        velocityY *= scale;
        speed = maxSpeed;
      }

      pointer.lastTime = now;
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
      if (speed <= speedTrigger) return;

      for (const dot of dotsRef.current) {
        const distance = Math.hypot(dot.cx - pointer.x, dot.cy - pointer.y);
        if (distance < proximity && !dot.animating) {
          nudgeDot(dot, dot.cx - pointer.x + velocityX * 0.004, dot.cy - pointer.y + velocityY * 0.004);
        }
      }
    }, 48);

    const onPointerLeave = () => {
      pointerRef.current.inside = false;
      pointerRef.current.lastTime = 0;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || shockRadius <= 0 || shockStrength <= 0 || !updatePointer(event)) return;
      const pointer = pointerRef.current;
      for (const dot of dotsRef.current) {
        const distance = Math.hypot(dot.cx - pointer.x, dot.cy - pointer.y);
        if (distance < shockRadius && !dot.animating) {
          const falloff = 1 - distance / shockRadius;
          nudgeDot(
            dot,
            (dot.cx - pointer.x) * shockStrength * falloff,
            (dot.cy - pointer.y) * shockStrength * falloff,
          );
        }
      }
    };

    interactionTarget.addEventListener('pointermove', onPointerMove, { passive: true });
    interactionTarget.addEventListener('pointerleave', onPointerLeave, { passive: true });
    interactionTarget.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => {
      interactionTarget.removeEventListener('pointermove', onPointerMove);
      interactionTarget.removeEventListener('pointerleave', onPointerLeave);
      interactionTarget.removeEventListener('pointerdown', onPointerDown);
      for (const dot of dotsRef.current) gsap.killTweensOf(dot);
    };
  }, [
    documentVisible,
    inViewport,
    interactionTargetRef,
    maxSpeed,
    proximity,
    reducedMotion,
    resistance,
    returnDuration,
    shockRadius,
    shockStrength,
    speedTrigger,
  ]);

  return (
    <section aria-hidden="true" className={`${styles.root} ${className}`.trim()} style={style}>
      <div ref={wrapperRef} className={styles.wrap}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
    </section>
  );
}
