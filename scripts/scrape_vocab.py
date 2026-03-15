"""
爬取教育部課文本國語生字資料
來源: https://pedia.cloud.edu.tw/Bookmark/Textword

使用方式:
  1. pip install playwright
  2. playwright install chromium
  3. python scripts/scrape_vocab.py

可選參數:
  --year 114_2        學年度學期 (預設 114_2)
  --degree 4          年級 (預設 4)
  --press 康軒版      出版社 (預設 康軒版)
  --output backend/vocab_data_scraped.json   輸出檔案

產出 JSON 格式可直接匯入系統使用。
"""

import argparse
import json
import sys
import time
from urllib.parse import quote


def build_url(category: str, year: str, degree: int, press: str) -> str:
    return (
        f"https://pedia.cloud.edu.tw/Bookmark/Textword"
        f"?category={quote(category)}"
        f"&year={year}"
        f"&degree={degree}"
        f"&press={quote(press)}"
    )


def scrape_vocab(year: str, degree: int, press: str) -> dict:
    """Use Playwright to load the page and extract vocabulary data."""
    from playwright.sync_api import sync_playwright

    url = build_url("國語", year, degree, press)
    print(f"正在開啟: {url}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            locale="zh-TW",
        )
        page = context.new_page()

        # Navigate and wait for content to load
        page.goto(url, wait_until="networkidle", timeout=30000)
        print("頁面已載入，等待內容渲染...")
        time.sleep(3)  # Extra wait for dynamic content

        # Debug: save screenshot and HTML for inspection
        page.screenshot(path="scripts/debug_screenshot.png", full_page=True)
        html_content = page.content()
        with open("scripts/debug_page.html", "w", encoding="utf-8") as f:
            f.write(html_content)
        print("已儲存截圖 (scripts/debug_screenshot.png) 和 HTML (scripts/debug_page.html)")

        # Try multiple strategies to extract data
        vocab_data = {}

        # Strategy 1: Look for table structures
        vocab_data = _try_table_extraction(page)
        if vocab_data:
            print(f"[表格策略] 成功抓取 {len(vocab_data)} 課資料")
            browser.close()
            return vocab_data

        # Strategy 2: Look for card/list structures
        vocab_data = _try_card_extraction(page)
        if vocab_data:
            print(f"[卡片策略] 成功抓取 {len(vocab_data)} 課資料")
            browser.close()
            return vocab_data

        # Strategy 3: Look for any structured content with lesson patterns
        vocab_data = _try_generic_extraction(page)
        if vocab_data:
            print(f"[通用策略] 成功抓取 {len(vocab_data)} 課資料")
            browser.close()
            return vocab_data

        # Strategy 4: If it's a SPA that needs interaction (click tabs/accordion)
        vocab_data = _try_interactive_extraction(page)
        if vocab_data:
            print(f"[互動策略] 成功抓取 {len(vocab_data)} 課資料")
            browser.close()
            return vocab_data

        print("⚠ 自動抓取失敗，請檢查 debug_screenshot.png 和 debug_page.html")
        print("  然後修改腳本中的 CSS selector 來匹配實際頁面結構")
        browser.close()
        return {}


def _try_table_extraction(page) -> dict:
    """Try extracting from HTML tables."""
    try:
        tables = page.query_selector_all("table")
        if not tables:
            return {}

        vocab_data = {}
        lesson_num = 0

        for table in tables:
            rows = table.query_selector_all("tr")
            for row in rows:
                cells = row.query_selector_all("td, th")
                texts = [c.inner_text().strip() for c in cells]

                # Look for lesson headers (e.g., "第一課", "L1", or lesson title)
                row_text = " ".join(texts)
                if _is_lesson_header(row_text):
                    lesson_num += 1
                    title = _extract_lesson_title(row_text)
                    vocab_data[lesson_num] = {"title": title, "characters": []}
                elif lesson_num > 0 and texts:
                    # Extract individual characters from the row
                    for text in texts:
                        chars = _extract_chinese_chars(text)
                        for c in chars:
                            vocab_data[lesson_num]["characters"].append({"char": c})

        # Filter out empty lessons
        return {k: v for k, v in vocab_data.items() if v["characters"]}
    except Exception as e:
        print(f"  表格策略錯誤: {e}")
        return {}


def _try_card_extraction(page) -> dict:
    """Try extracting from card/div-based layouts."""
    try:
        vocab_data = {}

        # Common patterns for lesson containers
        selectors = [
            ".lesson", ".unit", ".chapter",
            "[class*='lesson']", "[class*='unit']", "[class*='chapter']",
            ".card", ".panel", ".accordion-item",
            ".textword-item", ".word-list", ".char-list",
        ]

        for selector in selectors:
            elements = page.query_selector_all(selector)
            if len(elements) >= 3:  # At least a few lessons
                for i, el in enumerate(elements):
                    text = el.inner_text().strip()
                    chars = _extract_chinese_chars(text)
                    if chars:
                        # Try to find lesson title
                        title_el = el.query_selector("h2, h3, h4, .title, .name, .lesson-title")
                        title = title_el.inner_text().strip() if title_el else f"第{i+1}課"
                        vocab_data[i + 1] = {
                            "title": title,
                            "characters": [{"char": c} for c in chars],
                        }

                if vocab_data:
                    return vocab_data

        return {}
    except Exception as e:
        print(f"  卡片策略錯誤: {e}")
        return {}


def _try_generic_extraction(page) -> dict:
    """Try to find lesson/character data from full page text."""
    try:
        full_text = page.inner_text("body")
        lines = full_text.split("\n")
        vocab_data = {}
        current_lesson = 0

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Detect lesson headers
            if _is_lesson_header(line):
                current_lesson += 1
                title = _extract_lesson_title(line)
                vocab_data[current_lesson] = {"title": title, "characters": []}
            elif current_lesson > 0:
                # Look for lines that contain mostly single Chinese characters
                # (vocabulary lists often have characters separated by spaces or commas)
                chars = _extract_chinese_chars(line)
                if chars and len(chars) <= 20:  # Reasonable number per line
                    for c in chars:
                        if c not in [v["char"] for v in vocab_data[current_lesson]["characters"]]:
                            vocab_data[current_lesson]["characters"].append({"char": c})

        return {k: v for k, v in vocab_data.items() if v["characters"]}
    except Exception as e:
        print(f"  通用策略錯誤: {e}")
        return {}


def _try_interactive_extraction(page) -> dict:
    """Try clicking on tabs/accordion elements to reveal content."""
    try:
        # Look for clickable lesson tabs or accordion headers
        clickable_selectors = [
            ".tab", ".nav-link", ".accordion-header",
            "[role='tab']", "[data-toggle]",
            "a[href*='lesson']", "button:has-text('第')",
        ]

        for selector in clickable_selectors:
            tabs = page.query_selector_all(selector)
            if len(tabs) >= 3:
                vocab_data = {}
                for i, tab in enumerate(tabs):
                    tab_text = tab.inner_text().strip()
                    tab.click()
                    time.sleep(1)

                    # After clicking, look for character content
                    content = page.inner_text("body")
                    chars = _extract_chinese_chars(content)

                    # Only keep chars that appeared after this click
                    if chars:
                        title = _extract_lesson_title(tab_text) or f"第{i+1}課"
                        vocab_data[i + 1] = {
                            "title": title,
                            "characters": [{"char": c} for c in chars[:20]],
                        }

                if vocab_data:
                    return vocab_data

        return {}
    except Exception as e:
        print(f"  互動策略錯誤: {e}")
        return {}


def _is_lesson_header(text: str) -> bool:
    """Check if a text looks like a lesson header."""
    import re
    patterns = [
        r"第[一二三四五六七八九十\d]+課",
        r"第[一二三四五六七八九十\d]+單元",
        r"Lesson\s*\d+",
        r"L\d+",
        r"Unit\s*\d+",
        r"統整活動",
    ]
    return any(re.search(p, text) for p in patterns)


def _extract_lesson_title(text: str) -> str:
    """Extract a clean lesson title."""
    import re
    # Remove "第X課" prefix to get the title
    text = text.strip()
    match = re.search(r"第[一二三四五六七八九十\d]+課\s*(.*)", text)
    if match:
        return match.group(1).strip() or text
    return text[:20]  # Truncate if too long


def _extract_chinese_chars(text: str) -> list[str]:
    """Extract individual Chinese characters from text, filtering common/function words."""
    import re
    # Match CJK Unified Ideographs
    chars = re.findall(r"[\u4e00-\u9fff]", text)

    # Filter out very common function words that aren't likely vocabulary
    common = set("的了是在不我他她它們這那有會和與或但")
    return [c for c in chars if c not in common]


def generate_vocab_data_py(data: dict, year: str, degree: int, press: str) -> str:
    """Generate Python source code for vocab_data.py from scraped data."""
    lines = [
        '"""',
        f"{press} {year} {degree}年級國語 生字資料",
        "Source: https://pedia.cloud.edu.tw/Bookmark/Textword",
        "Auto-scraped by scripts/scrape_vocab.py",
        '"""',
        "",
        "VOCAB_DATA = {",
    ]

    for lesson_num in sorted(data.keys()):
        lesson = data[lesson_num]
        lines.append(f"    {lesson_num}: {{")
        lines.append(f'        "title": "{lesson["title"]}",')
        lines.append(f'        "characters": [')
        for ch in lesson["characters"]:
            char = ch["char"]
            wrong = ch.get("similar_wrong", [])
            wrong_str = json.dumps(wrong, ensure_ascii=False)
            lines.append(f'            {{"char": "{char}", "similar_wrong": {wrong_str}}},')
        lines.append(f"        ],")
        lines.append(f"    }},")

    lines.append("}")
    lines.append("")
    lines.append(f"TOTAL_LESSONS = {len(data)}")
    lines.append(f'SEMESTER_NAME = "{year}"')
    lines.append(f'GRADE = "{degree}年級"')
    lines.append(f'PUBLISHER = "{press}"')
    lines.append("")
    lines.append(f"MIDTERM_RANGE = (1, {len(data) // 2})")
    lines.append(f"FINAL_RANGE = ({len(data) // 2 + 1}, {len(data)})")
    lines.append("")
    lines.append("")
    lines.append("def get_lessons_in_range(start: int, end: int) -> dict:")
    lines.append('    """Get vocabulary data for a range of lessons."""')
    lines.append("    return {k: v for k, v in VOCAB_DATA.items() if start <= k <= end}")
    lines.append("")
    lines.append("")
    lines.append("def get_all_characters_in_range(start: int, end: int) -> list[dict]:")
    lines.append('    """Get all characters for a range of lessons, with lesson info."""')
    lines.append("    chars = []")
    lines.append("    for lesson_num, lesson_data in VOCAB_DATA.items():")
    lines.append("        if start <= lesson_num <= end:")
    lines.append('            for c in lesson_data["characters"]:')
    lines.append("                chars.append({")
    lines.append('                    "char": c["char"],')
    lines.append('                    "similar_wrong": c.get("similar_wrong", []),')
    lines.append('                    "lesson": lesson_num,')
    lines.append('                    "lesson_title": lesson_data["title"],')
    lines.append("                })")
    lines.append("    return chars")
    lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="爬取教育部課文本生字資料")
    parser.add_argument("--year", default="114_2", help="學年度學期 (例: 114_2)")
    parser.add_argument("--degree", type=int, default=4, help="年級 (例: 4)")
    parser.add_argument("--press", default="康軒版", help="出版社 (例: 康軒版)")
    parser.add_argument("--output", default="backend/vocab_data_scraped.json", help="輸出 JSON 檔")
    parser.add_argument("--generate-py", action="store_true", help="同時產生 vocab_data.py")
    args = parser.parse_args()

    print(f"=== 教育部生字爬蟲 ===")
    print(f"學年度: {args.year}")
    print(f"年級: {args.degree}")
    print(f"出版社: {args.press}")
    print()

    data = scrape_vocab(args.year, args.degree, args.press)

    if not data:
        print("\n❌ 未能抓取到任何資料")
        print("請檢查:")
        print("  1. scripts/debug_screenshot.png - 頁面截圖")
        print("  2. scripts/debug_page.html - 頁面原始碼")
        print("  3. 根據實際頁面結構修改 CSS selectors")
        sys.exit(1)

    # Save JSON
    output = {
        "metadata": {
            "year": args.year,
            "degree": args.degree,
            "press": args.press,
            "total_lessons": len(data),
            "source_url": build_url("國語", args.year, args.degree, args.press),
        },
        "lessons": data,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n✅ 已儲存 JSON: {args.output}")

    # Print summary
    print(f"\n📊 抓取結果:")
    for num in sorted(data.keys()):
        lesson = data[num]
        char_str = "、".join(c["char"] for c in lesson["characters"])
        print(f"  第{num}課 {lesson['title']}: {char_str}")

    # Optionally generate Python file
    if args.generate_py:
        py_content = generate_vocab_data_py(data, args.year, args.degree, args.press)
        py_path = "backend/vocab_data.py"
        with open(py_path, "w", encoding="utf-8") as f:
            f.write(py_content)
        print(f"\n✅ 已產生 Python 檔: {py_path}")

    print(f"\n共 {len(data)} 課, {sum(len(v['characters']) for v in data.values())} 個生字")


if __name__ == "__main__":
    main()
