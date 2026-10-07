# models.py - the database tables, written as Python classes.
# One class = one table. One attribute = one column.
# SQLAlchemy turns these into real SQL tables, so we never write SQL by hand.
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    # The table is called "users" in the database.
    __tablename__ = "users"

    # Unique number for each user. The database fills it in automatically.
    id = Column(Integer, primary_key=True, index=True)

    # unique=True: two users cannot share a name or email.
    # nullable=False: the column cannot be empty.
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(120), unique=True, nullable=False)

    # We never store the real password, only a scrambled version (a hash).
    # The hashing itself is written in step 4 (security.py).
    password_hash = Column(String(255), nullable=False)

    # "user" for regular accounts, "manager" for the admin. New accounts default to "user".
    role = Column(String(20), nullable=False, default="user")

    # When the account was created. Filled in automatically.
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # A user "owns" their list rows. delete-orphan + "all" means: when a user is deleted
    # (by a manager), all their wishlist / watched / progress rows are deleted with them.
    wishlist = relationship("Wishlist", cascade="all, delete-orphan")
    watched = relationship("Watched", cascade="all, delete-orphan")
    progress = relationship("Progress", cascade="all, delete-orphan")


# The three tables below store only the TMDB id, never the title or poster.
# Those are fetched live from TMDB when a list is shown (see services/tmdb.py).
class Wishlist(Base):
    # "I want to watch this."
    __tablename__ = "wishlist"
    # The same title cannot be on the same user's wishlist twice.
    __table_args__ = (UniqueConstraint("user_id", "tmdb_id", "media_type", name="uq_wishlist_item"),)

    id = Column(Integer, primary_key=True)
    # ForeignKey: this number must be the id of a real user. ondelete="CASCADE" repeats the
    # delete rule inside PostgreSQL itself (the relationship above does it on the Python side).
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tmdb_id = Column(Integer, nullable=False)
    media_type = Column(String(5), nullable=False)  # "movie" or "tv"
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Watched(Base):
    # "I have watched this", with an optional rating and review.
    __tablename__ = "watched"
    __table_args__ = (UniqueConstraint("user_id", "tmdb_id", "media_type", name="uq_watched_item"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tmdb_id = Column(Integer, nullable=False)
    media_type = Column(String(5), nullable=False)
    # "my_" so they are not confused with TMDB's own average rating.
    my_rating = Column(Integer, nullable=True)   # 1-10, optional
    my_review = Column(Text, nullable=True)      # optional
    watched_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Progress(Base):
    # "I am watching this series, and I am up to season S, episode E."
    __tablename__ = "progress"
    # One row per user and series.
    __table_args__ = (UniqueConstraint("user_id", "tmdb_id", name="uq_progress_show"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tmdb_id = Column(Integer, nullable=False)   # series only
    season = Column(Integer, nullable=False)
    episode = Column(Integer, nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),  # refreshed automatically on every change
    )
