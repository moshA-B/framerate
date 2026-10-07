# models.py - the database tables, written as Python classes.
# One class = one table. One attribute = one column.
# SQLAlchemy turns these into real SQL tables, so we never write SQL by hand.
from datetime import datetime, timezone

from werkzeug.security import generate_password_hash, check_password_hash

from extensions import db


class User(db.Model):
    # The table is called "users" in the database.
    __tablename__ = "users"

    # Unique number for each user. The database fills it in automatically.
    id = db.Column(db.Integer, primary_key=True)

    # unique=True: two users cannot share a name or email.
    # nullable=False: the column cannot be empty.
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)

    # We never store the real password, only a scrambled version (a hash).
    password_hash = db.Column(db.String(255), nullable=False)

    # "user" for regular accounts, "manager" for the admin. New accounts default to "user".
    role = db.Column(db.String(20), nullable=False, default="user")

    # When the account was created. Filled in automatically.
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def set_password(self, password):
        # Turns "mypassword" into a hash and stores that.
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        # At login: hash what the user typed and compare it with the stored hash.
        return check_password_hash(self.password_hash, password)
