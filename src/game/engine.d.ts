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
    /**
     * Hand the engine the map as the database last knew it. `contested`
     * narrows the ground a match may be dealt; `holdings` lets a snapshot name
     * a holder. Nothing here reaches a rule that decides a fight — see
     * `engine.mjs` and `docs/FACTIONS.md` §3.
     */
    setWarFront(front: WarFront | null): void;
    /** Subscribe to the end of every match. Returns the unsubscribe. */
    /** Say something to every seat in a room from outside the sim. Never throws. */
    tellRoom(roomCode: string, msg: { type: string; data?: unknown }): boolean;
    onMatchEnd(handler: (report: MatchEndReport) => unknown): () => void;
  }
  /** The map, as far as the simulation is allowed to know it. */
  export interface WarFront {
    /** Territory ids, most nearly lost first. */
    contested: string[];
    /** Territory id -> the people holding it. */
    holdings: Record<string, string>;
  }
  /** One man's share of what a match did to the war. NO PEOPLE: see war.mjs. */
  export interface WarEntry {
    playerId: string;
    name: string;
    points: number;
  }
  /** What `endMatch` hands its subscribers, and what rides on `match_end`. */
  export interface MatchEndReport {
    roomCode: string;
    mode: string;
    /** `${roomCode}:${matchId}`, minted at match START. The replay guard. */
    matchKey: string;
    territoryId: string;
    entries: WarEntry[];
    at: number;
  }
  /** An independent simulation. Call it twice for two arenas that cannot meet. */
  export function makeEngine(options?: EngineOptions): Engine;
  /** The process-wide default engine, timer and all. */
  export function getEngine(): Engine;
}
