# config.py - all settings in one place.
# Values come from environment variables, so no secret is written in the code.
import os
from dotenv import load_dotenv

# If a .env file exists (when you run the app on your own computer),
# load its lines into environment variables. Inside Docker, Compose sets them instead.
load_dotenv()

# Where the database is.
# Docker/Postgres:  postgresql://user:password@db:5432/dbname  (set by docker-compose.yml)
# No DATABASE_URL set? Fall back to a local SQLite file, so we can test with nothing installed.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./framerate.db")

# Secret used to sign login tokens (JWT). Anyone who knows it could forge a login,
# so the real value lives in .env. The fallback below is for local testing only.
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-only-secret-change-me-this-is-not-for-production")
JWT_ALGORITHM = "HS256"           # how the token is signed
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # a login lasts one hour

# Your TMDB key. Used later in services/tmdb.py. Never sent to the browser.
TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")

# The first manager account. It is created automatically when the app starts
# (see main.py) if no manager exists yet. Set these in .env.
# Leave MANAGER_PASSWORD empty and no manager is created.
MANAGER_USERNAME = os.getenv("MANAGER_USERNAME", "manager")
MANAGER_EMAIL = os.getenv("MANAGER_EMAIL", "manager@example.com")
MANAGER_PASSWORD = os.getenv("MANAGER_PASSWORD", "")
