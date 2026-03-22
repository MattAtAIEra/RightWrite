export interface GradeOption {
  id: string;
  label: string;
  grade: string;
  publisher: string;
}

export interface GradesResponse {
  grades: GradeOption[];
}

export interface Lesson {
  lesson_number: number;
  title: string;
  character_count: number;
  characters: string[];
}

export interface LessonsResponse {
  semester: string;
  grade: string;
  publisher: string;
  total_lessons: number;
  midterm_range: [number, number];
  final_range: [number, number];
  lessons: Lesson[];
}

export interface WrongChar {
  position: number;
  wrong_char: string;
  correct_char: string;
  lesson: number;
  lesson_title: string;
}

export interface ArticleResponse {
  original_text: string;
  display_text: string;
  wrong_chars: WrongChar[];
  total_wrong: number;
  zhuyin: string[];
}

export interface RecognizeResponse {
  recognized_char: string;
  is_correct: boolean;
  confidence: number;
}

export type AppStage = "select" | "practice" | "result";
export type PracticeMode = "sentence" | "article";
