import random
from collections import Counter

import pytest

from main import _weighted_sample_without_replacement


def test_empty_returns_empty():
    assert _weighted_sample_without_replacement([], [], 5) == []


def test_k_zero_returns_empty():
    assert _weighted_sample_without_replacement(["a", "b"], [1.0, 1.0], 0) == []


def test_k_at_least_population_returns_full_population():
    # When k >= len(population), all are returned
    result = _weighted_sample_without_replacement(["a", "b", "c"], [1.0, 1.0, 1.0], 10)
    assert sorted(result) == ["a", "b", "c"]


def test_no_replacement_unique():
    pop = list(range(20))
    weights = [1.0] * 20
    out = _weighted_sample_without_replacement(pop, weights, 5)
    assert len(out) == 5
    assert len(set(out)) == 5


def test_heavily_weighted_item_appears_far_more_often():
    """Item with weight=100 should be sampled in nearly every draw."""
    random.seed(0)
    pop = ["heavy", "light1", "light2", "light3", "light4"]
    weights = [100.0, 1.0, 1.0, 1.0, 1.0]
    counter = Counter()
    trials = 500
    for _ in range(trials):
        out = _weighted_sample_without_replacement(pop, weights, 1)
        counter.update(out)
    # heavy should be picked in > 90% of trials with such skew
    assert counter["heavy"] > trials * 0.9


def test_uniform_weights_distribute_roughly_evenly():
    random.seed(0)
    pop = ["a", "b", "c", "d"]
    weights = [1.0, 1.0, 1.0, 1.0]
    counter = Counter()
    trials = 4000
    for _ in range(trials):
        counter.update(_weighted_sample_without_replacement(pop, weights, 1))
    for item in pop:
        assert 0.18 < counter[item] / trials < 0.32  # tolerance around 0.25


def test_raises_on_mismatched_lengths():
    with pytest.raises(ValueError):
        _weighted_sample_without_replacement(["a", "b"], [1.0], 1)


def test_zero_weight_never_selected():
    random.seed(0)
    pop = ["a", "b", "c"]
    weights = [0.0, 1.0, 1.0]
    counter = Counter()
    for _ in range(200):
        counter.update(_weighted_sample_without_replacement(pop, weights, 1))
    assert counter["a"] == 0
