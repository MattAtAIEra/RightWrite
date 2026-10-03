"""115上 / 114下 term support in the vocab registry and API."""
import random

from fastapi.testclient import TestClient

from main import app, generate_article_with_errors
from vocab_data import get_grade_registry, get_grade_info, get_vocab_data

client = TestClient(app)


def test_registry_has_both_terms_for_every_grade_and_publisher():
    reg = get_grade_registry()
    terms = {}
    for gid, info in reg.items():
        terms.setdefault(info["term"], set()).add((info["grade"], info["publisher"]))
    assert set(terms) == {"114_2", "115_1"}
    assert len(terms["114_2"]) == 18
    assert len(terms["115_1"]) == 18


def test_legacy_ids_still_point_to_114_2():
    # Stored sessions/charStats in users' browsers reference these ids.
    assert get_grade_info("4_kangxuan")["term"] == "114_2"
    assert get_grade_info("grade4")["term"] == "114_2"  # alias
    assert get_grade_info("115_1_4_kangxuan")["term"] == "115_1"
    assert get_grade_info("115_1_4_kangxuan")["term_label"] == "115上學期"


def test_api_grades_exposes_term_fields():
    res = client.get("/api/grades")
    assert res.status_code == 200
    grades = res.json()["grades"]
    g = next(x for x in grades if x["id"] == "115_1_4_kangxuan")
    assert g["term"] == "115_1"
    assert g["term_label"] == "115上學期"
    assert g["label"] == "四上-康軒版"
    legacy = next(x for x in grades if x["id"] == "4_kangxuan")
    assert legacy["term_label"] == "114下學期"


def test_api_lessons_115_1_kangxuan_grade4():
    res = client.get("/api/lessons", params={"grade_id": "115_1_4_kangxuan"})
    assert res.status_code == 200
    body = res.json()
    assert body["semester"] == "115學年度第1學期"
    assert body["total_lessons"] == 12
    lesson1 = next(l for l in body["lessons"] if l["lesson_number"] == 1)
    assert lesson1["title"] == "水陸小高手"
    # matches 大腦與語言實驗室 115上 康軒 四上 第1課
    assert lesson1["characters"] == list("泳串般姿溜耳鷹滑遨緩陀螺轉躍煩")


def test_generate_works_for_115_1():
    random.seed(1)
    result = generate_article_with_errors(1, 6, "sentence", "115_1_4_kangxuan")
    assert len(result["wrong_chars"]) >= 5
    lesson_chars = {
        c["char"] for l in get_vocab_data("115_1_4_kangxuan").values() for c in l["characters"]
    }
    for wc in result["wrong_chars"]:
        assert wc["correct_char"] in lesson_chars
        assert wc["wrong_char"] != wc["correct_char"]
