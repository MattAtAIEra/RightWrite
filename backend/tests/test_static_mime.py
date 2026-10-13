"""
前端靜態檔的 Content-Type。

Cloud Run 的 python:3.12-slim 容器沒有系統的 mime.types，.webp／.woff2 要靠
main.register_static_mime_types() 註冊，否則會被當成 text/plain 送出。
macOS 有系統的 mime.types，所以本機直接打 API 看不出這個問題，這裡改成模擬容器的狀況。

執行：cd backend && python -m pytest tests -q
"""
from __future__ import annotations

import mimetypes
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

import main  # noqa: E402


def test_webp_and_woff2_without_system_mime_files(monkeypatch):
    # 換成只有 Python 內建對照表的 MimeTypes，等同容器裡沒有 /etc/mime.types
    monkeypatch.setattr(mimetypes, "_db", mimetypes.MimeTypes())
    main.register_static_mime_types()
    assert mimetypes.guess_type("rightwrite-1672-B40MMj_Q.webp")[0] == "image/webp"
    assert mimetypes.guess_type("ARPLUKaiTW-yzqj.woff2")[0] == "font/woff2"
