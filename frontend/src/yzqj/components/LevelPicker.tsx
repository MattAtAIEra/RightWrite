import { LEVEL_LABELS } from "../types";
import type { PlayableLevel } from "../types";

const LEVELS: PlayableLevel[] = ["common", "advanced"];

const LEVEL_HINTS: Record<PlayableLevel, string> = {
  common: "國小課本和生活裡常見的成語",
  advanced: "國中以上程度、典故比較深的成語",
};

interface Props {
  value: PlayableLevel;
  onChange: (level: PlayableLevel) => void;
  /** 每個難度有幾個成語；還沒載入時不顯示 */
  counts?: Record<PlayableLevel, number> | null;
}

/** 老師在開始比賽／再來一輪之前選這一輪的成語難度 */
export default function LevelPicker({ value, onChange, counts }: Props) {
  return (
    <div className="yz-level-picker" role="radiogroup" aria-label="成語難度">
      {LEVELS.map((level) => (
        <label key={level} className={`yz-level-option ${level}${value === level ? " active" : ""}`}>
          <input type="radio" name="yz-level" value={level} checked={value === level} onChange={() => onChange(level)} />
          <b>{LEVEL_LABELS[level]}</b>
          <small>
            {LEVEL_HINTS[level]}
            {counts ? `（${counts[level]} 個）` : ""}
          </small>
        </label>
      ))}
    </div>
  );
}
