"""
Download vocabulary Excel files from pedia.cloud.edu.tw
for all grades (1-6) and publishers (康軒版, 南一版, 翰林版).
114 學年度第 2 學期
"""
import os
import re
import subprocess
import time

BASE_URL = "https://pedia.cloud.edu.tw"
TEXTWORD_URL = f"{BASE_URL}/Bookmark/Textword"
TCOLLECTION_URL = f"{BASE_URL}/Bookmark/TCollection"
EXPORT_URL = f"{BASE_URL}/Bookmark/ExportExcel"

RESOURCE_DIR = os.path.join(os.path.dirname(__file__), "..", "resource")
COOKIE_FILE = "/tmp/pedia_cookies.txt"

PUBLISHERS = ["康軒版", "南一版", "翰林版"]
GRADES = [1, 2, 3, 4, 5, 6]
GRADE_CN = {1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六"}
YEAR = "114_2"
SEMESTER_LABEL = "下"


def curl_get(url: str) -> str:
    """GET a URL using curl, returns response body."""
    result = subprocess.run(
        ["curl", "-sS", "-c", COOKIE_FILE, "-b", COOKIE_FILE, url],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"curl GET failed: {result.stderr}")
    return result.stdout


def curl_post_download(url: str, data: dict, output_path: str) -> bool:
    """POST to a URL using curl and save the response to a file."""
    args = ["curl", "-sS", "-b", COOKIE_FILE, "-o", output_path, "-w", "%{http_code}"]
    for k, v in data.items():
        args.extend(["-d", f"{k}={v}"])
    args.append(url)

    result = subprocess.run(args, capture_output=True, text=True)
    status = result.stdout.strip()
    return status == "200"


def get_session_and_token() -> str:
    """Fetch a TCollection page to get CSRF token and session cookies."""
    html = curl_get(f"{TCOLLECTION_URL}?TextNameId=0103041140201")
    match = re.search(
        r'name="__RequestVerificationToken"[^>]*value="([^"]*)"', html
    )
    if not match:
        raise RuntimeError("Could not find CSRF token")
    return match.group(1)


def get_lessons(grade: int, press: str) -> list[dict]:
    """Fetch the Textword page and extract lesson IDs and names."""
    from urllib.parse import urlencode
    params = urlencode({"category": "國語", "year": YEAR, "degree": str(grade), "press": press})
    html = curl_get(f"{TEXTWORD_URL}?{params}")

    ids = re.findall(r'class="textname"[^>]*id="(\d+)"', html)
    names = re.findall(r"<strong>(第[^<]+)</strong>", html)

    lessons = []
    for i, text_id in enumerate(ids):
        name = names[i] if i < len(names) else f"lesson_{i+1}"
        lessons.append({"id": text_id, "name": name})
    return lessons


def download_excel(token: str, text_name_id: str, output_path: str) -> bool:
    """Download an Excel file for a given TextNameId."""
    ok = curl_post_download(
        EXPORT_URL,
        {
            "__RequestVerificationToken": token,
            "textNameId": text_name_id,
            "isAllWords": "true",
            "createtype": "textbook",
            "s": "All",
        },
        output_path,
    )
    if not ok:
        return False
    # Verify it's actually an Excel file (starts with PK zip header)
    with open(output_path, "rb") as f:
        header = f.read(2)
    if header != b"PK":
        os.remove(output_path)
        return False
    return True


def main():
    # Clean up old cookie file
    if os.path.exists(COOKIE_FILE):
        os.remove(COOKIE_FILE)

    print("Getting session and CSRF token...")
    token = get_session_and_token()
    print(f"Token: {token[:20]}...")

    total = 0
    failed = 0

    for press in PUBLISHERS:
        for grade in GRADES:
            dir_name = f"{GRADE_CN[grade]}{SEMESTER_LABEL}-{press}"
            out_dir = os.path.join(RESOURCE_DIR, dir_name)
            os.makedirs(out_dir, exist_ok=True)

            print(f"\n=== {dir_name} ===")
            lessons = get_lessons(grade, press)
            if not lessons:
                print("  No lessons found, skipping.")
                continue

            print(f"  Found {len(lessons)} lessons")

            for lesson in lessons:
                filename = f"{lesson['name']}.xlsx"
                filepath = os.path.join(out_dir, filename)

                if os.path.exists(filepath):
                    print(f"  SKIP (exists): {filename}")
                    total += 1
                    continue

                ok = download_excel(token, lesson["id"], filepath)
                if ok:
                    size = os.path.getsize(filepath)
                    print(f"  OK: {filename} ({size} bytes)")
                    total += 1
                else:
                    failed += 1
                    print(f"  FAILED: {filename} (id={lesson['id']})")

                time.sleep(0.3)

    print(f"\nDone! {total} files total, {failed} failures.")


if __name__ == "__main__":
    main()
