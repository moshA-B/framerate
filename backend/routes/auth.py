# routes/auth.py - register, login, "who am I" and password reset.
import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import config
from database import get_db
from dependencies import get_current_user
from models import User
from schemas import (ForgotPasswordRequest, LoginRequest, Message, RegisterRequest,
                     ResetPasswordRequest, TokenOut, UserOut)
from security import (create_access_token, create_reset_token, hash_password,
                      reset_token_matches, reset_token_user_id, verify_password)
from services import mailer

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


@router.post("/forgot-password", response_model=Message)
def forgot_password(data: ForgotPasswordRequest, background: BackgroundTasks,
                    db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if user:
        link = f"{config.FRONTEND_URL}/reset-password?token={create_reset_token(user)}"
        body = (f"Hi {user.username},\n\nSomeone asked to reset your Framerate password. "
                f"Open this link within {config.RESET_TOKEN_EXPIRE_MINUTES} minutes:\n\n{link}\n\n"
                "If it was not you, ignore this email and nothing changes.")
        # BackgroundTasks sends the email AFTER the response, so the request is fast.
        background.add_task(mailer.send_email, user.email, "Reset your Framerate password", body)
    # The same answer whether or not the email exists, so nobody can use this form
    # to find out who has an account.
    return Message(message="If that email has an account, we sent a reset link.")


@router.post("/reset-password", response_model=Message)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    bad_link = HTTPException(status_code=400, detail="This reset link is invalid or has expired")
    try:
        user_id, fingerprint = reset_token_user_id(data.token)
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise bad_link
    user = db.get(User, user_id)
    if user is None or not reset_token_matches(user, fingerprint):
        raise bad_link  # also happens when the link was already used once
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return Message(message="Password changed. You can log in now.")
