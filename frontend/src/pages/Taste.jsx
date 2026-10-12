// Taste.jsx - "Refine my taste": one title at a time, the user gives a thumb up, thumb down or skip.
// Every thumb is saved on the server and feeds the recommender (For you tab and The Reel).
import { useCallback, useEffect, useRef, useState } from "react";
import { api, yearOf } from "../api.js";
import { useToast } from "../ToastContext.jsx";
import { useTitle } from "../hooks.js";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Poster from "../components/Poster.jsx";
import { Link } from "react-router-dom";

// The same look as a normal card, but not a link (a click must not leave the page).
function StaticCard({ item }) {
  return (
    <div className="card">
      <span className="score" title="TMDB score">{item.rating ? item.rating.toFixed(1) : "–"}</span>
      <Poster item={item} />
      <p className="stage-title">{item.title}</p>
      <span className="card-year">{yearOf(item)}</span>
      {item.overview && <p className="muted">{item.overview.length > 180 ? item.overview.slice(0, 177) + "…" : item.overview}</p>}
    </div>
  );
}

function countText(n) {
  return n === 0 ? "No answers yet." : `You have answered ${n} title${n === 1 ? "" : "s"}.`;
}

export default function Taste() {
  useTitle("Refine my taste");
  const toast = useToast();

  const [mediaType, setMediaType] = useState("movie");
  const [current, setCurrent] = useState(null);       // the title on screen (null = nothing to show)
  const [loaded, setLoaded] = useState(false);        // false until the first title (or "nothing") is known
  const [profile, setProfile] = useState(null);       // "Your taste so far"
  const [count, setCount] = useState("");
  const [error, setError] = useState("");
  const [armed, setArmed] = useState(false);          // the Reset button needs two clicks

  // Values that change often but do not need to redraw anything are kept in refs.
  const queue = useRef([]);        // titles fetched but not shown yet
  const busy = useRef(false);      // true while a thumb is being saved (stops double clicks)
  const request = useRef(0);       // makes slow old answers harmless when the user switches Movies/Series
  const currentRef = useRef(null); // same as `current`, readable inside the keyboard handler

  // ------------------------- loading titles -------------------------
  // We fetch a few at a time so the next card is ready instantly.
  async function fillQueue(type) {
    const mine = ++request.current;
    const batch = await api(`/api/me/taste/next?media_type=${type}&count=8`);
    if (mine !== request.current) return;               // the user switched type meanwhile
    const known = new Set(queue.current.map((t) => t.tmdb_id));
    if (currentRef.current) known.add(currentRef.current.tmdb_id);
    queue.current.push(...batch.filter((t) => !known.has(t.tmdb_id)));
  }

  async function showNext(type) {
    setError("");
    try {
      if (queue.current.length < 2) await fillQueue(type);   // top up before we run out
    } catch (e) {
      setError(e.message);
    }
    const next = queue.current.shift() || null;
    currentRef.current = next;
    setCurrent(next);
    setLoaded(true);
  }

  async function loadProfile() {
    try {
      const data = await api("/api/me/taste/profile");
      setCount(countText(data.signals));
      setProfile(data);
    } catch (e) {
      setError(e.message);
    }
  }

  // At the start, and every time the user switches between Movies and Series.
  useEffect(() => {
    queue.current = [];
    currentRef.current = null;
    setCurrent(null);
    setLoaded(false);
    showNext(mediaType);
  }, [mediaType]);

  useEffect(() => { loadProfile(); }, []);

  // ------------------------- saving a thumb -------------------------
  const rate = useCallback(async (score) => {
    const item = currentRef.current;
    if (busy.current || !item) return;
    busy.current = true;
    try {
      const result = await api("/api/me/taste", { method: "POST", body: { tmdb_id: item.tmdb_id, media_type: item.media_type, score } });
      setCount(countText(result.signals));
      await showNext(item.media_type);
      loadProfile();                                     // refresh "Your taste so far" in the background
    } catch (e) {
      setError(e.message);
    } finally {
      busy.current = false;
    }
  }, []);

  // Keyboard shortcuts: left = dislike, right = like, down = skip.
  useEffect(() => {
    function onKey(event) {
      if (event.target.closest("input, textarea, select")) return;
      const score = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: 0 }[event.key];
      if (score === undefined) return;
      event.preventDefault();
      rate(score);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);   // remove it when we leave the page
  }, [rate]);

  // Reset needs two clicks, so it cannot happen by accident.
  async function reset() {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    try {
      await api("/api/me/taste", { method: "DELETE" });
      toast("Your thumbs were cleared");
      queue.current = [];
      await showNext(mediaType);
      loadProfile();
    } catch (e) {
      setError(e.message);
    }
  }

  const answer = (text, cls, score, label) => (
    <button className={`btn ${cls}`} type="button" aria-label={label} onClick={() => rate(score)}>{text}</button>
  );
  const line = (g) => <li key={g.name}>{g.name} <span className="muted">{g.score}%</span></li>;

  return (
    <>
      <h1 className="page-title">Refine my taste</h1>
      <p className="muted" style={{ maxWidth: "62ch" }}>
        Tell us what you think of some well-known titles. The more you answer, the better your
        "For you" picks and The Reel get. Haven't seen it? Just skip.
      </p>
      <ErrorMessage text={error} />

      <div className="taste-layout">
        <section>
          <div className="toggle section" role="group" aria-label="Movies or series">
            <button type="button" aria-pressed={mediaType === "movie"} onClick={() => setMediaType("movie")}>Movies</button>
            <button type="button" aria-pressed={mediaType === "tv"} onClick={() => setMediaType("tv")}>Series</button>
          </div>

          <div className="stage">
            {current && (
              <>
                <StaticCard item={current} />
                <div className="answer-row">
                  {answer("👎 Not for me", "", -1, `Not for me: ${current.title}`)}
                  {answer("Haven't seen it", "", 0, `Skip ${current.title}`)}
                  {answer("👍 Like it", "btn-primary", 1, `Like ${current.title}`)}
                </div>
              </>
            )}
            {!current && loaded && (
              <EmptyState title="That's everything for now"
                          text="You have answered all the titles we had. Check your picks, or try the other type."
                          buttonText="See my picks" to="/#for-you" />
            )}
          </div>
          <p className="muted" style={{ textAlign: "center" }}>Keyboard: left arrow = not for me, right arrow = like it, down arrow = skip.</p>
        </section>

        <aside className="panel" aria-label="Your taste so far">
          <h2>Your taste so far</h2>
          <p className="muted">{count}</p>
          {profile && (
            <div>
              {profile.top.length > 0 && <div><h3>You like</h3><ul>{profile.top.map(line)}</ul></div>}
              {profile.low.length > 0 && <div><h3>Not your thing</h3><ul>{profile.low.map(line)}</ul></div>}
              {profile.top.length === 0 && profile.low.length === 0 && (
                <p className="muted">Answer a few titles and your taste will show up here.</p>
              )}
            </div>
          )}
          <hr />
          <div className="row">
            <Link className="btn btn-primary" to="/#for-you">See my picks</Link>
            <button className="btn btn-small" type="button" onClick={reset}>{armed ? "Click again to confirm" : "Reset my taste"}</button>
          </div>
        </aside>
      </div>
    </>
  );
}
