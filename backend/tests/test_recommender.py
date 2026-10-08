# tests/test_recommender.py - automatic tests for the recommendation logic.
# Run from the backend folder:   python -m unittest discover -s tests -v
# They use only the standard library and a FAKE TMDB, so they need no internet,
# no API key and no database.
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so "services" can be imported

from services import engine  # noqa: E402
from services import recommender as rec  # noqa: E402

BANK = rec.load_bank()
BANK_BY_ID = {q["id"]: q for q in BANK}


def card(tmdb_id, genres, rating=7.5, votes=5000, media_type="movie", title=None):
    # A fake TMDB card.
    return {"tmdb_id": tmdb_id, "media_type": media_type, "title": title or f"Title {tmdb_id}",
            "poster_url": "http://x/p.jpg", "release_date": "2020-01-01", "rating": rating,
            "overview": "", "genre_ids": genres, "vote_count": votes}


class FakeTmdb:
    # Pretends to be services/tmdb.py. `catalog` = {(media_type, id): card}.
    def __init__(self, catalog, recs=None):
        self.catalog, self.recs = catalog, recs or {}
        self.discover_calls = []

    def cards_for(self, refs, skip_errors=False):
        return [self.catalog.get(ref) for ref in refs]

    def recommendations(self, media_type, tmdb_id):
        return [self.catalog[(media_type, i)] for i in self.recs.get(tmdb_id, [])]

    def discover(self, media_type, genre_ids=None, page=1, sort="popularity.desc", min_votes=200):
        self.discover_calls.append((media_type, genre_ids, sort))
        wanted = set(genre_ids or [])
        found = [c for (m, _), c in self.catalog.items()
                 if m == media_type and (not wanted or wanted & set(c["genre_ids"]))]
        return {"page": page, "total_pages": 1, "results": found}


class GenreTests(unittest.TestCase):
    def test_series_genres_are_expanded(self):
        self.assertEqual(rec.normalize_genres([10759, 18]), [28, 12, 18])

    def test_unknown_genres_dropped_and_no_repeats(self):
        self.assertEqual(rec.normalize_genres([10763, 28, 28]), [28])

    def test_to_tmdb_genres_for_series(self):
        self.assertEqual(rec.to_tmdb_genres("tv", [28, 12, 27]), [10759])  # horror has no series genre

    def test_every_genre_has_traits(self):
        self.assertEqual(set(rec.GENRES), set(rec.GENRE_TRAITS))


class ProfileTests(unittest.TestCase):
    def test_rating_weights(self):
        self.assertAlmostEqual(rec.signal_weight("rating", 10), 1.0)
        self.assertAlmostEqual(rec.signal_weight("rating", 1), -1.0)
        self.assertAlmostEqual(rec.signal_weight("rating", 5.5), 0.0)

    def test_skip_gives_no_information(self):
        self.assertEqual(rec.signal_weight("skip"), 0.0)

    def test_profile_prefers_liked_genres(self):
        profile = rec.build_profile([([878], 1.0), ([878, 18], 1.0), ([27], -1.0)])
        self.assertGreater(profile[878], profile[18])
        self.assertLess(profile[27], 0)
        self.assertAlmostEqual(max(abs(v) for v in profile.values()), 1.0)

    def test_empty_profile(self):
        self.assertEqual(rec.build_profile([]), {})
        self.assertEqual(rec.profile_match([28], {}), 0.0)

    def test_top_genres_order(self):
        self.assertEqual(rec.top_genres({1: .2, 2: .9, 3: -.5}, 2), [2, 1])
        self.assertEqual(rec.top_genres({1: .2, 2: .9, 3: -.5}, 1, positive=False), [3])


class MoodTests(unittest.TestCase):
    def test_bank_is_valid(self):
        self.assertGreaterEqual(len(BANK), 60)
        self.assertEqual(len(BANK_BY_ID), len(BANK))          # unique ids
        for q in BANK:
            self.assertTrue(set(q["traits"]) <= set(rec.AXES), q["id"])
            self.assertTrue(set(q["genres"]) <= set(rec.GENRES), q["id"])
            self.assertTrue(all(-1 <= v <= 1 for v in q["traits"].values()), q["id"])
        # every axis is covered in both directions
        for axis in rec.AXES:
            values = [q["traits"][axis] for q in BANK if axis in q["traits"]]
            self.assertTrue(any(v > 0.5 for v in values) and any(v < -0.5 for v in values), axis)

    def test_like_moves_toward_dislike_moves_away(self):
        dark = next(q for q in BANK if q["id"] == "q03")                 # a horror scenario, tone -1
        liked = rec.mood_from_answers([{"id": dark["id"], "answer": 1}], BANK_BY_ID)
        disliked = rec.mood_from_answers([{"id": dark["id"], "answer": -1}], BANK_BY_ID)
        self.assertLess(liked["axes"]["tone"], 0)
        self.assertGreater(disliked["axes"]["tone"], 0)

    def test_meh_teaches_nothing(self):
        mood = rec.mood_from_answers([{"id": "q03", "answer": 0}], BANK_BY_ID)
        self.assertFalse(rec.has_mood(mood))

    def test_quiz_never_repeats_and_first_questions_are_broad(self):
        for seed in range(30):
            answers, ids = [], []
            for step in range(rec.QUESTIONS_TOTAL):
                q = rec.next_question(answers, BANK, rec.make_rng(seed, step))
                self.assertIsNotNone(q)
                if step < 3:
                    self.assertTrue(q.get("broad"), f"seed {seed} step {step} not broad")
                self.assertNotIn(q["id"], ids)
                ids.append(q["id"])
                answers.append({"id": q["id"], "answer": random.Random(seed + step).choice([-1, 0, 1])})

    def test_same_seed_same_question(self):
        a = rec.next_question([], BANK, rec.make_rng(5, 0))
        b = rec.next_question([], BANK, rec.make_rng(5, 0))
        self.assertEqual(a["id"], b["id"])

    def test_quiz_covers_the_axes(self):
        # Always answering "like" must still explore all four axes within 8 questions.
        answers = []
        for step in range(rec.QUESTIONS_TOTAL):
            q = rec.next_question(answers, BANK, rec.make_rng(1, step))
            answers.append({"id": q["id"], "answer": 1})
        mood = rec.mood_from_answers(answers, BANK_BY_ID)
        for axis in rec.AXES:
            self.assertGreater(mood["evidence"][axis], 0.5, axis)

    def test_quiz_avoids_disliked_genre(self):
        # After disliking romance scenarios, another romance scenario should rarely come next.
        romance = [q for q in BANK if 10749 in q["genres"] and q["genres"][10749] >= 1]
        answers = [{"id": q["id"], "answer": -1} for q in romance[:2]]
        picked_romance = 0
        for seed in range(40):
            q = rec.next_question(answers, BANK, rec.make_rng(seed, 2))
            if q["genres"].get(10749, 0) >= 1:
                picked_romance += 1
        self.assertLess(picked_romance, 8)


class ScoringTests(unittest.TestCase):
    def setUp(self):
        # A user who loves sci-fi and drama and dislikes horror.
        self.profile = rec.build_profile([([878], 1.0), ([18], 0.8), ([27], -1.0)])
        self.nomood = rec.mood_from_answers([], {})

    def score(self, genres, rating=8.0, votes=5000, rec_bonus=0.0, mood=None, weights=rec.WEIGHTS_FOR_YOU):
        return rec.score_candidate({"genres": genres, "rating": rating, "votes": votes}, self.profile,
                                   mood or self.nomood, rec_bonus, weights)[0]

    def test_liked_genre_beats_disliked_genre(self):
        self.assertGreater(self.score([878]), self.score([27]))

    def test_quality_matters(self):
        self.assertGreater(self.score([878], rating=8.5), self.score([878], rating=6.0))

    def test_few_votes_reduce_trust(self):
        self.assertGreater(self.score([878], rating=9.0, votes=5000), self.score([878], rating=9.0, votes=5))

    def test_tmdb_recommendation_bonus(self):
        self.assertGreater(self.score([878], rec_bonus=0.8), self.score([878]))

    def test_mood_changes_the_ranking(self):
        # Mood: loves light, fast, escapist fun -> a comedy/action beats a slow drama.
        answers = [{"id": "q09", "answer": 1}, {"id": "q17", "answer": 1}, {"id": "q41", "answer": 1}]
        mood = rec.mood_from_answers(answers, BANK_BY_ID)
        fun = self.score([35, 28], mood=mood, weights=rec.WEIGHTS_QUIZ)
        heavy = self.score([18], mood=mood, weights=rec.WEIGHTS_QUIZ)
        self.assertGreater(fun, heavy)
        # ...and the opposite mood flips it
        answers = [{"id": "q25", "answer": 1}, {"id": "q36", "answer": 1}, {"id": "q49", "answer": 1}]
        mood = rec.mood_from_answers(answers, BANK_BY_ID)
        self.assertGreater(self.score([18], mood=mood, weights=rec.WEIGHTS_QUIZ),
                           self.score([35, 28], mood=mood, weights=rec.WEIGHTS_QUIZ))

    def test_lean_bonus(self):
        base = rec.score_candidate({"genres": [35], "rating": 7, "votes": 1000}, {}, self.nomood, 0, rec.WEIGHTS_QUIZ)[0]
        lean = rec.score_candidate({"genres": [35], "rating": 7, "votes": 1000}, {}, self.nomood, 0, rec.WEIGHTS_QUIZ, lean={35})[0]
        self.assertAlmostEqual(lean - base, 0.25)

    def test_explanations(self):
        candidate = {"genres": [878, 18], "rating": 8.2, "votes": 9000}
        total, parts = rec.score_candidate(candidate, self.profile, self.nomood, 0.8, rec.WEIGHTS_FOR_YOU)
        reasons = rec.explain(candidate, parts, self.profile, self.nomood, ["Arrival"])
        self.assertTrue(1 <= len(reasons) <= 3)
        self.assertTrue(any("Science Fiction" in r for r in reasons))
        self.assertTrue(any("Arrival" in r for r in reasons))

    def test_explanation_always_has_a_reason(self):
        candidate = {"genres": [], "rating": 5.0, "votes": 10}
        _, parts = rec.score_candidate(candidate, {}, self.nomood, 0, rec.WEIGHTS_QUIZ)
        self.assertEqual(len(rec.explain(candidate, parts, {}, self.nomood, [])), 1)

    def test_genres_for_mood_follow_the_mood(self):
        answers = [{"id": "q09", "answer": 1}, {"id": "q17", "answer": 1}]
        mood = rec.mood_from_answers(answers, BANK_BY_ID)
        top = rec.genres_for_mood(mood, {}, set())
        self.assertTrue({35, 28, 12, 16} & set(top))
        self.assertIn(27, rec.genres_for_mood(mood, {}, {27}))   # lean forces a genre in


def make_catalog():
    cat = {}
    cat[("movie", 1)] = card(1, [878, 18], 8.5, title="Arrival")
    cat[("movie", 2)] = card(2, [878, 53], 8.0, title="Space Thriller")
    cat[("movie", 3)] = card(3, [35], 7.5, title="Funny One")
    cat[("movie", 4)] = card(4, [27], 7.0, title="Scary One")
    cat[("movie", 5)] = card(5, [18], 8.1, title="Deep Drama")
    cat[("movie", 6)] = card(6, [878], 7.9, title="More Sci-Fi")
    cat[("movie", 7)] = card(7, [878, 12], 7.7, title="Sci-Fi Adventure")
    cat[("movie", 8)] = card(8, [18, 10749], 7.6, title="Romantic Drama")
    cat[("movie", 9)] = card(9, [878, 18], 8.3, title="Another Sci-Fi Drama")
    cat[("movie", 10)] = card(10, [878], 7.2, title="Sci-Fi Extra")
    for i in range(11, 25):                      # more sci-fi, so there is enough for several rows
        cat[("movie", i)] = card(i, [878, 12], 7.0 + (i % 5) / 10, title=f"Sci-Fi {i}")
    return cat


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.catalog = make_catalog()
        self.tmdb = FakeTmdb(self.catalog, recs={1: [2, 6, 9, 7, 10] + list(range(11, 25))})

    def rows(self, *items):
        return [{"media_type": "movie", "tmdb_id": i, "kind": k, "value": v} for i, k, v in items]

    def test_for_you_needs_signals(self):
        out = engine.for_you(self.rows((1, "rating", 9)), "movie", set(), self.tmdb)
        self.assertTrue(out["needs_more"])

    def test_for_you_rows(self):
        rows = self.rows((1, "rating", 10), (5, "rating", 8), (4, "dislike", None))
        out = engine.for_you(rows, "movie", {("movie", 1), ("movie", 5), ("movie", 4)}, self.tmdb)
        self.assertFalse(out["needs_more"])
        titles = [r["title"] for r in out["rows"]]
        self.assertEqual(titles[0], "Picked for you")
        self.assertIn("Because you liked Arrival", titles)
        shown = [(c["media_type"], c["tmdb_id"]) for r in out["rows"] for c in r["items"]]
        for gone in [("movie", 1), ("movie", 5), ("movie", 4)]:
            self.assertNotIn(gone, shown)                  # already seen titles never come back
        self.assertEqual(len(shown), len(set(shown)))      # no title in two rows
        # a sci-fi drama (the user's favorite mix) leads the first row
        self.assertIn(out["rows"][0]["items"][0]["tmdb_id"], (9, 2, 6))

    def test_taste_batch(self):
        batch = engine.taste_batch(5, "movie", {("movie", 1)}, self.tmdb, random.Random(1))
        self.assertTrue(all(c["poster_url"] for c in batch))
        self.assertNotIn(1, [c["tmdb_id"] for c in batch])
        self.assertLessEqual(len(batch), 5)

    def test_profile_summary(self):
        rows = self.rows((1, "rating", 10), (5, "rating", 8), (4, "dislike", None))
        summary = engine.profile_summary(rows, self.tmdb)
        self.assertEqual(summary["signals"], 3)
        names = [g["name"] for g in summary["top"]]
        self.assertEqual(names[0], "Drama")              # liked in two rated titles
        self.assertIn("Science Fiction", names)
        self.assertEqual(summary["low"][0]["name"], "Horror")

    def test_reel_asks_questions_then_picks(self):
        answers = []
        for step in range(rec.QUESTIONS_TOTAL):
            out = engine.reel(answers, 7, [], False, [], [], set(), BANK, self.tmdb)
            self.assertFalse(out["done"])
            self.assertEqual(out["asked"], step)
            answers.append({"id": out["question"]["id"], "answer": 1})
        out = engine.reel(answers, 7, [], False, [], [], set(), BANK, self.tmdb)
        self.assertTrue(out["done"])
        self.assertGreater(len(out["picks"]), 0)
        self.assertTrue(all(p["reasons"] for p in out["picks"]))

    def test_reel_finish_early_needs_enough_answers(self):
        few = [{"id": "q05", "answer": 1}]
        self.assertFalse(engine.reel(few, 1, [], True, [], [], set(), BANK, self.tmdb)["done"])
        enough = [{"id": i, "answer": 1} for i in ("q05", "q10", "q19", "q25")]
        self.assertTrue(engine.reel(enough, 1, [], True, [], [], set(), BANK, self.tmdb)["done"])

    def test_reel_excludes_seen_and_boosts_wishlist(self):
        answers = [{"id": i, "answer": 1} for i in ("q05", "q10", "q19", "q25")]
        out = engine.reel(answers, 3, [], True, [], [("movie", 3)], {("movie", 9)}, BANK, self.tmdb)
        ids = [p["tmdb_id"] for p in out["picks"]]
        self.assertNotIn(9, ids)
        self.assertIn(3, ids)
        wish = next(p for p in out["picks"] if p["tmdb_id"] == 3)
        self.assertIn("It is already on your wishlist", wish["reasons"])

    def test_reel_only_returns_movies(self):
        self.catalog[("tv", 50)] = card(50, [10765], 9.0, media_type="tv")
        answers = [{"id": i, "answer": 1} for i in ("q05", "q10", "q19", "q25")]
        out = engine.reel(answers, 3, [], True, [], [], set(), BANK, self.tmdb)
        self.assertTrue(all(p["media_type"] == "movie" for p in out["picks"]))

    def test_lean_changes_where_we_look(self):
        answers = [{"id": i, "answer": 0} for i in ("q05", "q10", "q19", "q25")]   # no mood at all
        engine.reel(answers, 3, [27], True, [], [], set(), BANK, self.tmdb)
        self.assertTrue(any(27 in (genres or []) for _, genres, _ in self.tmdb.discover_calls))

    def test_survives_tmdb_errors(self):
        class Broken(FakeTmdb):
            def discover(self, *a, **k):
                raise RuntimeError("TMDB down")
        out = engine.reel([{"id": "q05", "answer": 1}] * 0 + [{"id": i, "answer": 1} for i in ("q05", "q10", "q19", "q25")],
                          1, [], True, [], [], set(), BANK, Broken(self.catalog))
        self.assertTrue(out["done"])
        self.assertEqual(out["picks"], [])


if __name__ == "__main__":
    unittest.main()
