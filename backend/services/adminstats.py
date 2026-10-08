# services/adminstats.py - small pure helpers for the admin statistics.
# No database and no web framework in here, so they are easy to test and easy to explain.
from datetime import timedelta


def last_days(dates, days, today):
    # dates = a list of datetime.date (one per signup). Returns one entry per day for the last
    # `days` days, oldest first, INCLUDING days with zero signups (a chart needs those gaps).
    #   [{"date": "2026-10-07", "count": 2}, {"date": "2026-10-08", "count": 0}, ...]
    counts = {}
    for day in dates:
        counts[day] = counts.get(day, 0) + 1
    start = today - timedelta(days=days - 1)
    return [{"date": (start + timedelta(days=i)).isoformat(),
             "count": counts.get(start + timedelta(days=i), 0)} for i in range(days)]


def rating_counts(pairs):
    # pairs = [(rating, how_many)] from the database. Returns all of 1..10, zeros included.
    found = {rating: n for rating, n in pairs if rating}
    return [{"rating": r, "count": found.get(r, 0)} for r in range(1, 11)]


def tally_genres(entries, limit=6):
    # entries = [(genre_names, weight)]: the genres of one title and how many users have it.
    # A title that 5 users added counts 5 times for each of its genres.
    totals = {}
    for names, weight in entries:
        for name in names:
            totals[name] = totals.get(name, 0) + weight
    ranked = sorted(totals.items(), key=lambda pair: (-pair[1], pair[0]))
    return [{"name": name, "count": count} for name, count in ranked[:limit]]


def escape_like(text):
    # The user's search words go into a LIKE pattern, where % and _ are wildcards.
    # Put a backslash in front of them so they are matched as normal characters.
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
