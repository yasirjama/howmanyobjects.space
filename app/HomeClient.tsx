"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { CountsResponse } from "@/lib/types";
import HeroCount from "@/components/HeroCount";
import DataStatus from "@/components/DataStatus";
import CategoryBreakdown from "@/components/CategoryBreakdown";
import ExploreSection from "@/components/ExploreSection";
import EducationalSection from "@/components/EducationalSection";
import ShareActions from "@/components/ShareActions";
import ScrollReveal from "@/components/ScrollReveal";

// Dynamic import for Three.js to avoid SSR issues. Kept in its own chunk
// so the hero globe doesn't block first paint.
const EarthVisualization = dynamic(
  () => import("@/components/EarthVisualization"),
  {
    ssr: false,
    loading: () => (
      <div className="hero__canvas-container">
        <div
          style={{
            width: "100%",
            height: "100%",
            background:
              "radial-gradient(ellipse at center, #0a1628 0%, #060a14 100%)",
          }}
        />
      </div>
    ),
  }
);

interface HomeClientProps {
  initialCounts: CountsResponse | null;
}

export default function HomeClient({ initialCounts }: HomeClientProps) {
  const [counts, setCounts] = useState<CountsResponse | null>(initialCounts);

  // Refresh counts periodically
  const refreshCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/counts");
      if (res.ok) {
        const data: CountsResponse = await res.json();
        setCounts(data);
      }
    } catch {
      // Silently fail — we have cached data
    }
  }, []);

  useEffect(() => {
    // Refresh on tab focus
    const handleFocus = () => refreshCounts();
    window.addEventListener("focus", handleFocus);

    // Periodic refresh every 5 minutes (was 2m — counts change slowly;
    // less polling = less bandwidth + fewer wakeups on mobile)
    const interval = setInterval(refreshCounts, 5 * 60 * 1000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, [refreshCounts]);

  return (
    <>
      {/* ── Hero Section ── */}
      <section className="hero" id="hero">
        <EarthVisualization counts={counts} />

        <HeroCount
          targetCount={counts?.totalCount || 0}
          isLoading={!counts}
        />

        <div className="hero__timestamp">
          {counts && (
            <DataStatus
              lastSyncedAt={counts.lastSyncedAt}
              dataHealth={counts.dataHealth}
            />
          )}
        </div>

        <div className="hero__scroll-hint" aria-hidden="true">
          <span>Explore</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
          </svg>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="divider" />

      {/* ── Category Breakdown ── */}
      <CategoryBreakdown counts={counts} />

      {/* ── Divider ── */}
      <div className="divider" />

      {/* ── Explore Section ── */}
      <ExploreSection />

      {/* ── Divider ── */}
      <div className="divider" />

      {/* ── Educational Section ── */}
      <EducationalSection />

      {/* ── Share Actions ── */}
      <ScrollReveal>
        <ShareActions totalCount={counts?.totalCount || 0} />
      </ScrollReveal>

      {/* ── Footer ── */}
      <footer className="footer">
        <p>
          Data sourced from{" "}
          <a
            href="https://celestrak.org"
            target="_blank"
            rel="noopener noreferrer"
            className="footer__link"
          >
            CelesTrak
          </a>{" "}
          / 18th Space Defense Squadron
        </p>
        <p>
          Built with wonder. Not affiliated with any government agency.
        </p>
        <p style={{ marginTop: "var(--space-2)" }}>
          Made by{" "}
          <a
            href="https://www.instagram.com/yasir._jama/"
            target="_blank"
            rel="noopener noreferrer"
            className="footer__link"
            style={{ fontWeight: 500 }}
          >
            me
          </a>
        </p>
        <p style={{ marginTop: "var(--space-4)", opacity: 0.5 }}>
          howmanyobjects.space © {new Date().getFullYear()}
        </p>
      </footer>

    </>
  );
}
