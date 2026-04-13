import {
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { ExerciseType } from '../entities/exercise.entity';

export class CreateExerciseDto {
  @IsEnum(ExerciseType)
  type: ExerciseType;

  @IsNotEmpty()
  @IsString()
  question: string;

  @IsNotEmpty()
  options: any; // JSON structure depends on type

  @IsNotEmpty()
  answer: any; // JSON structure depends on type

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  points?: number = 10;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  difficulty?: number = 1;

  @IsNotEmpty()
  @IsString()
  lessonId: string;
}

export class SubmitExerciseDto {
  @IsNotEmpty()
  answer: any; // User's answer
}

export class SubmitExercisesDto {
  @IsArray()
  answers: {
    exerciseId: string;
    answer: any;
  }[];
}

export class ExerciseResultDto {
  exerciseId: string;
  correct: boolean;
  userAnswer: any;
  correctAnswer: any;
  explanation?: string;
  pointsEarned: number;
}

export class SubmitExercisesResultDto {
  totalExercises: number;
  correctAnswers: number;
  wrongAnswers: number;
  score: number; // Percentage
  totalPoints: number;
  earnedPoints: number;
  results: ExerciseResultDto[];
}
