import { NextRequest, NextResponse } from "next/server";
import { getFindings, getFindingsCount, getFindingsStats, getMessagesCount } from "@/lib/clickhouse";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const statsOnly = searchParams.get("stats") === "true";

    if (statsOnly) {
      const [count, stats, messagesCount] = await Promise.all([
        getFindingsCount(),
        getFindingsStats(),
        getMessagesCount(),
      ]);

      return NextResponse.json({
        success: true,
        total_findings: count,
        scanned_messages: messagesCount,
        by_type: stats,
      });
    }

    const [findings, count] = await Promise.all([
      getFindings(limit, offset),
      getFindingsCount(),
    ]);

    return NextResponse.json({
      success: true,
      findings,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching findings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch findings" },
      { status: 500 }
    );
  }
}
