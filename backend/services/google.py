# services/google.py - checks a "Sign in with Google" token.
# The browser shows Google's button; after the user picks an account Google gives the
# browser an ID token (a signed text that says "this person is x@gmail.com").
# We ask Google's own server whether that token is genuine, so nobody can fake it.
import httpx
from fastapi import HTTPException

import config

TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"


def verify_google_token(credential: str) -> dict:
    # Returns {"email": ..., "name": ...} for a valid token, otherwise raises an HTTP error.
    if not config.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured")
    try:
        response = httpx.get(TOKENINFO_URL, params={"id_token": credential}, timeout=10)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach Google")
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google sign-in")

    info = response.json()
    # The token must be made for OUR app (aud) and the email must be verified by Google.
    if info.get("aud") != config.GOOGLE_CLIENT_ID or info.get("email_verified") not in ("true", True):
        raise HTTPException(status_code=401, detail="Invalid Google sign-in")
    return {"email": info["email"].lower(), "name": info.get("name") or ""}
