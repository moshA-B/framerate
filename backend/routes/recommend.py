# routes/recommend.py - recommendations: the "For you" tab and The Reel (mood quiz).
# The routes only collect data and call services/engine.py, where the real work is.
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, get_optional_user
from models import User
from schemas import ForYouOut, ReelOut, ReelRequest
from services import engine, recommender, signals, tmdb

router = APIRouter(tags=["recommend"])

MediaType = Literal["movie", "tv"]
BANK = recommender.load_bank()   # the quiz scenarios, read once when the server starts


@router.get("/api/me/for-you", response_model=ForYouOut)
def for_you(media_type: MediaType = "movie", user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    # Personalised rows for the home page. Needs a login (it uses the user's history).
    data = signals.load_user_data(db, user)
    return engine.for_you(data["rows"], media_type, data["seen"] | data["wishlist"], tmdb)


@router.post("/api/reel/next", response_model=ReelOut)
def reel_next(body: ReelRequest, user: User | None = Depends(get_optional_user),
              db: Session = Depends(get_db)):
    # The Reel works for everyone. Logged-in users also get their history taken into account.
    rows, seen, wishlist_refs = [], set(), []
    if user:
        data = signals.load_user_data(db, user)
        rows, seen, wishlist_refs = data["rows"], data["seen"], data["wishlist_refs"]

    # Keep each scenario only once, and only genres we know.
    answers, used = [], set()
    for item in body.answers:
        if item.id not in used:
            used.add(item.id)
            answers.append({"id": item.id, "answer": item.answer})
    lean = [g for g in dict.fromkeys(body.lean) if g in recommender.GENRES]

    return engine.reel(answers, body.seed, lean, body.finish, rows, wishlist_refs, seen, BANK, tmdb)
