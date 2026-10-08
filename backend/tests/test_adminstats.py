# Unit tests for services/adminstats.py. Run:  python -m unittest discover -s tests
import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services import adminstats  # noqa: E402


class LastDays(unittest.TestCase):
    def test_fills_days_with_no_signups(self):
        out = adminstats.last_days([date(2026, 10, 8), date(2026, 10, 8), date(2026, 10, 6)], 4, date(2026, 10, 8))
        self.assertEqual([d["date"] for d in out], ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"])
        self.assertEqual([d["count"] for d in out], [0, 1, 0, 2])

    def test_ignores_dates_outside_the_window(self):
        out = adminstats.last_days([date(2026, 9, 1)], 3, date(2026, 10, 8))
        self.assertEqual([d["count"] for d in out], [0, 0, 0])

    def test_empty(self):
        self.assertEqual(len(adminstats.last_days([], 14, date(2026, 10, 8))), 14)


class RatingCounts(unittest.TestCase):
    def test_always_returns_ten_buckets(self):
        out = adminstats.rating_counts([(9, 3), (5, 1)])
        self.assertEqual([r["rating"] for r in out], list(range(1, 11)))
        self.assertEqual(out[8]["count"], 3)
        self.assertEqual(out[4]["count"], 1)
        self.assertEqual(out[0]["count"], 0)

    def test_none_and_zero_are_skipped(self):
        self.assertEqual(sum(r["count"] for r in adminstats.rating_counts([(None, 4), (0, 2)])), 0)


class TallyGenres(unittest.TestCase):
    def test_weights_count_and_order(self):
        out = adminstats.tally_genres([(["Drama", "Sci-Fi"], 5), (["Drama"], 1), (["Horror"], 2)])
        self.assertEqual(out[0], {"name": "Drama", "count": 6})
        self.assertEqual(out[1], {"name": "Sci-Fi", "count": 5})
        self.assertEqual(out[2], {"name": "Horror", "count": 2})

    def test_limit(self):
        out = adminstats.tally_genres([([f"G{i}"], 1) for i in range(10)], limit=3)
        self.assertEqual(len(out), 3)

    def test_ties_are_alphabetical(self):
        out = adminstats.tally_genres([(["B"], 1), (["A"], 1)])
        self.assertEqual([g["name"] for g in out], ["A", "B"])


class EscapeLike(unittest.TestCase):
    def test_wildcards_are_escaped(self):
        self.assertEqual(adminstats.escape_like("100%_done"), "100\\%\\_done")
        self.assertEqual(adminstats.escape_like("a\\b"), "a\\\\b")


if __name__ == "__main__":
    unittest.main()
