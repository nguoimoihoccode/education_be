import {
  REFERENCE_CHAR_BUDGET,
  REFERENCE_CLOSE,
  REFERENCE_OPEN,
  renderReferenceBlock,
} from './knowledge-prompt.policy';

const chunk = (title: string, content: string) => ({ title, content });

describe('renderReferenceBlock', () => {
  it('returns null for no chunks', () => {
    expect(renderReferenceBlock([])).toBeNull();
  });

  // An empty block would tell the model that material was supplied when none
  // was, which is worse than saying nothing at all.
  it('returns null rather than an empty block when nothing fits', () => {
    const oversized = chunk('huge', 'x'.repeat(REFERENCE_CHAR_BUDGET + 1));

    expect(renderReferenceBlock([oversized])).toBeNull();
  });

  it('labels the block and includes each chunk with its title', () => {
    const block = renderReferenceBlock([
      chunk('Thì hiện tại tiếp diễn', 'Diễn tả hành động đang xảy ra.'),
    ]);

    expect(block).toContain(REFERENCE_OPEN);
    expect(block).toContain(REFERENCE_CLOSE);
    expect(block).toContain('[Thì hiện tại tiếp diễn]');
    expect(block).toContain('Diễn tả hành động đang xảy ra.');
  });

  it('stops adding chunks once the budget is reached', () => {
    const big = 'x'.repeat(REFERENCE_CHAR_BUDGET - 100);
    const block = renderReferenceBlock([
      chunk('first', big),
      chunk('second', 'y'.repeat(500)),
      chunk('third', 'z'.repeat(500)),
    ]);

    expect(block).toContain('[first]');
    expect(block).not.toContain('[second]');
    expect(block).not.toContain('[third]');
  });

  // Chunks arrive closest-first, so spending the budget in order keeps the best
  // matches and drops the weakest — the opposite of truncating at the end.
  it('keeps the closest chunks and drops the farthest', () => {
    const each = 'x'.repeat(Math.floor(REFERENCE_CHAR_BUDGET / 3));
    const block = renderReferenceBlock([
      chunk('closest', each),
      chunk('middle', each),
      chunk('farthest', each),
      chunk('beyond-budget', each),
    ]);

    expect(block).toContain('[closest]');
    expect(block).not.toContain('[beyond-budget]');
  });

  it('skips a chunk too large to fit but still takes a smaller one after it', () => {
    const block = renderReferenceBlock([
      chunk('huge', 'x'.repeat(REFERENCE_CHAR_BUDGET + 1)),
      chunk('small', 'fits'),
    ]);

    // The oversized chunk is skipped rather than ending the block, so one long
    // chunk cannot hide every shorter match behind it.
    expect(block).toContain('[small]');
    expect(block).not.toContain('[huge]');
  });
});
