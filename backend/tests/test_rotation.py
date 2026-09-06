"""同一課連做兩次不該拿到同一批題目 — 詞語輪替與錯字變體輪替。"""
import random

from main import (
    _pick_variant,
    _pick_words_with_rotation,
    generate_article_with_errors,
)


def _usable(words):
    """做出 _pick_words_with_rotation 需要的最小 shape。"""
    return [{"word": w, "_swappable": [(0, w[0])]} for w in words]


def test_fresh_words_win_over_recent_ones():
    pool = _usable(["甲一", "乙二", "丙三", "丁四", "戊五", "己六"])
    recent = [["甲一", "乙二", "丙三"]]  # 上一輪出過的
    random.seed(1)
    picked = {c["word"] for c in _pick_words_with_rotation(pool, 3, None, recent)}
    assert picked == {"丁四", "戊五", "己六"}


def test_falls_back_to_oldest_rounds_when_pool_too_small():
    pool = _usable(["甲一", "乙二", "丙三", "丁四"])
    # 上一輪出了甲乙，更早那一輪出了丙丁 → 補的時候要先拿比較舊的丙丁
    recent = [["甲一", "乙二"], ["丙三", "丁四"]]
    random.seed(2)
    picked = {c["word"] for c in _pick_words_with_rotation(pool, 2, None, recent)}
    assert picked == {"丙三", "丁四"}


def test_never_returns_more_than_asked_or_duplicates():
    pool = _usable(["甲一", "乙二", "丙三", "丁四", "戊五"])
    random.seed(3)
    picked = _pick_words_with_rotation(pool, 4, None, [["甲一", "乙二"]])
    words = [c["word"] for c in picked]
    assert len(words) == 4
    assert len(set(words)) == 4


def test_weighted_chars_still_apply_within_fresh_words():
    pool = [
        {"word": "甲一", "_swappable": [(0, "甲")]},
        {"word": "乙二", "_swappable": [(0, "乙")]},
        {"word": "丙三", "_swappable": [(0, "丙")]},
    ]
    random.seed(4)
    hits = 0
    for _ in range(30):
        picked = _pick_words_with_rotation(pool, 1, {"丙": 1000.0}, None)
        if picked[0]["word"] == "丙三":
            hits += 1
    assert hits > 25


def test_variant_avoids_the_combination_just_used():
    comp = {"word": "環境", "_swappable": [(0, "環"), (1, "境")]}
    lookup = {"環": ["幻"], "境": ["敬", "靜"]}
    used = {"環境|環|幻", "環境|境|敬"}
    random.seed(5)
    for _ in range(20):
        idx, correct, wrong = _pick_variant(comp, lookup, used)
        assert (correct, wrong) == ("境", "靜")
        assert comp["word"][idx] == correct


def test_variant_reuses_when_every_combination_is_exhausted():
    comp = {"word": "環境", "_swappable": [(0, "環")]}
    lookup = {"環": ["幻"]}
    idx, correct, wrong = _pick_variant(comp, lookup, {"環境|環|幻"})
    assert (idx, correct, wrong) == (0, "環", "幻")


def test_single_lesson_second_round_barely_overlaps():
    """真實資料:第 4 課(4_kangxuan)單課連做兩次,重疊的詞要明顯變少。"""
    random.seed(7)
    first = generate_article_with_errors(4, 4, "sentence", "4_kangxuan")
    first_words = [wc["word"] for wc in first["wrong_chars"]]
    second = generate_article_with_errors(
        4, 4, "sentence", "4_kangxuan",
        recent_rounds=[first_words],
        recent_variants=[
            f'{wc["word"]}|{wc["correct_char"]}|{wc["wrong_char"]}'
            for wc in first["wrong_chars"]
        ],
    )
    second_words = [wc["word"] for wc in second["wrong_chars"]]

    overlap = set(first_words) & set(second_words)
    # 單課詞池只有 8 個左右,一次出 5～7 題,不可能完全不重疊;
    # 但重疊的詞必須少於第二輪的一半,而且重疊的詞一定要換不同的錯字組合。
    assert len(overlap) < len(second_words) / 2

    first_variants = {
        f'{wc["word"]}|{wc["correct_char"]}|{wc["wrong_char"]}' for wc in first["wrong_chars"]
    }
    second_variants = {
        f'{wc["word"]}|{wc["correct_char"]}|{wc["wrong_char"]}' for wc in second["wrong_chars"]
    }
    assert not (first_variants & second_variants)


# --- 錯字要以同音為主 ---------------------------------------------------------

def test_variant_prefers_a_homophone_over_a_lookalike():
    comp = {"word": "耳朵", "_swappable": [(0, "耳")]}
    # 聞 wén／茸 róng 只是字形像,爾 ěr 才是同音
    lookup = {"耳": ["聞", "茸", "爾"]}
    for _ in range(20):
        assert _pick_variant(comp, lookup, set())[2] == "爾"


def test_exact_homophone_beats_same_sound_different_tone():
    comp = {"word": "健康", "_swappable": [(1, "康")]}
    lookup = {"康": ["抗", "慷"]}  # 抗 kàng 只是同韻不同調,慷 kāng 完全同音
    for _ in range(20):
        assert _pick_variant(comp, lookup, set())[2] == "慷"


def test_falls_back_to_near_sound_before_repeating_an_exact_homophone():
    comp = {"word": "健康", "_swappable": [(1, "康")]}
    lookup = {"康": ["慷", "抗"]}
    # 「慷」上次考過了 → 換讀音次近的「抗」,而不是再考一次「慷」
    assert _pick_variant(comp, lookup, {"健康|康|慷"})[2] == "抗"


def test_uses_a_lookalike_only_when_nothing_sounds_alike():
    comp = {"word": "船艘", "_swappable": [(1, "艘")]}
    lookup = {"艘": ["嫂"]}  # sōu vs sǎo,只有這個候選
    assert _pick_variant(comp, lookup, set())[2] == "嫂"


def test_generated_wrong_chars_sound_like_the_correct_ones():
    """真實資料:整個學期出的錯字,幾乎都要跟正字同音或近音。"""
    from main import _sound_tier

    random.seed(13)
    tiers = []
    for lesson in range(1, 13):
        result = generate_article_with_errors(lesson, lesson, "sentence", "115_1_4_kangxuan")
        tiers += [
            _sound_tier(wc["correct_char"], wc["wrong_char"]) for wc in result["wrong_chars"]
        ]
    assert sum(1 for t in tiers if t == 2) / len(tiers) < 0.05
    assert sum(1 for t in tiers if t == 0) / len(tiers) > 0.8


def test_prefers_a_character_kids_have_actually_seen():
    comp = {"word": "幸福", "_swappable": [(0, "幸")]}
    lookup = {"幸": ["婞", "姓"]}  # 兩個都跟「幸」同音,但「婞」課本從來不教
    for _ in range(20):
        assert _pick_variant(comp, lookup, set())[2] == "姓"


def test_sound_still_wins_over_familiarity():
    comp = {"word": "耳朵", "_swappable": [(0, "耳")]}
    lookup = {"耳": ["聞", "邇"]}  # 聞很常見但不同音,邇 ěr 冷僻卻同音
    for _ in range(20):
        assert _pick_variant(comp, lookup, set())[2] == "邇"
