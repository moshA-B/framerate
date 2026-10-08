# routes/taste.py - the "Refine my taste" page: show titles, the user gives a thumb,
# and we remember it. Needs a login. The thumbs feed the recommender (services/engine.py).
import random
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import TasteSignal, User
from schemas import TasteCount, TasteIn, TasteProfile, TitleCard
from services import engine, signals, tmdb

router = APIRouter(prefix="/api/me/taste", tags=["taste"])

MediaType = Literal["movie", "tv"]


def _count(db, user):
    return db.query(TasteSignal).filter(TasteSignal.user_id == user.id).count()


@router.get("/next", response_model=list[TitleCard])
def next_titles(media_type: MediaType = "movie", count: int = Query(8, ge=1, le=20),
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # A few titles the user has not rated, watched or been asked about yet.
    data = signals.load_user_data(db, user)
    already = data["seen"] | data["wishlist"] | data["taste"]
    return engine.taste_batch(count, media_type, already, tmdb, random.Random())


@router.post("", response_model=TasteCount)
def give_thumb(body: TasteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tmdb.meta(body.media_type, body.tmdb_id)  # 404 if this title does not exist
    row = (db.query(TasteSignal)
           .filter(TasteSignal.user_id == user.id, TasteSignal.tmdb_id == body.tmdb_id,
                   TasteSignal.media_type == body.media_type).first())
    if row is None:
        row = TasteSignal(user_id=user.id, tmdb_id=body.tmdb_id, media_type=body.media_type)
        db.add(row)
    row.score = body.score          # changing your mind just replaces the old thumb
    try:
        db.commit()
    except IntegrityError:          # the same thumb sent twice at the same moment: it is saved already
        db.rollback()
    return TasteCount(signals=_count(db, user))


@router.get("/profile", response_model=TasteProfile)
def my_taste(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # "Your taste so far": the genres the recommender thinks you like and dislike.
    data = signals.load_user_data(db, user)
    return engine.profile_summary(data["rows"], tmdb)


@router.delete("", status_code=204)
def reset_taste(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Deletes only the thumbs. Your ratings, wishlist and history stay.
    db.query(TasteSignal).filter(TasteSignal.user_id == user.id).delete()
    db.commit()
    return Response(status_code=204)
