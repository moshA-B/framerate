# services/tmdb.py - the ONLY file that talks to TMDB (themoviedb.org).
# Routes call the functions here; they never call TMDB themselves. Why:
#   1) the API key stays on the server and never reaches the browser
#   2) TMDB's data is reshaped here into the simple shape our frontend needs
import logging
from concurrent.futures import ThreadPoolExecutor

import httpx
from fastapi import HTTPException

import config

BASE_URL = "https://api.themoviedb.org/3"
IMAGE_URL = "https://image.tmdb.org/t/p"
LANGUAGE = "en-US"

# The API key travels inside the request address, so never let the HTTP library log full addresses.
logging.getLogger("httpx").setLevel(logging.WARNING)

# One shared client: it reuses connections, so it is faster than creating a new one per request.
client = httpx.Client(base_url=BASE_URL, timeout=10.0)


def _get(path, **params):
    # Sends one request to TMDB and returns its JSON. Every TMDB call goes through here,
    # so the error handling lives in one place.
    if not config.TMDB_API_KEY:
        raise HTTPException(status_code=503, detail="TMDB_API_KEY is not set on the server")
    try:
        response = client.get(path, params={"api_key": config.TMDB_API_KEY, "language": LANGUAGE, **params})
    except httpx.HTTPError:  # no internet, timeout, ...
        raise HTTPException(status_code=502, detail="Could not reach TMDB")
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Not found on TMDB")
    if response.status_code == 401:
        raise HTTPException(status_code=502, detail="TMDB rejected the API key. Check TMDB_API_KEY in .env")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"TMDB error {response.status_code}")
    return response.json()


def _image(path, size):
    # TMDB only gives the END of a picture address, like "/abc123.jpg".
    # We add the start and a size, e.g. "w342" = 342 pixels wide.
    return f"{IMAGE_URL}/{size}{path}" if path else None


# ------------------------- lists of titles -------------------------
def _card(item, media_type=None):
    # One entry in a list (search results, popular...). Movies and series name things
    # differently in TMDB ("title" vs "name", "release_date" vs "first_air_date"),
    # so we turn both into the same shape.
    return {
        "tmdb_id": item["id"],
        "media_type": media_type or item.get("media_type"),
        "title": item.get("title") or item.get("name") or "Untitled",
        "poster_url": _image(item.get("poster_path"), "w342"),
        "release_date": item.get("release_date") or item.get("first_air_date") or None,
        "rating": round(item.get("vote_average") or 0, 1),
        "overview": item.get("overview") or "",
    }


def _page(data, media_type=None):
    # Keeps only movies and series (search also returns people) and reshapes each one.
    results = [
        _card(item, media_type)
        for item in data.get("results", [])
        if (media_type or item.get("media_type")) in ("movie", "tv")
    ]
    return {"page": data.get("page", 1), "total_pages": data.get("total_pages", 1), "results": results}


def search(query, page):
    return _page(_get("/search/multi", query=query, page=page, include_adult="false"))


def popular(media_type, page):
    return _page(_get(f"/{media_type}/popular", page=page), media_type)


def trending(page):
    return _page(_get("/trending/all/week", page=page))


# ------------------------- one title -------------------------
def _where_to_watch(data, region):
    # TMDB lists streaming services per country. We show the ones for one region.
    entry = data.get("watch/providers", {}).get("results", {}).get(region)
    if not entry:
        return None

    def providers(kind):
        return [
            {"name": p["provider_name"], "logo_url": _image(p.get("logo_path"), "w92")}
            for p in entry.get(kind, [])
        ]

    return {
        "region": region,
        "link": entry.get("link"),
        "streaming": providers("flatrate"),  # included in a subscription
        "rent": providers("rent"),
        "buy": providers("buy"),
    }


def details(media_type, tmdb_id, region):
    # append_to_response gets the cast and the streaming services in the SAME request,
    # instead of three separate ones.
    data = _get(f"/{media_type}/{tmdb_id}", append_to_response="credits,watch/providers")
    is_movie = media_type == "movie"

    cast = [
        {
            "name": person["name"],
            "character": person.get("character") or "",
            "photo_url": _image(person.get("profile_path"), "w185"),
        }
        for person in data.get("credits", {}).get("cast", [])[:12]  # the first 12 actors
    ]

    # Series only: the list of seasons (without season 0, which TMDB uses for "Specials").
    seasons = []
    if not is_movie:
        seasons = [
            {
                "season_number": s["season_number"],
                "name": s.get("name") or f"Season {s['season_number']}",
                "episode_count": s.get("episode_count") or 0,
                "air_date": s.get("air_date") or None,
            }
            for s in data.get("seasons", [])
            if s.get("season_number", 0) > 0
        ]

    return {
        "tmdb_id": data["id"],
        "media_type": media_type,
        "title": data.get("title") or data.get("name") or "Untitled",
        "tagline": data.get("tagline") or "",
        "overview": data.get("overview") or "",
        "poster_url": _image(data.get("poster_path"), "w500"),
        "backdrop_url": _image(data.get("backdrop_path"), "w1280"),
        "release_date": data.get("release_date") or data.get("first_air_date") or None,
        "rating": round(data.get("vote_average") or 0, 1),
        "vote_count": data.get("vote_count") or 0,
        # minutes: a movie has "runtime", a series has a list of typical episode lengths
        "runtime": data.get("runtime") if is_movie else (data.get("episode_run_time") or [None])[0],
        "genres": [g["name"] for g in data.get("genres", [])],
        "cast": cast,
        "where_to_watch": _where_to_watch(data, region),
        "seasons": seasons,
    }


def season_episodes(tmdb_id, season_number):
    # The episodes of one season, for the "which episode are you on?" picker.
    data = _get(f"/tv/{tmdb_id}/season/{season_number}")
    return [
        {
            "episode_number": e["episode_number"],
            "name": e.get("name") or f"Episode {e['episode_number']}",
            "air_date": e.get("air_date") or None,
            "overview": e.get("overview") or "",
        }
        for e in data.get("episodes", [])
    ]


# ------------------- helpers for the personal lists -------------------
def basic(media_type, tmdb_id):
    # One title as a card (no cast, no streaming info). Two uses:
    # checking that an id really exists before we save it, and filling in lists.
    return _card(_get(f"/{media_type}/{tmdb_id}"), media_type)


def cards_for(refs):
    # refs = a list of (media_type, tmdb_id). Returns one card per ref, in the same order.
    # The requests run 8 at a time, so a list of 20 titles is not 20 slow requests in a row.
    def one(ref):
        try:
            return basic(*ref)
        except HTTPException as error:
            if error.status_code not in (404, 502):
                raise  # e.g. 503 "no API key" is a real problem, show it
            # This one title could not be loaded (removed from TMDB, or a hiccup).
            # Show a placeholder instead of breaking the whole list.
            return {"tmdb_id": ref[1], "media_type": ref[0], "title": "(unavailable)",
                    "poster_url": None, "release_date": None, "rating": 0.0, "overview": ""}

    with ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(one, refs))
