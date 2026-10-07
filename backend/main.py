# main.py - the entry point. It creates the FastAPI app and connects everything.
# Replaces app.py from the Flask version.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from sqlalchemy.exc import IntegrityError

import config
from database import engine, Base, SessionLocal
from models import User  # importing the models also tells SQLAlchemy which tables exist
from routes import auth, admin, lists, movies
from security import hash_password

# Create any missing tables the first time the app starts.
Base.metadata.create_all(bind=engine)


def create_default_manager():
    # Nobody can register as a manager, so the first one is created here, at startup.
    # The username, email and password come from .env (see config.py).
    if not config.MANAGER_PASSWORD:
        print("MANAGER_PASSWORD is not set - no manager account created. See .env.example")
        return
    db = SessionLocal()
    try:
        if db.query(User).filter(User.role == "manager").first():
            return  # a manager already exists, nothing to do
        db.add(User(
            username=config.MANAGER_USERNAME,
            email=config.MANAGER_EMAIL.lower(),
            password_hash=hash_password(config.MANAGER_PASSWORD),
            role="manager",
        ))
        db.commit()
        print(f"Created manager account '{config.MANAGER_USERNAME}'")
    except IntegrityError:  # a normal user already took that username or email
        db.rollback()
        print("Could not create the manager: that username or email is already used")
    finally:
        db.close()


create_default_manager()

# The app object. The title shows up on the automatic docs page (/docs).
app = FastAPI(title="Framerate API")

# CORS lets the website (a different address) call this API.
# Without it the browser blocks the requests.
# 8080 = the nginx container, 5500 = VS Code Live Server (handy while developing).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080", "http://127.0.0.1:8080",
        "http://localhost:5500", "http://127.0.0.1:5500",
    ] + config.CORS_ORIGINS,  # CORS_ORIGINS in .env adds more (e.g. the VM's address)
    allow_methods=["*"],
    allow_headers=["*"],
)

# Plug in the route files. Each router adds its own group of endpoints.
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(movies.router)
app.include_router(lists.router)


# A tiny test endpoint: open /api/health to see that the server is alive.
@app.get("/api/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    # Lets you start the server with:  python main.py
    # (the usual command is:  uvicorn main:app --reload )
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
