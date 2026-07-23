// pacing.mjs — conservative randomized pacing and a hard daily cap.
// Keeps the worker slow and polite. `rng` is injectable for tests.

export function createPacer({ minDelayMs = 3500, maxDelayMs = 9000, dailyCap = 120, rng = Math.random } = {}) {
  let inspected = 0;
  return {
    /** Random delay within [min,max]. */
    nextDelay() {
      const span = Math.max(0, maxDelayMs - minDelayMs);
      return Math.round(minDelayMs + span * rng());
    },
    async wait() {
      await new Promise((r) => setTimeout(r, this.nextDelay()));
    },
    /** Register one inspected profile; returns false when the daily cap is hit. */
    tick() {
      inspected += 1;
      return inspected <= dailyCap;
    },
    get inspected() {
      return inspected;
    },
    get capReached() {
      return inspected >= dailyCap;
    },
  };
}
