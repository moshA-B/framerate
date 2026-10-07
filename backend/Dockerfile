# backend/Dockerfile - the recipe for the backend container (FastAPI).
# docker compose reads this when it runs "build: ./backend".

# Start from an official image that already has Python. "slim" = small size.
FROM python:3.12-slim

# All following commands run inside this folder in the container.
WORKDIR /app

# Copy ONLY requirements.txt first and install. Docker caches each step, so
# when you change your code (but not the packages) this slow step is skipped.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Now copy our code (everything in ./backend, except what .dockerignore lists).
COPY . .

# Documentation only: the app listens on port 8000.
EXPOSE 8000

# The command that starts the server when the container runs.
# --host 0.0.0.0 is required, otherwise it is unreachable from outside the container.
# No --reload here: that is for development only.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
