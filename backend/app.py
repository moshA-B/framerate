# app.py - the entry point. It creates the Flask app and connects everything.
from flask import Flask, jsonify
from flask_cors import CORS

from config import Config
from extensions import db, jwt
import models  # noqa: F401  (imported so SQLAlchemy knows the tables before create_all)


def create_app():
    app = Flask(__name__)

    # Load the settings from config.py (database address, secret keys).
    app.config.from_object(Config)

    # CORS lets the website (localhost:8080) call this API (localhost:5000).
    # Without it the browser blocks the requests.
    CORS(app)

    # Connect the shared tools from extensions.py to this app.
    db.init_app(app)
    jwt.init_app(app)

    # Create any missing tables the first time the app starts.
    with app.app_context():
        db.create_all()

    # A tiny test endpoint: open /api/health to see that the server is alive.
    @app.get("/api/health")
    def health():
        return jsonify(status="ok")

    return app


app = create_app()

if __name__ == "__main__":
    # host 0.0.0.0 lets Docker expose it. debug=True auto-restarts when you edit a file.
    app.run(host="0.0.0.0", port=5000, debug=True)
