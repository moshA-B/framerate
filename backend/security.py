# security.py - passwords and login tokens. Nothing else.
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt  # the PyJWT library

import config

# --------------------------- passwords ---------------------------
# We never store passwords. We store a "hash": a one-way scramble.
# PBKDF2 (from Python's standard library) repeats the scrambling many times,
# which makes guessing passwords very slow for an attacker.
# Real projects often use bcrypt or argon2 libraries; PBKDF2 is also secure
# and needs no extra package.
ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)  # random salt: two users with the same password get different hashes
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    # Stored as one text value:  pbkdf2_sha256$600000$<salt>$<hash>
    return f"pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    # Hash the typed password with the SAME salt and compare it with the stored hash.
    try:
        _, iterations, salt_hex, hash_hex = stored.split("$")
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
    except ValueError:
        return False
    # compare_digest avoids leaking information through how long the comparison takes
    return hmac.compare_digest(digest.hex(), hash_hex)


# ----------------------------- tokens -----------------------------
# A JWT is a signed text the server hands out at login. The browser sends it back
# with every request, so the server knows who is calling without asking for the password again.
# Only our secret key can produce a valid signature, so it cannot be forged.
def create_access_token(user) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),  # "subject": who this token belongs to
        "role": user.role,
        "exp": expires,       # after this moment the token is rejected
    }
    return jwt.encode(payload, config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    # Raises jwt.InvalidTokenError if the signature is wrong or the token expired.
    return jwt.decode(token, config.JWT_SECRET_KEY, algorithms=[config.JWT_ALGORITHM])


# ------------------------- password-reset tokens -------------------------
# Same idea as the login token, but with purpose="reset" so a login token can never be
# used as a reset link (and the other way round). It also carries a short "fingerprint" of
# the CURRENT password hash. After the password is changed the fingerprint no longer
# matches, so each reset link works only once and we need no extra database table.
def _fingerprint(user) -> str:
    return hashlib.sha256(user.password_hash.encode("utf-8")).hexdigest()[:16]


def create_reset_token(user) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=config.RESET_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user.id), "purpose": "reset", "pw": _fingerprint(user), "exp": expires}
    return jwt.encode(payload, config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def reset_token_user_id(token: str):
    # Returns (user_id, fingerprint) or raises jwt.InvalidTokenError.
    payload = jwt.decode(token, config.JWT_SECRET_KEY, algorithms=[config.JWT_ALGORITHM])
    if payload.get("purpose") != "reset":
        raise jwt.InvalidTokenError("not a reset token")
    return int(payload["sub"]), payload["pw"]


def reset_token_matches(user, fingerprint: str) -> bool:
    return hmac.compare_digest(_fingerprint(user), fingerprint)
