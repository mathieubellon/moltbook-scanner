import { NextRequest, NextResponse } from "next/server";
import { getPatterns, addPattern, updatePatternEnabled, deletePattern, seedDefaultPatterns } from "@/lib/clickhouse";

export async function GET() {
  try {
    // Seed default patterns if needed
    await seedDefaultPatterns();
    
    const patterns = await getPatterns();

    return NextResponse.json({
      success: true,
      patterns,
    });
  } catch (error) {
    console.error("Error fetching patterns:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch patterns" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, pattern, description } = body;

    if (!name || !pattern) {
      return NextResponse.json(
        { success: false, error: "Name and pattern are required" },
        { status: 400 }
      );
    }

    // Validate regex
    try {
      new RegExp(pattern);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid regex pattern" },
        { status: 400 }
      );
    }

    await addPattern(name, pattern, description || "");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding pattern:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add pattern" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, enabled } = body;

    if (!id || typeof enabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "ID and enabled status are required" },
        { status: 400 }
      );
    }

    await updatePatternEnabled(id, enabled);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating pattern:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update pattern" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID is required" },
        { status: 400 }
      );
    }

    await deletePattern(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting pattern:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete pattern" },
      { status: 500 }
    );
  }
}
