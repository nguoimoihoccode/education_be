import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Flashcard } from './flashcard.entity';

@Entity('edu_flashcard_decks')
export class FlashcardDeck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  icon: string;

  @Column({ nullable: true })
  color: string;

  @Column({ default: 0 })
  cardCount: number;

  @Column({
    type: 'enum',
    enum: ['SYSTEM', 'USER'],
    default: 'USER',
  })
  type: 'SYSTEM' | 'USER';

  @Column({ nullable: true })
  topic: string; // HSK1, HSK2, HSK3, etc.

  @Column({ default: true })
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @OneToMany(() => Flashcard, (flashcard) => flashcard.deck)
  flashcards: Flashcard[];
}
