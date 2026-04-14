import { NextRequest, NextResponse } from "next/server";
import { getOrbitalData } from "@/lib/data/celestrak";
import { isAllowed } from "@/lib/rateLimit";

export const revalidate = 7200; // 2 hours

export async function GET(request: NextRequest) {
  // Rate limit: Max 120 requests per minute per IP for polling counts
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!isAllowed(ip, 120, 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }
  try {
    const { counts } = await getOrbitalData();
    return NextResponse.json(counts, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Error in /api/counts:", error);
    return NextResponse.json(
      { error: "Failed to fetch orbital data" },
      { status: 500 }
    );
  }
}
