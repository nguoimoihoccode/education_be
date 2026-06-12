import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum EducationExportFormat {
  JSON = 'json',
  CSV = 'csv',
}

export enum EducationExportTimeRange {
  ALL = 'all',
  THIRTY_DAYS = '30days',
  YEAR_TO_DATE = 'yeartodate',
}

export enum EducationExportStatus {
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('edu_data_exports')
@Index('IDX_edu_data_exports_user_created', ['userId', 'createdAt'])
export class EducationDataExport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: EducationExportFormat,
    enumName: 'edu_export_format_enum',
  })
  format: EducationExportFormat;

  @Column({
    name: 'time_range',
    type: 'enum',
    enum: EducationExportTimeRange,
    enumName: 'edu_export_time_range_enum',
  })
  timeRange: EducationExportTimeRange;

  @Column({ name: 'data_types', type: 'jsonb' })
  dataTypes: Record<string, boolean>;

  @Column({
    type: 'enum',
    enum: EducationExportStatus,
    enumName: 'edu_export_status_enum',
  })
  status: EducationExportStatus;

  @Column({ name: 'file_name', type: 'varchar' })
  fileName: string;

  @Column({ name: 'file_path', type: 'varchar' })
  filePath: string;

  @Column({
    name: 'file_size',
    type: 'bigint',
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  fileSize: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date | null;
}
