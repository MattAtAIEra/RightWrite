import { useEffect } from "react";
import "./yzqj.css";
import { usePathname } from "./router";
import Landing from "./Landing";
import HostView from "./HostView";
import PlayerView from "./PlayerView";
import AdminView from "./AdminView";

/**
 * 一字千金的路由：
 *   /yzqj              首頁（老師建立 / 學生輸入代碼）
 *   /yzqj/host/:code   老師監看畫面
 *   /g/:code           學生加入與作答（QR Code 指到這裡，短一點好掃）
 *   /yzqj/admin        成績後台
 */
export default function YzqjApp() {
  const path = usePathname();

  useEffect(() => {
    document.title = "一字千金 · 成語改錯競賽";
  }, []);

  const hostMatch = path.match(/^\/yzqj\/host\/([A-Za-z0-9]{3})\/?$/);
  const playerMatch = path.match(/^\/g\/([A-Za-z0-9]{3})\/?$/);

  let page: React.ReactNode;
  if (hostMatch) {
    page = <HostView key={hostMatch[1]} code={hostMatch[1].toUpperCase()} />;
  } else if (playerMatch) {
    page = <PlayerView key={playerMatch[1]} code={playerMatch[1].toUpperCase()} />;
  } else if (/^\/yzqj\/admin\/?$/.test(path)) {
    page = <AdminView />;
  } else {
    page = <Landing />;
  }

  return <div className="yzqj-root">{page}</div>;
}
