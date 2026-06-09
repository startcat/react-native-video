import { CONTENT_STYLE_HINT, CONTENT_STYLE_EXTRA_KEYS, parseContentStyleHint } from '../contentStyle';

describe('Android Auto content-style contract (PLAYER-267)', () => {
  it('GUAU LIST="1" / GRID="2" map to the verified media3 int hints', () => {
    expect(parseContentStyleHint('1')).toBe(CONTENT_STYLE_HINT.LIST);   // MediaConstants ..._LIST_ITEM = 1
    expect(parseContentStyleHint('2')).toBe(CONTENT_STYLE_HINT.GRID);   // MediaConstants ..._GRID_ITEM = 2
    expect(CONTENT_STYLE_HINT.LIST).toBe(1);
    expect(CONTENT_STYLE_HINT.GRID).toBe(2);
  });

  it('exposes the exact extras keys GUAU templatesToMediaLibrary writes', () => {
    expect(Object.values(CONTENT_STYLE_EXTRA_KEYS)).toEqual([
      'contentStyle',
      'childrenBrowsableContentStyle',
      'childrenPlayableContentStyle',
      'groupTitle',
    ]);
  });

  it('drops unrecognised style values (no bundle key emitted)', () => {
    expect(parseContentStyleHint('9')).toBeUndefined();
    expect(parseContentStyleHint(undefined)).toBeUndefined();
  });
});
