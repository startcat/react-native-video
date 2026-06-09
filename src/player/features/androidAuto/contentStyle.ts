/**
 * PLAYER-267: the Android Auto content-style contract.
 *
 * The native side (ContentStyle.kt) maps a JS MediaItem.extras carrying these keys onto the
 * androidx.media MediaConstants content-style bundle, which media3's MediaLibrarySession surfaces to
 * Android Auto. These mirror MediaConstants by VALUE (verified against androidx.media:media:1.7.0):
 *   DESCRIPTION_EXTRAS_VALUE_CONTENT_STYLE_LIST_ITEM = 1, _GRID_ITEM = 2,
 *   _CATEGORY_LIST_ITEM = 3, _CATEGORY_GRID_ITEM = 4.
 *
 * GUAU's CONTENT_STYLE enum (baseTemplate.utils.ts) emits LIST = '1', GRID = '2' as the extras values —
 * which equal CONTENT_STYLE_HINT.LIST / .GRID below, so the native string->int parse is the identity on
 * the numeric value.
 */

/** The extras keys the JS layer puts on a MediaItem to request a content-style. */
export const CONTENT_STYLE_EXTRA_KEYS = {
  /** This item's own presentation style. */
  contentStyle: 'contentStyle',
  /** Presentation style for this item's browsable children. */
  childrenBrowsableContentStyle: 'childrenBrowsableContentStyle',
  /** Presentation style for this item's playable children. */
  childrenPlayableContentStyle: 'childrenPlayableContentStyle',
  /** Grouping title for this item's children. */
  groupTitle: 'groupTitle',
} as const;

/** Content-style hint values (mirror MediaConstants ints, verified media3 1.1.1 / androidx.media 1.7.0). */
export enum CONTENT_STYLE_HINT {
  LIST = 1,
  GRID = 2,
  CATEGORY_LIST = 3,
  CATEGORY_GRID = 4,
}

/** Parse a GUAU content-style extras value ("1"/"2") to a hint int, or undefined if unrecognised. */
export const parseContentStyleHint = (value: string | number | undefined): CONTENT_STYLE_HINT | undefined => {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return n === CONTENT_STYLE_HINT.LIST || n === CONTENT_STYLE_HINT.GRID ||
         n === CONTENT_STYLE_HINT.CATEGORY_LIST || n === CONTENT_STYLE_HINT.CATEGORY_GRID
    ? (n as CONTENT_STYLE_HINT)
    : undefined;
};
