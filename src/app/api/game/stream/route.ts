import { NextRequest } from "next/server";
import { getEngine } from "@/game/engine.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get("sid");
  const engine = getEngine();

  if (!sid || !engine.has(sid)) {
    return new Response("no_session", { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      engine.attachSender(sid, (msg) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
        } catch {
          closed = true;
        }
      });
      // Initial beacon
      try {
        controller.enqueue(encoder.encode(`: connected\n\n`));
      } catch {
        closed = true;
      }
      // keepalive
      const ka = setInterval(() => {
        if (closed) { clearInterval(ka); return; }
        try { controller.enqueue(encoder.encode(`: ka\n\n`)); } catch { clearInterval(ka); closed = true; }
      }, 15000);
      // @ts-expect-error - attach for cancel hookup
      controller.__ka = ka;
    },
    cancel() {
      closed = true;
      engine.detachSender(sid);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
