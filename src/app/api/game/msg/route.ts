import { NextRequest, NextResponse } from "next/server";
import { getEngine } from "@/game/engine.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const engine = getEngine();
    const body = (await req.json()) as { sid?: string; type?: string; data?: Record<string, unknown> };

    if (body.type === "open") {
      // Create a bare HTTP session
      const sid = engine.connect(null);
      return NextResponse.json({ ok: true, sid });
    }

    if (!body.sid || !engine.has(body.sid)) {
      return NextResponse.json({ ok: false, error: "no_session" }, { status: 400 });
    }

    const sid: string = body.sid;
    if (body.type === "close") {
      engine.disconnectSession(sid);
      return NextResponse.json({ ok: true, replies: [] });
    }

    const result = engine.httpMessage(sid, { type: body.type || "", data: body.data || {} });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
