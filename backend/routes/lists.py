# routes/lists.py - the logged-in user's personal lists: wishlist, watched, progress.
# Every endpoint needs a login (get_current_user), and every query filters by the
# CURRENT user's id, so nobody can see or change another person's lists.
#
# The database stores only (media_type, tmdb_id) plus the user's own data.
# The title, poster, etc. are fetched from TMDB each time (services/tmdb.py).
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import Progress, User, Watched, Wishlist
from schemas import (ProgressEntry, ProgressItem, ProgressUpdate, TitleRef, TitleStatus,
                     WatchedEntry, WatchedItem, WatchedUpdate, WishlistItem)
from services import tmdb

router = APIRouter(prefix="/api/me", tags=["my lists"])

MediaType = Literal["movie", "tv"]
MAX_ROWS = 100  # a list shows at most this many titles (each one is a TMDB request)


def _commit(db, conflict_message):
    # Save. The unique constraints in models.py make the database refuse duplicates;
    # we turn that error into a clear 409 instead of a crash.
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=conflict_message)


def _find(db, model, user, media_type, tmdb_id):
    # One row of this user for this title, or None.
    return (db.query(model)
            .filter(model.user_id == user.id, model.tmdb_id == tmdb_id,
                    model.media_type == media_type)
            .first())


# ---------------------------------------------------------------- wishlist
@router.get("/wishlist", response_model=list[WishlistItem])
def get_wishlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (db.query(Wishlist).filter(Wishlist.user_id == user.id)
            .order_by(Wishlist.added_at.desc()).limit(MAX_ROWS).all())
    cards = tmdb.cards_for([(r.media_type, r.tmdb_id) for r in rows])
    return [{**card, "added_at": row.added_at} for row, card in zip(rows, cards)]


@router.post("/wishlist", response_model=WishlistItem, status_code=201)
def add_to_wishlist(body: TitleRef, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    card = tmdb.basic(body.media_type, body.tmdb_id)  # 404 if this title does not exist
    row = Wishlist(user_id=user.id, tmdb_id=body.tmdb_id, media_type=body.media_type)
    db.add(row)
    _commit(db, "Already in your wishlist")
    db.refresh(row)
    return {**card, "added_at": row.added_at}


@router.delete("/wishlist/{media_type}/{tmdb_id}", status_code=204)
def remove_from_wishlist(media_type: MediaType, tmdb_id: int = Path(gt=0),
                         user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = _find(db, Wishlist, user, media_type, tmdb_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not in your wishlist")
    db.delete(row)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- watched
@router.get("/watched", response_model=list[WatchedItem])
def get_watched(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (db.query(Watched).filter(Watched.user_id == user.id)
            .order_by(Watched.watched_at.desc()).limit(MAX_ROWS).all())
    cards = tmdb.cards_for([(r.media_type, r.tmdb_id) for r in rows])
    return [{**card, "my_rating": r.my_rating, "my_review": r.my_review,
             "watched_at": r.watched_at} for r, card in zip(rows, cards)]


@router.put("/watched/{media_type}/{tmdb_id}", response_model=WatchedEntry)
def mark_watched(media_type: MediaType, tmdb_id: int = Path(gt=0),
                 body: WatchedUpdate = WatchedUpdate(),
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # PUT = "make it look like this". It creates the entry the first time and
    # replaces the rating/review on later calls, so one endpoint covers both.
    row = _find(db, Watched, user, media_type, tmdb_id)
    if row is None:
        tmdb.basic(media_type, tmdb_id)  # only check the title exists when creating
        row = Watched(user_id=user.id, tmdb_id=tmdb_id, media_type=media_type)
        db.add(row)
    row.my_rating = body.my_rating
    row.my_review = body.my_review

    # Once you have watched something it no longer belongs on the "want to watch" list.
    wish = _find(db, Wishlist, user, media_type, tmdb_id)
    if wish:
        db.delete(wish)

    _commit(db, "Already marked as watched")
    db.refresh(row)
    return row


@router.delete("/watched/{media_type}/{tmdb_id}", status_code=204)
def unmark_watched(media_type: MediaType, tmdb_id: int = Path(gt=0),
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = _find(db, Watched, user, media_type, tmdb_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not in your watched list")
    db.delete(row)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- progress (series only)
@router.get("/progress", response_model=list[ProgressItem])
def get_progress(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (db.query(Progress).filter(Progress.user_id == user.id)
            .order_by(Progress.updated_at.desc()).limit(MAX_ROWS).all())
    cards = tmdb.cards_for([("tv", r.tmdb_id) for r in rows])
    return [{**card, "season": r.season, "episode": r.episode,
             "updated_at": r.updated_at} for r, card in zip(rows, cards)]


@router.put("/progress/{tmdb_id}", response_model=ProgressEntry)
def set_progress(body: ProgressUpdate, tmdb_id: int = Path(gt=0),
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # "I am on season X, episode Y" - one row per user per series.
    row = db.query(Progress).filter(Progress.user_id == user.id,
                                    Progress.tmdb_id == tmdb_id).first()
    if row is None:
        tmdb.basic("tv", tmdb_id)  # progress only makes sense for a real series
        row = Progress(user_id=user.id, tmdb_id=tmdb_id)
        db.add(row)
    row.season = body.season
    row.episode = body.episode
    _commit(db, "Progress already exists")
    db.refresh(row)
    return row


@router.delete("/progress/{tmdb_id}", status_code=204)
def clear_progress(tmdb_id: int = Path(gt=0), user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    row = db.query(Progress).filter(Progress.user_id == user.id,
                                    Progress.tmdb_id == tmdb_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No progress saved for this series")
    db.delete(row)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------- status of one title
@router.get("/status/{media_type}/{tmdb_id}", response_model=TitleStatus)
def title_status(media_type: MediaType, tmdb_id: int = Path(gt=0),
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # The details page calls this once to know which buttons to show
    # ("Add to wishlist" or "Remove", "Mark watched" or "Watched 8/10"...).
    progress = None
    if media_type == "tv":
        progress = db.query(Progress).filter(Progress.user_id == user.id,
                                             Progress.tmdb_id == tmdb_id).first()
    return {
        "in_wishlist": _find(db, Wishlist, user, media_type, tmdb_id) is not None,
        "watched": _find(db, Watched, user, media_type, tmdb_id),
        "progress": progress,
    }
