# Framerate

A movie and TV-series tracker. Browse and search titles (data from TMDB), keep a wishlist,
mark what you watched with a rating and review, and track the episode you are on.
Managers get an admin page with statistics and user management.

Stack: FastAPI (Python) backend, PostgreSQL database, plain HTML/CSS/JavaScript frontend
served by nginx, everything started with Docker Compose.

## Run it (on the VM or any machine with Docker)

1. Copy the settings file and fill it in:
   ```
   cp .env.example .env
   nano .env
   ```
   - `POSTGRES_PASSWORD`: any password.
   - `JWT_SECRET_KEY`: a long random value: `python3 -c "import secrets; print(secrets.token_hex(32))"`
   - `TMDB_API_KEY`: your key from themoviedb.org (Settings > API, the short "API Key").
   - `MANAGER_USERNAME`, `MANAGER_EMAIL`, `MANAGER_PASSWORD`: the first manager account.
2. Start everything:
   ```
   docker compose up --build
   ```
3. Open the site: http://localhost:8080  (API docs: http://localhost:8000/docs)

Working from your PC while Docker runs on the VM? Open a tunnel and keep it open:
```
ssh -L 8080:localhost:8080 -L 8000:localhost:8000 youruser@VM_IP
```
Then use the same `localhost` addresses in your PC's browser.

Stop: `Ctrl+C`. Start again without rebuilding: `docker compose up`.
Delete everything including the database: `docker compose down -v`.

## Optional: Sign in with Google

1. Go to https://console.cloud.google.com/ and create a project.
2. "APIs & Services" > "OAuth consent screen": choose External, fill the app name and your email, save.
   Under "Test users" add the Google accounts you will use (the app stays in testing mode, which is fine).
3. "Credentials" > "Create credentials" > "OAuth client ID" > type **Web application**.
4. Under "Authorized JavaScript origins" add `http://localhost:8080` (and `http://localhost:5500` if you use Live Server).
   Google does not accept a plain IP address here, so use the SSH tunnel and `localhost`.
5. Copy the client ID into `.env` as `GOOGLE_CLIENT_ID=...` and restart (`docker compose up --build`).
   The "Continue with Google" button now appears on the login and register pages.

## Optional: password-reset emails

Without SMTP settings nothing is emailed: the reset link is printed in the backend log
(`docker compose logs backend`), which is enough for a demo.
For real emails with Gmail, turn on 2-step verification, create an "app password", and set
`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=you@gmail.com`, `SMTP_PASSWORD=<app password>`.

## New: recommendations
- **Home** has a Movies / Series switch and genre tabs, plus a **For you** tab.
- **The Reel** (navbar) is a short mood quiz that picks a movie.
- **My taste** lets you give titles a thumbs up, thumbs down or skip.
- The search bar shows suggestions as you type.

Run the unit tests (no Docker, no internet needed): `cd backend` then `python -m unittest discover -s tests`.

## Run the backend without Docker (development)

```
cd backend
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```
Without `DATABASE_URL` it uses a local SQLite file. Open `frontend/index.html` with VS Code Live Server (port 5500).

## Folders

```
backend/    FastAPI app: routes/ (endpoints), services/ (TMDB, email, Google), models.py, schemas.py, security.py
frontend/   HTML pages, css/style.css, js/ (one script per page + api.js, auth.js, ui.js)
docs/       the project book
docker-compose.yml   db + backend + frontend
```

This product uses the TMDB API but is not endorsed or certified by TMDB.
