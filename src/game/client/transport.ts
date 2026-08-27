"use client";
// ============================================================
// BRETWALDA — Client Transport (WebSocket first, HTTP/SSE fallback)
// ============================================================
export type GameMsg = { type: string; data?: Record<string, unknown> };
type Handler = (msg: GameMsg) => void;

export class Transport {
  mode: "ws" | "http" | null = null;
  private ws: WebSocket | null = null;
  private es: EventSource | null = null;
  private sid: string | null = null;
  private handlers: Handler[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  closedByUser = false;

  on(fn: Handler) { this.handlers.push(fn); }
  off(fn: Handler) { const i = this.handlers.indexOf(fn); if (i >= 0) this.handlers.splice(i, 1); }
  private emit(msg: GameMsg) { this.handlers.forEach((h) => { try { h(msg); } catch { /* ok */ } }); }

  private abandoned = false;
  private relinking = false;

  /**
   * THE RETRY (8.9). Three goes at a fresh WebSocket on a short backoff,
   * then the HTTP/SSE fallback — either way the SESSION is new, so success
   * emits a synthetic `relink` and the page presents its `reconnectKey` to
   * walk back into the body the server has been holding. Emitted, not
   * handled here: the transport does not know what room the player was in,
   * and should not.
   */
  private async relink(): Promise<void> {
    if (this.relinking || this.closedByUser) return;
    this.relinking = true;
    try {
      for (const wait of [800, 1600, 3200]) {
        await new Promise((r) => setTimeout(r, wait));
        if (this.closedByUser) return;
        try {
          this.abandoned = false;
          await this.connectWS();
          this.mode = "ws";
          this.emit({ type: "relink", data: {} });
          return;
        } catch { /* the next lap */ }
      }
      if (this.closedByUser) return;
      try {
        await this.connectHTTP();
        this.mode = "http";
        this.emit({ type: "relink", data: {} });
      } catch {
        this.emit({ type: "error", data: { message: "Could not reach the war council. Check your connection and retry." } });
      }
    } finally {
      this.relinking = false;
    }
  }

  async connect(): Promise<void> {
    // Try WebSocket first (preferred low-latency)
    try {
      await this.connectWS();
      this.mode = "ws";
      return;
    } catch {
      // Abandon the failed WS so its late events never ghost-error
      this.abandoned = true;
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        try { this.ws.close(); } catch { /* ok */ }
        this.ws = null;
      }
    }
    await this.connectHTTP();
    this.mode = "http";
  }

  private connectWS(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let wsRef: WebSocket | null = null;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; try { wsRef?.close(); } catch { /* ok */ } reject(new Error("ws_timeout")); }
      }, 3000);

      try {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
        wsRef = ws;
        this.ws = ws;

        ws.onopen = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
          }, 5000);
          resolve();
        };
        ws.onmessage = (event) => {
          try { this.emit(JSON.parse(event.data)); } catch { /* ok */ }
        };
        ws.onclose = () => {
          if (this.pingTimer) clearInterval(this.pingTimer);
          if (this.abandoned || this.closedByUser) return;
          if (this.mode === "ws") {
            // "reopening..." USED TO BE A LIE (8.9): nothing retried, the
            // server pronounced the drop, and the man's fight was over
            // behind a message promising otherwise. The retry is real now,
            // and the server holds his body for AWOL_GRACE while it runs —
            // see `relink` below, which is what actually walks him back in.
            this.emit({ type: "error", data: { code: "lost", message: "Link to the war council dropped — reopening..." } });
            void this.relink();
          }
        };
        ws.onerror = () => {
          if (!settled) { settled = true; clearTimeout(timer); reject(new Error("ws_error")); }
          else if (!this.closedByUser) this.emit({ type: "error", data: { message: "Connection error." } });
        };
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  private async connectHTTP(): Promise<void> {
    const res = await fetch("/api/game/msg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "open" }),
    });
    const json = await res.json();
    if (!json.ok || !json.sid) throw new Error("http_session_failed");
    this.sid = json.sid;

    this.es = new EventSource(`/api/game/stream?sid=${encodeURIComponent(json.sid)}`);
    this.es.onmessage = (event) => {
      try { this.emit(JSON.parse(event.data)); } catch { /* ok */ }
    };
    this.es.onerror = () => {
      // EventSource auto-reconnects; only report if stream fully dies
      if (this.es && this.es.readyState === EventSource.CLOSED && !this.closedByUser) {
        this.emit({ type: "error", data: { message: "Lost the horn signal… reopen the battle." } });
      }
    };
  }

  async send(msg: GameMsg): Promise<void> {
    if (this.closedByUser) return;
    if (this.mode === "ws" && this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
      return;
    }
    if (this.mode === "http" && this.sid) {
      try {
        const res = await fetch("/api/game/msg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid: this.sid, type: msg.type, data: msg.data || {} }),
        });
        const json = await res.json();
        if (json.replies) {
          (json.replies as GameMsg[]).forEach((r) => this.emit(r));
        }
      } catch {
        this.emit({ type: "error", data: { message: "Message to the war council failed." } });
      }
    }
  }

  close() {
    this.closedByUser = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.ws) { try { this.ws.close(); } catch { /* ok */ } this.ws = null; }
    if (this.sid) {
      try {
        fetch("/api/game/msg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sid: this.sid, type: "close" }),
          keepalive: true,
        });
      } catch { /* ok */ }
      this.sid = null;
    }
    if (this.es) { try { this.es.close(); } catch { /* ok */ } this.es = null; }
    this.mode = null;
    // AND IT LETS GO OF ITS SUBSCRIBERS.
    //
    // `on()` is called once per session by `page.tsx` and there was no matching
    // release anywhere: a closed transport kept its handler array, so anything
    // still holding a reference to the object kept a live path into a component
    // that may be gone. `react-doctor/effect-needs-cleanup` flagged the
    // subscription, and the right place to answer it is here rather than at the
    // call site — a socket that has been closed has no business delivering, and
    // making every caller remember to `off()` is how one of them forgets.
    //
    // `pingTimer` is nulled with them for the same reason: `clearInterval` on a
    // stale id is harmless, but a field that still holds one reads as a timer
    // that is still running.
    this.pingTimer = null;
    this.handlers.length = 0;
  }
}
