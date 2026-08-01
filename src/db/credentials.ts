import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { RECOVERY_WORDS } from "./recoveryWords";

/**
 * The two credentials a profile has, and neither of them is a password.
 *
 * `secret` is the bearer token the client keeps in localStorage and sends with
 * every request. It is machine handled, so it is 256 random bits and nobody
 * ever reads it aloud.
 *
 * The recovery code is the opposite problem: it exists to be read aloud, from
 * a screenshot, over a group chat, onto a friend's phone. Four words from a
 * 256 word list is 32 bits — far less than the token, and deliberately so.
 * What it protects is a pile of cosmetic gold, and the realistic attack on it
 * is not a cracking rig but a stranger typing phrases at the recovery box, so
 * the guard that matters is the rate limit on that route rather than another
 * eight bits nobody can dictate down a phone.
 */

const RECOVERY_LENGTH = 4;

export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The stored form of a secret. SHA-256 with no salt and no stretching is the
 * right primitive here precisely because the input is not a password: it is
 * full-entropy random, so there is no dictionary to run and nothing for a
 * slow hash to slow down. What it buys is that a dump of the players table
 * cannot be replayed against the API.
 */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function secretMatches(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), "hex");
  let b: Buffer;
  try { b = Buffer.from(storedHash, "hex"); } catch { return false; }
  if (a.length !== b.length || b.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function newRecoveryCode(): string {
  const words: string[] = [];
  for (let i = 0; i < RECOVERY_LENGTH; i++) {
    words.push(RECOVERY_WORDS[randomInt(RECOVERY_WORDS.length)]);
  }
  return words.join(" ");
}

const WORD_SET = new Set(RECOVERY_WORDS);
/** Four-letter stems that name exactly one word, for forgiving a typed tail. */
const STEMS = (() => {
  const counts = new Map<string, string[]>();
  for (const w of RECOVERY_WORDS) {
    const stem = w.slice(0, 4);
    const list = counts.get(stem);
    if (list) list.push(w); else counts.set(stem, [w]);
  }
  const unique = new Map<string, string>();
  counts.forEach((list, stem) => { if (list.length === 1) unique.set(stem, list[0]); });
  return unique;
})();

/**
 * Turns whatever the player typed into the canonical code, or null.
 *
 * Forgiving about the things that go wrong when a code is dictated — case,
 * punctuation, hyphens instead of spaces, a mangled tail on a word whose first
 * four letters already name it uniquely — and unforgiving about everything
 * else. `brook` and `broom` share a stem, so those two have to be typed in
 * full; a code containing one of the five such pairs is not weaker, only less
 * forgiving.
 */
export function normaliseRecoveryCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 120) return null;
  const tokens = input.toLowerCase().replace(/[^a-z]+/g, " ").trim().split(" ").filter(Boolean);
  if (tokens.length !== RECOVERY_LENGTH) return null;
  const words: string[] = [];
  for (const token of tokens) {
    if (WORD_SET.has(token)) { words.push(token); continue; }
    const stem = STEMS.get(token.slice(0, 4));
    if (stem && token.length >= 4) { words.push(stem); continue; }
    return null;
  }
  return words.join(" ");
}
