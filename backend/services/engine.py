# services/engine.py - connects the recommender maths (recommender.py) to real data.
# It asks TMDB for candidate titles, scores them, and shapes the result for the routes.
# It does not import TMDB or the database itself: the routes hand in a `tmdb` object
# (services/tmdb.py) and plain lists, so the tests can pass in a fake one.
import random
from concurrent.futures import ThreadPoolExecutor

from services import recommender as rec

MAX_SIGNALS = 60   # use at most this many of the user's titles to learn their taste
MIN_SIGNALS = 3    # fewer than this and "For you" asks the user to rate a few titles first
ROW_SIZE = 12      # titles per row in "For you"
TOP_ROW = 8        # the first row is shorter, so the rows below still have something new to show
PICKS = 8          # titles the Reel keeps in reserve for "throw me another"

EMPTY_MOOD = rec.mood_from_answers([], {})   # "no quiz": every mood number is zero


def _parallel(calls):
    # Runs several TMDB requests at the same time. A request that fails gives an empty
    # list, so one hiccup does not break the whole page. (Real programming errors would
    # also be hidden here, so keep the functions passed in tiny.)
    def run(call):
        try:
            return call()
        except Exception:
            return []
    with ThreadPoolExecutor(max_workers=6) as pool:
        return list(pool.map(run, calls))


def _candidate(card):
    # Only the fields the scoring needs.
    return {"genres": rec.normalize_genres(card.get("genre_ids")),
            "rating": card.get("rating"), "votes": card.get("vote_count")}


def _key(card):
    return (card["media_type"], card["tmdb_id"])


# ----------------------------------------------------------------------------
# Learning the user's taste
# ----------------------------------------------------------------------------
def gather(rows, tmdb):
    # rows = [{"media_type", "tmdb_id", "kind", "value"}] built from the database
    # (watched + rating, wishlist, progress, thumbs). Returns one "signal" per title:
    # {"key", "weight", "title", "genres"}. If a title appears several times we keep the
    # strongest opinion. The genres come from TMDB (cached by services/tmdb.py).
    best = {}
    for row in rows:
        weight = rec.signal_weight(row["kind"], row.get("value"))
        if weight == 0:
            continue
        key = (row["media_type"], row["tmdb_id"])
        if key not in best or abs(weight) > abs(best[key]):
            best[key] = weight
    chosen = sorted(best.items(), key=lambda item: -abs(item[1]))[:MAX_SIGNALS]
    cards = tmdb.cards_for([key for key, _ in chosen], skip_errors=True)
    signals = []
    for (key, weight), card in zip(chosen, cards):
        if card is None:
            continue
        signals.append({"key": key, "weight": weight, "title": card["title"],
                        "genres": rec.normalize_genres(card.get("genre_ids"))})
    return signals


def profile_of(signals):
    return rec.build_profile([(s["genres"], s["weight"]) for s in signals])


def profile_summary(rows, tmdb):
    # For the "your taste so far" box on the Refine page.
    signals = gather(rows, tmdb)
    profile = profile_of(signals)
    def named(ids):
        return [{"name": rec.GENRES[g], "score": round(abs(profile[g]) * 100)} for g in ids]
    return {"signals": len(signals),
            "top": named(rec.top_genres(profile, 5, positive=True)),
            "low": named(rec.top_genres(profile, 3, positive=False))}


def _collect(media_type, signals, profile, tmdb, extra_calls=()):
    # Gathers candidate titles from TMDB: its recommendations for the titles the user
    # liked most, plus popular titles in the user's best genres.
    # Returns (pool, rec_bonus, rec_sources, rec_lists, extra_results):
    #   pool        {key: card}               every candidate
    #   rec_bonus   {key: 0..1}               how strongly TMDB recommends it for this user
    #   rec_sources {key: [title, ...]}       which liked titles led to it (for the reason text)
    #   rec_lists   [(signal, [card, ...])]   the recommendation list of each liked title
    liked = sorted((s for s in signals if s["weight"] >= 0.5 and s["key"][0] == media_type),
                   key=lambda s: -s["weight"])[:3]
    best = rec.to_tmdb_genres(media_type, rec.top_genres(profile, 3))

    calls = [(lambda s=s: tmdb.recommendations(media_type, s["key"][1])) for s in liked]
    calls += [
        lambda: tmdb.discover(media_type, best or None, 1, "popularity.desc", 300)["results"],
        lambda: tmdb.discover(media_type, best or None, 2, "popularity.desc", 300)["results"],
        lambda: tmdb.discover(media_type, best or None, 1, "vote_average.desc", 1500)["results"],
    ]
    calls += list(extra_calls)
    results = _parallel(calls)

    pool, rec_bonus, rec_sources, rec_lists = {}, {}, {}, []
    for signal, cards in zip(liked, results[:len(liked)]):
        rec_lists.append((signal, cards))
        for card in cards:
            key = _key(card)
            pool[key] = card
            rec_bonus[key] = rec_bonus.get(key, 0.0) + signal["weight"] * 0.8
            rec_sources.setdefault(key, []).append(signal["title"])
    for cards in results[len(liked):len(liked) + 3]:
        for card in cards:
            pool.setdefault(_key(card), card)
    return pool, rec_bonus, rec_sources, rec_lists, results[len(liked) + 3:]


# ----------------------------------------------------------------------------
# "For you" tab
# ----------------------------------------------------------------------------
def for_you(rows, media_type, excluded, tmdb):
    # excluded = keys the user already watched / wishlisted / rated: never suggested again.
    signals = gather(rows, tmdb)
    profile = profile_of(signals)
    favorite = rec.top_genres(profile, 3)
    if len(signals) < MIN_SIGNALS or not favorite:
        return {"needs_more": True, "signals": len(signals), "rows": []}

    # one extra request: the single best genre, for the "More X for you" row
    single = rec.to_tmdb_genres(media_type, favorite[:1])
    extra = [lambda: tmdb.discover(media_type, single or None, 1, "popularity.desc", 500)["results"]]
    pool, rec_bonus, rec_sources, rec_lists, extras = _collect(media_type, signals, profile, tmdb, extra)

    liked_keys = {s["key"] for s, _ in rec_lists}
    scored = []
    for key, card in pool.items():
        if key in excluded or key in liked_keys:
            continue
        total, _ = rec.score_candidate(_candidate(card), profile, EMPTY_MOOD,
                                       rec_bonus.get(key, 0.0), rec.WEIGHTS_FOR_YOU)
        scored.append((total, key, card))
    scored.sort(key=lambda item: -item[0])
    score_of = {key: total for total, key, _ in scored}

    rows_out, used = [], set()

    def add_row(title, cards, size=ROW_SIZE):
        fresh = [c for c in cards if _key(c) not in used and _key(c) not in excluded][:size]
        if len(fresh) >= 4:                        # a row of 1-2 titles looks broken
            used.update(_key(c) for c in fresh)
            rows_out.append({"title": title, "items": fresh})

    add_row("Picked for you", [card for _, _, card in scored], TOP_ROW)
    for signal, cards in rec_lists[:2]:
        ranked = sorted(cards, key=lambda c: -score_of.get(_key(c), -9))
        add_row(f"Because you liked {signal['title']}", ranked)
    if extras and extras[0]:
        add_row(f"More {rec.GENRES[favorite[0]]} for you", extras[0])
    return {"needs_more": False, "signals": len(signals), "rows": rows_out}


# ----------------------------------------------------------------------------
# "Refine my taste" cards
# ----------------------------------------------------------------------------
def taste_batch(count, media_type, excluded, tmdb, rng):
    # A few well-known titles from random genres, for the user to thumbs up / down / skip.
    genre_ids = [g for g in rec.GENRES if g != 10770]
    ids = rec.to_tmdb_genres(media_type, genre_ids)
    ids = list(dict.fromkeys(ids))                    # remove repeats, keep order
    chosen = rng.sample(ids, min(3, len(ids)))
    calls = [(lambda g=g, p=rng.randint(1, 4): tmdb.discover(media_type, [g], p, "popularity.desc", 800)["results"])
             for g in chosen]
    pool, seen = [], set()
    for cards in _parallel(calls):
        for card in cards:
            key = _key(card)
            if key in seen or key in excluded or not card.get("poster_url"):
                continue
            seen.add(key)
            pool.append(card)
    rng.shuffle(pool)
    return pool[:count]


# ----------------------------------------------------------------------------
# The Reel (mood quiz)
# ----------------------------------------------------------------------------
def reel(answers, seed, lean, finish, rows, wishlist_refs, seen, bank, tmdb):
    # One endpoint does both jobs, so the server needs no memory between requests:
    #   not finished -> returns the next question
    #   finished     -> returns ranked picks (the browser shows them one by one)
    answers = answers[:rec.QUESTIONS_TOTAL]
    count = len(answers)
    ready = count >= rec.QUESTIONS_TOTAL or (finish and count >= rec.MIN_QUESTIONS)
    if not ready:
        question = rec.next_question(answers, bank, rec.make_rng(seed, count))
        if question is not None:
            return {"done": False, "asked": count, "total": rec.QUESTIONS_TOTAL,
                    "question": {"id": question["id"], "text": question["text"]}, "picks": []}
    return {"done": True, "asked": count, "total": rec.QUESTIONS_TOTAL, "question": None,
            "picks": _picks(answers, seed, set(lean), rows, wishlist_refs, seen, bank, tmdb)}


def _picks(answers, seed, lean, rows, wishlist_refs, seen, bank, tmdb):
    mood = rec.mood_from_answers(answers, {q["id"]: q for q in bank})
    signals = gather(rows, tmdb) if rows else []       # a visitor without history still gets picks
    profile = profile_of(signals)

    # Where to look: the genres that best fit tonight's mood, taste and lean.
    wanted = rec.genres_for_mood(mood, profile, lean, 3)
    tmdb_genres = rec.to_tmdb_genres("movie", wanted)
    extra = [
        lambda: tmdb.discover("movie", tmdb_genres, 1, "vote_average.desc", 2000)["results"],
        lambda: tmdb.discover("movie", tmdb_genres[:1], 1, "popularity.desc", 800)["results"],
        lambda: tmdb.discover("movie", tmdb_genres[1:2] or None, 1, "popularity.desc", 800)["results"],
    ]
    pool, rec_bonus, rec_sources, _, extras = _collect("movie", signals, profile, tmdb, extra)
    for cards in extras:
        for card in cards:
            pool.setdefault(_key(card), card)

    # Movies already on the wishlist are good picks too ("you wanted to watch this").
    wishlisted = set()
    wish_movies = [ref for ref in wishlist_refs if ref[0] == "movie"][:10]
    for card in tmdb.cards_for(wish_movies, skip_errors=True):
        if card:
            pool.setdefault(_key(card), card)
            wishlisted.add(_key(card))

    jitter = rec.make_rng(seed, 99)    # a tiny shake, so two quizzes are not identical
    scored = []
    for key, card in pool.items():
        if key in seen or key[0] != "movie":
            continue
        candidate = _candidate(card)
        total, parts = rec.score_candidate(
            candidate, profile, mood, rec_bonus.get(key, 0.0), rec.WEIGHTS_QUIZ, lean,
            wishlist_bonus=0.15 if key in wishlisted else 0.0)
        total += jitter.random() * 0.03
        reasons = rec.explain(candidate, parts, profile, mood, rec_sources.get(key, []),
                              key in wishlisted, lean)
        scored.append((total, card, reasons))
    scored.sort(key=lambda item: -item[0])
    return [dict(card, reasons=reasons) for _, card, reasons in scored[:PICKS]]
