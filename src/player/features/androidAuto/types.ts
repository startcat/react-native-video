/**
 * Harness-local MediaItem schema that mirrors the interface expected by
 * AndroidAutoControl.setMediaLibrary in the refactor_androidauto module
 * (not yet integrated — PLAYER-266). Fields are verbatim from that module's
 * types.ts so the adapter contract is locked to the real shape.
 *
 * TODO(PLAYER-266): once the module is integrated, replace this with a re-export
 * from `src/player/features/androidAuto/types.ts` (the integrated module path).
 */
export interface MediaItem {
  id: string;
  title: string;
  subtitle?: string;
  artist?: string;
  artworkUri?: string;
  mediaUri?: string;
  browsable?: boolean;
  playable?: boolean;
  parentId?: string;
  extras?: Record<string, unknown>;
}
