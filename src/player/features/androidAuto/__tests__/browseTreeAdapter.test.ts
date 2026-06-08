import { toMediaLibrary, type BrowseNode } from '../browseTreeAdapter';
import type { MediaItem } from '../types';

const tree: BrowseNode[] = [
  { id: 'root', title: 'Radios', browsable: true, children: [
    { id: 'r1', title: 'Radio Euskadi', playable: true, mediaUri: 'https://x/r1.m3u8', artworkUri: 'https://x/r1.png', subtitle: 'En directo', parentId: 'root' },
  ]},
];

describe('toMediaLibrary (browse-tree adapter)', () => {
  it('flattens a browse tree to MediaItem[] preserving id/parentId and playable/browsable', () => {
    const out: MediaItem[] = toMediaLibrary(tree);
    expect(out).toEqual([
      { id: 'root', title: 'Radios', browsable: true, playable: false, parentId: undefined },
      { id: 'r1', title: 'Radio Euskadi', subtitle: 'En directo', mediaUri: 'https://x/r1.m3u8', artworkUri: 'https://x/r1.png', browsable: false, playable: true, parentId: 'root' },
    ]);
  });

  it('never emits an item that is both browsable and playable', () => {
    const out = toMediaLibrary([{ id: 'a', title: 'A', browsable: true, playable: true, children: [] }]);
    expect(out.every((i) => !(i.browsable && i.playable))).toBe(true);
  });

  it('returns [] for an empty tree (no-op when no car library configured)', () => {
    expect(toMediaLibrary([])).toEqual([]);
  });
});
