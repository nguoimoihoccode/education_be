import { getMetadataArgsStorage } from 'typeorm';
import { SoulieMessage } from './message.entity';
import { SoulieMoment } from './moment.entity';

describe('Soulie media entity columns', () => {
  it('declares explicit varchar types for nullable media string columns', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (column) =>
        column.target === SoulieMessage || column.target === SoulieMoment,
    );

    const getColumnType = (target: Function, propertyName: string) =>
      columns.find(
        (column) =>
          column.target === target && column.propertyName === propertyName,
      )?.options.type;

    expect(getColumnType(SoulieMessage, 'mediaUrl')).toBe('varchar');
    expect(getColumnType(SoulieMessage, 'thumbnailUrl')).toBe('varchar');
    expect(getColumnType(SoulieMessage, 'mimeType')).toBe('varchar');
    expect(getColumnType(SoulieMoment, 'imageUrl')).toBe('varchar');
    expect(getColumnType(SoulieMoment, 'thumbnailUrl')).toBe('varchar');
    expect(getColumnType(SoulieMoment, 'mimeType')).toBe('varchar');
  });
});
