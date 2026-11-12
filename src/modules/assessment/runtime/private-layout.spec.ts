import sharp from 'sharp';
import { privatePage } from './private-layout';

it('masks the background and redactions before the reader receives the page', async () => {
  const bytes = await sharp({
    create: { width: 80, height: 80, channels: 3, background: 'black' },
  })
    .jpeg()
    .toBuffer();
  const { bytes: output } = await privatePage(
    { bytes, width: 80, height: 80 },
    {
      safeToRead: true,
      primaryPolygon: [
        [0.2, 0.2],
        [0.8, 0.2],
        [0.8, 0.8],
        [0.2, 0.8],
      ],
      redactions: [
        [
          [0.3, 0.3],
          [0.5, 0.3],
          [0.5, 0.5],
          [0.3, 0.5],
        ],
      ],
    },
  );
  const pixels = await sharp(output).raw().toBuffer();
  const value = (x: number, y: number) => pixels[(y * 80 + x) * 3];
  expect(value(5, 5)).toBeGreaterThan(230);
  expect(value(32, 32)).toBeGreaterThan(230);
  expect(value(50, 50)).toBeLessThan(25);
  await expect(
    privatePage({ bytes, width: 80, height: 80 }, { safeToRead: false }),
  ).rejects.toThrow('privacy_layout_review_required');
});
