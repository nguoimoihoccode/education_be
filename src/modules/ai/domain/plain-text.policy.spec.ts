import { toPlainText } from './plain-text.policy';

describe('toPlainText', () => {
  it('returns an empty string for missing content', () => {
    expect(toPlainText(null)).toBe('');
    expect(toPlainText(undefined)).toBe('');
    expect(toPlainText('')).toBe('');
  });

  it('strips HTML tags and keeps the prose', () => {
    expect(toPlainText('<p>Thì hiện tại đơn</p>')).toBe('Thì hiện tại đơn');
  });

  it('turns block tags into line breaks so paragraphs stay separate', () => {
    const html = '<p>Đoạn một</p><p>Đoạn hai</p>';

    expect(toPlainText(html)).toBe('Đoạn một\nĐoạn hai');
  });

  // <br> has no closing tag, so it cannot rely on the closing-block-tag rule.
  it('keeps breaks written as <br>', () => {
    expect(toPlainText('Dòng một<br>Dòng hai')).toBe('Dòng một\nDòng hai');
    expect(toPlainText('Dòng một<br/>Dòng hai')).toBe('Dòng một\nDòng hai');
  });

  // Without a separator an inline tag would fuse two words into one token.
  it('keeps inline-tag content from fusing into one word', () => {
    expect(toPlainText('<b>từ</b>vựng')).toBe('từ vựng');
  });

  // A script or style body is not lesson prose. Stripping only the tags would
  // leave raw CSS/JS in the index, where it competes with real content.
  it('removes script and style bodies entirely, not just their tags', () => {
    const html =
      '<style>.lesson{color:red}</style><p>Nội dung</p><script>track()</script>';

    const text = toPlainText(html);

    expect(text).toBe('Nội dung');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('track()');
  });

  it('drops HTML comments', () => {
    expect(toPlainText('<p>A</p><!-- ghi chú nội bộ --><p>B</p>')).toBe('A\nB');
  });

  it('decodes the entities that actually appear in lesson content', () => {
    expect(toPlainText('<p>Tom &amp; Jerry&nbsp;đây</p>')).toBe(
      'Tom & Jerry đây',
    );
  });

  it('keeps markdown link text and drops the target', () => {
    expect(toPlainText('Xem [bài 2](/education/lessons/2) nhé')).toBe(
      'Xem bài 2 nhé',
    );
  });

  it('keeps code content but drops the fence syntax', () => {
    expect(toPlainText('```ts\nconst a = 1;\n```')).toBe('const a = 1;');
  });

  it('strips markdown heading markers while keeping the heading text', () => {
    expect(toPlainText('## Ngữ pháp\nNội dung')).toBe('Ngữ pháp\nNội dung');
  });

  it('collapses runs of whitespace and blank lines', () => {
    expect(toPlainText('<p>A   </p>\n\n\n\n<p>  B</p>')).toBe('A\n\nB');
  });

  // Editors and word processors emit non-breaking spaces, and they are not
  // matched by `\s` inside a character class on every engine — left in place
  // they survive into the embedded text as an invisible oddity.
  it('collapses non-breaking spaces to ordinary spaces', () => {
    expect(toPlainText('<p>luôn\u00a0\u00a0luôn</p>')).toBe('luôn luôn');
  });
});
