declare module "@/game/engine.mjs" {
  export interface EngineMessage {
    type: string;
    data?: Record<string, unknown>;
  }
  export interface Engine {
    connect(sender: ((msg: string) => void) | null): string;
    attachSender(sid: string, sender: (msg: string) => void): boolean;
    detachSender(sid: string): boolean;
    message(sid: string, msg: EngineMessage): void;
    httpMessage(sid: string, msg: EngineMessage): { ok: boolean; replies: unknown[] };
    disconnectSession(sid: string): void;
    has(sid: string): boolean;
  }
  export function getEngine(): Engine;
}
