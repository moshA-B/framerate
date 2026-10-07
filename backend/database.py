# database.py - connects to the database. Replaces extensions.py from the Flask version.
# Everything that touches the database imports from here.
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

import config

# SQLite complains when a web server uses it from several threads;
# this flag switches that check off. PostgreSQL does not need it.
connect_args = {"check_same_thread": False} if config.DATABASE_URL.startswith("sqlite") else {}

# The engine is the actual connection to the database (SQLite file or PostgreSQL).
engine = create_engine(config.DATABASE_URL, connect_args=connect_args)

# A "session" is one conversation with the database: read, add, save.
# SessionLocal is a factory that creates a new session each time we call it.
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    # Every table class in models.py inherits from this,
    # so SQLAlchemy can find all the tables and create them.
    pass


def get_db():
    # Used in routes as:  db: Session = Depends(get_db)
    # FastAPI opens a session for the request, hands it to the route,
    # and closes it afterwards, even if the route crashed.
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
