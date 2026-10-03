import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerMessage } from "./types";

/**
 * 跟賽局伺服器保持 WebSocket 連線。
 * - 斷線會自動重連（指數退避，最多 10 秒）
 * - 伺服器用 4xxx 代碼拒絕時（找不到賽局、密鑰錯誤）不再重試，把原因交給畫面顯示
 */
export function useGameSocket(url: string | null, onMessage: (msg: ServerMessage) => void) {
  const [connected, setConnected] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onMessage);

  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!url) return;
    let disposed = false;
    let attempt = 0;
    let timer: number | undefined;

    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setFatal(null);
        setConnected(true);
      };
      ws.onmessage = (event) => {
        try {
          handlerRef.current(JSON.parse(event.data) as ServerMessage);
        } catch {
          /* 忽略壞掉的訊息 */
        }
      };
      ws.onerror = () => {
        ws.close();
      };
      ws.onclose = (event) => {
        setConnected(false);
        if (wsRef.current === ws) wsRef.current = null;
        if (disposed) return;
        if (event.code >= 4000 && event.code < 5000) {
          setFatal(event.reason || "連線被伺服器拒絕");
          return;
        }
        attempt += 1;
        timer = window.setTimeout(connect, Math.min(10000, 500 * 2 ** attempt));
      };
    };

    connect();
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url]);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  return { send, connected, fatal };
}
