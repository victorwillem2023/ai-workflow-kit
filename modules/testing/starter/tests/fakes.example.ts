// The pattern for tests that never touch the network: one `fakeDeps()` that builds every outside service as a fake, and one fixed `NOW`.
// Copy this file to tests/fakes.ts, replace the example services with yours, and import it in every test that needs them.
// Rules (also in CLAUDE.md): a test never hits the network; a test that waits on a timeout wraps its body in `clocked()` (tests/clock.ts);
// randomness goes through a seeded generator so the same request gives the same result.

/** A fixed "today" so dates in tests never drift. */
export const NOW = new Date('2026-01-15T10:00:00Z');

export interface Deps {
  now: () => Date;
  /** replace with your services: geocoder, router, mailer, payment... */
  http: (url: string) => Promise<{ status: number; body: string }>;
}

export function fakeDeps(over: Partial<Deps> = {}): Deps {
  return {
    now: () => NOW,
    http: async (url) => { throw new Error(`a test tried to reach the network: ${url}`); },
    ...over,
  };
}
