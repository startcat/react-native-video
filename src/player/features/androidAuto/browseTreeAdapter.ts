import type { MediaItem } from './types';

/** A node in GUAU's existing browse tree, flattened into MediaItem[] for setMediaLibrary. */
export interface BrowseNode {
  id: string;
  title: string;
  subtitle?: string;
  artist?: string;
  artworkUri?: string;
  mediaUri?: string;
  browsable?: boolean;
  playable?: boolean;
  parentId?: string;
  children?: BrowseNode[];
}

/**
 * Flatten a browse tree into the MediaItem[] schema consumed by
 * AndroidAutoControl.setMediaLibrary. Browsable wins over playable so a node is
 * never both (media3 rejects ambiguous items). Pure function — no native calls.
 */
export function toMediaLibrary(nodes: BrowseNode[]): MediaItem[] {
  const out: MediaItem[] = [];
  const walk = (list: BrowseNode[]) => {
    for (const n of list) {
      const browsable = !!n.browsable;
      const item: MediaItem = {
        id: n.id,
        title: n.title,
        ...(n.subtitle !== undefined ? { subtitle: n.subtitle } : {}),
        ...(n.artist !== undefined ? { artist: n.artist } : {}),
        ...(n.artworkUri !== undefined ? { artworkUri: n.artworkUri } : {}),
        ...(n.mediaUri !== undefined ? { mediaUri: n.mediaUri } : {}),
        browsable,
        playable: browsable ? false : !!n.playable,
        parentId: n.parentId,
      };
      out.push(item);
      if (n.children && n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
