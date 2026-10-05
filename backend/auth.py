"""
管理介面的登入與 session。

- 帳號是 ADMIN_EMAIL（預設 matt.jiang@gmail.com），密碼是 ADMIN_PASSWORD（放在 Secret Manager）。
- 登入成功後發一個 HMAC 簽章的 cookie（rw_admin），12 小時有效；不用資料庫、不用額外套件。
- 給腳本用的替代方式：header `X-Admin-Token` 帶管理密碼。
- 沒設定 ADMIN_PASSWORD 時，所有管理端點一律拒絕，避免忘了設密碼就把後台開給大眾。
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from fastapi import HTTPException, Request, Response

ADMIN_COOKIE = "rw_admin"
SESSION_TTL_SECONDS = 12 * 3600
ADMIN_PATH = "/backstage-admin"  # 管理介面的網址，刻意不用 /admin 這種一猜就中的名字
_PROCESS_SECRET = secrets.token_hex(32)  # 沒設 secret 時的退路：重啟就失效


def admin_email() -> str:
    return os.environ.get("ADMIN_EMAIL", "matt.jiang@gmail.com").strip().lower()


def admin_password() -> str:
    return os.environ.get("ADMIN_PASSWORD", "")


def admin_configured() -> bool:
    return bool(admin_password())


def admin_allowed_ips() -> set[str]:
    """ADMIN_ALLOWED_IPS：逗號分隔的 IP 名單；空的代表不限制（本機開發）。"""
    raw = os.environ.get("ADMIN_ALLOWED_IPS", "")
    return {ip.strip() for ip in raw.split(",") if ip.strip()}


def trusted_client_ip(request: Request) -> str:
    """
    真正連上來的 IP。
    Cloud Run 會把客戶端 IP「附加」到 X-Forwarded-For 的最後面，客戶端自己塞的值會排在前面，
    所以在 Cloud Run 上要取最後一個；本機或測試沒有這層 proxy，取第一個（相容既有測試）。
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    parts = [p.strip() for p in forwarded.split(",") if p.strip()]
    if parts:
        return parts[-1] if os.environ.get("K_SERVICE") else parts[0]
    return request.client.host if request.client else ""


def ip_allowed(request: Request) -> bool:
    allowed = admin_allowed_ips()
    return not allowed or trusted_client_ip(request) in allowed


def require_allowed_ip(request: Request) -> None:
    """不在名單裡的 IP 一律 404，讓管理介面對外看起來不存在。"""
    if not ip_allowed(request):
        raise HTTPException(status_code=404, detail="Not Found")


def signing_key() -> bytes:
    raw = os.environ.get("ADMIN_SESSION_SECRET") or admin_password() or _PROCESS_SECRET
    return hashlib.sha256(raw.encode("utf-8")).digest()


def sign(payload: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    sig = hmac.new(signing_key(), body.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{body}.{sig}"


def verify(token: str | None) -> dict | None:
    if not token or "." not in token:
        return None
    body, sig = token.rsplit(".", 1)
    expected = hmac.new(signing_key(), body.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        padded = body + "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
    except Exception:
        return None
    exp = payload.get("exp")
    if isinstance(exp, (int, float)) and exp < time.time():
        return None
    return payload


def request_is_https(request: Request) -> bool:
    return request.headers.get("x-forwarded-proto", request.url.scheme) == "https"


def login_ok(email: str, password: str) -> bool:
    configured = admin_password()
    if not configured:
        return False
    same_email = hmac.compare_digest(email.strip().lower().encode(), admin_email().encode())
    same_password = hmac.compare_digest(password.encode(), configured.encode())
    return same_email and same_password


def issue_admin_cookie(request: Request, response: Response, email: str) -> None:
    token = sign({"sub": email, "exp": int(time.time()) + SESSION_TTL_SECONDS, "n": secrets.token_hex(4)})
    response.set_cookie(
        ADMIN_COOKIE,
        token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=request_is_https(request),
        samesite="lax",
        path="/",
    )


def clear_admin_cookie(response: Response) -> None:
    response.delete_cookie(ADMIN_COOKIE, path="/")


def current_admin(request: Request) -> str | None:
    """已登入就回 email，否則 None。"""
    if not admin_configured():
        return None
    payload = verify(request.cookies.get(ADMIN_COOKIE))
    if payload and payload.get("sub"):
        return str(payload["sub"])
    return None


def require_admin(request: Request) -> str:
    """FastAPI dependency：沒登入就 401。也接受 X-Admin-Token（或 ?token=）帶管理密碼，給腳本用。"""
    require_allowed_ip(request)
    if not admin_configured():
        raise HTTPException(status_code=401, detail="後台尚未設定管理密碼")
    email = current_admin(request)
    if email:
        return email
    supplied = request.headers.get("x-admin-token") or request.query_params.get("token") or ""
    if supplied and hmac.compare_digest(supplied.encode(), admin_password().encode()):
        return admin_email()
    raise HTTPException(status_code=401, detail="請先登入管理介面")
