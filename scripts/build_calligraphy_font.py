#!/usr/bin/env python3
"""
一字千金 — 書法字型子集化工具

從「文鼎 PL 中楷」(AR PL UKai TW, Arphic Public License) 擷取成語資料會用到的字，
輸出成小巧的 woff2 放到 frontend/public/fonts/，前端用 @font-face 載入。

為什麼要子集化：完整的 CJK 字型約 17MB，子集化後只有幾百個字，約 200KB。

用法：
    pip install fonttools brotli
    python scripts/build_calligraphy_font.py [--source /path/to/ukai.ttc]

新增成語到 backend/idioms_data.py 之後，要重新執行一次這個腳本。
"""
from __future__ import annotations

import argparse
import io
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from idioms_data import all_characters  # noqa: E402

# Ubuntu 套件庫裡的 fonts-arphic-ukai（內含 ukai.ttc，4 個字面）
DEB_URL = (
    "http://archive.ubuntu.com/ubuntu/pool/main/f/fonts-arphic-ukai/"
    "fonts-arphic-ukai_0.2.20080216.2-5_all.deb"
)
TTC_INDEX_TW = 2  # ukai.ttc 內第 3 個字面是 "AR PL UKai TW"

OUT_DIR = ROOT / "frontend" / "public" / "fonts"
OUT_FONT = OUT_DIR / "ARPLUKaiTW-yzqj.woff2"
OUT_LICENSE = OUT_DIR / "ARPHICPL.TXT"

# 除了成語本身，介面上也會以書法字型顯示的字
EXTRA_TEXT = "一字千金正確答案成語挑戰第題恭喜排名冠亞季軍滿分加油再來一輪老師學生改錯"


def download_ttc(cache_dir: Path) -> tuple[Path, Path]:
    """下載 .deb 並解出 ukai.ttc 與授權文字，回傳 (ttc_path, license_path)。"""
    cache_dir.mkdir(parents=True, exist_ok=True)
    deb = cache_dir / "fonts-arphic-ukai.deb"
    if not deb.exists():
        print(f"下載 {DEB_URL} ...")
        urllib.request.urlretrieve(DEB_URL, deb)
    extract_dir = cache_dir / "deb"
    extract_dir.mkdir(exist_ok=True)
    subprocess.run(["ar", "x", str(deb)], cwd=extract_dir, check=True)
    data_tar = next(extract_dir.glob("data.tar.*"))
    with tarfile.open(data_tar) as tf:
        tf.extractall(extract_dir)
    ttc = extract_dir / "usr/share/fonts/truetype/arphic/ukai.ttc"
    lic = extract_dir / "usr/share/doc/fonts-arphic-ukai/copyright"
    return ttc, lic


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", help="ukai.ttc 的路徑（不給就自動下載）")
    parser.add_argument("--license", help="授權文字檔路徑（不給就用下載包內的 copyright）")
    args = parser.parse_args()

    from fontTools import subset
    from fontTools.ttLib import TTCollection, TTFont

    if args.source:
        ttc_path = Path(args.source)
        lic_path = Path(args.license) if args.license else None
    else:
        ttc_path, lic_path = download_ttc(ROOT / ".cache" / "fonts")

    chars = set(all_characters()) | set(EXTRA_TEXT)
    chars.discard(" ")
    print(f"子集化 {len(chars)} 個字...")

    if ttc_path.suffix.lower() == ".ttc":
        collection = TTCollection(str(ttc_path))
        font = collection.fonts[TTC_INDEX_TW]
        # 先存成單一 ttf 再交給 subsetter，避免 TTC 的共用表造成問題
        buf = io.BytesIO()
        font.save(buf)
        buf.seek(0)
        font = TTFont(buf)
    else:
        font = TTFont(str(ttc_path))

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    options.hinting = False
    options.desubroutinize = True

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=[ord(c) for c in chars])
    subsetter.subset(font)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    font.save(str(OUT_FONT))
    size_kb = OUT_FONT.stat().st_size / 1024
    print(f"輸出 {OUT_FONT.relative_to(ROOT)} ({size_kb:.0f} KB)")

    if lic_path and lic_path.exists():
        text = lic_path.read_text(encoding="utf-8", errors="replace")
        header = (
            "AR PL UKai TW (文鼎 PL 中楷) — subset for RightWrite / 一字千金\n"
            "This file is a derivative (character subset, format conversion) of the\n"
            "AR PL UKai TW font, redistributed under the ARPHIC PUBLIC LICENSE below.\n"
            f"Source package: {DEB_URL}\n\n"
        )
        OUT_LICENSE.write_text(header + text, encoding="utf-8")
        print(f"輸出 {OUT_LICENSE.relative_to(ROOT)}")

    # 確認所有字都有字形
    cmap = font.getBestCmap()
    missing = [c for c in sorted(chars) if ord(c) not in cmap]
    if missing:
        print("警告：以下字沒有字形，會改用備援字型顯示：", "".join(missing))
    else:
        print("所有字都有字形 ✓")


if __name__ == "__main__":
    main()
