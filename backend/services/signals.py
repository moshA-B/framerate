# services/signals.py - reads what a user did (watched, wishlist, progress, thumbs) from the
# database and turns it into plain lists for the recommender (services/engine.py).
# It is the only recommender file that touches the database.
from models import Progress, TasteSignal, Watched, Wishlist

LIMIT = 300  # at most this many rows of each kind


def load_user_data(db, user):
    # Returns:
    #   rows           [{"media_type", "tmdb_id", "kind", "value"}]  the opinions, see signal_weight()
    #   seen           {(media_type, tmdb_id)}   already watched, liked or disliked: never recommend
    #   wishlist       {(media_type, tmdb_id)}   on the wishlist
    #   wishlist_refs  [(media_type, tmdb_id)]   the same, newest first
    #   taste          {(media_type, tmdb_id)}   every thumb given, including skips: do not ask again
    rows, seen, taste = [], set(), set()

    for w in db.query(Watched).filter(Watched.user_id == user.id).order_by(Watched.id.desc()).limit(LIMIT):
        rows.append({"media_type": w.media_type, "tmdb_id": w.tmdb_id,
                     "kind": "rating" if w.my_rating else "watched", "value": w.my_rating})
        seen.add((w.media_type, w.tmdb_id))

    wishlist_refs = []
    for w in db.query(Wishlist).filter(Wishlist.user_id == user.id).order_by(Wishlist.id.desc()).limit(LIMIT):
        rows.append({"media_type": w.media_type, "tmdb_id": w.tmdb_id, "kind": "wishlist", "value": None})
        wishlist_refs.append((w.media_type, w.tmdb_id))

    for p in db.query(Progress).filter(Progress.user_id == user.id).limit(LIMIT):
        rows.append({"media_type": "tv", "tmdb_id": p.tmdb_id, "kind": "progress", "value": None})

    for t in db.query(TasteSignal).filter(TasteSignal.user_id == user.id).order_by(TasteSignal.id.desc()).limit(LIMIT):
        kind = {1: "like", -1: "dislike"}.get(t.score, "skip")
        rows.append({"media_type": t.media_type, "tmdb_id": t.tmdb_id, "kind": kind, "value": None})
        taste.add((t.media_type, t.tmdb_id))
        if t.score != 0:           # a skip means "have not seen it", so it can still be recommended
            seen.add((t.media_type, t.tmdb_id))

    return {"rows": rows, "seen": seen, "wishlist": set(wishlist_refs),
            "wishlist_refs": wishlist_refs, "taste": taste}
