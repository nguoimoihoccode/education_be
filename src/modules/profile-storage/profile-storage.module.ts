import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProfileStorageService } from './profile-storage.service';

@Module({
  imports: [ConfigModule],
  providers: [ProfileStorageService],
  exports: [ProfileStorageService],
})
export class ProfileStorageModule {}
