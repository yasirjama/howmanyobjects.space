import { getOrbitalData } from "@/lib/data/celestrak";
import HomeClient from "./HomeClient";

export const revalidate = 7200; // 2 hours ISR

export default async function Home() {
  let counts = null;

  try {
    const data = await getOrbitalData();
    // If the upstream fetch failed and we're serving static FALLBACK_COUNTS,
    // skip SSR seeding so the client fetches the real number and the hero
    // animates 0 → real total (upward) instead of flashing the fallback
    // (48,500) and then tweening downward to the live value.
    if (data.counts.dataHealth !== "degraded") {
      counts = data.counts;
    }
  } catch (error) {
    console.error("Failed to load orbital data on page render:", error);
  }

  return <HomeClient initialCounts={counts} />;
}
