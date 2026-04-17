"use client";

import {
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useState,
  Suspense,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import { seededRandom, prefersReducedMotion } from "@/lib/utils";
import { TYPE_COLORS } from "@/lib/constants";
import type { CountsResponse } from "@/lib/types";

/* ──────────────────────────────────────────────
   Snapshot type (matches /api/snapshot payload)
   ────────────────────────────────────────────── */
export interface SnapshotObject {
  id: string;
  name: string;
  objectType: keyof typeof TYPE_COLORS;
  orbitRegion: "LEO" | "MEO" | "GEO" | "HEO" | "unknown";
  apogeeKm?: number;
  perigeeKm?: number;
  inclinationDeg?: number;
  launchDate?: string;
}

interface ParticleHit {
  index: number;
  object: SnapshotObject | null;
  clientX: number;
  clientY: number;
}

/* ──────────────────────────────────────────────
   Earth Sphere
   ────────────────────────────────────────────── */
function Earth() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.0003;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshStandardMaterial
        color="#1a3a5c"
        emissive="#0a1628"
        emissiveIntensity={0.3}
        roughness={0.8}
        metalness={0.1}
      />
    </mesh>
  );
}

/* ──────────────────────────────────────────────
   Atmosphere Glow
   ────────────────────────────────────────────── */
function Atmosphere() {
  const shaderRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    []
  );

  useFrame(({ clock }) => {
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  return (
    <mesh scale={1.15}>
      <sphereGeometry args={[1, 32, 32]} />
      <shaderMaterial
        ref={shaderRef}
        transparent
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
            float pulse = 1.0 + 0.05 * sin(uTime * 0.5);
            gl_FragColor = vec4(0.3, 0.6, 1.0, intensity * 0.4 * pulse);
          }
        `}
      />
    </mesh>
  );
}

/* ──────────────────────────────────────────────
   Orbit Rings (LEO, MEO, GEO)
   ────────────────────────────────────────────── */
function OrbitRings() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.00005;
    }
  });

  const rings = [
    { radius: 1.5, color: "#4da6ff", label: "LEO" },
    { radius: 2.2, color: "#a78bfa", label: "MEO" },
    { radius: 3.0, color: "#fbbf24", label: "GEO" },
  ];

  return (
    <group ref={groupRef}>
      {rings.map((ring, i) => (
        <mesh key={ring.label} rotation={[Math.PI / 2 + i * 0.15, 0, i * 0.3]}>
          <ringGeometry args={[ring.radius - 0.005, ring.radius + 0.005, 96]} />
          <meshBasicMaterial
            color={ring.color}
            transparent
            opacity={0.12}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ──────────────────────────────────────────────
   Orbital Particles — all orbit math on GPU
   ────────────────────────────────────────────── */
interface OrbitalParticlesProps {
  counts: CountsResponse | null;
  snapshot: SnapshotObject[] | null;
  maxParticles: number;
  onHit: (hit: ParticleHit | null) => void;
  onSelect: (obj: SnapshotObject) => void;
  highlightType: keyof typeof TYPE_COLORS | null;
  highlightRegion: "LEO" | "MEO" | "GEO" | "HEO" | null;
}

function OrbitalParticles({
  counts,
  snapshot,
  maxParticles,
  onHit,
  onSelect,
  highlightType,
  highlightRegion,
}: OrbitalParticlesProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { camera, gl } = useThree();

  const reduceMotion = useMemo(() => prefersReducedMotion(), []);

  // Build per-particle attributes. When a snapshot is available we anchor
  // each particle to a real satellite so click interactions show real data.
  const { positions, startAngles, radii, yOffsets, speeds, colors, sizes, meta } =
    useMemo(() => {
      const pos = new Float32Array(maxParticles * 3);
      const ang = new Float32Array(maxParticles);
      const rad = new Float32Array(maxParticles);
      const y = new Float32Array(maxParticles);
      const spd = new Float32Array(maxParticles);
      const col = new Float32Array(maxParticles * 3);
      const siz = new Float32Array(maxParticles);
      const meta: Array<SnapshotObject | null> = new Array(maxParticles).fill(
        null
      );

      const total = counts?.totalCount || 10000;
      const activeRatio =
        (counts?.countsByType.active_satellite || 7000) / total;
      const debrisRatio = (counts?.countsByType.debris || 2000) / total;
      const rocketRatio = (counts?.countsByType.rocket_body || 500) / total;

      const regionRadius = (seed: number, region: SnapshotObject["orbitRegion"]) => {
        const r = seededRandom(seed + 6000);
        switch (region) {
          case "LEO": return 1.3 + r * 0.7;
          case "MEO": return 2.0 + r * 0.5;
          case "GEO": return 2.9 + r * 0.2;
          case "HEO": return 2.5 + r * 0.7;
          default:    return 1.6 + r * 0.3;
        }
      };

      for (let i = 0; i < maxParticles; i++) {
        const seed = i;
        const r1 = seededRandom(seed);
        const r2 = seededRandom(seed + 1000);
        const r3 = seededRandom(seed + 2000);

        let radius: number;
        let type: keyof typeof TYPE_COLORS;
        let region: SnapshotObject["orbitRegion"];
        let real: SnapshotObject | null = null;

        if (snapshot && snapshot[i % snapshot.length]) {
          real = snapshot[i % snapshot.length];
          region = real.orbitRegion;
          type = real.objectType;
          radius = regionRadius(seed, region);
        } else {
          const regionRoll = seededRandom(seed + 3000);
          if (regionRoll < 0.75) {
            radius = 1.3 + r1 * 0.7;
            region = "LEO";
          } else if (regionRoll < 0.88) {
            radius = 2.0 + r1 * 0.5;
            region = "MEO";
          } else {
            radius = 2.8 + r1 * 0.4;
            region = "GEO";
          }

          const typeRoll = seededRandom(seed + 4000);
          if (typeRoll < activeRatio) type = "active_satellite";
          else if (typeRoll < activeRatio + debrisRatio) type = "debris";
          else if (typeRoll < activeRatio + debrisRatio + rocketRatio)
            type = "rocket_body";
          else type = "inactive_satellite";
        }

        const theta = r2 * Math.PI * 2;
        const phi = Math.acos(2 * r3 - 1);
        const flatPhi = phi * 0.6 + Math.PI * 0.2;

        const yVal = radius * Math.cos(flatPhi) * 0.4;

        // Seed position at t=0 (same formula as shader, used for CPU-side
        // picking so both stay in sync).
        pos[i * 3] = radius * Math.cos(theta);
        pos[i * 3 + 1] = yVal;
        pos[i * 3 + 2] = radius * Math.sin(theta);

        ang[i] = theta;
        rad[i] = radius;
        y[i] = yVal;
        spd[i] = reduceMotion
          ? 0
          : (0.2 + seededRandom(seed + 5000) * 0.3) / radius;

        const color = new THREE.Color(TYPE_COLORS[type]);
        // Debris particles are the densest bucket on the globe and the
        // shader uses AdditiveBlending. When hundreds of them stack at
        // screen center, the red channel of #e8713a saturates to 1.0
        // while green/blue stay low — the cluster reads as bright red
        // even though the flat CSS swatch on the category card shows
        // orange. Pre-dim the per-particle color so stacked debris
        // visually matches the #e8713a orange of the category row.
        if (type === "debris") {
          color.multiplyScalar(0.38);
        }
        col[i * 3] = color.r;
        col[i * 3 + 1] = color.g;
        col[i * 3 + 2] = color.b;

        // Slightly larger size for active sats so the eye reads "life"
        siz[i] = type === "active_satellite" ? 1.3 : 1.0;

        meta[i] = real;
      }

      return {
        positions: pos,
        startAngles: ang,
        radii: rad,
        yOffsets: y,
        speeds: spd,
        colors: col,
        sizes: siz,
        meta,
      };
    }, [maxParticles, counts, snapshot, reduceMotion]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(gl.getPixelRatio(), 1.5) },
      uHighlightType: { value: -1 }, // -1 = none
      uHighlightRegion: { value: -1 },
      // Tuned so individual points stay around 2–6px at the camera's
      // default distance. With 800 additive-blended particles, anything
      // larger saturates the center to solid white (the "cloud" bug).
      uBaseSize: { value: 0.22 },
    }),
    [gl]
  );

  // Keep highlight uniforms in sync without re-allocating buffers.
  useEffect(() => {
    if (!materialRef.current) return;
    const typeIndex = highlightType
      ? (
          [
            "active_satellite",
            "inactive_satellite",
            "rocket_body",
            "debris",
            "unknown",
          ] as Array<keyof typeof TYPE_COLORS>
        ).indexOf(highlightType)
      : -1;
    const regionIndex = highlightRegion
      ? ["LEO", "MEO", "GEO", "HEO"].indexOf(highlightRegion)
      : -1;
    materialRef.current.uniforms.uHighlightType.value = typeIndex;
    materialRef.current.uniforms.uHighlightRegion.value = regionIndex;
  }, [highlightType, highlightRegion]);

  // Only uniform update per frame — no JS per-particle loop.
  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  // Pack type/region as an "id" attribute so the shader can cheaply
  // test equality against highlight uniforms.
  const typeIds = useMemo(() => {
    const arr = new Float32Array(maxParticles);
    const types: Array<keyof typeof TYPE_COLORS> = [
      "active_satellite",
      "inactive_satellite",
      "rocket_body",
      "debris",
      "unknown",
    ];
    for (let i = 0; i < maxParticles; i++) {
      // Infer from color (a bit gross but avoids another full loop).
      // Actually just use meta when available, else map-from-color.
      const real = meta[i];
      if (real) {
        arr[i] = types.indexOf(real.objectType);
      } else {
        // Match on color channels to identify type bucket.
        const r = colors[i * 3];
        const g = colors[i * 3 + 1];
        const b = colors[i * 3 + 2];
        // Debris = orange (#e8713a) → high R, low B
        if (r > 0.7 && b < 0.4) arr[i] = 3;
        // Active sat = blue (#4da6ff) → high B
        else if (b > 0.7) arr[i] = 0;
        // Rocket body = neutral gray (#9ca3af) slightly lighter than inactive
        else if (r > 0.55) arr[i] = 2;
        else arr[i] = 1;
      }
    }
    return arr;
  }, [colors, meta, maxParticles]);

  const regionIds = useMemo(() => {
    const arr = new Float32Array(maxParticles);
    const regions = ["LEO", "MEO", "GEO", "HEO"];
    for (let i = 0; i < maxParticles; i++) {
      const real = meta[i];
      if (real) {
        arr[i] = regions.indexOf(real.orbitRegion);
      } else {
        // Infer region from orbit radius band
        const r = radii[i];
        if (r < 2.0) arr[i] = 0;
        else if (r < 2.6) arr[i] = 1;
        else if (r < 3.2) arr[i] = 2;
        else arr[i] = 3;
      }
    }
    return arr;
  }, [meta, radii, maxParticles]);

  // Pointer-move picking — throttled to ~20Hz. We compute positions on
  // the CPU using the exact same formula the vertex shader uses, so
  // hover stays accurate as particles orbit.
  const lastPickRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);

  const findNearestIndex = useCallback(
    (clientX: number, clientY: number, rect: DOMRect, pickRadius: number) => {
      const now = performance.now();
      if (startTimeRef.current == null) startTimeRef.current = now;
      const t = ((now - startTimeRef.current) / 1000) % 10000;

      // Create fresh, local instances so we never mutate memoized values —
      // keeps React purity rules happy. Construction cost is negligible vs.
      // the particle scan below.
      const localRay = new THREE.Raycaster();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      localRay.setFromCamera(ndc, camera);

      const origin = localRay.ray.origin;
      const dir = localRay.ray.direction;

      let bestIdx = -1;
      let bestDist = pickRadius;

      for (let i = 0; i < maxParticles; i++) {
        const angle = startAngles[i] + speeds[i] * t;
        const r = radii[i];
        const px = r * Math.cos(angle);
        const py = yOffsets[i];
        const pz = r * Math.sin(angle);
        const vx = px - origin.x;
        const vy = py - origin.y;
        const vz = pz - origin.z;
        // Point-to-line distance via cross product (dir is unit).
        const cx = vy * dir.z - vz * dir.y;
        const cy = vz * dir.x - vx * dir.z;
        const cz = vx * dir.y - vy * dir.x;
        const dist = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      return bestIdx;
    },
    [camera, maxParticles, startAngles, speeds, radii, yOffsets]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const now = performance.now();
      if (now - lastPickRef.current < 50) return;
      lastPickRef.current = now;

      const rect = (
        event.currentTarget as HTMLElement
      ).getBoundingClientRect();
      const bestIdx = findNearestIndex(event.clientX, event.clientY, rect, 0.12);

      if (bestIdx >= 0) {
        onHit({
          index: bestIdx,
          object: meta[bestIdx],
          clientX: event.clientX,
          clientY: event.clientY,
        });
      } else {
        onHit(null);
      }
    },
    [findNearestIndex, meta, onHit]
  );

  const handlePointerLeave = useCallback(() => {
    onHit(null);
  }, [onHit]);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      const rect = (
        event.currentTarget as HTMLElement
      ).getBoundingClientRect();
      const bestIdx = findNearestIndex(event.clientX, event.clientY, rect, 0.15);
      if (bestIdx >= 0) {
        const picked = meta[bestIdx];
        if (picked) onSelect(picked);
      }
    },
    [findNearestIndex, meta, onSelect]
  );

  return (
    <group>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aStartAngle" args={[startAngles, 1]} />
          <bufferAttribute attach="attributes-aRadius" args={[radii, 1]} />
          <bufferAttribute attach="attributes-aYOffset" args={[yOffsets, 1]} />
          <bufferAttribute attach="attributes-aSpeed" args={[speeds, 1]} />
          <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
          <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
          <bufferAttribute attach="attributes-aTypeId" args={[typeIds, 1]} />
          <bufferAttribute attach="attributes-aRegionId" args={[regionIds, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={uniforms}
          vertexShader={`
            uniform float uTime;
            uniform float uPixelRatio;
            uniform float uBaseSize;
            uniform float uHighlightType;
            uniform float uHighlightRegion;

            attribute float aStartAngle;
            attribute float aRadius;
            attribute float aYOffset;
            attribute float aSpeed;
            attribute vec3  aColor;
            attribute float aSize;
            attribute float aTypeId;
            attribute float aRegionId;

            varying vec3 vColor;
            varying float vHighlight;
            varying float vActiveHighlight;

            void main() {
              float angle = aStartAngle + uTime * aSpeed;
              vec3 pos = vec3(
                aRadius * cos(angle),
                aYOffset,
                aRadius * sin(angle)
              );

              // Highlight = 1 when matching filter, 0.25 when non-matching,
              // 1 when no filter active (-1 sentinel).
              float matchType   = (uHighlightType   < 0.0) ? 1.0 : step(abs(aTypeId   - uHighlightType),   0.5);
              float matchRegion = (uHighlightRegion < 0.0) ? 1.0 : step(abs(aRegionId - uHighlightRegion), 0.5);
              vHighlight = matchType * matchRegion;
              float dim = mix(0.18, 1.0, vHighlight);

              // Only emit glow in the fragment shader when the user has
              // an active filter AND this particle matches it; otherwise
              // every particle would halo and the additive blend blooms.
              float filterActive = step(0.0, max(uHighlightType, uHighlightRegion));
              vActiveHighlight = vHighlight * filterActive;

              vColor = aColor * dim;

              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_Position = projectionMatrix * mvPosition;
              // Perspective divisor kept small (was 260 → blooming
              // "cloud" bug); 90 gives ~4–8px points across the scene.
              gl_PointSize = aSize * uBaseSize * uPixelRatio *
                             (1.0 + 0.4 * vHighlight) *
                             (90.0 / -mvPosition.z);
            }
          `}
          fragmentShader={`
            varying vec3 vColor;
            varying float vHighlight;
            varying float vActiveHighlight;
            void main() {
              vec2 uv = gl_PointCoord - 0.5;
              float d = length(uv);
              // Tight soft disk — no baseline glow (caused the cloud
              // bug when multiplied across 800 additive points).
              float core = smoothstep(0.5, 0.15, d);
              // Halo only when the user has filtered AND this particle
              // matches the filter.
              float glow = smoothstep(0.5, 0.0, d) * 0.3 * vActiveHighlight;
              float alpha = clamp(core + glow, 0.0, 1.0);
              if (alpha < 0.02) discard;
              gl_FragColor = vec4(vColor, alpha);
            }
          `}
        />
      </points>
    </group>
  );
}

/* ──────────────────────────────────────────────
   Scene Setup
   ────────────────────────────────────────────── */
interface SceneProps {
  counts: CountsResponse | null;
  snapshot: SnapshotObject[] | null;
  maxParticles: number;
  starsCount: number;
  onHit: (hit: ParticleHit | null) => void;
  onSelect: (obj: SnapshotObject) => void;
  highlightType: keyof typeof TYPE_COLORS | null;
  highlightRegion: "LEO" | "MEO" | "GEO" | "HEO" | null;
}

function Scene({
  counts,
  snapshot,
  maxParticles,
  starsCount,
  onHit,
  onSelect,
  highlightType,
  highlightRegion,
}: SceneProps) {
  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 3, 5]} intensity={0.8} color="#b0c4de" />
      <pointLight position={[-3, 2, -3]} intensity={0.3} color="#4da6ff" />

      <Stars
        radius={100}
        depth={50}
        count={starsCount}
        factor={2.5}
        saturation={0.1}
        fade
        speed={0.3}
      />

      <Earth />
      <Atmosphere />
      <OrbitRings />
      <OrbitalParticles
        counts={counts}
        snapshot={snapshot}
        maxParticles={maxParticles}
        onHit={onHit}
        onSelect={onSelect}
        highlightType={highlightType}
        highlightRegion={highlightRegion}
      />
    </>
  );
}

/* ──────────────────────────────────────────────
   Camera Controller — Slow drift, stops on hover
   ────────────────────────────────────────────── */
function CameraDrift({ paused }: { paused: boolean }) {
  const { camera } = useThree();
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useFrame(({ clock }) => {
    if (pausedRef.current) return;
    const t = clock.getElapsedTime() * 0.05;
    camera.position.x = 5 * Math.cos(t) * 0.3;
    camera.position.y = 1.5 + Math.sin(t * 0.5) * 0.3;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/* ──────────────────────────────────────────────
   Hover Tooltip (DOM, not three)
   ────────────────────────────────────────────── */
function HoverTooltip({ hit }: { hit: ParticleHit | null }) {
  if (!hit || !hit.object) return null;
  const o = hit.object;
  const typeLabel: Record<string, string> = {
    active_satellite: "Active satellite",
    inactive_satellite: "Inactive satellite",
    rocket_body: "Rocket body",
    debris: "Debris",
    unknown: "Unknown",
  };
  return (
    <div
      className="particle-tooltip"
      style={{
        position: "fixed",
        left: hit.clientX + 14,
        top: hit.clientY + 14,
        pointerEvents: "none",
      }}
    >
      <div className="particle-tooltip__name">{o.name}</div>
      <div className="particle-tooltip__meta">
        {typeLabel[o.objectType]} · {o.orbitRegion}
        {o.launchDate ? ` · ${o.launchDate.slice(0, 4)}` : ""}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Main Export
   ────────────────────────────────────────────── */
interface EarthVisualizationProps {
  counts: CountsResponse | null;
  onSelect?: (obj: SnapshotObject) => void;
  highlightType?: keyof typeof TYPE_COLORS | null;
  highlightRegion?: "LEO" | "MEO" | "GEO" | "HEO" | null;
}

export default function EarthVisualization({
  counts,
  onSelect,
  highlightType = null,
  highlightRegion = null,
}: EarthVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [inView, setInView] = useState(true);
  const [hit, setHit] = useState<ParticleHit | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotObject[] | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsMobile(window.innerWidth < 768);
  }, []);

  // IntersectionObserver — don't render the Canvas when hero is off-screen.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);

  // Fetch the lightweight snapshot after mount — doesn't block render.
  // We kick it off from requestIdleCallback to avoid competing with first paint.
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    const run = () => {
      fetch("/api/snapshot")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data?.objects) return;
          setSnapshot(data.objects as SnapshotObject[]);
        })
        .catch(() => {
          // Non-fatal — the scene still renders with simulated particles.
        });
    };
    type IdleWin = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    const w = window as IdleWin;
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(run, { timeout: 1200 });
    } else {
      const timer = setTimeout(run, 400);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const maxParticles = isMobile ? 250 : 800;
  const starsCount = isMobile ? 400 : 800;

  if (!mounted || hasError) {
    return (
      <div className="hero__canvas-container" ref={containerRef}>
        <div
          style={{
            width: "100%",
            height: "100%",
            background:
              "radial-gradient(ellipse at center, #0a1628 0%, #060a14 100%)",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="hero__canvas-container"
      ref={containerRef}
      aria-hidden="true"
    >
      {inView && (
        <Canvas
          camera={{ position: [0, 1.5, 5], fov: 45 }}
          dpr={[1, 1.5]}
          gl={{
            antialias: false, // big mobile win; additive-blended points don't need it
            alpha: false,
            powerPreference: "high-performance",
            stencil: false,
            depth: true,
          }}
          onError={handleError}
          frameloop={inView ? "always" : "never"}
          style={{ width: "100%", height: "100%" }}
        >
          <color attach="background" args={["#060a14"]} />
          <fog attach="fog" args={["#060a14", 8, 20]} />
          <Suspense fallback={null}>
            <Scene
              counts={counts}
              snapshot={snapshot}
              maxParticles={maxParticles}
              starsCount={starsCount}
              onHit={setHit}
              onSelect={(o) => onSelect?.(o)}
              highlightType={highlightType}
              highlightRegion={highlightRegion}
            />
          </Suspense>
          <CameraDrift paused={hit !== null} />
        </Canvas>
      )}

      <HoverTooltip hit={hit} />
    </div>
  );
}
