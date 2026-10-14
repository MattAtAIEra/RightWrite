#!/usr/bin/env python3
"""
一字千金 — 書法字型子集化工具

從「文鼎 PL 中楷」(AR PL UKai TW, Arphic Public License) 擷取成語資料會用到的字，
輸出成 woff2 放到 frontend/public/fonts/，並產生 frontend/src/yzqj/calligraphy-font.css 的 @font-face。

為什麼要子集化：完整的 CJK 字型約 17MB，只留成語用到的字可以小很多。
為什麼拆成兩個檔：題庫有一千多個成語、兩千多個字，全部放一個檔約 1.5MB。
  - ARPLUKaiTW-yzqj.woff2：「一般常用」成語（含錯字）與介面文字用到的字，平常出題只會用到這個檔
  - ARPLUKaiTW-yzqj-ext.woff2：其餘只有「進階」或「不出題」成語才用到的字
  兩個 @font-face 用 unicode-range 標明各自涵蓋哪些字，瀏覽器遇到補充檔裡的字才會下載它。

用法：
    pip install fonttools brotli
    python scripts/build_calligraphy_font.py [--source /path/to/ukai.ttc]

重新產生 backend/idiom_bank.json、或新增自訂成語之後，要重新執行一次這個腳本。
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

from idioms_data import all_characters, all_idioms  # noqa: E402

# Ubuntu 套件庫裡的 fonts-arphic-ukai（內含 ukai.ttc，4 個字面）
DEB_URL = (
    "http://archive.ubuntu.com/ubuntu/pool/main/f/fonts-arphic-ukai/"
    "fonts-arphic-ukai_0.2.20080216.2-5_all.deb"
)
TTC_INDEX_TW = 2  # ukai.ttc 內第 3 個字面是 "AR PL UKai TW"

OUT_DIR = ROOT / "frontend" / "public" / "fonts"
OUT_FONT = OUT_DIR / "ARPLUKaiTW-yzqj.woff2"
OUT_FONT_EXT = OUT_DIR / "ARPLUKaiTW-yzqj-ext.woff2"
OUT_CSS = ROOT / "frontend" / "src" / "yzqj" / "calligraphy-font.css"
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


def unicode_range(chars: set[str]) -> str:
    """把字集轉成 CSS unicode-range，連續的碼位合併成一段（U+4E00-4E05）。"""
    points = sorted(ord(c) for c in chars)
    spans: list[str] = []
    start = prev = points[0]
    for cp in points[1:] + [-1]:
        if cp == prev + 1:
            prev = cp
            continue
        spans.append(f"U+{start:X}" if start == prev else f"U+{start:X}-{prev:X}")
        start = prev = cp
    return ", ".join(spans)


def font_face(file_name: str, chars: set[str]) -> str:
    return (
        "@font-face {\n"
        '  font-family: "AR PL UKai TW";\n'
        f'  src: url("/fonts/{file_name}") format("woff2");\n'
        "  font-weight: normal;\n"
        "  font-style: normal;\n"
        "  font-display: swap;\n"
        f"  unicode-range: {unicode_range(chars)};\n"
        "}\n"
    )


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

    every = (set(all_characters()) | set(EXTRA_TEXT)) - {" "}
    core = set(EXTRA_TEXT) - {" "}
    for item in all_idioms():
        if item["level"] == "common":
            core.update(item["idiom"])
            core.update(char for _, char in item["wrong"])

    if ttc_path.suffix.lower() == ".ttc":
        # 先存成單一 ttf 再交給 subsetter，避免 TTC 的共用表造成問題
        buf = io.BytesIO()
        TTCollection(str(ttc_path)).fonts[TTC_INDEX_TW].save(buf)
        source = buf.getvalue()
    else:
        source = ttc_path.read_bytes()

    cmap = TTFont(io.BytesIO(source)).getBestCmap()
    missing = sorted(c for c in every if ord(c) not in cmap)
    core = {c for c in core if ord(c) in cmap}
    ext = {c for c in every if ord(c) in cmap} - core

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    options.hinting = False
    options.desubroutinize = True

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    faces = []
    for path, chars in ((OUT_FONT, core), (OUT_FONT_EXT, ext)):
        font = TTFont(io.BytesIO(source))
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=[ord(c) for c in chars])
        subsetter.subset(font)
        font.save(str(path))
        print(f"輸出 {path.relative_to(ROOT)}：{len(chars)} 個字，{path.stat().st_size / 1024:.0f} KB")
        faces.append(font_face(path.name, chars))

    OUT_CSS.write_text(
        "/* 由 scripts/build_calligraphy_font.py 產生，不要手動修改。\n"
        "   書法字型：文鼎 PL 中楷（AR PL UKai TW）子集。一般常用成語的字在第一個檔，其餘字在 -ext 檔；\n"
        "   unicode-range 讓瀏覽器只在畫面用到那些字時才下載 -ext。 */\n\n" + "\n".join(faces),
        encoding="utf-8",
    )
    print(f"輸出 {OUT_CSS.relative_to(ROOT)}")

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

    if missing:
        print("警告：以下字沒有字形，會改用備援字型顯示：", "".join(missing))
    else:
        print("所有字都有字形 ✓")


if __name__ == "__main__":
    main()
