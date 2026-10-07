# routes/auth.py - register, login, and "who am I".
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import User
from schemas import LoginRequest, RegisterRequest, TokenOut, UserOut
from security import create_access_token, hash_password, verify_password

# All routes in this file start with /api/auth
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    # `data` was already checked by Pydantic (see schemas.py) before we got here.
    taken = db.query(User).filter(
        or_(User.username == data.username, User.email == data.email)
    ).first()
    if taken:
        raise HTTPException(status_code=409, detail="Username or email already taken")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),  # store the hash, never the password
        role="user",  # always "user". The role is never taken from the request.
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two people registering the same name at the same moment
        db.rollback()
        raise HTTPException(status_code=409, detail="Username or email already taken")
    db.refresh(user)  # reload from the database so user.id is filled in
    return user


@router.post("/login", response_model=TokenOut)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username).first()
    # One message for both "no such user" and "wrong password",
    # so an attacker cannot find out which usernames exist.
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return TokenOut(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    # Returns the logged-in user. Handy for testing a token,
    # and the frontend can use it to check that a saved login is still valid.
    return current_user
