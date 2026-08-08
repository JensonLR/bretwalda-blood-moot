declare module "@/game/engine.mjs" {
  export interface EngineMessage {
    type: string;
    data?: Record<string, unknown>;
  }
  export interface EngineOptions {
    /** false builds an engine with no timer at all; time arrives via step(). */
    autoTick?: boolean;
    /** Wall ms that sim time 0 stands for. Display fields only — see engine.mjs. */
    epoch?: number;
  }
  export interface Engine {
    connect(sender: ((msg: string) => void) | null): string;
    attachSender(sid: string, sender: (msg: string) => void): boolean;
    detachSender(sid: string): boolean;
    message(sid: string, msg: EngineMessage): void;
    httpMessage(sid: string, msg: EngineMessage): { ok: boolean; replies: unknown[] };
    disconnectSession(sid: string): void;
    has(sid: string): boolean;
    /** Advance by dtSeconds of sim time (one tick if omitted); returns steps run. */
    step(dtSeconds?: number): number;
    /** Milliseconds of simulation advanced so far. */
    simTime(): number;
    /** Whether this engine started its own 20 Hz timer. */
    autoTick: boolean;
    /** Put the internal timer down. A no-op when there is none. */
    stop(): void;
  }
  /** An independent simulation. Call it twice for two arenas that cannot meet. */
  export function makeEngine(options?: EngineOptions): Engine;
  /** The process-wide default engine, timer and all. */
  export function getEngine(): Engine;
}
