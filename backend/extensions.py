# extensions.py - creates the shared tools ONCE, so every other file can import them.
# They are created empty here and connected to the app later, in app.py.
# (Keeping them in their own file avoids files importing each other in a circle.)
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager

# db: our connection to the database. Models and routes use it to read and write.
db = SQLAlchemy()

# jwt: creates and checks login tokens.
jwt = JWTManager()
