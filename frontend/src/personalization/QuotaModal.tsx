// src/personalization/QuotaModal.tsx
import { useEffect, useState } from "react";
import { getEstimate, type StorageEstimate } from "../storage/quota";
import { purgeOlderThanFourMonths } from "../storage/imageStore";
import { setSkippingImages } from "../storage/skipImagesFlag";

interface Props {
  open: boolean;
  onClose: () => void;
}

function fmtMB(bytes: number): string {
  return (bytes / 1_048_576).toFixed(1) + " MB";
}

export default function QuotaModal({ open, onClose }: Props) {
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) getEstimate().then(setEstimate);
  }, [open]);

  if (!open) return null;

  const handlePurge = async () => {
    setBusy(true);
    try {
      const deleted = await purgeOlderThanFourMonths();
      alert(`已釋出空間，刪除了 ${deleted} 張舊手寫圖。`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = () => {
    setSkippingImages(true);
    alert("已停止儲存新的手寫圖。原本的紀錄仍會保留。");
    onClose();
  };

  return (
    <div className="quota-modal" role="dialog">
      <div className="quota-modal-content">
        <h3>⚠️ iPad 上儲存空間快滿了</h3>
        {estimate && (
          <p>
            目前已佔用 <strong>{fmtMB(estimate.usage)}</strong> / {fmtMB(estimate.quota)} (
            {Math.round(estimate.pct * 100)}%)
          </p>
        )}
        <div className="quota-modal-actions">
          <button className="primary" onClick={handlePurge} disabled={busy}>
            {busy ? "清理中…" : "清掉 4 個月前的資料"}
          </button>
          <button onClick={handleSkip} disabled={busy}>
            先別清，不再儲手寫圖
          </button>
          <button onClick={onClose} disabled={busy}>
            稍後再說
          </button>
        </div>
      </div>
    </div>
  );
}
