import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  Language,
  Course,
  Lesson,
  Vocabulary,
  Exercise,
  CourseLevel,
  LessonType,
  ExerciseType,
  FlashcardDeck,
  Flashcard,
  Quiz,
  QuizQuestion,
} from './entities';

@Injectable()
export class EducationSeederService implements OnModuleInit {
  private readonly logger = new Logger(EducationSeederService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Language)
    private languageRepository: Repository<Language>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(Lesson)
    private lessonRepository: Repository<Lesson>,
    @InjectRepository(Vocabulary)
    private vocabularyRepository: Repository<Vocabulary>,
    @InjectRepository(Exercise)
    private exerciseRepository: Repository<Exercise>,
    @InjectRepository(FlashcardDeck)
    private flashcardDeckRepository: Repository<FlashcardDeck>,
    @InjectRepository(Flashcard)
    private flashcardRepository: Repository<Flashcard>,
    @InjectRepository(Quiz)
    private quizRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    private quizQuestionRepository: Repository<QuizQuestion>,
  ) {}

  async onModuleInit() {
    await this.seedLanguages();
    await this.seedKoreanTopik5();
    await this.seedTopik5ExamPack();
    await this.seedCourses();
    await this.seedLessons();
  }

  /**
   * Seeds a full TOPIK 5 (Level II) Korean course for learners preparing
   * for the TOPIK exam: grammar, vocabulary, reading and writing.
   * Idempotent: only runs when the course does not exist yet.
   */
  private async seedKoreanTopik5() {
    const existingCourse = await this.courseRepository.findOne({
      where: { title: 'TOPIK 5 Preparation' },
    });
    if (existingCourse) {
      this.logger.log('TOPIK 5 course already seeded, skipping...');
      return;
    }

    const korean = await this.languageRepository.findOne({
      where: { code: 'ko' },
    });
    if (!korean) {
      this.logger.warn('Korean language not found, skipping TOPIK 5 seeding');
      return;
    }

    const course = await this.courseRepository.save({
      title: 'TOPIK 5 Preparation',
      description:
        'Comprehensive preparation for the TOPIK (Test of Proficiency in Korean) Level II exam. Covers advanced grammar, high-frequency vocabulary, reading comprehension, and writing strategies for non-native learners aiming for TOPIK 5.',
      shortDescription:
        'Master TOPIK Level II grammar, vocabulary, reading & writing',
      level: CourseLevel.ADVANCED,
      estimatedHours: 45,
      languageId: korean.id,
      free: false,
      price: 69.99,
      order: 6,
    });

    const lessonsData = [
      {
        title: '핵심 문법 ① — Advanced Grammar: Cause & Concession',
        description:
          'Các cấu trúc ngữ pháp nâng cao chỉ nguyên nhân và nhượng bộ thường gặp trong TOPIK II.',
        content: `# 핵심 문법 ① — Ngữ pháp nâng cao: nguyên nhân & nhượng bộ

## Nguyên nhân / lý do (-기 때문에, -느라고)
- **-(으)므로** — vì ... (văn viết, trang trọng): 날씨가 좋으므로 산책하기 좋다.
- **-느라고** — vì... (hệ quả không mong muốn): 시험 공부하느라고 잠을 못 잤어요.
- **-는 바람에** — vì ... (sự việc gây ra hậu quả ngoài ý muốn): 비가 오는 바람에 경기가 취소됐다.

## Nhượng bộ / tuy... nhưng (-에도 불구하고, -더라도)
- **-에도 불구하고** — mặc dù ... (trang trọng): 어려움에도 불구하고 꾸준히 노력했다.
- **-(으)ㄴ/는 데다가** — bên cạnh đó còn ... (thêm vào).
- **-더라도** — dù có ... đi chăng nữa: 비가 오더라도 출발할 것이다.

## Luyện tập
Viết 3 câu dùng -에도 불구하고 và 3 câu dùng -는 바람에.`,
        type: LessonType.GRAMMAR,
        estimatedMinutes: 40,
        courseId: course.id,
        orderIndex: 1,
      },
      {
        title: '핵심 문법 ② — Advanced Grammar: Intent & Hypothetical',
        description:
          'Cấu trúc chỉ ý định, giả định và điều kiện trong văn viết TOPIK II.',
        content: `# 핵심 문법 ② — Ý định, giả định & điều kiện

## Ý định / mục đích
- **-(으)ㄹ까 봐** — lo rằng ...: 지각할까 봐 일찍 나갔다.
- **-도록** — để ... / đến mức ...: 잘 들리는도록 소리를 높였다.
- **-으려던 참이다** — đúng lúc định ...: 막 전화하려던 참이었어요.

## Giả định / điều kiện
- **-(으)ㄴ/는 한** — miễn là / chừng nào còn ...: 건강한 한 희망이 있다.
- **-기만 하면** — chỉ cần ...: 노력하기만 하면 성공할 수 있다.
- **-은/는 김에** — nhân tiện / nhờ dịp ...: 온 김에 밥도 먹고 가자.

## Luyện tập
Dịch sang tiếng Hàn: "Vì sợ bị muộn nên tôi đã đi sớm." và "Chỉ cần cố gắng thì sẽ thành công."`,
        type: LessonType.GRAMMAR,
        estimatedMinutes: 40,
        courseId: course.id,
        orderIndex: 2,
      },
      {
        title: '핵심 어휘 — Social Issues Vocabulary',
        description:
          'Từ vựng chủ đề xã hội tần suất cao trong đề thi TOPIK II (실업, 경쟁, 복지...).',
        content: `# 핵심 어휘 — Từ vựng xã hội

## Xã hội (사회)
- **실업** (실업) — thất nghiệp
- **경쟁력** (경쟁력) — năng lực cạnh tranh
- **복지** (복지) — phúc lợi
- **저출산** (저출산) — tỉ lệ sinh thấp
- **고령화** (고령화) — già hóa (dân số)
- **양극화** (양극화) — sự phân hóa giàu nghèo

## Giáo dục & đời sống
- **사교육** (사교육) — giáo dục ngoài trường lớp
- **자아실현** (자아실현) — tự hiện thực hóa bản thân
- **여유** (여유) — sự thoải mái, thong dong
- **삶의 질** (삶의 질) — chất lượng cuộc sống

## Từ kép văn viết hay gặp
- **집중력**, **판단력**, **의사소통** — sự tập trung, khả năng phán đoán, giao tiếp

Khoanh tròn các từ liên quan chủ đề '살아가기 힘든 현대 사회': 양극화, 빈부 격차, 스트레스.`,
        type: LessonType.VOCABULARY,
        estimatedMinutes: 35,
        courseId: course.id,
        orderIndex: 3,
      },
      {
        title: '핵심 어휘 — Academic & Economy Vocabulary',
        description:
          'Từ vựng học thuật và kinh tế dùng cho phần đọc hiểu và viết TOPIK II.',
        content: `# 핵심 어휘 — Từ vựng học thuật & kinh tế

## Kinh tế (경제)
- **소비** (소비) — tiêu dùng
- **물가** (물가) — giá cả hàng hóa
- **가계** (가계) — kinh tế hộ gia đình
- **수입/지출** (수입/지출) — thu nhập / chi tiêu
- **경기** (경기) — kinh tế (tình hình kinh tế)
- **투자** (투자) — đầu tư

## Học thuật (학문)
- **연구** (연구) — nghiên cứu
- **가설** (가설) — giả thuyết
- **결과** (결과) — kết quả
- **효과** (효과) — hiệu quả
- **조사** (조사) — khảo sát, điều tra
- **증거** (증거) — bằng chứng

## Câu văn mẫu
- 연구 결과에 따르면, 규칙적인 운동은 스트레스 감소에 큰 효과가 있다.
- 경기가 악화되면서 가계의 소비가 줄어들었다.

Đọc và gạch chân các danh từ: 소비, 물가, 연구, 가설, 투자 trong câu văn trên.`,
        type: LessonType.VOCABULARY,
        estimatedMinutes: 35,
        courseId: course.id,
        orderIndex: 4,
      },
      {
        title: '읽기 — Reading Comprehension Strategy',
        description:
          'Chiến lược đọc hiểu TOPIK II: kỹ thuật quét ý chính, tìm thông tin và suy luận.',
        content: `# 읽기 — Chiến lược đọc hiểu TOPIK II

## 4 dạng câu hỏi chính
1. **주제 찾기** — tìm chủ đề của đoạn văn
2. **빈칸 채우기** — điền vào chỗ trống (dựa vào ngữ cảnh và nối câu)
3. **세부 사항** — chi tiết đúng theo nội dung
4. **심경 변화** — nhận định tâm trạng của tác giả

## Kỹ thuật làm bài
- Đọc câu đầu và câu cuối của đoạn văn để nắm ý chính (주제문).
- Chú ý từ nối: 그러나 (nhưng), 따라서 (vì vậy), 즉 (tức là) để hiểu mạch lạp luận.
- Với 빈칸 채우기: chọn đáp án nào nối được về ngữ pháp lẫn ý nghĩa.

## Đoạn luyện tập
"집중력은 금방 길러지는 것이 아니다. 꾸준히 한 가지 일에 몰두하는 습관이 쌓일 때 비로소 집중력은 향상된다. 따라서 ..."

→ Chủ đề của đoạn văn là gì? Suy luận từ 단어 집중력과 향상된다.`,
        type: LessonType.READING,
        estimatedMinutes: 45,
        courseId: course.id,
        orderIndex: 5,
      },
      {
        title: '쓰기 — Writing Strategies (51~54번)',
        description:
          'Chiến lược viết TOPIK II: viết câu hoàn chỉnh và đoạn văn cho câu 51 đến 54.',
        content: `# 쓰기 — Chiến lược viết TOPIK II

## Các câu hỏi trong phần 쓰기
- **51번** — hoàn thành câu dựa trên thông tin cho sẵn.
- **52번** — hoàn thành câu với mẫu 문법 cho sẵn.
- **53번** — viết đoạn văn 200~300 chữ về biểu đồ/주제.
- **54번** — viết essay 600~700 chữ (có hạn chế từ).

## Mẹo viết câu
- Tôn trọng số âm tiết / số từ yêu cầu (적을수록 감점).
- Dùng văn phong trang trọng: -(으)ㅂ니다, -아/어야 하다, -도록 하다.
- Với biểu đồ: nêu xu hướng (증가하다, 감소하다, 유지하다) rồi đưa nguyên nhân.

## Cấu trúc câu 50+ hữu ích
- 그래프에 따르면 ... 경향을 보인다. Theo đồ thị ... có xu hướng ...
- 이러한 변화의 원인은 ... (으)로 볼 수 있다.
- 앞으로도 계속 ... (으)ㄹ 것으로 전망된다.

Viết thử: một đoạn văn 3 câu mô tả biểu đồ tỉ lệ 실업 (thất nghiệp) của Hàn Quốc.`,
        type: LessonType.PRACTICE,
        estimatedMinutes: 50,
        courseId: course.id,
        orderIndex: 6,
      },
      {
        title: '종합 실전 모의고사 — Mock Test',
        description:
          'Bài ôn tổng hợp mô phỏng trắc nghiệm TOPIK II kết hợp ngữ pháp, từ vựng và đọc hiểu.',
        content: `# 종합 실전 모의고사 — Bài ôn tổng hợp

## Hướng dẫn
Hoàn thành các câu trắc nghiệm nhằm kiểm tra tổng hợp: ngữ pháp nâng cao, từ vựng học thuật, và kỹ năng đọc hiểu tương tự đề TOPIK II thật.

## Chủ đề ôn
- Ngữ pháp: -에도 불구하고, -는 바람에, -(으)ㄹ까 봐, -기만 하면
- Từ vựng: 실업, 복지, 물가, 연구, 소비, 양극화
- Đọc hiểu: xác định 주제 và suy luận tâm trạng

## Lưu ý
- Đọc kỹ toàn bộ câu trước khi chọn đáp án.
- Phân bổ thời gian hợp lý, mỗi câu không quá 1–2 phút.`,
        type: LessonType.QUIZ,
        estimatedMinutes: 60,
        courseId: course.id,
        orderIndex: 7,
      },
    ];

    const savedLessons = await this.lessonRepository.save(lessonsData);

    const vocabByLesson: Record<string, any[]> = {
      [savedLessons[0].id]: [
        {
          word: '에도 불구하고',
          meaning: 'mặc dù ... (nhượng bộ, trang trọng)',
          pronunciation: 'e-do bul-gu-ha-go',
          partOfSpeech: 'grammar',
          example: '힘든 상황에도 불구하고 끝까지 노력했다.',
          exampleTranslation:
            'Mặc dù hoàn cảnh khó khăn nhưng đã nỗ lực đến cùng.',
          difficulty: 4,
          orderIndex: 1,
        },
        {
          word: '느라고',
          meaning: 'vì ... (hậu quả ngoài ý muốn)',
          pronunciation: 'neu-ra-go',
          partOfSpeech: 'grammar',
          example: '게임하느라고 숙제를 못 했어요.',
          exampleTranslation: 'Vì chơi game nên không làm được bài tập.',
          difficulty: 4,
          orderIndex: 2,
        },
        {
          word: '는 바람에',
          meaning: 'vì ... (gây hậu quả tiêu cực)',
          pronunciation: 'neun ba-ram-e',
          partOfSpeech: 'grammar',
          example: '길이 막히는 바람에 약속에 늦었다.',
          exampleTranslation: 'Vì đường tắc nên đến trễ cuộc hẹn.',
          difficulty: 4,
          orderIndex: 3,
        },
        {
          word: '더라도',
          meaning: 'dù có ... đi chăng nữa',
          pronunciation: 'deo-ra-do',
          partOfSpeech: 'grammar',
          example: '비가 오더라도 행사는 진행된다.',
          exampleTranslation: 'Dù trời có mưa đi nữa thì sự kiện vẫn diễn ra.',
          difficulty: 3,
          orderIndex: 4,
        },
        {
          word: '도록',
          meaning: 'để ... / đến mức ...',
          pronunciation: 'do-rok',
          partOfSpeech: 'grammar',
          example: '잘 들리도록 소리를 키웠다.',
          exampleTranslation: 'Đã vặn to âm lượng để nghe rõ.',
          difficulty: 3,
          orderIndex: 5,
        },
      ],
      [savedLessons[1].id]: [
        {
          word: '(으)ㄹ까 봐',
          meaning: 'lo rằng ...',
          pronunciation: 'kkka-bwa',
          partOfSpeech: 'grammar',
          example: '실패할까 봐 두렵다.',
          exampleTranslation: 'Lo sợ sẽ thất bại.',
          difficulty: 4,
          orderIndex: 1,
        },
        {
          word: '(으)ㄴ/는 한',
          meaning: 'chừng nào còn ... (miễn là)',
          pronunciation: '-han',
          partOfSpeech: 'grammar',
          example: '건강한 한 아무 것도 두렵지 않다.',
          exampleTranslation: 'Chừng nào còn khỏe mạnh thì không sợ gì cả.',
          difficulty: 4,
          orderIndex: 2,
        },
        {
          word: '기만 하면',
          meaning: 'chỉ cần ...',
          pronunciation: 'gi-man ha-myeon',
          partOfSpeech: 'grammar',
          example: '꾸준히 노력하기만 하면 이루어질 수 있다.',
          exampleTranslation: 'Chỉ cần nỗ lực đều đặn thì có thể đạt được.',
          difficulty: 3,
          orderIndex: 3,
        },
        {
          word: '는 김에',
          meaning: 'nhân tiện, nhờ dịp ...',
          pronunciation: 'neun gi-me',
          partOfSpeech: 'grammar',
          example: '은행에 가는 김에 우체국에도 들를게요.',
          exampleTranslation: 'Nhân tiện đi ngân hàng tôi sẽ ghé cả bưu điện.',
          difficulty: 4,
          orderIndex: 4,
        },
        {
          word: '도록 하다',
          meaning: 'hãy cố ... / để làm cho ...',
          pronunciation: 'do-rok ha-da',
          partOfSpeech: 'grammar',
          example: '항상 안전하도록 하세요.',
          exampleTranslation: 'Hãy luôn cẩn thận an toàn nhé.',
          difficulty: 3,
          orderIndex: 5,
        },
      ],
      [savedLessons[2].id]: [
        {
          word: '실업',
          meaning: 'thất nghiệp',
          pronunciation: 'si-reop',
          partOfSpeech: 'noun',
          example: '실업률이 매년 증가하고 있다.',
          exampleTranslation: 'Tỉ lệ thất nghiệp ngày càng tăng.',
          difficulty: 4,
          orderIndex: 1,
        },
        {
          word: '양극화',
          meaning: 'sự phân hóa giàu nghèo',
          pronunciation: 'yang-geuk-wha',
          partOfSpeech: 'noun',
          example: '소득 양극화가 사회 문제가 되었다.',
          exampleTranslation: 'Phân hóa thu nhập đã trở thành vấn đề xã hội.',
          difficulty: 5,
          orderIndex: 2,
        },
        {
          word: '복지',
          meaning: 'phúc lợi (xã hội)',
          pronunciation: 'bok-ji',
          partOfSpeech: 'noun',
          example: '정부는 복지 예산을 늘렸다.',
          exampleTranslation: 'Chính phủ đã tăng ngân sách phúc lợi.',
          difficulty: 4,
          orderIndex: 3,
        },
        {
          word: '저출산',
          meaning: 'tỉ lệ sinh thấp',
          pronunciation: 'jeo-chul-san',
          partOfSpeech: 'noun',
          example: '저출산 고령화 문제가 심각하다.',
          exampleTranslation:
            'Vấn đề tỉ lệ sinh thấp và già hóa dân số rất nghiêm trọng.',
          difficulty: 4,
          orderIndex: 4,
        },
        {
          word: '여유',
          meaning: 'sự thong dong, thoải mái',
          pronunciation: 'yeo-yu',
          partOfSpeech: 'noun',
          example: '시간에 여유를 두고 준비하세요.',
          exampleTranslation: 'Hãy chuẩn bị với thời gian dư dả.',
          difficulty: 3,
          orderIndex: 5,
        },
      ],
      [savedLessons[3].id]: [
        {
          word: '소비',
          meaning: 'tiêu dùng',
          pronunciation: 'so-bi',
          partOfSpeech: 'noun',
          example: '물가가 오르자 소비가 줄었다.',
          exampleTranslation: 'Giá cả tăng nên tiêu dùng giảm.',
          difficulty: 4,
          orderIndex: 1,
        },
        {
          word: '물가',
          meaning: 'giá cả hàng hóa',
          pronunciation: 'mul-ga',
          partOfSpeech: 'noun',
          example: '최근 물가가 크게 올랐다.',
          exampleTranslation: 'Gần đây giá cả tăng mạnh.',
          difficulty: 4,
          orderIndex: 2,
        },
        {
          word: '가설',
          meaning: 'giả thuyết',
          pronunciation: 'ga-seol',
          partOfSpeech: 'noun',
          example: '연구자는 가설을 세우고 실험을 진행했다.',
          exampleTranslation:
            'Nhà nghiên cứu đã đặt giả thuyết và tiến hành thí nghiệm.',
          difficulty: 5,
          orderIndex: 3,
        },
        {
          word: '연구',
          meaning: 'nghiên cứu',
          pronunciation: 'yeon-gu',
          partOfSpeech: 'noun',
          example: '이는 오랜 연구의 결과다.',
          exampleTranslation: 'Đây là kết quả của nghiên cứu lâu dài.',
          difficulty: 4,
          orderIndex: 4,
        },
        {
          word: '투자',
          meaning: 'đầu tư',
          pronunciation: 'tu-ja',
          partOfSpeech: 'noun',
          example: '교육에 대한 투자가 중요하다.',
          exampleTranslation: 'Đầu tư vào giáo dục là quan trọng.',
          difficulty: 4,
          orderIndex: 5,
        },
      ],
    };
    const allVocab = Object.entries(vocabByLesson).flatMap(
      ([lessonId, items]) => items.map((item) => ({ ...item, lessonId })),
    );

    await this.vocabularyRepository.save(allVocab);

    const exercisesByLesson: Record<string, any[]> = {
      [savedLessons[0].id]: [
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question:
            '"힘든 상황이지만 노력했다" — chọn câu dùng -(으)에도 불구하고 đúng nhất.',
          options: [
            '힘든 상황에도 불구하고 노력했다.',
            '힘들기 때문에 노력했다.',
            '힘든 만큼 노력했다.',
            '힘들수록 노력했다.',
          ],
          answer: '힘든 상황에도 불구하고 노력했다.',
          explanation:
            '-에도 불구하고 diễn tả nhượng bộ "mặc dù", phù hợp ý câu có tương phản "nhưng".',
          points: 10,
          difficulty: 4,
          orderIndex: 1,
        },
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: 'Câu nào dùng -는 바람에 thể hiện hậu quả ngoài ý muốn?',
          options: [
            '비가 오는 바람에 경기가 취소됐다.',
            '비가 와서 좋았다.',
            '비가 오면 출발한다.',
            '비가 오는 한 멈추지 않겠다.',
          ],
          answer: '비가 오는 바람에 경기가 취소됐다.',
          explanation:
            '-는 바람에 chỉ hậu quả tiêu cực ngoài ý muốn, ở đây là việc hủy trận đấu.',
          points: 10,
          difficulty: 4,
          orderIndex: 2,
        },
      ],
      [savedLessons[1].id]: [
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question:
            'Chọn từ nối phù hợp cho chỗ trống: "노력하기만 ____ 성공할 수 있다."',
          options: ['하면', '하니까', '하도록', '하려면'],
          answer: '하면',
          explanation:
            '-기만 하면 nghĩa là "chỉ cần ... là", đúng với cấu trúc điều kiện.',
          points: 10,
          difficulty: 4,
          orderIndex: 1,
        },
        {
          type: ExerciseType.FILL_BLANK,
          question:
            'Điền vào chỗ trống: "실패할 ____ ____ 두렵다." (lo rằng sẽ thất bại)',
          options: null,
          answer: '까 봐',
          explanation:
            '-(으)ㄹ까 봐 diễn tả nỗi lo về một sự việc có thể xảy ra.',
          points: 15,
          difficulty: 5,
          orderIndex: 2,
        },
      ],
      [savedLessons[2].id]: [
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: '"실업" có nghĩa là gì?',
          options: ['Thất nghiệp', 'Phúc lợi', 'Đầu tư', 'Dân số'],
          answer: 'Thất nghiệp',
          explanation: '실업 = thất nghiệp (unemployment).',
          points: 10,
          difficulty: 3,
          orderIndex: 1,
        },
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: 'Từ nào chỉ "sự phân hóa giàu nghèo"?',
          options: ['양극화', '복지', '여유', '물가'],
          answer: '양극화',
          explanation: '양극화 = sự phân hóa/trái chiều (polarization).',
          points: 10,
          difficulty: 4,
          orderIndex: 2,
        },
        {
          type: ExerciseType.TRUE_FALSE,
          question: '"고령화" có nghĩa là tỉ lệ sinh thấp. Đúng hay sai?',
          options: ['Đúng', 'Sai'],
          answer: 'Sai',
          explanation:
            '고령화 = già hóa dân số, còn 저출산 mới là tỉ lệ sinh thấp.',
          points: 10,
          difficulty: 3,
          orderIndex: 3,
        },
      ],
      [savedLessons[3].id]: [
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: '"물가" chỉ điều gì?',
          options: ['Giá cả hàng hóa', 'Tiêu dùng', 'Thu nhập', 'Chi tiêu'],
          answer: 'Giá cả hàng hóa',
          explanation: '물가 = giá cả hàng hóa (prices of goods).',
          points: 10,
          difficulty: 3,
          orderIndex: 1,
        },
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: '"가설" có nghĩa là gì?',
          options: ['Giả thuyết', 'Kết quả', 'Bằng chứng', 'Khảo sát'],
          answer: 'Giả thuyết',
          explanation: '가설 = giả thuyết (hypothesis).',
          points: 10,
          difficulty: 4,
          orderIndex: 2,
        },
      ],
      [savedLessons[4].id]: [
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question:
            'Đoạn văn tập trung vào việc gì? "집중력은 꾸준한 습관으로 향상된다." (Chủ đề chính)',
          options: [
            'Cách nâng cao sự tập trung',
            'Tác hại của việc chơi game',
            'Lợi ích của việc nghỉ ngơi',
            'Sự quan trọng của trí nhớ',
          ],
          answer: 'Cách nâng cao sự tập trung',
          explanation:
            'Từ khóa 집중력 (tập trung) + 향상된다 (được nâng cao) → chủ đề là cải thiện sự tập trung.',
          points: 10,
          difficulty: 4,
          orderIndex: 1,
        },
        {
          type: ExerciseType.FILL_BLANK,
          question:
            'Từ nối phù hợp cho chỗ trống: "수입이 줄었다. ____ 소비를 줄였다." (vì vậy)',
          options: null,
          answer: '따라서',
          explanation: '따라서 = vì vậy (therefore), nối ý hệ quả.',
          points: 15,
          difficulty: 5,
          orderIndex: 2,
        },
      ],
      [savedLessons[5].id]: [
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: 'Câu 53 trong phần 쓰기 yêu cầu viết bao nhiêu chữ?',
          options: ['200~300 chữ', '50~100 chữ', '600~700 chữ', 'Chỉ 1 câu'],
          answer: '200~300 chữ',
          explanation:
            'Câu 53 yêu cầu viết đoạn văn 200~300 chữ về biểu đồ hoặc chủ đề.',
          points: 10,
          difficulty: 3,
          orderIndex: 1,
        },
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question:
            'Câu nào dùng văn phong trang trọng phù hợp phần viết TOPIK II?',
          options: [
            '실업률이 증가하는 경향을 보인다.',
            '실업률이 늘고 있지.',
            '실업률이 또 올랐어요.',
            '실업률이 많아지네.',
          ],
          answer: '실업률이 증가하는 경향을 보인다.',
          explanation:
            'Phần viết TOPIK II cần văn phong -(으)ㅂ니다 trang trọng; đáp án đầu dùng cách diễn đạt khách quan.',
          points: 10,
          difficulty: 4,
          orderIndex: 2,
        },
      ],
      [savedLessons[6].id]: [
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: 'Mock test: "어려움에도 ____ 꾸준히 노력했다."',
          options: ['불구하고', '따져서', '비롯해', '통해'],
          answer: '불구하고',
          explanation:
            '-에도 불구하고: mặc dù khó khăn nhưng vẫn nỗ lực đều đặn.',
          points: 10,
          difficulty: 4,
          orderIndex: 1,
        },
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: 'Mock test: "경기가 악화되면서 가계의 ____이 줄어들었다."',
          options: ['소비', '실업', '연구', '복지'],
          answer: '소비',
          explanation:
            'Kinh tế xấu đi → tiêu dùng của các hộ gia đình giảm; 소비 = tiêu dùng.',
          points: 10,
          difficulty: 4,
          orderIndex: 2,
        },
        {
          type: ExerciseType.TRUE_FALSE,
          question:
            'Mock test: Từ nối "그러나" diễn tả mối quan hệ nhân quả. Đúng hay sai?',
          options: ['Đúng', 'Sai'],
          answer: 'Sai',
          explanation:
            '그러나 = "nhưng" (chỉ đối lập), còn поэтому/quan hệ nhân quả dùng 따라서.',
          points: 10,
          difficulty: 3,
          orderIndex: 3,
        },
      ],
    };
    const allExercises = Object.entries(exercisesByLesson).flatMap(
      ([lessonId, items]) => items.map((item) => ({ ...item, lessonId })),
    );

    await this.exerciseRepository.save(allExercises);

    await this.courseRepository.update(course.id, {
      totalLessons: savedLessons.length,
    });

    this.logger.log(
      `TOPIK 5 course seeded: ${savedLessons.length} lessons, ${allVocab.length} vocabularies, ${allExercises.length} exercises`,
    );
  }

  private async seedLanguages() {
    const existingCount = await this.languageRepository.count();
    if (existingCount > 0) {
      this.logger.log('Languages already seeded, skipping...');
      return;
    }

    const languages = [
      {
        code: 'en',
        name: 'English',
        nativeName: 'English',
        flag: '🇺🇸',
        order: 1,
      },
      {
        code: 'ja',
        name: 'Japanese',
        nativeName: '日本語',
        flag: '🇯🇵',
        order: 2,
      },
      {
        code: 'ko',
        name: 'Korean',
        nativeName: '한국어',
        flag: '🇰🇷',
        order: 3,
      },
      { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', order: 4 },
      {
        code: 'vi',
        name: 'Vietnamese',
        nativeName: 'Tiếng Việt',
        flag: '🇻🇳',
        order: 5,
      },
    ];

    await this.languageRepository.save(languages);
    this.logger.log('Languages seeded successfully!');
  }

  private async seedCourses() {
    const existingCount = await this.courseRepository.count();
    if (existingCount > 0) {
      this.logger.log('Courses already seeded, skipping...');
      return;
    }

    const english = await this.languageRepository.findOne({
      where: { code: 'en' },
    });
    const japanese = await this.languageRepository.findOne({
      where: { code: 'ja' },
    });

    if (!english || !japanese) {
      this.logger.warn('Languages not found, skipping course seeding');
      return;
    }

    const courses = [
      // English Courses
      {
        title: 'English for Beginners',
        description:
          'Start your English journey with basic vocabulary and grammar. Perfect for absolute beginners.',
        shortDescription: 'Learn basic English from scratch',
        level: CourseLevel.BEGINNER,
        estimatedHours: 20,
        languageId: english.id,
        free: true,
        order: 1,
      },
      {
        title: 'Everyday English Conversations',
        description:
          'Master common phrases and expressions used in daily conversations.',
        shortDescription: 'Speak English confidently in daily life',
        level: CourseLevel.ELEMENTARY,
        estimatedHours: 15,
        languageId: english.id,
        free: true,
        order: 2,
      },
      {
        title: 'Business English',
        description:
          'Professional English for workplace communication, meetings, and presentations.',
        shortDescription: 'English for professional settings',
        level: CourseLevel.INTERMEDIATE,
        estimatedHours: 25,
        languageId: english.id,
        free: false,
        price: 29.99,
        order: 3,
      },
      // Japanese Courses
      {
        title: 'Hiragana & Katakana Mastery',
        description:
          'Learn to read and write Japanese syllabaries. Essential foundation for Japanese learning.',
        shortDescription: 'Master Japanese writing systems',
        level: CourseLevel.BEGINNER,
        estimatedHours: 10,
        languageId: japanese.id,
        free: true,
        order: 1,
      },
      {
        title: 'JLPT N5 Preparation',
        description:
          'Comprehensive preparation for JLPT N5 exam with vocabulary, grammar, and practice tests.',
        shortDescription: 'Pass JLPT N5 with confidence',
        level: CourseLevel.BEGINNER,
        estimatedHours: 40,
        languageId: japanese.id,
        free: false,
        price: 49.99,
        order: 2,
      },
    ];

    await this.courseRepository.save(courses);
    this.logger.log('Courses seeded successfully!');
  }

  private async seedLessons() {
    const existingCount = await this.lessonRepository.count();
    if (existingCount > 0) {
      this.logger.log('Lessons already seeded, skipping...');
      return;
    }

    const beginnerEnglish = await this.courseRepository.findOne({
      where: { title: 'English for Beginners' },
    });

    if (!beginnerEnglish) {
      this.logger.warn(
        'Beginner English course not found, skipping lesson seeding',
      );
      return;
    }

    const lessons = [
      {
        title: 'Greetings & Introductions',
        description:
          'Learn how to greet people and introduce yourself in English.',
        content: `
# Greetings & Introductions

## Common Greetings
- **Hello** - A formal greeting
- **Hi** - An informal greeting
- **Good morning** - Used before noon
- **Good afternoon** - Used after noon until evening
- **Good evening** - Used in the evening

## Introducing Yourself
- "My name is [name]."
- "I'm [name]."
- "Nice to meet you!"

## Practice
Try saying these phrases out loud!
        `,
        type: LessonType.VOCABULARY,
        estimatedMinutes: 15,
        courseId: beginnerEnglish.id,
        orderIndex: 1,
      },
      {
        title: 'Numbers 1-20',
        description: 'Learn to count from 1 to 20 in English.',
        content: `
# Numbers 1-20

## Basic Numbers
| Number | Word |
|--------|------|
| 1 | One |
| 2 | Two |
| 3 | Three |
| 4 | Four |
| 5 | Five |
| 6 | Six |
| 7 | Seven |
| 8 | Eight |
| 9 | Nine |
| 10 | Ten |

## Teens
| Number | Word |
|--------|------|
| 11 | Eleven |
| 12 | Twelve |
| 13 | Thirteen |
| 14 | Fourteen |
| 15 | Fifteen |
| 16 | Sixteen |
| 17 | Seventeen |
| 18 | Eighteen |
| 19 | Nineteen |
| 20 | Twenty |
        `,
        type: LessonType.VOCABULARY,
        estimatedMinutes: 20,
        courseId: beginnerEnglish.id,
        orderIndex: 2,
      },
      {
        title: 'Days of the Week',
        description: 'Learn the days of the week in English.',
        type: LessonType.VOCABULARY,
        estimatedMinutes: 10,
        courseId: beginnerEnglish.id,
        orderIndex: 3,
      },
    ];

    const savedLessons = await this.lessonRepository.save(lessons);

    // Update course total lessons
    await this.courseRepository.update(beginnerEnglish.id, {
      totalLessons: savedLessons.length,
    });

    // Seed vocabulary for first lesson
    const greetingsLesson = savedLessons[0];
    const vocabularies = [
      {
        word: 'Hello',
        meaning: 'Xin chào',
        pronunciation: '/həˈloʊ/',
        partOfSpeech: 'interjection',
        example: 'Hello, how are you?',
        exampleTranslation: 'Xin chào, bạn khỏe không?',
        lessonId: greetingsLesson.id,
        orderIndex: 1,
      },
      {
        word: 'Goodbye',
        meaning: 'Tạm biệt',
        pronunciation: '/ˌɡʊdˈbaɪ/',
        partOfSpeech: 'interjection',
        example: 'Goodbye, see you tomorrow!',
        exampleTranslation: 'Tạm biệt, hẹn gặp lại ngày mai!',
        lessonId: greetingsLesson.id,
        orderIndex: 2,
      },
      {
        word: 'Thank you',
        meaning: 'Cảm ơn',
        pronunciation: '/θæŋk juː/',
        partOfSpeech: 'phrase',
        example: 'Thank you for your help.',
        exampleTranslation: 'Cảm ơn bạn đã giúp đỡ.',
        lessonId: greetingsLesson.id,
        orderIndex: 3,
      },
      {
        word: 'Please',
        meaning: 'Làm ơn',
        pronunciation: '/pliːz/',
        partOfSpeech: 'adverb',
        example: 'Please sit down.',
        exampleTranslation: 'Làm ơn ngồi xuống.',
        lessonId: greetingsLesson.id,
        orderIndex: 4,
      },
      {
        word: 'Excuse me',
        meaning: 'Xin lỗi (để hỏi)',
        pronunciation: '/ɪkˈskjuːz miː/',
        partOfSpeech: 'phrase',
        example: 'Excuse me, where is the station?',
        exampleTranslation: 'Xin lỗi, nhà ga ở đâu?',
        lessonId: greetingsLesson.id,
        orderIndex: 5,
      },
    ];

    await this.vocabularyRepository.save(vocabularies);

    // Seed exercises for first lesson
    const exercises = [
      {
        type: ExerciseType.MULTIPLE_CHOICE,
        question: 'What does "Hello" mean in Vietnamese?',
        options: ['Tạm biệt', 'Xin chào', 'Cảm ơn', 'Xin lỗi'],
        answer: 'Xin chào',
        explanation: '"Hello" là lời chào thông dụng trong tiếng Anh.',
        points: 10,
        lessonId: greetingsLesson.id,
        orderIndex: 1,
      },
      {
        type: ExerciseType.MULTIPLE_CHOICE,
        question: 'Which phrase means "Thank you"?',
        options: ['Please', 'Hello', 'Thank you', 'Goodbye'],
        answer: 'Thank you',
        explanation: '"Thank you" nghĩa là "Cảm ơn".',
        points: 10,
        lessonId: greetingsLesson.id,
        orderIndex: 2,
      },
      {
        type: ExerciseType.FILL_BLANK,
        question: 'Complete: "_____, how are you?"',
        options: null,
        answer: 'Hello',
        explanation: 'Câu chào hỏi thông dụng: "Hello, how are you?"',
        points: 15,
        lessonId: greetingsLesson.id,
        orderIndex: 3,
      },
    ];

    await this.exerciseRepository.save(exercises);

    this.logger.log(
      'Lessons, vocabularies, and exercises seeded successfully!',
    );
  }

  private mapQuizQuestions(
    questions: any[],
    quizId: string,
  ): DeepPartial<QuizQuestion>[] {
    return questions.map((q: any) => {
      const { options, ...rest } = q;
      const payload: DeepPartial<QuizQuestion> = { ...rest, quizId };
      if (options != null) {
        payload.options = options;
      }
      return payload;
    });
  }

  private async seedTopik5ExamPack() {
    const course = await this.courseRepository.findOne({
      where: { title: 'TOPIK 5 Preparation' },
    });
    if (!course) {
      this.logger.warn('TOPIK 5 course not found, skipping exam pack seeding');
      return;
    }

    const user = await this.userRepository.findOne({ where: {} });
    if (!user) {
      this.logger.warn('No user found, skipping exam pack seeding');
      return;
    }

    // ---- 1. Topical vocabulary lessons ----
    const existingVocabLessons = await this.lessonRepository.find({
      where: { courseId: course.id },
    });
    const topicLessons = await this.ensureTopicLessons(
      course,
      existingVocabLessons,
    );

    // ---- 3. SYSTEM flashcard deck (must exist before flashcards) ----
    const deck = await this.ensureTopikFlashcardDeck(user);

    // ---- 2. Vocabulary + flashcards from topics ----
    const seeded = await this.seedTopicVocabulary(topicLessons, user, deck.id);

    // ---- 2b. Exercises for topic lessons ----
    await this.seedTopicExercises(topicLessons);

    await this.syncDeckCount(deck.id);

    // ---- 4. Mock exam quizzes ----
    await this.seedTopikMockQuizzes(user);

    this.logger.log(
      `TOPIK 5 exam pack seeded: ${topicLessons.length} topic lessons, ${seeded.allVocab.length} vocabularies, ${seeded.cards} flashcards`,
    );
  }

  private async ensureTopikFlashcardDeck(user: User): Promise<FlashcardDeck> {
    const existingDeck = await this.flashcardDeckRepository.findOne({
      where: { name: 'TOPIK 5 핵심 어휘', type: 'SYSTEM' },
    });
    if (existingDeck) {
      return existingDeck;
    }
    return this.flashcardDeckRepository.save({
      name: 'TOPIK 5 핵심 어휘',
      description: 'Từ vựng cốt lõi TOPIK 5 theo chủ đề.',
      icon: '🎯',
      color: '#8b5cf6',
      type: 'SYSTEM',
      topic: 'TOPIK5',
      isPublic: true,
      userId: user.id,
    });
  }

  private async syncDeckCount(deckId: string) {
    const deckCount = await this.flashcardRepository.count({
      where: { deckId },
    });
    await this.flashcardDeckRepository.update(deckId, {
      cardCount: deckCount,
    });
    this.logger.log(`TOPIK 5 flashcard deck: ${deckCount} cards`);
  }

  private async ensureTopicLessons(
    course: Course,
    existing: Lesson[],
  ): Promise<Lesson[]> {
    const topics: Array<{ title: string; order: number }> = [
      {
        title: '어휘 · 사회와 교육 (Vocabulary: Society & Education)',
        order: 8,
      },
      {
        title: '어휘 · 경제와 직장 (Vocabulary: Economy & Work)',
        order: 9,
      },
      {
        title: '어휘 · 문화와 일상 (Vocabulary: Culture & Daily Life)',
        order: 10,
      },
      {
        title: '어휘 · 과학과 문명 (Vocabulary: Science & Civilization)',
        order: 11,
      },
      {
        title: '어휘 · 감정과 성격 (Vocabulary: Emotions & Personality)',
        order: 12,
      },
    ];

    const result: Lesson[] = [];
    for (const topic of topics) {
      let lesson = existing.find((l) => l.title === topic.title);
      if (!lesson) {
        lesson = await this.lessonRepository.save({
          title: topic.title,
          description: `Từ vựng TOPIK 5 theo chủ đề: ${this.extractTopic(topic.title)}.`,
          content: `# Từ vựng TOPIK 5 — ${this.extractTopic(topic.title)}\n\nHọc tập và ôn luyện các từ vựng tần suất cao theo chủ đề để vững vàng hơn trong phần 읽기/듣기 của đề thi TOPIK II.`,
          type: LessonType.VOCABULARY,
          estimatedMinutes: 30,
          courseId: course.id,
          orderIndex: topic.order,
        });
      }
      result.push(lesson);
    }

    const totalLessons = await this.lessonRepository.count({
      where: { courseId: course.id },
    });
    await this.courseRepository.update(course.id, {
      totalLessons,
    });
    return result;
  }

  private extractTopic(title: string): string {
    return title.replace(/^어휘 · .+ \((.+)\)$/, '$1');
  }

  private async seedTopicVocabulary(
    lessons: Lesson[],
    user: User,
    deckId: string,
  ): Promise<{ allVocab: Vocabulary[]; cards: number }> {
    const topicVocab: Array<{ words: any[]; lessonId: string }> = [
      {
        lessonId: lessons[0].id,
        words: [
          {
            word: '어린이집',
            meaning: 'nhà trẻ',
            pronunciation: 'eo-rin-i-jip',
            partOfSpeech: 'noun',
            example: '아이가 어린이집에 다닌다.',
            exampleTranslation: 'Bé đang học ở nhà trẻ.',
            difficulty: 3,
          },
          {
            word: '청소년',
            meaning: 'thanh thiếu niên',
            pronunciation: 'cheong-so-nyeon',
            partOfSpeech: 'noun',
            example: '청소년의 인터넷 사용이 늘었다.',
            exampleTranslation:
              'Việc sử dụng internet của thanh thiếu niên tăng.',
            difficulty: 3,
          },
          {
            word: '학력',
            meaning: 'trình độ học vấn',
            pronunciation: 'hang-nyeok',
            partOfSpeech: 'noun',
            example: '학력보다 능력이 중요하다.',
            exampleTranslation: 'Năng lực quan trọng hơn trình độ học vấn.',
            difficulty: 4,
          },
          {
            word: '입시',
            meaning: 'kỳ thi tuyển sinh',
            pronunciation: 'ip-si',
            partOfSpeech: 'noun',
            example: '입시 경쟁이 매우 치열하다.',
            exampleTranslation: 'Cạnh tranh tuyển sinh rất gay gắt.',
            difficulty: 4,
          },
          {
            word: '공교육',
            meaning: 'giáo dục công lập',
            pronunciation: 'gong-gyo-yuk',
            partOfSpeech: 'noun',
            example: '공교육의 질을 높여야 한다.',
            exampleTranslation: 'Cần nâng cao chất lượng giáo dục công lập.',
            difficulty: 4,
          },
          {
            word: '다문화',
            meaning: 'đa văn hóa',
            pronunciation: 'da-mun-hwa',
            partOfSpeech: 'noun',
            example: '다문화 사회가 되어 가고 있다.',
            exampleTranslation: 'Xã hội đang dần trở thành đa văn hóa.',
            difficulty: 4,
          },
          {
            word: '양육',
            meaning: 'việc nuôi dạy',
            pronunciation: 'yang-yuk',
            partOfSpeech: 'noun',
            example: '양육에 드는 비용이 부담스럽다.',
            exampleTranslation: 'Chi phí nuôi dạy con cái là gánh nặng.',
            difficulty: 4,
          },
          {
            word: '소통',
            meaning: 'sự giao tiếp, trao đổi',
            pronunciation: 'so-tong',
            partOfSpeech: 'noun',
            example: '가족 간의 소통이 중요하다.',
            exampleTranslation:
              'Sự giao tiếp giữa các thành viên gia đình rất quan trọng.',
            difficulty: 3,
          },
          {
            word: '취학',
            meaning: 'đi học (vào trường)',
            pronunciation: 'chwi-hak',
            partOfSpeech: 'noun',
            example: '취학 연령이 되면 학교에 간다.',
            exampleTranslation: 'Đến tuổi đi học thì vào trường.',
            difficulty: 4,
          },
          {
            word: '난독증',
            meaning: 'chứng khó đọc',
            pronunciation: 'nan-dok-jeung',
            partOfSpeech: 'noun',
            example: '난독증 아동을 위한 지원이 필요하다.',
            exampleTranslation: 'Cần hỗ trợ trẻ mắc chứng khó đọc.',
            difficulty: 5,
          },
          {
            word: '견학',
            meaning: 'đi tham quan thực tế',
            pronunciation: 'gyeon-hak',
            partOfSpeech: 'noun',
            example: '박물관으로 견학을 갔다.',
            exampleTranslation: 'Đã đi tham quan thực tế tại bảo tàng.',
            difficulty: 4,
          },
          {
            word: '평등',
            meaning: 'sự bình đẳng',
            pronunciation: 'pyeong-deung',
            partOfSpeech: 'noun',
            example: '교육의 기회가 평등해야 한다.',
            exampleTranslation: 'Cơ hội giáo dục phải bình đẳng.',
            difficulty: 3,
          },
          {
            word: '인재',
            meaning: 'nhân tài',
            pronunciation: 'in-jae',
            partOfSpeech: 'noun',
            example: '나라가 큰 인재를 필요로 한다.',
            exampleTranslation: 'Đất nước cần nhân tài lớn.',
            difficulty: 3,
          },
          {
            word: '진학',
            meaning: 'lên cấp học cao hơn',
            pronunciation: 'jin-hak',
            partOfSpeech: 'noun',
            example: '대학에 진학하기 위해 노력한다.',
            exampleTranslation: 'Nỗ lực để học lên đại học.',
            difficulty: 3,
          },
        ],
      },
      {
        lessonId: lessons[1].id,
        words: [
          {
            word: '취업',
            meaning: 'kiếm việc làm',
            pronunciation: 'chwi-eop',
            partOfSpeech: 'noun',
            example: '졸업 후 취업을 준비하고 있다.',
            exampleTranslation: 'Sau tốt nghiệp đang chuẩn bị kiếm việc.',
            difficulty: 3,
          },
          {
            word: '실적',
            meaning: 'thành tích, kết quả',
            pronunciation: 'sil-jeok',
            partOfSpeech: 'noun',
            example: '이번 분기 실적이 좋았다.',
            exampleTranslation: 'Kết quả kinh doanh quý này tốt.',
            difficulty: 4,
          },
          {
            word: '급여',
            meaning: 'tiền lương',
            pronunciation: 'geup-yeo',
            partOfSpeech: 'noun',
            example: '급여가 늦게 지급되었다.',
            exampleTranslation: 'Lương bị trả chậm.',
            difficulty: 3,
          },
          {
            word: '승진',
            meaning: 'thăng chức',
            pronunciation: 'seung-jin',
            partOfSpeech: 'noun',
            example: '열심히 일하면 승진할 수 있다.',
            exampleTranslation: 'Làm việc chăm chỉ sẽ được thăng chức.',
            difficulty: 3,
          },
          {
            word: '퇴직',
            meaning: 'về hưu, nghỉ việc',
            pronunciation: 'toe-jik',
            partOfSpeech: 'noun',
            example: '퇴직 후에도 일을 계속했다.',
            exampleTranslation: 'Sau khi về hưu vẫn tiếp tục làm việc.',
            difficulty: 4,
          },
          {
            word: '출근',
            meaning: 'đi làm',
            pronunciation: 'chul-geun',
            partOfSpeech: 'noun',
            example: '매일 아침 9시에 출근한다.',
            exampleTranslation: 'Mỗi sáng đi làm lúc 9 giờ.',
            difficulty: 2,
          },
          {
            word: '퇴근',
            meaning: 'tan làm',
            pronunciation: 'toe-geun',
            partOfSpeech: 'noun',
            example: '퇴근 후 운동을 한다.',
            exampleTranslation: 'Sau khi tan làm thì đi tập thể dục.',
            difficulty: 2,
          },
          {
            word: '연봉',
            meaning: 'lương năm',
            pronunciation: 'yeon-bong',
            partOfSpeech: 'noun',
            example: '연봉이 인상되었다.',
            exampleTranslation: 'Lương năm được tăng.',
            difficulty: 3,
          },
          {
            word: '직장인',
            meaning: 'người đi làm',
            pronunciation: 'jik-jang-in',
            partOfSpeech: 'noun',
            example: '직장인들의 스트레스가 크다.',
            exampleTranslation: 'Người đi làm căng thẳng nhiều.',
            difficulty: 3,
          },
          {
            word: '업무',
            meaning: 'công việc',
            pronunciation: 'eom-mu',
            partOfSpeech: 'noun',
            example: '업무가 많아서 야근한다.',
            exampleTranslation: 'Nhiều việc nên phải tăng ca.',
            difficulty: 3,
          },
          {
            word: '근무',
            meaning: 'làm việc (tại cơ quan)',
            pronunciation: 'geun-mu',
            partOfSpeech: 'noun',
            example: '회사에서 5년째 근무 중이다.',
            exampleTranslation: 'Đang làm việc tại công ty được 5 năm.',
            difficulty: 3,
          },
          {
            word: '면접',
            meaning: 'phỏng vấn',
            pronunciation: 'myeon-jeop',
            partOfSpeech: 'noun',
            example: '면접에서 긴장하지 말아야 한다.',
            exampleTranslation: 'Không nên căng thẳng trong buổi phỏng vấn.',
            difficulty: 3,
          },
          {
            word: '계약',
            meaning: 'hợp đồng',
            pronunciation: 'gye-yak',
            partOfSpeech: 'noun',
            example: '계약서에 서명했다.',
            exampleTranslation: 'Đã ký vào hợp đồng.',
            difficulty: 3,
          },
          {
            word: '도급',
            meaning: 'khoán việc',
            pronunciation: 'do-geup',
            partOfSpeech: 'noun',
            example: '건설 도급을 따냈다.',
            exampleTranslation: 'Đã thắng thầu khoán xây dựng.',
            difficulty: 5,
          },
        ],
      },
      {
        lessonId: lessons[2].id,
        words: [
          {
            word: '명절',
            meaning: 'ngày lễ truyền thống',
            pronunciation: 'myeong-jeol',
            partOfSpeech: 'noun',
            example: '명절에 고향에 간다.',
            exampleTranslation: 'Về quê vào ngày lễ truyền thống.',
            difficulty: 3,
          },
          {
            word: '차림',
            meaning: 'sự sắp bày, trang phục',
            pronunciation: 'cha-rim',
            partOfSpeech: 'noun',
            example: '제사상 차림이 복잡하다.',
            exampleTranslation: 'Việc bày mâm cỗ cúng phức tạp.',
            difficulty: 4,
          },
          {
            word: '례절',
            meaning: 'phép tắc lễ nghi',
            pronunciation: 'rye-jeol',
            partOfSpeech: 'noun',
            example: '어른께 반드시 말씀을 하게 됩니다.',
            exampleTranslation: 'Lễ phép với người lớn tuổi.',
            difficulty: 4,
          },
          {
            word: '의상',
            meaning: 'trang phục',
            pronunciation: 'ui-sang',
            partOfSpeech: 'noun',
            example: '전통 의상을 입었다.',
            exampleTranslation: 'Đã mặc trang phục truyền thống.',
            difficulty: 3,
          },
          {
            word: '행사',
            meaning: 'sự kiện, lễ hội',
            pronunciation: 'haeng-sa',
            partOfSpeech: 'noun',
            example: '마을 행사에 참여했다.',
            exampleTranslation: 'Đã tham gia sự kiện của làng.',
            difficulty: 3,
          },
          {
            word: '주거',
            meaning: 'nơi cư trú',
            pronunciation: 'ju-geo',
            partOfSpeech: 'noun',
            example: '주거 환경이 개선되었다.',
            exampleTranslation: 'Môi trường cư trú được cải thiện.',
            difficulty: 4,
          },
          {
            word: '이웃',
            meaning: 'hàng xóm',
            pronunciation: 'i-ut',
            partOfSpeech: 'noun',
            example: '이웃과 잘 지내야 한다.',
            exampleTranslation: 'Nên sống hòa thuận với hàng xóm.',
            difficulty: 2,
          },
          {
            word: '식문화',
            meaning: 'văn hóa ẩm thực',
            pronunciation: 'sik-mun-hwa',
            partOfSpeech: 'noun',
            example: '김치는 한국의 대표 식문화다.',
            exampleTranslation:
              'Kimchi là văn hóa ẩm thực tiêu biểu của Hàn Quốc.',
            difficulty: 3,
          },
          {
            word: '전통',
            meaning: 'truyền thống',
            pronunciation: 'jeon-tong',
            partOfSpeech: 'noun',
            example: '전통을 지키는 것이 중요하다.',
            exampleTranslation: 'Việc giữ gìn truyền thống rất quan trọng.',
            difficulty: 2,
          },
          {
            word: '관례',
            meaning: 'tập tục, lệ cũ',
            pronunciation: 'gwan-rye',
            partOfSpeech: 'noun',
            example: '이것은 오랜 관례다.',
            exampleTranslation: 'Đây là một tập tục lâu đời.',
            difficulty: 4,
          },
          {
            word: '마을',
            meaning: 'làng',
            pronunciation: 'ma-eul',
            partOfSpeech: 'noun',
            example: '조용한 마을에 산다.',
            exampleTranslation: 'Sống ở một ngôi làng yên tĩnh.',
            difficulty: 2,
          },
          {
            word: '축제',
            meaning: 'lễ hội',
            pronunciation: 'chuk-je',
            partOfSpeech: 'noun',
            example: '봄마다 꽃 축제를 연다.',
            exampleTranslation: 'Mỗi mùa xuân mở lễ hội hoa.',
            difficulty: 2,
          },
          {
            word: '유래',
            meaning: 'nguồn gốc',
            pronunciation: 'yu-rae',
            partOfSpeech: 'noun',
            example: '이 풍습의 유래를 알아보자.',
            exampleTranslation: 'Tìm hiểu nguồn gốc của phong tục này.',
            difficulty: 4,
          },
          {
            word: '민족',
            meaning: 'dân tộc',
            pronunciation: 'min-jok',
            partOfSpeech: 'noun',
            example: '우리 민족의 역사가 오래다.',
            exampleTranslation: 'Lịch sử dân tộc chúng ta rất lâu đời.',
            difficulty: 3,
          },
        ],
      },
      {
        lessonId: lessons[3].id,
        words: [
          {
            word: '발전',
            meaning: 'sự phát triển',
            pronunciation: 'bal-jeon',
            partOfSpeech: 'noun',
            example: '과학 기술이 발전했다.',
            exampleTranslation: 'Khoa học kỹ thuật đã phát triển.',
            difficulty: 3,
          },
          {
            word: '발명',
            meaning: 'phát minh',
            pronunciation: 'bal-myeong',
            partOfSpeech: 'noun',
            example: '전화기를 발명한 사람은 벨이다.',
            exampleTranslation: 'Người phát minh ra điện thoại là Bell.',
            difficulty: 3,
          },
          {
            word: '전기',
            meaning: 'điện',
            pronunciation: 'jeon-gi',
            partOfSpeech: 'noun',
            example: '전기 요금이 오른다.',
            exampleTranslation: 'Tiền điện tăng.',
            difficulty: 2,
          },
          {
            word: '에너지',
            meaning: 'năng lượng',
            pronunciation: 'e-neo-ji',
            partOfSpeech: 'noun',
            example: '태양 에너지를 이용한다.',
            exampleTranslation: 'Sử dụng năng lượng mặt trời.',
            difficulty: 2,
          },
          {
            word: '중력',
            meaning: 'trọng lực',
            pronunciation: 'jung-nyeok',
            partOfSpeech: 'noun',
            example: '중력은 물체를 끌어당긴다.',
            exampleTranslation: 'Trọng lực hút các vật thể.',
            difficulty: 4,
          },
          {
            word: '유전자',
            meaning: 'gen',
            pronunciation: 'yu-jeon-ja',
            partOfSpeech: 'noun',
            example: '유전자 정보를 연구한다.',
            exampleTranslation: 'Nghiên cứu thông tin gen.',
            difficulty: 5,
          },
          {
            word: '기후',
            meaning: 'khí hậu',
            pronunciation: 'gi-hu',
            partOfSpeech: 'noun',
            example: '기후 변화가 심해졌다.',
            exampleTranslation: 'Biến đổi khí hậu ngày càng nghiêm trọng.',
            difficulty: 3,
          },
          {
            word: '오염',
            meaning: 'sự ô nhiễm',
            pronunciation: 'o-yeom',
            partOfSpeech: 'noun',
            example: '공기 오염을 줄여야 한다.',
            exampleTranslation: 'Cần giảm ô nhiễm không khí.',
            difficulty: 3,
          },
          {
            word: '재활용',
            meaning: 'tái chế',
            pronunciation: 'jae-hwal-yong',
            partOfSpeech: 'noun',
            example: '쓰레기를 재활용한다.',
            exampleTranslation: 'Tái chế rác thải.',
            difficulty: 3,
          },
          {
            word: '자원',
            meaning: 'tài nguyên',
            pronunciation: 'ja-won',
            partOfSpeech: 'noun',
            example: '천연자원이 부족하다.',
            exampleTranslation: 'Tài nguyên thiên nhiên khan hiếm.',
            difficulty: 4,
          },
          {
            word: '수단',
            meaning: 'phương tiện, biện pháp',
            pronunciation: 'su-dan',
            partOfSpeech: 'noun',
            example: '문제를 해결할 수단이 없다.',
            exampleTranslation: 'Không có biện pháp giải quyết vấn đề.',
            difficulty: 4,
          },
          {
            word: '효용',
            meaning: 'lợi ích, công dụng',
            pronunciation: 'hyo-yong',
            partOfSpeech: 'noun',
            example: '이 기술의 효용을 검증했다.',
            exampleTranslation: 'Đã kiểm chứng lợi ích của công nghệ này.',
            difficulty: 5,
          },
          {
            word: '탐구',
            meaning: 'sự tìm tòi, nghiên cứu',
            pronunciation: 'tam-gu',
            partOfSpeech: 'noun',
            example: '진리를 탐구한다.',
            exampleTranslation: 'Tìm tòi chân lý.',
            difficulty: 4,
          },
          {
            word: '기술',
            meaning: 'kỹ thuật, công nghệ',
            pronunciation: 'gi-sul',
            partOfSpeech: 'noun',
            example: '새로운 기술을 개발했다.',
            exampleTranslation: 'Đã phát triển công nghệ mới.',
            difficulty: 3,
          },
        ],
      },
      {
        lessonId: lessons[4].id,
        words: [
          {
            word: '기쁨',
            meaning: 'niềm vui',
            pronunciation: 'gi-ppeum',
            partOfSpeech: 'noun',
            example: '성공의 기쁨을 느꼈다.',
            exampleTranslation: 'Cảm nhận niềm vui của thành công.',
            difficulty: 2,
          },
          {
            word: '슬픔',
            meaning: 'nỗi buồn',
            pronunciation: 'seul-peum',
            partOfSpeech: 'noun',
            example: '슬픔을 함께 나눈다.',
            exampleTranslation: 'Chia sẻ nỗi buồn.',
            difficulty: 2,
          },
          {
            word: '분노',
            meaning: 'sự tức giận, phẫn nộ',
            pronunciation: 'bun-no',
            partOfSpeech: 'noun',
            example: '부당한 일에 분노가 났다.',
            exampleTranslation: 'Tức giận trước chuyện bất công.',
            difficulty: 4,
          },
          {
            word: '두려움',
            meaning: 'sự sợ hãi',
            pronunciation: 'du-ryeo-um',
            partOfSpeech: 'noun',
            example: '실패에 대한 두려움이 크다.',
            exampleTranslation: 'Nỗi sợ thất bại rất lớn.',
            difficulty: 3,
          },
          {
            word: '자존감',
            meaning: 'lòng tự trọng',
            pronunciation: 'ja-jon-gam',
            partOfSpeech: 'noun',
            example: '아이의 자존감을 키워야 한다.',
            exampleTranslation: 'Nên xây dựng lòng tự trọng cho trẻ.',
            difficulty: 4,
          },
          {
            word: '인내',
            meaning: 'sự nhẫn nại',
            pronunciation: 'in-nae',
            partOfSpeech: 'noun',
            example: '인내는 성공의 열쇠다.',
            exampleTranslation: 'Nhẫn nại là chìa khóa của thành công.',
            difficulty: 3,
          },
          {
            word: '집념',
            meaning: 'sự kiên trì, quyết tâm',
            pronunciation: 'jip-nyeom',
            partOfSpeech: 'noun',
            example: '그는 집념이 강하다.',
            exampleTranslation: 'Anh ấy có sự kiên trì mạnh mẽ.',
            difficulty: 5,
          },
          {
            word: '겸손',
            meaning: 'sự khiêm tốn',
            pronunciation: 'gyeom-son',
            partOfSpeech: 'noun',
            example: '겸손한 태도가 중요하다.',
            exampleTranslation: 'Thái độ khiêm tốn rất quan trọng.',
            difficulty: 3,
          },
          {
            word: '호기심',
            meaning: 'sự tò mò',
            pronunciation: 'ho-gi-sim',
            partOfSpeech: 'noun',
            example: '어린이는 호기심이 많다.',
            exampleTranslation: 'Trẻ em tò mò nhiều.',
            difficulty: 3,
          },
          {
            word: '체면',
            meaning: 'thể diện',
            pronunciation: 'che-myeon',
            partOfSpeech: 'noun',
            example: '체면을 지키고 싶어 한다.',
            exampleTranslation: 'Muốn giữ thể diện.',
            difficulty: 4,
          },
          {
            word: '마음가짐',
            meaning: 'thái độ, tâm thế',
            pronunciation: 'ma-eum-ga-jim',
            partOfSpeech: 'noun',
            example: '긍정적인 마음가짐을 갖자.',
            exampleTranslation: 'Hãy giữ thái độ tích cực.',
            difficulty: 4,
          },
          {
            word: '설레임',
            meaning: 'sự hồi hộp, háo hức',
            pronunciation: 'seol-re-im',
            partOfSpeech: 'noun',
            example: '첫 만남이 설레게 한다.',
            exampleTranslation: 'Buổi gặp đầu tiên khiến ta háo hức.',
            difficulty: 3,
          },
          {
            word: '고집',
            meaning: 'sự bướng bỉnh, cố chấp',
            pronunciation: 'go-jip',
            partOfSpeech: 'noun',
            example: '고집을 꺾는 것이 어렵다.',
            exampleTranslation: 'Thật khó để phá bỏ sự bướng bỉnh.',
            difficulty: 4,
          },
          {
            word: '용기',
            meaning: 'lòng can đảm',
            pronunciation: 'yong-gi',
            partOfSpeech: 'noun',
            example: '용기를 내어 도전했다.',
            exampleTranslation: 'Đã can đảm thử thách.',
            difficulty: 2,
          },
        ],
      },
    ];

    const allVocab: Vocabulary[] = [];
    let cards = 0;
    for (const group of topicVocab) {
      for (const w of group.words) {
        let existing = await this.vocabularyRepository.findOne({
          where: { word: w.word, lessonId: group.lessonId },
        });
        if (!existing) {
          existing = await this.vocabularyRepository.save({
            ...w,
            lessonId: group.lessonId,
          });
        }
        allVocab.push(existing!);

        if (user) {
          const existingCard = await this.flashcardRepository.findOne({
            where: { front: w.word, userId: user.id },
          });
          if (!existingCard) {
            await this.flashcardRepository.save({
              front: w.word,
              back: w.meaning,
              pronunciation: w.pronunciation,
              example: w.example,
              exampleTranslation: w.exampleTranslation,
              difficulty: w.difficulty,
              deckId,
              tags: ['topik5'],
              userId: user.id,
            });
            cards++;
          }
        }
      }
    }
    return { allVocab, cards };
  }

  private async seedTopicExercises(lessons: Lesson[]) {
    const exercisesByLesson: Record<number, any[]> = {
      [0]: [
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: '"청소년" có nghĩa là gì?',
          options: ['Thanh thiếu niên', 'Người lớn', 'Trẻ em', 'Người già'],
          answer: 'Thanh thiếu niên',
          explanation: '청소년 = thanh thiếu niên.',
          points: 10,
          lessonId: lessons[0].id,
          orderIndex: 1,
        },
        {
          type: ExerciseType.TRUE_FALSE,
          question: '"소통" nghĩa là sự giao tiếp, trao đổi. Đúng hay sai?',
          options: ['Đúng', 'Sai'],
          answer: 'Đúng',
          explanation: '소통 = sự giao tiếp.',
          points: 10,
          lessonId: lessons[0].id,
          orderIndex: 2,
        },
        {
          type: ExerciseType.FILL_BLANK,
          question: '"입시" có nghĩa là kỳ thi ______. (2 từ)',
          options: null,
          answer: 'tuyển sinh',
          explanation: '입시 = kỳ thi tuyển sinh.',
          points: 15,
          lessonId: lessons[0].id,
          orderIndex: 3,
        },
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: 'Từ nào chỉ "giáo dục công lập"?',
          options: ['공교육', '사교육', '입시', '학력'],
          answer: '공교육',
          explanation:
            '공교육 = giáo dục công lập; 사교육 = giáo dục ngoài trường.',
          points: 10,
          lessonId: lessons[0].id,
          orderIndex: 4,
        },
      ],
      [1]: [
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: '"퇴근" nghĩa là gì?',
          options: ['Tan làm', 'Đi làm', 'Tăng ca', 'Nghỉ phép'],
          answer: 'Tan làm',
          explanation: '퇴근 = tan làm; 출근 = đi làm.',
          points: 10,
          lessonId: lessons[1].id,
          orderIndex: 1,
        },
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: 'Từ nào chỉ "lương năm"?',
          options: ['연봉', '급여', '보너스', '현금'],
          answer: '연봉',
          explanation: '연봉 = lương năm.',
          points: 10,
          lessonId: lessons[1].id,
          orderIndex: 2,
        },
        {
          type: ExerciseType.TRUE_FALSE,
          question: '"면접" có nghĩa là buổi phỏng vấn. Đúng hay sai?',
          options: ['Đúng', 'Sai'],
          answer: 'Đúng',
          explanation: '면접 = phỏng vấn.',
          points: 10,
          lessonId: lessons[1].id,
          orderIndex: 3,
        },
        {
          type: ExerciseType.FILL_BLANK,
          question: '"승진" có nghĩa là ______. (2 từ)',
          options: null,
          answer: 'thăng chức',
          explanation: '승진 = thăng chức.',
          points: 15,
          lessonId: lessons[1].id,
          orderIndex: 4,
        },
      ],
      [2]: [
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: '"전통" có nghĩa là gì?',
          options: ['Truyền thống', 'Hiện đại', 'Lễ hội', 'Phong tục'],
          answer: 'Truyền thống',
          explanation: '전통 = truyền thống.',
          points: 10,
          lessonId: lessons[2].id,
          orderIndex: 1,
        },
        {
          type: ExerciseType.TRUE_FALSE,
          question:
            '"축제" có nghĩa là ngày lễ truyền thống, không phải lễ hội.',
          options: ['Đúng', 'Sai'],
          answer: 'Sai',
          explanation: '축제 = lễ hội. 명절 mới là ngày lễ truyền thống.',
          points: 10,
          lessonId: lessons[2].id,
          orderIndex: 2,
        },
        {
          type: ExerciseType.FILL_BLANK,
          question: '"유래" có nghĩa là nguồn ______.',
          options: null,
          answer: 'gốc',
          explanation: '유래 = nguồn gốc.',
          points: 15,
          lessonId: lessons[2].id,
          orderIndex: 3,
        },
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: 'Từ nào chỉ "dân tộc"?',
          options: ['민족', '마을', '이웃', '주거'],
          answer: '민족',
          explanation: '민족 = dân tộc.',
          points: 10,
          lessonId: lessons[2].id,
          orderIndex: 4,
        },
      ],
      [3]: [
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: '"발명" có nghĩa là gì?',
          options: ['Phát minh', 'Phát triển', 'Nghiên cứu', 'Khám phá'],
          answer: 'Phát minh',
          explanation: '발명 = phát minh.',
          points: 10,
          lessonId: lessons[3].id,
          orderIndex: 1,
        },
        {
          type: ExerciseType.TRUE_FALSE,
          question: '"자원" nghĩa là tài nguyên. Đúng hay sai?',
          options: ['Đúng', 'Sai'],
          answer: 'Đúng',
          explanation: '자원 = tài nguyên.',
          points: 10,
          lessonId: lessons[3].id,
          orderIndex: 2,
        },
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: 'Từ nào chỉ "khí hậu"?',
          options: ['기후', '오염', '에너지', '중력'],
          answer: '기후',
          explanation: '기후 = khí hậu.',
          points: 10,
          lessonId: lessons[3].id,
          orderIndex: 3,
        },
        {
          type: ExerciseType.FILL_BLANK,
          question: '"오염" có nghĩa là sự ______. (2 từ)',
          options: null,
          answer: 'ô nhiễm',
          explanation: '오염 = sự ô nhiễm.',
          points: 15,
          lessonId: lessons[3].id,
          orderIndex: 4,
        },
      ],
      [4]: [
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: '"용기" có nghĩa là gì?',
          options: ['Lòng can đảm', 'Nỗi buồn', 'Sự tức giận', 'Niềm vui'],
          answer: 'Lòng can đảm',
          explanation: '용기 = lòng can đảm.',
          points: 10,
          lessonId: lessons[4].id,
          orderIndex: 1,
        },
        {
          type: ExerciseType.TRUE_FALSE,
          question: '"자존감" chỉ sự khiêm tốn. Đúng hay sai?',
          options: ['Đúng', 'Sai'],
          answer: 'Sai',
          explanation: '자존감 = lòng tự trọng; 자존감 ≠ 겸손 (khiêm tốn).',
          points: 10,
          lessonId: lessons[4].id,
          orderIndex: 2,
        },
        {
          type: ExerciseType.FILL_BLANK,
          question: '"인내" có nghĩa là sự ______.',
          options: null,
          answer: 'nhẫn nại',
          explanation: '인내 = sự nhẫn nại.',
          points: 15,
          lessonId: lessons[4].id,
          orderIndex: 3,
        },
        {
          type: ExerciseType.MULTIPLE_CHOICE,
          question: 'Từ nào chỉ "thể diện"?',
          options: ['체면', '고집', '호기심', '마음가짐'],
          answer: '체면',
          explanation: '체면 = thể diện.',
          points: 10,
          lessonId: lessons[4].id,
          orderIndex: 4,
        },
      ],
    };

    for (const key of Object.keys(exercisesByLesson)) {
      const idx = Number(key);
      const lesson = lessons[idx];
      if (!lesson) continue;
      const existingCount = await this.exerciseRepository.count({
        where: { lessonId: lesson.id },
      });
      if (existingCount > 0) continue;
      await this.exerciseRepository.save(exercisesByLesson[idx]);
    }
  }

  private async seedTopikMockQuizzes(user: User) {
    const quizzes = [
      {
        name: 'TOPIK II 모의고사 1 — 문법 · 어휘',
        description: 'Đề thi thử TOPIK II phần ngữ pháp & từ vựng, mức độ 5-6.',
        topic: 'TOPIK II 문법/어휘',
        questionType: 'MIXED' as const,
        questionCount: 12,
        timeLimit: 15,
        passingScore: 70,
        difficulty: 'HARD' as const,
        isPublic: true,
        shuffleQuestions: true,
        shuffleAnswers: true,
        showCorrectAnswer: true,
        allowRetry: true,
        maxRetries: 3,
        userId: user.id,
        questions: [
          {
            question: '힘든 상황에도 __ 꾸준히 노력했다.',
            type: 'FILL_BLANK' as const,
            options: null,
            correctAnswer: '불구하고',
            explanation: '-에도 불구하고: mặc dù ... nhưng vẫn ...',
            points: 2,
            order: 1,
          },
          {
            question: '실패할까 __ 미리 준비를 철저히 했다.',
            type: 'FILL_BLANK' as const,
            options: null,
            correctAnswer: '봐',
            explanation: '-(으)ㄹ까 봐: lo sẽ ... nên ...',
            points: 2,
            order: 2,
          },
          {
            question: '"고용"에 해당하는 뜻은?',
            type: 'MULTIPLE_CHOICE' as const,
            options: ['tuyển dụng', 'thất nghiệp', 'lương', 'thăng chức'],
            correctAnswer: 'tuyển dụng',
            explanation: '고용 = sự tuyển dụng/việc làm.',
            points: 2,
            order: 3,
          },
          {
            question: '"복지" có nghĩa là gì?',
            type: 'MULTIPLE_CHOICE' as const,
            options: ['phúc lợi', 'thuế', 'giáo dục', 'an ninh'],
            correctAnswer: 'phúc lợi',
            explanation: '복지 = phúc lợi xã hội.',
            points: 2,
            order: 4,
          },
          {
            question: '"양극화" chỉ hiện tượng phân hóa giàu nghèo.',
            type: 'TRUE_FALSE' as const,
            options: ['Đúng', 'Sai'],
            correctAnswer: 'Đúng',
            explanation: '양극화 = sự phân cực, hai đầu.',
            points: 2,
            order: 5,
          },
          {
            question: '경기가 악화되면서 가계의 __이 줄어들었다.',
            type: 'FILL_BLANK' as const,
            options: null,
            correctAnswer: '소비',
            explanation: '소비 = tiêu dùng.',
            points: 2,
            order: 6,
          },
          {
            question: '"환경오염" 비슷한 의미의 단어는?',
            type: 'MULTIPLE_CHOICE' as const,
            options: ['오염', '재활용', '자원', '기후'],
            correctAnswer: '오염',
            explanation: '오염 = ô nhiễm.',
            points: 2,
            order: 7,
          },
          {
            question: '용기를 내는 것은 어려운 일이 아니다.',
            type: 'TRUE_FALSE' as const,
            options: ['Đúng', 'Sai'],
            correctAnswer: 'Sai',
            explanation:
              'Đây là ý kiến chủ quan, không đúng/không sai tuyệt đối.',
            points: 2,
            order: 8,
          },
          {
            question: '"투자" nghĩa là đầu tư.',
            type: 'TRUE_FALSE' as const,
            options: ['Đúng', 'Sai'],
            correctAnswer: 'Đúng',
            explanation: '투자 = sự đầu tư.',
            points: 2,
            order: 9,
          },
          {
            question: '자존감은 __감을 뜻한다.',
            type: 'FILL_BLANK' as const,
            options: null,
            correctAnswer: '자존',
            explanation: '자존감 = lòng tự trọng.',
            points: 2,
            order: 10,
          },
          {
            question: '"면접" có nghĩa là gì?',
            type: 'MULTIPLE_CHOICE' as const,
            options: ['phỏng vấn', 'hợp đồng', 'tăng ca', 'nhận việc'],
            correctAnswer: 'phỏng vấn',
            explanation: '면접 = buổi phỏng vấn.',
            points: 2,
            order: 11,
          },
          {
            question: '급여가 늦게 지급되었다. — "급여" nghĩa là tiền lương.',
            type: 'TRUE_FALSE' as const,
            options: ['Đúng', 'Sai'],
            correctAnswer: 'Đúng',
            explanation: '급여 = tiền lương.',
            points: 2,
            order: 12,
          },
        ],
      },
      {
        name: 'TOPIK II 모의고사 2 — 읽기 실전',
        description: 'Đề thi thử TOPIK II phần đọc hiểu thực chiến.',
        topic: 'TOPIK II 읽기',
        questionType: 'MULTIPLE_CHOICE' as const,
        questionCount: 12,
        timeLimit: 20,
        passingScore: 70,
        difficulty: 'HARD' as const,
        isPublic: true,
        shuffleQuestions: true,
        shuffleAnswers: true,
        showCorrectAnswer: true,
        allowRetry: true,
        maxRetries: 3,
        userId: user.id,
        questions: [
          {
            question:
              '다음 글의 주제로 가장 알맞은 것은? "집중력은 금방 길러지는 것이 아니다. 꾸준히 한 가지 일에 몰두하는 습관이 쌓일 때 비로소 향상된다."',
            type: 'MULTIPLE_CHOICE' as const,
            options: [
              '집중력을 기르는 방법',
              '일하는 시간의 중요성',
              '습관의 나쁜 점',
              '관심 분야의 다양성',
            ],
            correctAnswer: '집중력을 기르는 방법',
            explanation: 'Văn bản bàn về cách rèn luyện sự tập trung.',
            points: 2,
            order: 1,
          },
          {
            question:
              '빈칸에 들어갈 말로 가장 적절한 것은? "수입이 줄었다. ____ 소비를 줄였다."',
            type: 'MULTIPLE_CHOICE' as const,
            options: ['따라서', '하지만', '왜냐하면', '그런데'],
            correctAnswer: '따라서',
            explanation: '따라서 = vì vậy (quan hệ nhân quả).',
            points: 2,
            order: 2,
          },
          {
            question:
              '다음 중 글쓴이의 심경으로 가장 알맞은 것은? "결국 포기할 수는 없었다. 처음엔 어려웠지만 이제는 조금씩 보람을 느낀다."',
            type: 'MULTIPLE_CHOICE' as const,
            options: ['긍정적', '침울한', '분노한', '무관심'],
            correctAnswer: '긍정적',
            explanation:
              'Từ 보람 (niềm vui có ý nghĩa) cho thấy tâm trạng tích cực.',
            points: 2,
            order: 3,
          },
          {
            question:
              '밑줄 친 "이들"이 가리키는 것은? "학생들은 도서관에 모였다. 이들은 모두 시험을 준비 중이다." — 이들은?',
            type: 'MULTIPLE_CHOICE' as const,
            options: ['학생들', '도서관', '시험', '책'],
            correctAnswer: '학생들',
            explanation: '이들 = những (đối tượng) được nhắc tới — học sinh.',
            points: 2,
            order: 4,
          },
          {
            question: '다음 글을 읽고 알맞은 것을 고르십시오. (추론)',
            type: 'MULTIPLE_CHOICE' as const,
            options: [
              '지문이 없으니 판단할 수 없다',
              '항상 지문이 있다',
              '문제 형식이 잘못되었다',
              '빈칸 문제이다',
            ],
            correctAnswer: '지문이 없으니 판단할 수 없다',
            explanation: 'Ví dụ về câu hỏi đọc hiểu cần đoạn văn đầy đủ.',
            points: 2,
            order: 5,
          },
          {
            question: '"인내는 성공의 열쇠다" — "인내"와 가장 가까운 의미는?',
            type: 'MULTIPLE_CHOICE' as const,
            options: ['인내심', '성공', '포기', '운동'],
            correctAnswer: '인내심',
            explanation: '인내(심) = sự nhẫn nại, kiên nhẫn.',
            points: 2,
            order: 6,
          },
          {
            question: '읽기 전략: 주제를 파악할 때 가장 먼저 볼 곳은?',
            type: 'MULTIPLE_CHOICE' as const,
            options: [
              '첫 문장과 마지막 문장',
              '중간 문장만',
              '단어만',
              '제목만',
            ],
            correctAnswer: '첫 문장과 마지막 문장',
            explanation: '주제문 (topic sentence) thường ở đầu/cuối đoạn.',
            points: 2,
            order: 7,
          },
          {
            question:
              '"그러나"는 앞뒤 내용을 연결하는 접속사로 대조를 나타낸다.',
            type: 'MULTIPLE_CHOICE' as const,
            options: ['Đúng', 'Sai', 'Không chắc', 'Không liên quan'],
            correctAnswer: 'Đúng',
            explanation: '그러나 = nhưng, thể hiện đối lập.',
            points: 2,
            order: 8,
          },
          {
            question: '지문의 "따라서"는 어떤 관계를 나타내는가?',
            type: 'MULTIPLE_CHOICE' as const,
            options: ['원인-결과', '대조', '예시', '시간순서'],
            correctAnswer: '원인-결과',
            explanation: '따라서 diễn tả hệ quả từ nguyên nhân.',
            points: 2,
            order: 9,
          },
          {
            question: '읽기 문제에서 빈칸 채우기의 핵심은?',
            type: 'MULTIPLE_CHOICE' as const,
            options: [
              '문법과 의미가 모두 맞는 것',
              '가장 긴 것',
              '가장 짧은 것',
              '어려운 단어',
            ],
            correctAnswer: '문법과 의미가 모두 맞는 것',
            explanation: 'Cần chọn đáp án hợp cả ngữ pháp lẫn nghĩa.',
            points: 2,
            order: 10,
          },
          {
            question: '"긍정적인 마음가짐"에서 "마음가짐"은 어떤 뜻인가?',
            type: 'MULTIPLE_CHOICE' as const,
            options: ['thái độ, tâm thế', 'tính cách', 'thói quen', 'mơ ước'],
            correctAnswer: 'thái độ, tâm thế',
            explanation: '마음가짐 = thái độ, tâm thế.',
            points: 2,
            order: 11,
          },
          {
            question: '읽기 MV 51번 주제를 고르는 보기에서 "주제"는 무엇인가?',
            type: 'MULTIPLE_CHOICE' as const,
            options: ['chủ đề', 'câu hỏi', 'đoạn văn', 'bài viết'],
            correctAnswer: 'chủ đề',
            explanation: '주제 = chủ đề.',
            points: 2,
            order: 12,
          },
        ],
      },
    ];

    for (const quiz of quizzes) {
      const existingQuiz = await this.quizRepository.findOne({
        where: { name: quiz.name },
      });
      const { questions, ...quizData } = quiz;
      if (existingQuiz) {
        // Top up missing questions
        const existingCount = await this.quizQuestionRepository.count({
          where: { quizId: existingQuiz.id },
        });
        if (existingCount === 0) {
          await this.quizQuestionRepository.save(
            this.mapQuizQuestions(questions, existingQuiz.id),
          );
          this.logger.log(
            `Quiz "${quiz.name}" already exists; added ${questions.length} missing questions`,
          );
        } else {
          this.logger.log(
            `Quiz "${quiz.name}" already exists with ${existingCount} questions, skipping`,
          );
        }
        continue;
      }

      const savedQuiz = await this.quizRepository.save(quizData);
      await this.quizQuestionRepository.save(
        this.mapQuizQuestions(questions, savedQuiz.id),
      );
      this.logger.log(
        `Created quiz "${quiz.name}" with ${questions.length} questions`,
      );
    }
  }
}
