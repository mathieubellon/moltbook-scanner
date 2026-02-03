import { NextRequest, NextResponse } from "next/server";
import { getMessages, getMessagesCount, getMessagesStats } from "@/lib/clickhouse";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const statsOnly = searchParams.get("stats") === "true";
    const messageType = searchParams.get("type") || undefined;
    const hasAPIKey = searchParams.get("has_api_key");

    if (statsOnly) {
      const stats = await getMessagesStats();

      return NextResponse.json({
        success: true,
        ...stats,
      });
    }

    const hasAPIKeyFilter = hasAPIKey === "true" ? true : hasAPIKey === "false" ? false : undefined;

    const [messages, count] = await Promise.all([
      getMessages(limit, offset, messageType, hasAPIKeyFilter),
      getMessagesCount(messageType, hasAPIKeyFilter),
    ]);

    return NextResponse.json({
      success: true,
      messages,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
