# routes/admin.py - endpoints for managers only.
import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_manager
from models import Progress, User, Watched, Wishlist
from schemas import AdminStats, AdminUser, ReviewPage
from services import adminstats, tmdb

# dependencies=[...] on the router means EVERY route in this file
# is manager-only. A regular user gets 403, a visitor who is not logged in gets 401.
router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_manager)],
)

SIGNUP_DAYS = 14            # the signups chart covers the last 14 days
MIN_RATINGS_FOR_TOP = 2     # a title needs this many ratings to enter "best rated"
REVIEWS_PER_PAGE = 10


@router.get("/users", response_model=list[AdminUser])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.id).all()


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int = Path(gt=0), manager: User = Depends(require_manager),
                db: Session = Depends(get_db)):
    if user_id == manager.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # db.delete(user) also deletes the user's wishlist, watched and progress rows
    # (the cascade set in models.py).
    db.delete(user)
    db.commit()
    return Response(status_code=204)


# ------------------------- statistics -------------------------
def _title_counts(db, model, limit=None):
    # [(media_type, tmdb_id, how many users)] for a table that has one row per user and title.
    query = (db.query(model.media_type, model.tmdb_id, func.count(model.id).label("n"))
             .group_by(model.media_type, model.tmdb_id)
             .order_by(func.count(model.id).desc()))
    return query.limit(limit).all() if limit else query.all()


def _popular_genres(db):
    # Which genres do users add the most? We look at the 30 most-added titles
    # (watched or wishlisted), ask TMDB for their genres and count them.
    totals = {}
    for model in (Watched, Wishlist):
        for media_type, tmdb_id, n in _title_counts(db, model):
            totals[(media_type, tmdb_id)] = totals.get((media_type, tmdb_id), 0) + n
    top = sorted(totals.items(), key=lambda pair: -pair[1])[:30]
    if not top:
        return []
    cards = tmdb.cards_for([ref for ref, _ in top], skip_errors=True)
    try:
        names = {kind: {g["id"]: g["name"] for g in tmdb.genres(kind)} for kind in ("movie", "tv")}
    except HTTPException:
        return []     # TMDB hiccup: the rest of the statistics are still worth showing
    entries = []
    for (ref, n), card in zip(top, cards):
        if card:
            entries.append(([names[ref[0]][g] for g in card["genre_ids"] if g in names[ref[0]]], n))
    return adminstats.tally_genres(entries)


def _active_users(db):
    # The users with the most activity: watched + wishlist + series progress rows.
    totals = {}
    for model in (Watched, Wishlist, Progress):
        for user_id, n in db.query(model.user_id, func.count(model.id)).group_by(model.user_id).all():
            totals[user_id] = totals.get(user_id, 0) + n
    best = sorted(totals.items(), key=lambda pair: -pair[1])[:5]
    usernames = {u.id: u.username for u in db.query(User).filter(User.id.in_([uid for uid, _ in best])).all()}
    return [{"username": usernames[uid], "items": n} for uid, n in best if uid in usernames]


@router.get("/stats", response_model=AdminStats)
def stats(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    # Top 5 most watched titles: group the watched rows by title and count them.
    top = _title_counts(db, Watched, 5)
    most_watched = tmdb.cards_for([(t.media_type, t.tmdb_id) for t in top])

    # Top 5 most wishlisted titles, the same way.
    wished = _title_counts(db, Wishlist, 5)
    most_wishlisted = tmdb.cards_for([(t.media_type, t.tmdb_id) for t in wished])

    # Best rated by the community: the average of everyone's rating for the same title.
    best = (db.query(Watched.media_type, Watched.tmdb_id,
                     func.avg(Watched.my_rating).label("avg"), func.count(Watched.my_rating).label("n"))
            .filter(Watched.my_rating.isnot(None))
            .group_by(Watched.media_type, Watched.tmdb_id)
            .having(func.count(Watched.my_rating) >= MIN_RATINGS_FOR_TOP)
            .order_by(func.avg(Watched.my_rating).desc(), func.count(Watched.my_rating).desc())
            .limit(5).all())
    best_cards = tmdb.cards_for([(t.media_type, t.tmdb_id) for t in best])

    # Signups per day: we load the join dates of the last 14 days and count them in Python.
    since = now - timedelta(days=SIGNUP_DAYS)
    joined = [row[0].date() for row in db.query(User.created_at).filter(User.created_at >= since).all()
              if row[0]]

    rating_pairs = (db.query(Watched.my_rating, func.count(Watched.id))
                    .filter(Watched.my_rating.isnot(None)).group_by(Watched.my_rating).all())

    return {
        "users": db.query(func.count(User.id)).scalar(),
        "managers": db.query(func.count(User.id)).filter(User.role == "manager").scalar(),
        "new_users_last_7_days": db.query(func.count(User.id))
                                   .filter(User.created_at >= week_ago).scalar(),
        "wishlist_items": db.query(func.count(Wishlist.id)).scalar(),
        "watched_items": db.query(func.count(Watched.id)).scalar(),
        "shows_in_progress": db.query(func.count(Progress.id)).scalar(),
        "average_rating": db.query(func.avg(Watched.my_rating)).scalar(),
        "most_watched": [{**card, "watch_count": t.n} for t, card in zip(top, most_watched)],
        "most_wishlisted": [{**card, "wish_count": t.n} for t, card in zip(wished, most_wishlisted)],
        "best_rated": [{**card, "avg_rating": round(float(t.avg), 1), "rating_count": t.n}
                       for t, card in zip(best, best_cards)],
        "signups": adminstats.last_days(joined, SIGNUP_DAYS, now.date()),
        "rating_counts": adminstats.rating_counts(rating_pairs),
        "active_users": _active_users(db),
        "popular_genres": _popular_genres(db),
    }


# ------------------------- review moderation -------------------------
@router.get("/reviews", response_model=ReviewPage)
def list_reviews(page: int = Query(1, ge=1), q: str = Query("", max_length=100),
                 db: Session = Depends(get_db)):
    # Every written review, newest first, optionally only those containing the words in `q`.
    query = (db.query(Watched, User.username)
             .join(User, User.id == Watched.user_id)
             .filter(Watched.my_review.isnot(None), Watched.my_review != ""))
    if q.strip():
        query = query.filter(Watched.my_review.ilike(f"%{adminstats.escape_like(q.strip())}%", escape="\\"))

    total = query.count()
    rows = (query.order_by(Watched.watched_at.desc(), Watched.id.desc())
            .offset((page - 1) * REVIEWS_PER_PAGE).limit(REVIEWS_PER_PAGE).all())
    cards = tmdb.cards_for([(w.media_type, w.tmdb_id) for w, _ in rows])

    return {
        "page": page,
        "total": total,
        "total_pages": max(1, math.ceil(total / REVIEWS_PER_PAGE)),
        "results": [
            {"id": w.id, "username": username, "rating": w.my_rating, "review": w.my_review,
             "watched_at": w.watched_at, "title": card}
            for (w, username), card in zip(rows, cards)
        ],
    }


@router.delete("/reviews/{watched_id}", status_code=204)
def remove_review(watched_id: int = Path(gt=0), db: Session = Depends(get_db)):
    # Moderation removes only the TEXT. The user's rating and "watched" mark stay.
    row = db.get(Watched, watched_id)
    if not row or not row.my_review:
        raise HTTPException(status_code=404, detail="Review not found")
    row.my_review = None
    db.commit()
    return Response(status_code=204)
