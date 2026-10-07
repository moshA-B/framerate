# models.py - the database tables, written as Python classes.
# One class = one table. One attribute = one column.
# SQLAlchemy turns these into real SQL tables, so we never write SQL by hand.
from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime

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
