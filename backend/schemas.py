# schemas.py - the SHAPE of the data going in and out of the API (Pydantic models).
# FastAPI uses them to check incoming requests automatically:
# if the data does not match, the client gets a clear 422 error and our code never runs.
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

# Reusable field types. StringConstraints cleans the text first (strips spaces),
# then checks it (length, pattern).
Username = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=50)]
Email = Annotated[str, StringConstraints(
    strip_whitespace=True, to_lower=True, max_length=120,
    pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",  # something@something.something
)]
NewPassword = Annotated[str, StringConstraints(min_length=6, max_length=128)]


class RegisterRequest(BaseModel):
    # What the browser sends to POST /api/auth/register.
    # Note: there is NO "role" field. Nobody can make themselves a manager.
    username: Username
    email: Email
    password: NewPassword


class LoginRequest(BaseModel):
    # What the browser sends to POST /api/auth/login.
    username: Annotated[str, StringConstraints(strip_whitespace=True)]
    password: Annotated[str, StringConstraints(max_length=128)]


class UserOut(BaseModel):
    # What we send back about a user. The password hash is deliberately missing.
    # from_attributes=True lets Pydantic read the fields straight from a database User object.
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    role: str


class TokenOut(BaseModel):
    # What we send back after a successful login.
    access_token: str          # the JWT. The browser stores it and sends it with later requests.
    token_type: str = "bearer"
    user: UserOut              # includes the role, so the frontend knows which pages to show


# ---------------- movies and series (data from TMDB, reshaped by services/tmdb.py) ----------------
class TitleCard(BaseModel):
    # One movie or series in a list (search results, popular, trending).
    tmdb_id: int
    media_type: str            # "movie" or "tv"
    title: str
    poster_url: str | None
    release_date: str | None
    rating: float              # TMDB's average score, 0-10
    overview: str


class TitleList(BaseModel):
    page: int
    total_pages: int
    results: list[TitleCard]


class CastMember(BaseModel):
    name: str
    character: str
    photo_url: str | None


class Provider(BaseModel):
    # A streaming service, e.g. Netflix.
    name: str
    logo_url: str | None


class WhereToWatch(BaseModel):
    region: str
    link: str | None           # TMDB page listing all the options
    streaming: list[Provider]  # included in a subscription
    rent: list[Provider]
    buy: list[Provider]


class SeasonSummary(BaseModel):
    season_number: int
    name: str
    episode_count: int
    air_date: str | None


class TitleDetails(BaseModel):
    # Everything the details page shows. `seasons` is empty for movies.
    tmdb_id: int
    media_type: str
    title: str
    tagline: str
    overview: str
    poster_url: str | None
    backdrop_url: str | None
    release_date: str | None
    rating: float
    vote_count: int
    runtime: int | None        # minutes
    genres: list[str]
    cast: list[CastMember]
    where_to_watch: WhereToWatch | None
    seasons: list[SeasonSummary]


class Episode(BaseModel):
    episode_number: int
    name: str
    air_date: str | None
    overview: str


# ---------------- personal lists (wishlist, watched, progress) ----------------
class TitleRef(BaseModel):
    # Which title to add to the wishlist.
    tmdb_id: int = Field(gt=0)
    media_type: Literal["movie", "tv"]


class WishlistItem(TitleCard):
    # A title card (poster, title...) plus the date it was added.
    added_at: datetime


class WatchedUpdate(BaseModel):
    # Both fields are optional, so "just mark as watched" can send an empty body: {}
    my_rating: int | None = Field(None, ge=1, le=10)
    my_review: str | None = Field(None, max_length=2000)


class WatchedEntry(BaseModel):
    # Only the user's own data, no title info.
    model_config = ConfigDict(from_attributes=True)
    my_rating: int | None
    my_review: str | None
    watched_at: datetime


class WatchedItem(TitleCard):
    my_rating: int | None
    my_review: str | None
    watched_at: datetime


class ProgressUpdate(BaseModel):
    season: int = Field(ge=1, le=1000)
    episode: int = Field(ge=1, le=10000)


class ProgressEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    season: int
    episode: int
    updated_at: datetime


class ProgressItem(TitleCard):
    season: int
    episode: int
    updated_at: datetime


class TitleStatus(BaseModel):
    # What the details page needs to know about ONE title for the logged-in user.
    in_wishlist: bool
    watched: WatchedEntry | None
    progress: ProgressEntry | None


# ---------------- manager dashboard ----------------
class AdminUser(UserOut):
    created_at: datetime


class MostWatched(TitleCard):
    watch_count: int


class MostWishlisted(TitleCard):
    wish_count: int


class BestRated(TitleCard):
    avg_rating: float          # the average of the users' own ratings (1-10)
    rating_count: int


class DayCount(BaseModel):
    date: str                  # "2026-10-08"
    count: int


class RatingCount(BaseModel):
    rating: int                # 1-10
    count: int


class ActiveUser(BaseModel):
    username: str
    items: int                 # watched + wishlist + progress rows


class GenreCount(BaseModel):
    name: str
    count: int


class AdminStats(BaseModel):
    users: int
    managers: int
    new_users_last_7_days: int
    wishlist_items: int
    watched_items: int
    shows_in_progress: int
    average_rating: float | None   # average of the users' own ratings
    most_watched: list[MostWatched]
    most_wishlisted: list[MostWishlisted]
    best_rated: list[BestRated]
    signups: list[DayCount]
    rating_counts: list[RatingCount]
    active_users: list[ActiveUser]
    popular_genres: list[GenreCount]


class ReviewItem(BaseModel):
    # One written review, for the moderation list. `id` is the id of the "watched" row.
    id: int
    username: str
    rating: int | None
    review: str
    watched_at: datetime
    title: TitleCard


class ReviewPage(BaseModel):
    page: int
    total: int
    total_pages: int
    results: list[ReviewItem]


# ---------------- Google sign-in and password reset ----------------
class GoogleLoginRequest(BaseModel):
    credential: str            # the ID token Google gives the browser after the user picks an account


class ForgotPasswordRequest(BaseModel):
    email: Email


class ResetPasswordRequest(BaseModel):
    token: str                 # from the link in the email
    new_password: NewPassword


class Message(BaseModel):
    message: str


class AuthConfig(BaseModel):
    # Public settings the website needs before login.
    google_client_id: str      # empty string = Google sign-in is not set up


# ---------------- genres, autocomplete ----------------
class Genre(BaseModel):
    id: int
    name: str


class SuggestItem(BaseModel):
    # One line in the search dropdown.
    tmdb_id: int
    media_type: str
    title: str
    year: str
    poster_url: str | None


# ---------------- recommendations ----------------
class TasteIn(BaseModel):
    # A thumb on the "Refine my taste" page: 1 = like, -1 = dislike, 0 = skip.
    tmdb_id: int = Field(gt=0)
    media_type: Literal["movie", "tv"]
    score: Literal[-1, 0, 1]


class TasteCount(BaseModel):
    signals: int               # how many thumbs the user has given so far


class GenreScore(BaseModel):
    name: str
    score: int                 # 0-100


class TasteProfile(BaseModel):
    signals: int               # how many titles the taste is based on
    top: list[GenreScore]      # genres the user likes most
    low: list[GenreScore]      # genres the user likes least


class ForYouRow(BaseModel):
    title: str                 # e.g. "Because you liked Arrival"
    items: list[TitleCard]


class ForYouOut(BaseModel):
    needs_more: bool           # True = not enough history yet, ask the user to rate some titles
    signals: int
    rows: list[ForYouRow]


class ReelAnswer(BaseModel):
    id: str = Field(max_length=10)       # which scenario
    answer: Literal[-1, 0, 1]            # dislike, meh, like


class ReelRequest(BaseModel):
    # Everything the server needs, because it remembers nothing between questions.
    answers: list[ReelAnswer] = Field(default_factory=list, max_length=8)
    seed: int = Field(0, ge=0, le=2_000_000_000)           # makes the question order different each time
    lean: list[int] = Field(default_factory=list, max_length=3)   # genres the user leans toward today
    finish: bool = False                                    # "show me my picks now"


class ReelQuestion(BaseModel):
    id: str
    text: str


class ReelPick(TitleCard):
    reasons: list[str]         # why this movie fits (1-3 short sentences)


class ReelOut(BaseModel):
    done: bool                 # False: show `question`. True: show `picks`.
    asked: int                 # questions answered so far
    total: int                 # questions in a full quiz
    question: ReelQuestion | None
    picks: list[ReelPick]      # best first, the page shows them one at a time

