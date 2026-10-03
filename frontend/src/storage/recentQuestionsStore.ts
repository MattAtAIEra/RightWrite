// src/storage/recentQuestionsStore.ts
// 記住最近幾次練習出過哪些題目,下次產生題目時避開。
//
// 單課的可用詞語只有 8～11 個,一次要出 5～8 題,純隨機兩次的重疊率很高,
// 小朋友會覺得「跟剛剛一樣」。這裡用 localStorage 存最近幾輪的詞與錯字組合
// (刻意不用 IndexedDB / profile,沒開個人化的裝置也要能輪替),送給後端當
// 避開清單。

export interface RecentQuestions {
  /** 出過的詞,一輪一組,最近的一輪排最前面 */
  rounds: string[][];
  /** 出過的「詞|正字|錯字」組合,最近的排最前面 */
  variants: string[];
}

export interface RecentQuestionKey {
  profileId: string | null;
  gradeId: string;
  startLesson: number;
  endLesson: number;
}

/** 記幾輪。太多會把整個詞池全部排除,反而失去輪替效果。 */
const MAX_ROUNDS = 3;
/** 錯字組合可以記久一點——變體數(每課約 24～60 種)遠多於詞數 */
const MAX_VARIANTS = 60;

const EMPTY: RecentQuestions = { rounds: [], variants: [] };

function storageKey(k: RecentQuestionKey): string {
  return `rw:recent:${k.profileId ?? "shared"}:${k.gradeId}:${k.startLesson}-${k.endLesson}`;
}

export function loadRecentQuestions(k: RecentQuestionKey): RecentQuestions {
  try {
    const raw = localStorage.getItem(storageKey(k));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<RecentQuestions>;
    return {
      rounds: Array.isArray(parsed.rounds) ? parsed.rounds.filter(Array.isArray) : [],
      variants: Array.isArray(parsed.variants) ? parsed.variants : [],
    };
  } catch {
    return EMPTY;
  }
}

export interface RoundEntry {
  word: string;
  correct_char: string;
  wrong_char: string;
}

/** 把剛產生的這一輪記下來(疊到最前面) */
export function pushRound(k: RecentQuestionKey, entries: RoundEntry[]): void {
  if (entries.length === 0) return;
  const prev = loadRecentQuestions(k);
  const words = [...new Set(entries.map((e) => e.word))];
  const variants = entries.map((e) => `${e.word}|${e.correct_char}|${e.wrong_char}`);
  const next: RecentQuestions = {
    rounds: [words, ...prev.rounds].slice(0, MAX_ROUNDS),
    variants: [...new Set([...variants, ...prev.variants])].slice(0, MAX_VARIANTS),
  };
  try {
    localStorage.setItem(storageKey(k), JSON.stringify(next));
  } catch {
    // 空間滿了就算了——輪替是加分項,不該擋住練習
  }
}
