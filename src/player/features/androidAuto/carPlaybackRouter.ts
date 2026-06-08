/** The single playback controller the app drives (PlaylistControl in production). */
export interface SingleWriteSink {
  play(mediaId: string): void;
  pause(): void;
  seek(positionSec: number): void;
}

export type CarPlayRequest =
  | { type: 'play'; mediaId: string; origin?: string }
  | { type: 'pause'; origin?: string }
  | { type: 'seek'; positionSec: number; origin?: string };

const SINK_ORIGIN = 'single-write-sink';

/**
 * Route a car-originated request to the ONE sink, exactly once. Requests that
 * originate from the sink itself are dropped (loop guard) — this is the
 * structural replacement for the dual-write + fragile origin guard the audit
 * flagged (G-1/G-4). Pure function; the native handoff is verified on-device.
 */
export function routeCarPlayRequest(req: CarPlayRequest, sink: SingleWriteSink): void {
  if (req.origin === SINK_ORIGIN) return;
  switch (req.type) {
    case 'play':
      sink.play(req.mediaId);
      return;
    case 'pause':
      sink.pause();
      return;
    case 'seek':
      sink.seek(req.positionSec);
      return;
  }
}
