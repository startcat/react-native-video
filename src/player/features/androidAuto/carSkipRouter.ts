// src/player/features/androidAuto/carSkipRouter.ts
// PLAYER-268: pure, testable mapping of an OS/car "skip" request to exactly one PlaylistControl call.
// Mirrors carPlaybackRouter (PLAYER-265 harness): one write per request, loop-guarded by origin.

/** The single-write sink the router drives (PlaylistControl in production, a spy in tests). */
export interface SkipSink {
  next: () => void;
  previous: () => void;
}

export type SkipType = 'next' | 'previous';

export interface SkipRequest {
  type: SkipType;
  /** Set when the request was emitted BY this sink (echo) — dropped to avoid re-entry. */
  origin?: string;
}

/** Sentinel origin marking a request that originated from the PlaylistControl sink itself. */
export const SKIP_SINK_ORIGIN = 'playlist-control-sink';

/**
 * Route a single skip request to exactly one sink call. Returns true if a write happened.
 * Drops self-origin requests (loop guard) without writing.
 */
export function routeSkipRequest(req: SkipRequest, sink: SkipSink): boolean {
  if (req.origin === SKIP_SINK_ORIGIN) {
    return false;
  }
  if (req.type === 'next') {
    sink.next();
    return true;
  }
  sink.previous();
  return true;
}
