import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface Props {
  url: string;
  code: string;
}

/** 大大的 QR Code、三碼代碼與網址，讓學生掃碼或手動輸入加入。 */
export default function QrCard({ url, code }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, url, {
      width: 280,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#2d3436", light: "#ffffff" },
    }).catch(() => {
      /* QR 畫不出來就只顯示網址 */
    });
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 瀏覽器不允許就算了 */
    }
  };

  return (
    <div className="qr-card">
      <div className="qr-frame">
        <canvas ref={canvasRef} aria-label={`加入賽局的 QR Code，網址 ${url}`} />
      </div>
      <div className="qr-code-label">
        <span className="qr-code-hint">賽局代碼</span>
        <span className="qr-code-value">{Array.from(code).map((ch, i) => <b key={i}>{ch}</b>)}</span>
      </div>
      <button type="button" className="qr-url" onClick={copy} title="點一下複製網址">
        {url}
        <span className="qr-copy">{copied ? "已複製 ✓" : "複製"}</span>
      </button>
    </div>
  );
}
