import { NextRequest, NextResponse } from "next/server";
import { getFilteredObjects } from "@/lib/data/celestrak";
import { isAllowed } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  // Rate limit: Max 60 requests per minute per IP for objects search
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!isAllowed(ip, 60, 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const types = searchParams.get("type")?.split(",") || undefined;
    const regions = searchParams.get("region")?.split(",") || undefined;
    const search = searchParams.get("search") || undefined;
    const launchedAfter = searchParams.get("launchedAfter") || undefined;
    const sortBy = searchParams.get("sortBy") as
      | "launch_desc"
      | "launch_asc"
      | "name"
      | undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(
      parseInt(searchParams.get("pageSize") || "50", 10),
      200
    );

    const { objects, total } = await getFilteredObjects({
      types,
      regions,
      search,
      launchedAfter,
      sortBy,
      page,
      pageSize,
    });

    return NextResponse.json(
      { objects, total, page, pageSize },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Error in /api/objects:", error);
    return NextResponse.json(
      { error: "Failed to fetch objects" },
      { status: 500 }
    );
  }
}
