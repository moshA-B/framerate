# main.py - the entry point. It creates the FastAPI app and connects everything.
# Replaces app.py from the Flask version.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
import models  # noqa: F401  (imported so SQLAlchemy knows the tables before create_all)

# Create any missing tables the first time the app starts.
Base.metadata.create_all(bind=engine)

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
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# A tiny test endpoint: open /api/health to see that the server is alive.
@app.get("/api/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    # Lets you start the server with:  python main.py
    # (the usual command is:  uvicorn main:app --reload )
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
