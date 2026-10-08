# services/recommender.py - the "brain" of the recommendations. PURE logic: it never calls
# TMDB or the database, it only does maths on small Python dicts and lists. That makes it
# easy to test (see tests/test_recommender.py) and easy to explain.
#
# The idea in four steps:
#   1. GENRES: every movie/series belongs to genres (Action, Drama, ...).
#   2. TASTE PROFILE: from what the user rated, liked or disliked we learn a score per genre.
#   3. MOOD: the quiz asks about scenarios. Each scenario is tagged with 4 "mood axes"
#      (tone, pace, depth, realism) and a few genres, so the answers build a mood.
#   4. SCORE: every candidate title gets a score from taste + mood + quality (+ a bonus when
#      TMDB itself recommends it). The best scores are shown, each with a short reason.
import json
import random
from pathlib import Path

# ----------------------------------------------------------------------------
# 1. Genres and mood axes
# ----------------------------------------------------------------------------
# TMDB genre ids for movies. Series use almost the same ids, with a few combined ones
# (see TV_TO_UNIFIED below), so we use ONE shared list for the maths.
GENRES = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
}

# Series genres that bundle two movie genres: "Action & Adventure" -> Action + Adventure.
TV_TO_UNIFIED = {10759: [28, 12], 10765: [878, 14], 10768: [10752]}
# The other direction, when we ask TMDB for series of a genre. Genres missing here and
# missing from TV_SAME do not exist for series (Horror, Romance, Thriller...).
UNIFIED_TO_TV = {28: 10759, 12: 10759, 878: 10765, 14: 10765, 10752: 10768}
TV_SAME = {16, 35, 80, 99, 18, 10751, 9648, 37}

# The four mood axes. Each runs from -1 to +1.
AXES = ("tone", "pace", "depth", "realism")
# Words for the two ends of each axis, used when we explain a pick.
AXIS_WORDS = {
    "tone": ("dark", "light"),
    "pace": ("slow-burning", "fast-paced"),
    "depth": ("escapist", "thoughtful"),
    "realism": ("fantastical", "realistic"),
}

# Where each genre sits on the four axes: (tone, pace, depth, realism).
# This is how we describe a movie's "feel" without reading it: we average its genres.
GENRE_TRAITS = {
    28: (0.0, 1.0, -0.5, -0.3), 12: (0.5, 0.7, -0.3, -0.7), 16: (0.7, 0.3, 0.0, -1.0),
    35: (1.0, 0.5, -0.5, 0.0), 80: (-0.6, 0.2, 0.4, 0.7), 99: (0.0, -0.3, 0.8, 1.0),
    18: (-0.3, -0.7, 0.8, 0.7), 10751: (0.9, 0.3, -0.3, -0.5), 14: (0.3, 0.2, 0.0, -1.0),
    36: (-0.3, -0.5, 0.7, 1.0), 27: (-1.0, 0.4, -0.2, -0.4), 10402: (0.5, 0.0, 0.0, 0.3),
    9648: (-0.5, 0.0, 0.6, 0.3), 10749: (0.6, -0.4, 0.2, 0.5), 878: (-0.2, 0.2, 0.6, -0.8),
    10770: (0.0, 0.0, 0.0, 0.0), 53: (-0.7, 0.7, 0.2, 0.4), 10752: (-0.8, 0.2, 0.5, 0.8),
    37: (-0.2, 0.0, 0.2, 0.2),
}


def normalize_genres(ids):
    # Turns TMDB genre ids (movie OR series) into our shared list: expands the combined
    # series genres, drops the ones we do not use (News, Reality...) and removes repeats.
    result = []
    for genre_id in ids or []:
        for g in TV_TO_UNIFIED.get(genre_id, [genre_id]):
            if g in GENRES and g not in result:
                result.append(g)
    return result


def to_tmdb_genres(media_type, genre_ids):
    # The opposite: our shared genre ids -> the ids TMDB understands for that media type.
    if media_type != "tv":
        return [g for g in genre_ids if g in GENRES]
    result = []
    for g in genre_ids:
        mapped = UNIFIED_TO_TV.get(g, g if g in TV_SAME else None)
        if mapped is not None and mapped not in result:
            result.append(mapped)
    return result


def traits_of(genres):
    # The "feel" of a title: the average of its genres' traits, as {axis: value}.
    known = [GENRE_TRAITS[g] for g in genres if g in GENRE_TRAITS]
    if not known:
        return {axis: 0.0 for axis in AXES}
    return {axis: sum(t[i] for t in known) / len(known) for i, axis in enumerate(AXES)}


# ----------------------------------------------------------------------------
# 2. Taste profile
# ----------------------------------------------------------------------------
def signal_weight(kind, value=None):
    # How strongly one thing the user did says "I like this" (+) or "I dislike this" (-).
    # The result is between -1 and +1.
    if kind == "rating":                 # the user's own 1-10 rating
        return (value - 5.5) / 4.5       # 1 -> -1.0, 5.5 -> 0, 10 -> +1.0
    return {
        "like": 1.0, "dislike": -1.0,    # thumbs in "Refine my taste"
        "watched": 0.3,                  # watched but did not rate: a mild plus
        "wishlist": 0.3,                 # wants to watch it: a mild plus
        "progress": 0.4,                 # is in the middle of a series: a mild plus
    }.get(kind, 0.0)                     # "skip" and anything unknown: no information


def build_profile(signals):
    # signals = list of (genres, weight). Returns {genre_id: score between -1 and +1}.
    # Each title shares its weight between its genres, so a title with 5 genres does not
    # count 5 times more than a title with 1.
    raw = {}
    for genres, weight in signals:
        if not genres or weight == 0:
            continue
        share = weight / len(genres)
        for g in genres:
            raw[g] = raw.get(g, 0.0) + share
    peak = max((abs(v) for v in raw.values()), default=0.0)
    if peak == 0:
        return {}
    return {g: v / peak for g, v in raw.items()}   # scale so the strongest genre is +-1


def top_genres(profile, count=3, positive=True):
    # The genres the user likes most (or least, with positive=False), best first.
    items = [(g, v) for g, v in profile.items() if (v > 0 if positive else v < 0)]
    items.sort(key=lambda item: item[1], reverse=positive)
    return [g for g, _ in items[:count]]


def profile_match(genres, profile):
    # How well a title's genres fit the profile: the average genre score, -1 to +1.
    if not genres or not profile:
        return 0.0
    return sum(profile.get(g, 0.0) for g in genres) / len(genres)


# ----------------------------------------------------------------------------
# 3. The mood quiz
# ----------------------------------------------------------------------------
QUESTIONS_TOTAL = 8      # the quiz asks 8 scenarios, never more
MIN_QUESTIONS = 4        # "show me now" is allowed after this many


def load_bank(path=None):
    # The scenarios live in data/quiz_bank.json, so adding questions needs no code change.
    path = path or Path(__file__).resolve().parent.parent / "data" / "quiz_bank.json"
    with open(path, encoding="utf-8") as file:
        bank = json.load(file)
    for question in bank:  # JSON keys are text, genre ids must be numbers
        question["genres"] = {int(g): w for g, w in question.get("genres", {}).items()}
    return bank


def mood_from_answers(answers, bank_by_id):
    # answers = [{"id": "q05", "answer": 1}, ...] where answer is 1 (like), -1 (dislike), 0 (meh).
    # Liking a scenario moves the mood TOWARD that scenario's traits, disliking moves it away.
    num = {a: 0.0 for a in AXES}        # sum of answer * trait
    den = {a: 0.0 for a in AXES}        # sum of |trait|
    evidence = {a: 0.0 for a in AXES}   # how much we have learned about each axis
    genre_pref = {}
    for item in answers:
        question = bank_by_id.get(item["id"])
        answer = item["answer"]
        if question is None or answer == 0:   # "meh" teaches us nothing
            continue
        for axis, trait in question["traits"].items():
            num[axis] += answer * trait
            den[axis] += abs(trait)
            evidence[axis] += abs(trait)
        for genre, weight in question["genres"].items():
            genre_pref[genre] = genre_pref.get(genre, 0.0) + answer * weight
    axes = {a: (num[a] / den[a] if den[a] else 0.0) for a in AXES}
    return {"axes": axes, "evidence": evidence, "genres": genre_pref}


def _strength(mood, axis):
    # How sure we are about an axis: 0 (no idea) to 1 (answered enough about it).
    return min(1.0, mood["evidence"][axis] / 1.5)


def has_mood(mood):
    return any(v > 0 for v in mood["evidence"].values()) or bool(mood["genres"])


def next_question(answers, bank, rng):
    # Picks the next scenario. Not a fixed list: it depends on the answers so far.
    #  - the first 3 are "broad" (not about one genre) and cover different axes,
    #  - then it asks about the axes we still know least about,
    #  - it leans into genres the user liked, avoids ones they disliked,
    #  - it never repeats a scenario or the same theme twice in a row.
    bank_by_id = {q["id"]: q for q in bank}
    mood = mood_from_answers(answers, bank_by_id)
    answered = {a["id"] for a in answers}
    recent_themes = {bank_by_id[a["id"]]["theme"] for a in answers[-2:] if a["id"] in bank_by_id}

    pool = [q for q in bank if q["id"] not in answered and q["theme"] not in recent_themes]
    if len(answers) < 3:
        pool = [q for q in pool if q.get("broad")] or pool
    if not pool:
        return None

    best, best_score = None, None
    for q in pool:
        main_axis = max(q["traits"], key=lambda a: abs(q["traits"][a]))
        unknown = max(0.0, 2.0 - mood["evidence"][main_axis])        # prefer what we know least
        liked = sum(max(0.0, mood["genres"].get(g, 0.0)) * w for g, w in q["genres"].items())
        disliked = sum(max(0.0, -mood["genres"].get(g, 0.0)) * w for g, w in q["genres"].items())
        score = unknown + 0.6 * min(liked, 1.5) - 0.8 * min(disliked, 1.5) + rng.random() * 0.5
        if best_score is None or score > best_score:
            best, best_score = q, score
    return best


def make_rng(seed, step):
    # The server remembers nothing between questions, so the "randomness" comes from a seed
    # that the browser sends back every time. Same seed + same answers = same next question.
    return random.Random(int(seed) * 1_000_003 + step)


# ----------------------------------------------------------------------------
# 4. Scoring a candidate title
# ----------------------------------------------------------------------------
# How much each part counts. They add up to 1.
WEIGHTS_QUIZ = {"mood": 0.40, "profile": 0.30, "quality": 0.20, "rec": 0.10}
WEIGHTS_FOR_YOU = {"mood": 0.00, "profile": 0.50, "quality": 0.25, "rec": 0.25}


def mood_match(genres, mood):
    # How well a title's feel matches the quiz mood, -1 to +1.
    if not has_mood(mood):
        return 0.0
    t = traits_of(genres)
    strengths = {a: _strength(mood, a) for a in AXES}
    total = sum(strengths.values())
    axes_part = sum(strengths[a] * mood["axes"][a] * t[a] for a in AXES) / total if total else 0.0

    peak = max((abs(v) for v in mood["genres"].values()), default=0.0)
    genre_part = 0.0
    if peak and genres:
        genre_part = sum(mood["genres"].get(g, 0.0) / peak for g in genres) / len(genres)
    return 0.6 * axes_part + 0.4 * genre_part


def quality(rating, votes):
    # TMDB's average score turned into 0..1, trusted less when very few people voted.
    base = min(1.0, max(0.0, ((rating or 0) - 5.5) / 3.0))     # 5.5 -> 0, 8.5 -> 1
    trust = min(1.0, (votes if votes is not None else 200) / 200)
    return base * trust


def score_candidate(candidate, profile, mood, rec_bonus, weights, lean=(), wishlist_bonus=0.0):
    # candidate = {"genres": [shared genre ids], "rating": 7.8, "votes": 12345}
    # Returns (score, parts) where parts holds each ingredient, used to explain the pick.
    parts = {
        "profile": profile_match(candidate["genres"], profile),
        "mood": mood_match(candidate["genres"], mood),
        "quality": quality(candidate.get("rating"), candidate.get("votes")),
        "rec": min(1.0, rec_bonus),
    }
    total = sum(weights[name] * parts[name] for name in parts)
    if lean and any(g in lean for g in candidate["genres"]):
        total += 0.25                      # the user said they lean toward this genre today
    total += wishlist_bonus                # it is already on their wishlist
    return total, parts


def explain(candidate, parts, profile, mood, rec_sources, on_wishlist=False, lean=()):
    # Up to 3 short human reasons for a pick, built from the same numbers as the score.
    genres = candidate["genres"]
    reasons = []
    if on_wishlist:
        reasons.append("It is already on your wishlist")
    if lean and any(g in lean for g in genres):
        names = [GENRES[g] for g in genres if g in lean]
        reasons.append(f"You are leaning toward {' / '.join(names)} today")
    if has_mood(mood):
        t = traits_of(genres)
        words = []
        for axis in AXES:
            m = mood["axes"][axis] * _strength(mood, axis)
            if abs(m) >= 0.35 and m * t[axis] > 0.1:        # same side of the axis
                words.append(AXIS_WORDS[axis][1 if m > 0 else 0])
        if words:
            reasons.append("Fits your mood: " + ", ".join(words[:2]))
    liked = sorted((g for g in genres if profile.get(g, 0.0) > 0.3), key=lambda g: -profile[g])
    if liked:
        reasons.append("You tend to enjoy " + " & ".join(GENRES[g] for g in liked[:2]))
    if rec_sources:
        reasons.append(f"Recommended by TMDB because you liked {rec_sources[0]}")
    if len(reasons) < 3 and (candidate.get("rating") or 0) >= 7.5:
        reasons.append(f"Highly rated on TMDB ({candidate['rating']})")
    if not reasons:
        reasons.append("A well-liked title in a genre you may enjoy")
    return reasons[:3]


def genres_for_mood(mood, profile, lean, count=3):
    # Which genres should we look in? Rank every genre by how well it fits the mood, the
    # quiz genre answers, the long-term taste and today's lean, and take the best few.
    peak = max((abs(v) for v in mood["genres"].values()), default=0.0)
    ranked = []
    for g in GENRES:
        if g == 10770:                       # "TV Movie" is not a useful place to search
            continue
        s = 0.6 * mood_match([g], mood) + 0.3 * profile.get(g, 0.0)
        if peak:
            s += 0.4 * mood["genres"].get(g, 0.0) / peak
        if g in lean:
            s += 0.5
        ranked.append((s, g))
    ranked.sort(reverse=True)
    return [g for _, g in ranked[:count]]
