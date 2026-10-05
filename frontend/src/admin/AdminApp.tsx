import { useEffect, useState } from "react";
import "../yzqj/yzqj.css";
import "./admin.css";
import { fetchMe, login, logout, type AdminMe } from "./api";
import { navigate, usePathname } from "../yzqj/router";
import UsageView from "./UsageView";
import VocabView from "./VocabView";
import IdiomsView from "../yzqj/IdiomsView";
import AdminView from "../yzqj/AdminView";

/**
 * 管理介面：/backstage-admin 底下四個功能，全部要先登入，而且只開放 ADMIN_ALLOWED_IPS 名單內的 IP。
 *   /backstage-admin/usage    使用次數分佈儀錶板
 *   /backstage-admin/idioms   成語題庫
 *   /backstage-admin/results  成績後台
 *   /backstage-admin/vocab    生字庫
 * 登入狀態放在 HttpOnly cookie，前端只問 /api/admin/me。
 */
const TABS = [
  { path: "/backstage-admin/usage", label: "使用量儀錶板" },
  { path: "/backstage-admin/idioms", label: "成語題庫" },
  { path: "/backstage-admin/results", label: "成績後台" },
  { path: "/backstage-admin/vocab", label: "生字庫" },
];

export default function AdminApp() {
  const path = usePathname();
  const [me, setMe] = useState<AdminMe | null | undefined>(undefined); // undefined = 還沒問過

  useEffect(() => {
    document.title = "管理介面 · RightWrite";
    fetchMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) return <div className="yz-loader">確認登入狀態…</div>;
  if (me === null) return <Login onDone={setMe} />;

  const active = TABS.find((t) => path.startsWith(t.path)) ?? TABS[0];

  return (
    <div className="ad-root">
      <header className="ad-bar">
        <div className="ad-brand" onClick={() => navigate("/backstage-admin/usage")} role="link" tabIndex={0}>
          RightWrite 管理介面
        </div>
        <nav className="ad-tabs" aria-label="管理功能">
          {TABS.map((t) => (
            <button
              key={t.path}
              type="button"
              className={`ad-tab${active.path === t.path ? " active" : ""}`}
              onClick={() => navigate(t.path)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ad-user">
          <span>{me.email}</span>
          <button
            type="button"
            className="yz-btn ghost"
            onClick={async () => {
              await logout();
              setMe(null);
            }}
          >
            登出
          </button>
        </div>
      </header>
      <main className="ad-main">
        {active.path === "/backstage-admin/usage" && <UsageView />}
        {active.path === "/backstage-admin/idioms" && <IdiomsView />}
        {active.path === "/backstage-admin/results" && <AdminView />}
        {active.path === "/backstage-admin/vocab" && <VocabView />}
      </main>
    </div>
  );
}

function Login({ onDone }: { onDone: (me: AdminMe) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await login(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ad-login">
      <form className="ad-login-card" onSubmit={submit}>
        <h1>RightWrite 管理介面</h1>
        <p className="yz-hint">成語題庫、成績後台、生字庫與使用量儀錶板只開放管理員。</p>
        <label>
          帳號（Email）
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="name@example.com"
            required
          />
        </label>
        <label>
          密碼
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <div className="yz-error">{error}</div>}
        <button type="submit" className="yz-btn primary big" disabled={busy || !email || !password}>
          {busy ? "登入中…" : "登入"}
        </button>
        <a href="/" className="ad-back">← 回學習樂園</a>
      </form>
    </div>
  );
}
