import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ExpensiveActionRateLimit } from '../../common/decorators/rate-limit.decorator';
import type { RequestWithUser } from '../../common/types/auth.types';
import { RequestDataExportDto } from './dto/request-data-export.dto';
import { DataExportService } from './data-export.service';
import { StreamableFile } from '@nestjs/common';

@ApiTags('Education Data Export')
@ApiBearerAuth('JWT-auth')
@Controller('education/exports')
export class DataExportController {
  constructor(private readonly dataExportService: DataExportService) {}

  @Get()
  @ApiOperation({ summary: 'List current user exports' })
  @ApiResponse({ status: 200, description: 'Export history returned' })
  list(@Req() req: RequestWithUser) {
    return this.dataExportService.list(req.user!.sub);
  }

  @Post()
  @ExpensiveActionRateLimit()
  @ApiOperation({ summary: 'Request a new export' })
  @ApiBody({ type: RequestDataExportDto })
  @ApiResponse({ status: 201, description: 'Export created' })
  create(@Req() req: RequestWithUser, @Body() dto: RequestDataExportDto) {
    return this.dataExportService.create(req.user!.sub, dto);
  }

  @Get(':exportId/download')
  @ApiOperation({ summary: 'Download an export file' })
  @ApiResponse({ status: 200, description: 'Export file returned' })
  async download(
    @Req() req: RequestWithUser,
    @Param('exportId') exportId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.dataExportService.download(req.user!.sub, exportId);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
    });
  }
}
