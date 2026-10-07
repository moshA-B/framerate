# dependencies.py - reusable checks that routes ask for with Depends(...).
# Replaces decorators.py from the Flask version.
# FastAPI runs a dependency BEFORE the route; if it raises an error, the route never runs.
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from models import User
from security import decode_access_token

# Reads the header "Authorization: Bearer <token>".
# It also adds the "Authorize" button to the /docs page.
# auto_error=False: we raise our own 401 below, with our own message.
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    # Check 1: who is calling? (any logged-in user passes)
    unauthorized = HTTPException(
        status_code=401,
        detail="Not logged in, or the login expired",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise unauthorized

    # We load the user from the database instead of trusting the token alone,
    # so a deleted user stops working immediately and the role is always up to date.
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    return user


def require_manager(user: User = Depends(get_current_user)) -> User:
    # Check 2: is the caller a manager? Builds on check 1.
    if user.role != "manager":
        raise HTTPException(status_code=403, detail="Managers only")
    return user
