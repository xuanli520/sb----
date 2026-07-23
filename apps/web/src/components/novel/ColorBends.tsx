'use client';

import * as THREE from 'three';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import styles from './ColorBends.module.css';

const MAX_COLORS = 8;

const fragmentShader = `
#define MAX_COLORS ${MAX_COLORS}
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRot;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform int uTransparent;
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer;
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
uniform int uIterations;
uniform float uIntensity;
uniform float uBandWidth;
varying vec2 vUv;

void main() {
  float t = uTime * uSpeed;
  vec2 p = vUv * 2.0 - 1.0;
  p += uPointer * uParallax * 0.1;
  vec2 rp = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x);
  vec2 q = vec2(rp.x * (uCanvas.x / uCanvas.y), rp.y);
  q /= max(uScale, 0.0001);
  q /= 0.5 + 0.2 * dot(q, q);
  q += 0.2 * cos(t) - 7.56;
  vec2 toward = (uPointer - rp);
  q += toward * uMouseInfluence * 0.2;

  for (int j = 0; j < 5; j++) {
    if (j >= uIterations - 1) break;
    vec2 rr = sin(1.5 * (q.yx * uFrequency) + 2.0 * cos(q * uFrequency));
    q += (rr - q) * 0.15;
  }

  vec3 col = vec3(0.0);
  float a = 1.0;

  if (uColorCount > 0) {
    vec2 s = q;
    vec3 sumCol = vec3(0.0);
    float cover = 0.0;
    for (int i = 0; i < MAX_COLORS; ++i) {
      if (i >= uColorCount) break;
      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;
      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float m = mix(m0, m1, kMix);
      float w = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));
      sumCol += uColors[i] * w;
      cover = max(cover, w);
    }
    col = clamp(sumCol, 0.0, 1.0);
    a = uTransparent > 0 ? cover : 1.0;
  } else {
    vec2 s = q;
    for (int k = 0; k < 3; ++k) {
      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(k)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;
      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(k)) / 4.0);
      float m = mix(m0, m1, kMix);
      col[k] = 1.0 - exp(-uBandWidth / exp(uBandWidth * m));
    }
    a = uTransparent > 0 ? max(max(col.r, col.g), col.b) : 1.0;
  }

  col *= uIntensity;
  if (uNoise > 0.0001) {
    float n = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
    col += (n - 0.5) * uNoise;
    col = clamp(col, 0.0, 1.0);
  }

  vec3 rgb = uTransparent > 0 ? col * a : col;
  gl_FragColor = vec4(rgb, a);
}
`;

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export type ColorBendsProps = {
  autoRotate?: number;
  bandWidth?: number;
  className?: string;
  colors?: string[];
  frequency?: number;
  intensity?: number;
  iterations?: number;
  mouseInfluence?: number;
  noise?: number;
  parallax?: number;
  rotation?: number;
  scale?: number;
  speed?: number;
  style?: CSSProperties;
  transparent?: boolean;
  warpStrength?: number;
};

function colorVector(value: string) {
  const normalized = value.trim();
  const color = new THREE.Color();
  color.set(normalized);
  return new THREE.Vector3(color.r, color.g, color.b);
}

export function ColorBends({
  autoRotate = 0,
  bandWidth = 6,
  className = '',
  colors = [],
  frequency = 1,
  intensity = 1.5,
  iterations = 1,
  mouseInfluence = 1,
  noise = 0.15,
  parallax = 0.5,
  rotation = 90,
  scale = 1,
  speed = 0.2,
  style,
  transparent = true,
  warpStrength = 1,
}: ColorBendsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const materialRef = useRef<THREE.ShaderMaterial>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const pointerTargetRef = useRef(new THREE.Vector2());
  const pointerCurrentRef = useRef(new THREE.Vector2());
  const configRef = useRef({ autoRotate, rotation });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    configRef.current = { autoRotate, rotation };
  }, [autoRotate, rotation]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || unavailable) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: 'low-power',
      });
    } catch {
      setUnavailable(true);
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    const palette = Array.from({ length: MAX_COLORS }, () => new THREE.Vector3());
    const initialPalette = colors.filter(Boolean).slice(0, MAX_COLORS).map(colorVector);
    for (let index = 0; index < MAX_COLORS; index += 1) {
      palette[index].copy(initialPalette[index] ?? new THREE.Vector3());
    }
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uCanvas: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uSpeed: { value: speed },
        uRot: { value: new THREE.Vector2(1, 0) },
        uColorCount: { value: initialPalette.length },
        uColors: { value: palette },
        uTransparent: { value: transparent ? 1 : 0 },
        uScale: { value: scale },
        uFrequency: { value: frequency },
        uWarpStrength: { value: warpStrength },
        uPointer: { value: new THREE.Vector2() },
        uMouseInfluence: { value: mouseInfluence },
        uParallax: { value: parallax },
        uNoise: { value: noise },
        uIterations: { value: iterations },
        uIntensity: { value: intensity },
        uBandWidth: { value: bandWidth },
      },
      premultipliedAlpha: true,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    renderer.setPixelRatio(reducedMotion ? 1 : Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setClearColor(0x000000, transparent ? 0 : 1);
    renderer.domElement.className = styles.canvas;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    materialRef.current = material;

    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      renderer.setSize(width, height, false);
      material.uniforms.uCanvas.value.set(width, height);
    };
    resize();

    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    resizeObserver?.observe(container);
    let frame = 0;
    let disposed = false;
    let activeElapsed = 0;
    let lastTimestamp = 0;
    let windowFocused = true;

    const draw = () => {
      const config = configRef.current;
      material.uniforms.uTime.value = activeElapsed / 1000;
      const degrees = (config.rotation % 360) + config.autoRotate * activeElapsed / 1000;
      const radians = degrees * Math.PI / 180;
      material.uniforms.uRot.value.set(Math.cos(radians), Math.sin(radians));
      pointerCurrentRef.current.lerp(pointerTargetRef.current, 0.1);
      material.uniforms.uPointer.value.copy(pointerCurrentRef.current);
      renderer.render(scene, camera);
    };

    const canAnimate = () => !reducedMotion && !document.hidden && windowFocused;
    const animate = (time: number) => {
      if (disposed || !canAnimate()) return;
      if (!lastTimestamp) lastTimestamp = time;
      activeElapsed += Math.min(100, Math.max(0, time - lastTimestamp));
      lastTimestamp = time;
      draw();
      frame = window.requestAnimationFrame(animate);
    };
    const synchronize = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      lastTimestamp = 0;
      if (!canAnimate()) return;
      draw();
      frame = window.requestAnimationFrame(animate);
    };

    draw();
    synchronize();
    const resume = () => { windowFocused = true; synchronize(); };
    const pause = () => { windowFocused = false; synchronize(); };
    document.addEventListener('visibilitychange', synchronize);
    window.addEventListener('focus', resume);
    window.addEventListener('blur', pause);

    return () => {
      window.cancelAnimationFrame(frame);
      disposed = true;
      document.removeEventListener('visibilitychange', synchronize);
      window.removeEventListener('focus', resume);
      window.removeEventListener('blur', pause);
      resizeObserver?.disconnect();
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      if (materialRef.current === material) materialRef.current = undefined;
      if (rendererRef.current === renderer) rendererRef.current = undefined;
    };
  }, [
    reducedMotion,
    unavailable,
  ]);

  useEffect(() => {
    const material = materialRef.current;
    const renderer = rendererRef.current;
    if (!material) return;

    material.uniforms.uSpeed.value = speed;
    material.uniforms.uScale.value = scale;
    material.uniforms.uFrequency.value = frequency;
    material.uniforms.uWarpStrength.value = warpStrength;
    material.uniforms.uMouseInfluence.value = mouseInfluence;
    material.uniforms.uParallax.value = parallax;
    material.uniforms.uNoise.value = noise;
    material.uniforms.uIterations.value = Math.max(1, Math.min(5, Math.floor(iterations)));
    material.uniforms.uIntensity.value = intensity;
    material.uniforms.uBandWidth.value = bandWidth;
    material.uniforms.uTransparent.value = transparent ? 1 : 0;
    renderer?.setClearColor(0x000000, transparent ? 0 : 1);

    const nextPalette = colors.filter(Boolean).slice(0, MAX_COLORS).map(colorVector);
    for (let index = 0; index < MAX_COLORS; index += 1) {
      material.uniforms.uColors.value[index].copy(nextPalette[index] ?? new THREE.Vector3());
    }
    material.uniforms.uColorCount.value = nextPalette.length;
  }, [
    bandWidth,
    colors,
    frequency,
    intensity,
    iterations,
    mouseInfluence,
    noise,
    parallax,
    reducedMotion,
    scale,
    speed,
    transparent,
    warpStrength,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mouseInfluence <= 0 && parallax <= 0) return undefined;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointerTargetRef.current.set(
        ((event.clientX - rect.left) / (rect.width || 1)) * 2 - 1,
        -(((event.clientY - rect.top) / (rect.height || 1)) * 2 - 1),
      );
    };
    const resetPointer = () => pointerTargetRef.current.set(0, 0);

    container.addEventListener('pointermove', handlePointerMove, { passive: true });
    container.addEventListener('pointerleave', resetPointer, { passive: true });
    return () => {
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', resetPointer);
    };
  }, [mouseInfluence, parallax]);

  return <div ref={containerRef} aria-hidden="true" className={`${styles.root} ${className}`.trim()} style={style} />;
}
