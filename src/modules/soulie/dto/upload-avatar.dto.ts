import { IsOptional, IsString } from 'class-validator';

export class UploadAvatarDto {
  @IsOptional()
  @IsString()
  file?: Express.Multer.File;
}
