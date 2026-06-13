import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import {
  CreateSlideDeckDto,
  GenerateSlideDeckDto,
  UpdateSlideDeckDto,
} from './dto/slide-deck.dto';
import { SlidesService } from './slides.service';

@Controller('slides')
export class SlidesController {
  constructor(private readonly slidesService: SlidesService) {}

  @Post('generate')
  generate(@Req() req: any, @Body() dto: GenerateSlideDeckDto) {
    return this.slidesService.generate(
      Number(req.user?.sub ?? req.user?.id),
      dto,
    );
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateSlideDeckDto) {
    return this.slidesService.create(
      Number(req.user?.sub ?? req.user?.id),
      dto,
    );
  }

  @Get()
  findMine(@Req() req: any) {
    return this.slidesService.findMine(Number(req.user?.sub ?? req.user?.id));
  }

  @Public()
  @Get('lessons/:lessonId')
  findByLesson(@Param('lessonId') lessonId: string) {
    return this.slidesService.findPublishedByLesson(lessonId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.slidesService.findOne(
      id,
      Number(req.user?.sub ?? req.user?.id),
    );
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSlideDeckDto,
  ) {
    return this.slidesService.update(
      id,
      Number(req.user?.sub ?? req.user?.id),
      dto,
    );
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.slidesService.remove(id, Number(req.user?.sub ?? req.user?.id));
  }

  @Post(':id/publish')
  publish(@Req() req: any, @Param('id') id: string) {
    return this.slidesService.publish(
      id,
      Number(req.user?.sub ?? req.user?.id),
    );
  }
}
