// Orbit altitude thresholds (km)
export const ORBIT_THRESHOLDS = {
  LEO_MAX: 2000,
  MEO_MAX: 35586,
  GEO_MIN: 35586,
  GEO_MAX: 35986,
} as const;

// Object type colors
export const TYPE_COLORS = {
  active_satellite: "#4da6ff",
  inactive_satellite: "#6b7280",
  rocket_body: "#9ca3af",
  debris: "#f97316",
  unknown: "#4b5563",
} as const;

// Orbit region colors
export const REGION_COLORS = {
  LEO: "#4da6ff",
  MEO: "#a78bfa",
  GEO: "#fbbf24",
  HEO: "#f472b6",
  unknown: "#4b5563",
} as const;

// Object type labels
export const TYPE_LABELS: Record<string, string> = {
  active_satellite: "Active Satellites",
  inactive_satellite: "Inactive Satellites",
  rocket_body: "Rocket Bodies",
  debris: "Debris",
  unknown: "Unknown",
} as const;

// Orbit region labels
export const REGION_LABELS: Record<string, string> = {
  LEO: "Low Earth Orbit",
  MEO: "Medium Earth Orbit",
  GEO: "Geostationary Orbit",
  HEO: "Highly Elliptical Orbit",
  unknown: "Unknown",
} as const;

// CelesTrak operational status codes that indicate active
export const ACTIVE_STATUS_CODES = ["+", "P", "B", "S", "X"];

// CelesTrak data source config
export const CELESTRAK_CONFIG = {
  SATCAT_URL: "https://celestrak.org/pub/satcat.csv",
  CACHE_TTL_MS: 2 * 60 * 60 * 1000, // 2 hours
  SOURCE_NAME: "CelesTrak / 18th SDS",
} as const;

// Visualization config
export const VIZ_CONFIG = {
  EARTH_RADIUS: 1,
  DESKTOP_PARTICLE_COUNT: 2000,
  MOBILE_PARTICLE_COUNT: 500,
  ROTATION_SPEED: 0.0003,
  ORBIT_RING_OPACITY: 0.15,
} as const;

// Animation config
export const ANIMATION = {
  COUNT_DURATION: 2000,
  FADE_DURATION: 600,
  SLIDE_DURATION: 300,
  EASING: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;
