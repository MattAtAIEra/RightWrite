export type GameStatus = "lobby" | "question" | "reveal" | "finished";

export interface PlayerPublic {
  id: string;
  nickname: string;
  connected: boolean;
  submitted: boolean;
  correct_count: number;
  answered: number;
}

export interface QuestionView {
  index: number;
  total: number;
  display: string;
  remaining_ms: number;
  seconds: number;
  // 以下只有老師端、或公布答案之後才會有
  idiom?: string;
  wrong_index?: number;
  wrong_char?: string;
  correct_char?: string;
  meaning?: string;
}

export interface ResultEntry {
  is_correct: boolean;
  recognized: string;
  answer_ms: number;
  engine: string;
  submitted: boolean;
}

export interface AnswerRecord extends ResultEntry {
  index: number;
  idiom: string;
  display: string;
  wrong_char: string;
  correct_char: string;
}

export interface LeaderboardEntry {
  player_id: string;
  nickname: string;
  correct_count: number;
  total_questions: number;
  accuracy: number;
  total_ms: number;
  rank: number;
}

export interface Snapshot {
  type: "snapshot";
  code: string;
  status: GameStatus;
  round: number;
  max_players: number;
  question_seconds: number;
  reveal_seconds: number;
  total_questions: number;
  players: PlayerPublic[];
  question: QuestionView | null;
  results: Record<string, ResultEntry>;
  leaderboard: LeaderboardEntry[];
  server_time: number;
  you?: {
    id: string;
    nickname: string;
    answers: AnswerRecord[];
    correct_count: number;
  };
}

export interface StrokeMessage {
  type: "stroke";
  player_id: string;
  sid: number;
  pts: number[][];
  end: boolean;
}

export type ServerMessage =
  | Snapshot
  | StrokeMessage
  | { type: "clear"; player_id: string }
  | { type: "time_up"; index: number }
  | { type: "question_start"; index: number }
  | { type: "error"; message: string }
  | { type: "pong" };

export interface Stroke {
  sid: number;
  pts: number[][];
}

export interface CreateGameResponse {
  code: string;
  host_token: string;
  join_path: string;
  host_path: string;
  max_players: number;
  questions_per_round: number;
  question_seconds: number;
}

export interface GameInfo {
  code: string;
  status: GameStatus;
  round: number;
  player_count: number;
  max_players: number;
  can_join: boolean;
}

export interface JoinResponse {
  player_id: string;
  nickname: string;
  code: string;
}

export interface AdminPlayer {
  id: string;
  game_code: string;
  round: number;
  nickname: string;
  ip: string | null;
  user_agent: string | null;
  joined_at: number;
  correct_count: number;
  total_questions: number;
  accuracy: number;
  rank: number | null;
  total_ms: number;
  answers: AnswerRecord[];
}

export interface AdminGame {
  code: string;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  status: GameStatus;
  round: number;
  host_ip: string | null;
  questions: { idiom: string; display: string; wrong_index: number; wrong_char: string; correct_char: string; meaning: string }[];
  players: AdminPlayer[];
  live: boolean;
}

export interface AdminGamesResponse {
  games: AdminGame[];
  stats: { games: number; finished_games: number; players: number };
  live_games: number;
}
