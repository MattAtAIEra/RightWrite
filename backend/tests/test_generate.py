import random
from collections import Counter

from main import generate_article_with_errors


def test_uniform_no_weights_works_same_as_before():
    random.seed(0)
    result = generate_article_with_errors(1, 3, "sentence", "4_kangxuan")
    assert "wrong_chars" in result
    assert len(result["wrong_chars"]) >= 5


def test_weighted_chars_skews_selection():
    """Heavily weighted chars appear in wrong_chars more often."""
    # Pick a char that's definitely in lessons 1-3 of 4_kangxuan
    from vocab_data import get_all_characters_in_range
    chars = get_all_characters_in_range(1, 3, "4_kangxuan")
    target_char = chars[0]["char"]  # some char in range

    random.seed(0)
    counts = Counter()
    trials = 30  # heavy weight, so each trial likely picks target_char
    for _ in range(trials):
        result = generate_article_with_errors(
            1, 3, "sentence", "4_kangxuan",
            weighted_chars={target_char: 1000.0},
        )
        for wc in result["wrong_chars"]:
            counts[wc["correct_char"]] += 1

    # target_char should be the most-picked correct_char
    top = counts.most_common(1)[0][0]
    assert top == target_char
