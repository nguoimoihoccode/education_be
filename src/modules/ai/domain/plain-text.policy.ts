/**
 * Lesson content is authored as HTML or Markdown (see `Lesson.content`), so it
 * must be reduced to plain text before it can be chunked and embedded. Markup
 * tokens are noise that dilutes an embedding, and script/style *bodies* would
 * otherwise be indexed as if they were lesson prose.
 *
 * Deliberately regex-only: pulling in cheerio/turndown just to index our own
 * teacher-authored lesson bodies is not worth the dependency.
 */

/** Void tag: it *is* the line break. */
const BR_TAG = /<\s*br\s*\/?\s*>/gi;

/**
 * Closing block tags become the line break. Opening ones contribute nothing, so
 * that `</p><p>` yields one break rather than two (which would read as a
 * paragraph boundary and split chunks in the wrong place).
 */
const CLOSING_BLOCK_TAG =
  /<\s*\/\s*(p|div|li|ul|ol|h[1-6]|tr|td|table|section|article|blockquote|pre|figure)\s*>/gi;

const OPENING_BLOCK_TAG =
  /<\s*(p|div|li|ul|ol|h[1-6]|tr|td|table|section|article|blockquote|pre|figure)\b[^>]*>/gi;

/** Removed with their contents, not just their tags. */
const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

/** Invisible when rendered, so it contributes no break and no space. */
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** Inline tags: a space, so `<b>a</b>b` cannot fuse into one word. */
const ANY_TAG = /<[^>]*>/g;

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

const decodeEntities = (text: string): string =>
  text.replace(
    /&(?:nbsp|amp|lt|gt|quot|#39|apos);/g,
    (match) => ENTITIES[match] ?? match,
  );

/** Keep the visible text of links/images, drop the targets. */
const unwrapMarkdownLinks = (text: string): string =>
  text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

/** Keep the code itself; the fence line is just syntax. */
const stripCodeFences = (text: string): string =>
  text.replace(/```[^\n]*\n([\s\S]*?)```/g, '$1');

/** "# Heading" -> "Heading": the words matter, the marker does not. */
const stripHeadingMarkers = (text: string): string =>
  text.replace(/^[ \t]*#{1,6}[ \t]+/gm, '');

export const toPlainText = (raw: string | null | undefined): string => {
  if (!raw) {
    return '';
  }

  const withoutMarkup = decodeEntities(
    raw
      .replace(SCRIPT_OR_STYLE, ' ')
      .replace(HTML_COMMENT, '')
      .replace(BR_TAG, '\n')
      .replace(CLOSING_BLOCK_TAG, '\n')
      .replace(OPENING_BLOCK_TAG, '')
      .replace(ANY_TAG, ' '),
  );

  return stripHeadingMarkers(
    unwrapMarkdownLinks(stripCodeFences(withoutMarkup)),
  )
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
