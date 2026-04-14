import { RawSatcatRecord, OrbitalObject, CountsResponse } from "@/lib/types";
import { normalizeAll } from "./normalize";
import {
  getCachedData,
  getStaleCachedData,
  setCachedData,
  markCacheStale,
} from "./cache";
import { FALLBACK_COUNTS, FALLBACK_OBJECTS } from "./fallback";

/**
 * Parse CSV text into an array of records.
 * CelesTrak SATCAT CSV has a header row followed by data rows.
 */
function parseSatcatCsv(csvText: string): RawSatcatRecord[] {
  const lines = csvText.split("\n");
  if (lines.length < 2) return [];

  // Header row
  const headers = parseCSVLine(lines[0]);
  const records: RawSatcatRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    if (values.length < headers.length) continue;

    const record: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j].trim();
      const val = values[j]?.trim() ?? "";
      // Convert numeric fields
      if (
        ["PERIOD", "INCLINATION", "APOGEE", "PERIGEE", "RCS", "NORAD_CAT_ID"].includes(key)
      ) {
        record[key] = val === "" ? null : Number(val);
      } else {
        record[key] = val || null;
      }
    }
    records.push(record as unknown as RawSatcatRecord);
  }

  return records;
}

/**
 * Parse a single CSV line respecting quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Fetch the complete SATCAT catalog as CSV (includes ALL object types).
 * This is the full catalog: payloads, rocket bodies, debris, and unknown.
 */
async function fetchFullSatcat(): Promise<RawSatcatRecord[]> {
  const url = "https://celestrak.org/pub/satcat.csv";

  const response = await fetch(url, {
    // Don't use Next.js data cache — response is large.
    // We manage our own in-memory cache instead.
    cache: "no-store",
    headers: {
      "User-Agent": "HowManyObjects.space/1.0 (educational-project)",
    },
  });

  if (!response.ok) {
    throw new Error(`CelesTrak returned ${response.status}`);
  }

  const csvText = await response.text();
  return parseSatcatCsv(csvText);
}

/**
 * Main data fetch — tries CelesTrak, falls back to cache, then to static seed
 */
export async function getOrbitalData(): Promise<{
  objects: OrbitalObject[];
  counts: CountsResponse;
}> {
  // 1. Check cache first
  const cached = getCachedData();
  if (cached) {
    return { objects: cached.objects, counts: cached.counts };
  }

  // 2. Try fetching fresh data from CelesTrak
  try {
    const rawRecords = await fetchFullSatcat();
    const objects = normalizeAll(rawRecords);

    if (objects.length > 0) {
      const entry = setCachedData(objects);
      return { objects: entry.objects, counts: entry.counts };
    }

    throw new Error("No objects returned from CelesTrak");
  } catch (error) {
    console.error("Failed to fetch from CelesTrak:", error);

    // 3. Try stale cache
    const stale = getStaleCachedData();
    if (stale) {
      markCacheStale();
      return { objects: stale.objects, counts: stale.counts };
    }

    // 4. Ultimate fallback: static seed data
    console.warn("Using static fallback data");
    return {
      objects: FALLBACK_OBJECTS,
      counts: FALLBACK_COUNTS,
    };
  }
}

/**
 * Get a single object by catalog number
 */
export async function getObjectById(
  id: string
): Promise<OrbitalObject | null> {
  const { objects } = await getOrbitalData();
  return objects.find((obj) => obj.catalogNumber === id) || null;
}

/**
 * Get filtered and paginated objects
 */
export async function getFilteredObjects(params: {
  types?: string[];
  regions?: string[];
  search?: string;
  launchedAfter?: string;
  sortBy?: "launch_desc" | "launch_asc" | "name";
  page?: number;
  pageSize?: number;
}): Promise<{ objects: OrbitalObject[]; total: number }> {
  const { objects } = await getOrbitalData();

  let filtered = objects;

  if (params.types && params.types.length > 0) {
    filtered = filtered.filter((obj) =>
      params.types!.includes(obj.objectType)
    );
  }

  if (params.regions && params.regions.length > 0) {
    filtered = filtered.filter((obj) =>
      params.regions!.includes(obj.orbitRegion)
    );
  }

  if (params.launchedAfter) {
    const cutoff = params.launchedAfter;
    filtered = filtered.filter(
      (obj) => obj.launchDate && obj.launchDate >= cutoff
    );
  }

  if (params.search) {
    const query = params.search.toLowerCase();
    filtered = filtered.filter(
      (obj) =>
        obj.name.toLowerCase().includes(query) ||
        obj.catalogNumber.includes(query) ||
        (obj.intlDesignator?.toLowerCase().includes(query) ?? false)
    );
  }

  // Sort
  if (params.sortBy === "launch_desc") {
    filtered.sort((a, b) =>
      (b.launchDate || "").localeCompare(a.launchDate || "")
    );
  } else if (params.sortBy === "launch_asc") {
    filtered.sort((a, b) =>
      (a.launchDate || "").localeCompare(b.launchDate || "")
    );
  }

  const total = filtered.length;
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;
  const start = (page - 1) * pageSize;

  return {
    objects: filtered.slice(start, start + pageSize),
    total,
  };
}
