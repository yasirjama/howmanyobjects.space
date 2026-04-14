"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { TYPE_LABELS, REGION_LABELS } from "@/lib/constants";
import { formatNumber, debounce } from "@/lib/utils";
import type { OrbitalObject, ObjectType, OrbitRegion } from "@/lib/types";
import ObjectDrawer from "./ObjectDrawer";
import ScrollReveal from "./ScrollReveal";

const ALL_TYPES: ObjectType[] = [
  "active_satellite",
  "inactive_satellite",
  "rocket_body",
  "debris",
];
const ALL_REGIONS: OrbitRegion[] = ["LEO", "MEO", "GEO", "HEO"];

/** Date string for "15 years ago" used to filter recent satellites */
function get15YearsAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 15);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export default function ExploreSection() {
  /* ── State ── */
  const [expanded, setExpanded] = useState(false);

  // Preview state (5 recent active satellites)
  const [previewObjects, setPreviewObjects] = useState<OrbitalObject[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);

  // Full catalog state
  const [objects, setObjects] = useState<OrbitalObject[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState<ObjectType[]>([]);
  const [activeRegions, setActiveRegions] = useState<OrbitRegion[]>([]);
  const [selectedObject, setSelectedObject] = useState<OrbitalObject | null>(
    null
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pageSize = 50;

  /* ── Fetch: preview (5 recent active satellites) ── */
  useEffect(() => {
    async function loadPreview() {
      try {
        const cutoff = get15YearsAgo();
        const params = new URLSearchParams({
          type: "active_satellite",
          launchedAfter: cutoff,
          sortBy: "launch_desc",
          page: "1",
          pageSize: "5",
        });
        const res = await fetch(`/api/objects?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setPreviewObjects(data.objects);
        }
      } catch {
        // Silently fail — user can still expand
      } finally {
        setPreviewLoading(false);
      }
    }
    loadPreview();
  }, []);

  /* ── Fetch: full catalog ── */
  const fetchObjects = useCallback(
    async (
      searchQuery: string,
      types: ObjectType[],
      regions: OrbitRegion[],
      pg: number
    ) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.set("search", searchQuery);
        if (types.length > 0) params.set("type", types.join(","));
        if (regions.length > 0) params.set("region", regions.join(","));
        params.set("page", String(pg));
        params.set("pageSize", String(pageSize));

        const res = await fetch(`/api/objects?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch");

        const data = await res.json();
        setObjects(data.objects);
        setTotal(data.total);
      } catch (err) {
        console.error("Failed to fetch objects:", err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /* ── Expand handler ── */
  const handleExpand = () => {
    setExpanded(true);
    fetchObjects("", [], [], 1);
  };

  /* ── Debounced search ── */
  const debouncedFetchRef = useRef(
    debounce((q: string, t: ObjectType[], r: OrbitRegion[]) => {
      setPage(1);
      fetchObjects(q, t, r, 1);
    }, 300)
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    debouncedFetchRef.current(value, activeTypes, activeRegions);
  };

  const clearSearch = () => {
    setSearch("");
    setPage(1);
    fetchObjects("", activeTypes, activeRegions, 1);
  };

  const toggleType = (type: ObjectType) => {
    const next = activeTypes.includes(type)
      ? activeTypes.filter((t) => t !== type)
      : [...activeTypes, type];
    setActiveTypes(next);
    setPage(1);
    fetchObjects(search, next, activeRegions, 1);
  };

  const toggleRegion = (region: OrbitRegion) => {
    const next = activeRegions.includes(region)
      ? activeRegions.filter((r) => r !== region)
      : [...activeRegions, region];
    setActiveRegions(next);
    setPage(1);
    fetchObjects(search, activeTypes, next, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchObjects(search, activeTypes, activeRegions, newPage);
  };

  const openDrawer = (obj: OrbitalObject) => {
    setSelectedObject(obj);
    setDrawerOpen(true);
  };

  const totalPages = Math.ceil(total / pageSize);

  /* ── Render ── */
  return (
    <>
      <section className="section" id="explore" aria-labelledby="explore-title">
        <ScrollReveal>
          <h2 className="section__title" id="explore-title">
            Explore the catalog
          </h2>
          <p className="section__subtitle">
            {expanded
              ? `Search and filter ${formatNumber(total)} tracked objects`
              : "Recently launched active satellites"}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="explore">
            {/* ── PREVIEW MODE: 5 recent active satellites ── */}
            {!expanded && (
              <>
                {previewLoading ? (
                  <div className="explore__loading">
                    <div className="loading-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                ) : (
                  <div className="object-list" role="list">
                    {previewObjects.map((obj) => (
                      <button
                        key={obj.id}
                        className="object-row"
                        onClick={() => openDrawer(obj)}
                        role="listitem"
                        aria-label={`${obj.name}, ${TYPE_LABELS[obj.objectType]}, launched ${obj.launchDate || "unknown"}`}
                      >
                        <span className="object-row__name">{obj.name}</span>
                        <span className="object-row__id">
                          #{obj.catalogNumber}
                        </span>
                        <span
                          className={`object-row__type object-row__type--${obj.objectType}`}
                        >
                          {obj.launchDate || "—"}
                        </span>
                        <span className="object-row__region">
                          {obj.orbitRegion}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="explore__more-wrap">
                  <button
                    className="explore__more-button"
                    onClick={handleExpand}
                    aria-label="Show full catalog with search and filters"
                  >
                    <span>Browse all objects</span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </>
            )}

            {/* ── EXPANDED MODE: full catalog ── */}
            {expanded && (
              <>
                <div className="explore__controls">
                  <div className="explore__search-wrap">
                    <input
                      type="search"
                      className="explore__search"
                      placeholder="Search by name or catalog number..."
                      value={search}
                      onChange={handleSearchChange}
                      aria-label="Search orbital objects"
                      id="object-search"
                    />
                    {search && (
                      <button
                        className="explore__search-clear"
                        onClick={clearSearch}
                        aria-label="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="explore__filter-group">
                  <div className="explore__filters">
                    <span className="explore__filter-label">Type:</span>
                    {ALL_TYPES.map((type) => (
                      <button
                        key={type}
                        className={`filter-chip ${activeTypes.includes(type) ? "filter-chip--active" : ""}`}
                        onClick={() => toggleType(type)}
                        aria-pressed={activeTypes.includes(type)}
                      >
                        {TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="explore__filter-group">
                  <div className="explore__filters">
                    <span className="explore__filter-label">Orbit:</span>
                    {ALL_REGIONS.map((region) => (
                      <button
                        key={region}
                        className={`filter-chip ${activeRegions.includes(region) ? "filter-chip--active" : ""}`}
                        onClick={() => toggleRegion(region)}
                        aria-pressed={activeRegions.includes(region)}
                      >
                        {REGION_LABELS[region]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Object List */}
                {isLoading ? (
                  <div className="explore__loading">
                    <div className="loading-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                ) : objects.length === 0 ? (
                  <div className="explore__empty">
                    No objects match your filters.
                  </div>
                ) : (
                  <>
                    <div className="object-list" role="list">
                      {objects.map((obj) => (
                        <button
                          key={obj.id}
                          className="object-row"
                          onClick={() => openDrawer(obj)}
                          role="listitem"
                          aria-label={`${obj.name}, ${TYPE_LABELS[obj.objectType]}, catalog ${obj.catalogNumber}`}
                        >
                          <span className="object-row__name">{obj.name}</span>
                          <span className="object-row__id">
                            #{obj.catalogNumber}
                          </span>
                          <span
                            className={`object-row__type object-row__type--${obj.objectType}`}
                          >
                            {TYPE_LABELS[obj.objectType]}
                          </span>
                          <span className="object-row__region">
                            {obj.orbitRegion}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="pagination">
                        <button
                          className="pagination__button"
                          onClick={() => handlePageChange(page - 1)}
                          disabled={page <= 1}
                          aria-label="Previous page"
                        >
                          ← Previous
                        </button>
                        <span className="pagination__info">
                          Page {page} of {totalPages}
                        </span>
                        <button
                          className="pagination__button"
                          onClick={() => handlePageChange(page + 1)}
                          disabled={page >= totalPages}
                          aria-label="Next page"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Collapse back */}
                <div className="explore__more-wrap">
                  <button
                    className="explore__collapse-button"
                    onClick={() => setExpanded(false)}
                    aria-label="Collapse catalog"
                  >
                    Show less
                  </button>
                </div>
              </>
            )}
          </div>
        </ScrollReveal>
      </section>

      <ObjectDrawer
        object={selectedObject}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
