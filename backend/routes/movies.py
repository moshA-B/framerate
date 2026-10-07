# routes/movies.py - endpoints for browsing movies and series.
# They are thin on purpose: validate the input, ask services/tmdb.py, return the answer.
# In this app a "title" means a movie OR a series.
# These endpoints are public (no login needed). To require a login, add
# dependencies=[Depends(get_current_user)] to the APIRouter below.
from typing import Literal

from fastapi import APIRouter, HTTPException, Path, Query

from schemas import Episode, TitleDetails, TitleList
from services import tmdb

router = APIRouter(prefix="/api/titles", tags=["titles"])

# Only these two values are accepted. Anything else gets a 422 error automatically.
MediaType = Literal["movie", "tv"]


@router.get("/search", response_model=TitleList)
def search(q: str = Query(min_length=1, max_length=100), page: int = Query(1, ge=1, le=500)):
    query = q.strip()
    if not query:
        raise HTTPException(status_code=422, detail="Search text cannot be empty")
    return tmdb.search(query, page)


@router.get("/popular", response_model=TitleList)
def popular(media_type: MediaType = "movie", page: int = Query(1, ge=1, le=500)):
    return tmdb.popular(media_type, page)


@router.get("/trending", response_model=TitleList)
def trending(page: int = Query(1, ge=1, le=500)):
    return tmdb.trending(page)


@router.get("/{media_type}/{tmdb_id}", response_model=TitleDetails)
def details(
    media_type: MediaType,
    tmdb_id: int = Path(gt=0),
    region: str = Query("IL", min_length=2, max_length=2),  # country code for "where to watch"
):
    return tmdb.details(media_type, tmdb_id, region.upper())


@router.get("/tv/{tmdb_id}/season/{season_number}", response_model=list[Episode])
def season(tmdb_id: int = Path(gt=0), season_number: int = Path(ge=1)):
    return tmdb.season_episodes(tmdb_id, season_number)
