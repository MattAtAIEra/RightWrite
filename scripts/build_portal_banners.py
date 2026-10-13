"""把首頁入口橫幅原圖裁成兩張 WebP（改錯字神器、一字千金）。

原圖是上下兩張橫幅中間夾一條白色分隔帶。這支程式自動找出分隔帶，
上半輸出成改錯字神器、下半輸出成一字千金，各產生 1672 與 836 寬兩種尺寸，
給首頁 Portal 的 <img srcset> 使用。換新的原圖後重跑一次即可。

    pip install pillow && python scripts/build_portal_banners.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "doc" / "Adventure Learning Banners_ Find and Write.png"
OUT_DIR = ROOT / "frontend" / "src" / "portal" / "banners"
WIDTHS = (1672, 836)
QUALITY = 82


def find_separator(im: Image.Image) -> tuple[int, int]:
    """回傳白色分隔帶的第一列與最後一列（整列 95% 以上的像素接近白色）。"""
    w, h = im.size
    rows = []
    for y in range(h // 4, h * 3 // 4):
        px = [im.getpixel((x, y)) for x in range(0, w, 4)]
        if sum(1 for r, g, b in px if min(r, g, b) > 235) / len(px) > 0.95:
            rows.append(y)
    if not rows:
        raise SystemExit("找不到上下橫幅之間的白色分隔帶")
    return rows[0], rows[-1]


def main() -> None:
    im = Image.open(SOURCE).convert("RGB")
    w, h = im.size
    sep_top, sep_bottom = find_separator(im)
    # 分隔帶上下各多讓 2 列，避開和白色混色的邊緣
    top = im.crop((0, 0, w, sep_top - 2))
    bottom = im.crop((0, sep_bottom + 3, w, h))
    # 兩張裁成一樣高，首頁上下排列時比例一致；較高的那張上下平均裁掉
    height = min(top.height, bottom.height)
    def trim(banner: Image.Image) -> Image.Image:
        extra = banner.height - height
        return banner.crop((0, extra // 2, w, extra // 2 + height))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, banner in (("rightwrite", trim(top)), ("yzqj", trim(bottom))):
        for width in WIDTHS:
            out = banner if width == w else banner.resize((width, round(height * width / w)), Image.LANCZOS)
            path = OUT_DIR / f"{name}-{width}.webp"
            out.save(path, "WEBP", quality=QUALITY, method=6)
            print(f"{path.relative_to(ROOT)}  {out.size[0]}x{out.size[1]}  {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
