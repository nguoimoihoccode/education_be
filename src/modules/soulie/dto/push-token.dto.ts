import { IsString, IsEnum } from 'class-validator';

export class PushTokenDto {
  @IsString()
  token: string;

  @IsEnum(['android', 'ios'])
  platform: 'android' | 'ios';
}
