// src/rewards/StampSeal.tsx
// 硃砂印章 — a rounded-square cinnabar seal with the stamp's two-character
// mark. Pure CSS; `stamping` plays the thump-down animation once.

import type { StampType } from "./types";
import { STAMP_LABELS } from "./types";

interface Props {
  type: StampType;
  size?: number;
  stamping?: boolean;
  /** 淡化顯示(已兌換消耗的章) */
  spent?: boolean;
}

export default function StampSeal({ type, size = 64, stamping = false, spent = false }: Props) {
  const label = STAMP_LABELS[type];
  return (
    <span
      className={`stamp-seal${stamping ? " stamping" : ""}${spent ? " spent" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.32 }}
      role="img"
      aria-label={label.name}
      title={`${label.name}——${label.describe}`}
    >
      {label.seal}
    </span>
  );
}
