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
    /**
     * Register one inspected profile; returns false when the daily cap is hit.
     * Checks BEFORE counting, so the tick that refuses does not also inflate the
     * count — the refused profile is never opened, and a run that reports
     * inspecting 121 profiles under a cap of 120 makes its own report look wrong.
     */
    tick() {
      if (inspected >= dailyCap) return false;
      inspected += 1;
      return true;
    },
    get inspected() {
      return inspected;
    },
    get capReached() {
      return inspected >= dailyCap;
    },
  };
}
