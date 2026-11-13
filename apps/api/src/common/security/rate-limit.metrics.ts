/**
 * Process-local counter of throttled requests, surfaced in admin analytics.
 * It is intentionally in-memory: it describes this instance since boot, and is
 * labelled as such in the UI rather than presented as a historic total.
 */
const state = {
  rejected: 0,
  lastRejectedAt: null as Date | null,
};

export const rateLimitMetrics = {
  record(): void {
    state.rejected += 1;
    state.lastRejectedAt = new Date();
  },
  snapshot(): { rejected: number; lastRejectedAt: string | null } {
    return {
      rejected: state.rejected,
      lastRejectedAt: state.lastRejectedAt?.toISOString() ?? null,
    };
  },
};
