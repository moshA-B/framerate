# routes/admin.py - endpoints for managers only.
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Path, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from dependencies import require_manager
from models import Progress, User, Watched, Wishlist
from schemas import AdminStats, AdminUser
from services import tmdb

# dependencies=[...] on the router means EVERY route in this file
# is manager-only. A regular user gets 403, a visitor who is not logged in gets 401.
router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_manager)],
)


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


@router.get("/stats", response_model=AdminStats)
def stats(db: Session = Depends(get_db)):
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    # Top 5 most watched titles: group the watched rows by title and count them.
    top = (db.query(Watched.media_type, Watched.tmdb_id, func.count(Watched.id).label("n"))
           .group_by(Watched.media_type, Watched.tmdb_id)
           .order_by(func.count(Watched.id).desc())
           .limit(5).all())
    cards = tmdb.cards_for([(t.media_type, t.tmdb_id) for t in top])

    return {
        "users": db.query(func.count(User.id)).scalar(),
        "managers": db.query(func.count(User.id)).filter(User.role == "manager").scalar(),
        "new_users_last_7_days": db.query(func.count(User.id))
                                   .filter(User.created_at >= week_ago).scalar(),
        "wishlist_items": db.query(func.count(Wishlist.id)).scalar(),
        "watched_items": db.query(func.count(Watched.id)).scalar(),
        "shows_in_progress": db.query(func.count(Progress.id)).scalar(),
        "average_rating": db.query(func.avg(Watched.my_rating)).scalar(),
        "most_watched": [{**card, "watch_count": t.n} for t, card in zip(top, cards)],
    }
