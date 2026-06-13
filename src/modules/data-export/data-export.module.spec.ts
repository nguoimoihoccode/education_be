import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { DataExportModule } from './data-export.module';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';

describe('DataExportModule', () => {
  it('wires the export dependencies and exports the service', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, DataExportModule) ?? [];
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      DataExportModule,
    ) as unknown[];
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      DataExportModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      DataExportModule,
    ) as unknown[];

    expect(imports).toEqual(
      expect.arrayContaining([ConfigModule, ActivityLogModule]),
    );
    expect(
      imports.some(
        (moduleRef) =>
          typeof moduleRef === 'object' &&
          moduleRef !== null &&
          (moduleRef as { module?: unknown }).module === TypeOrmModule,
      ),
    ).toBe(true);
    expect(controllers).toEqual([DataExportController]);
    expect(providers).toEqual(expect.arrayContaining([DataExportService]));
    expect(exports).toEqual([DataExportService]);
  });
});
