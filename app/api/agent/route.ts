import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { circleRail } from "@/lib/rails/circle";
import { instrument } from "@/lib/rails/metrics";

export async function POST(req: NextRequest) {
  try {
    const { task } = await req.json();
    if (!task || typeof task !== "string") {
      return NextResponse.json({ error: "task is required" }, { status: 400 });
    }

    const rail = instrument(circleRail());
    await rail.init();

    const run = await runAgent(task, rail);
    return NextResponse.json(run);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "agent run failed" }, { status: 500 });
  }
}