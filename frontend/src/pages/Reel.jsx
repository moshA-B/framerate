// Reel.jsx - "The Reel": a short mood quiz that ends with a movie to watch tonight.
// The server remembers nothing between questions. We send ALL answers every time and it
// replies with the next question, or (when finished) a list of picks with reasons.
//
// The page is a small state machine with three screens:
//   "intro"    -> choose genres, press Start
//   "question" -> one scenario at a time (state.done is false)
//   "result"   -> the picks (state.done is true)
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, detailsPath } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { useToast } from "../ToastContext.jsx";
import { useAddToWishlist, useTitle } from "../hooks.js";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import TitleCard from "../components/TitleCard.jsx";

// The browser remembers which scenarios it showed lately, so the next quiz looks different.
// (localStorage can be blocked, so every access is wrapped in try/catch.)
const SEEN_KEY = "framerate_reel_seen";
const SEEN_MAX = 32;
function recentScenarios() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || []; } catch (e) { return []; }
}
function rememberScenario(id) {
  try {
    const list = recentScenarios().filter((x) => x !== id);
    list.push(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-SEEN_MAX)));
  } catch (e) { /* not important */ }
}

export default function Reel() {
  useTitle("The Reel");
  const { user } = useAuth();
  const toast = useToast();
  const addToWishlist = useAddToWishlist();

  const [genres, setGenres] = useState([]);
  const [lean, setLean] = useState([]);          // up to 3 genre ids the user fancies today
  const [answers, setAnswers] = useState([]);    // [{id, answer}]  answer: -1 dislike, 0 meh, 1 like
  const [state, setState] = useState(null);      // the last reply from the server (null = intro screen)
  const [pickIndex, setPickIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const seed = useRef(0);                        // random number: a different question order each time

  // The genre pills on the intro screen (loaded once).
  useEffect(() => {
    api("/api/titles/genres?media_type=movie").then(setGenres).catch(() => setGenres([]));
  }, []);

  // ------------------------- talking to the server -------------------------
  // We pass the answers in as an argument (not read from state), because a state change is only
  // visible on the NEXT render, and we need the newest list right now.
  async function ask(currentAnswers, finish = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const reply = await api("/api/reel/next", {
        method: "POST",
        body: { answers: currentAnswers, seed: seed.current, lean, finish, avoid: recentScenarios() },
      });
      if (reply.done) setPickIndex(0);
      else rememberScenario(reply.question.id);
      setState(reply);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  function start() {
    seed.current = Math.floor(Math.random() * 2_000_000_000);
    setAnswers([]);
    ask([]);
  }

  function answer(id, value) {
    const next = [...answers, { id, answer: value }];
    setAnswers(next);
    ask(next);
  }

  function startOver() {
    setState(null);
    setAnswers([]);
    setLean([]);
    setError("");
  }

  function toggleGenre(id) {
    if (lean.includes(id)) setLean(lean.filter((x) => x !== id));
    else if (lean.length < 3) setLean([...lean, id]);
    else toast("Pick up to 3 genres", "warn");
  }

  // ------------------------- screen 1: intro -------------------------
  function renderIntro() {
    return (
      <div className="intro-card">
        <h2>Can't decide what to watch?</h2>
        <p>
          Answer a few quick "would you enjoy this?" scenarios. In about 8 questions we pick a movie for tonight.
          {user ? " Your ratings and history make it even better." : " Log in and your own history makes it even better."}
        </p>
        {genres.length > 0 && <p className="muted">Any genres you fancy today? (optional, up to 3)</p>}
        {genres.length > 0 && (
          <div className="toggle wrap" role="group" aria-label="Genres you fancy today">
            {genres.map((g) => (
              <button key={g.id} type="button" aria-pressed={lean.includes(g.id)} onClick={() => toggleGenre(g.id)}>{g.name}</button>
            ))}
          </div>
        )}
        <div className="row section" style={{ marginTop: 28 }}>   {/* space between the genres and the button */}
          <button className="btn btn-primary" type="button" disabled={busy} onClick={start}>Start the Reel</button>
        </div>
      </div>
    );
  }

  // ------------------------- screen 2: a question -------------------------
  function renderQuestion() {
    const q = state.question;
    const canFinish = answers.length >= 4;
    return (
      <>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={state.total}
             aria-valuenow={state.asked} aria-label="Quiz progress">
          <div style={{ width: `${Math.round((state.asked / state.total) * 100)}%` }}></div>
        </div>
        <p className="muted">Question {state.asked + 1} of {state.total}</p>
        <p className="scenario">{q.text}</p>
        <div className="answer-row">
          <button className="btn" type="button" disabled={busy} onClick={() => answer(q.id, -1)}>👎 No thanks</button>
          <button className="btn" type="button" disabled={busy} onClick={() => answer(q.id, 0)}>😐 Meh</button>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => answer(q.id, 1)}>👍 Sounds great</button>
        </div>
        {canFinish && (
          <div className="answer-row">
            <button className="btn btn-small" type="button" disabled={busy} onClick={() => ask(answers, true)}>Show me my pick now</button>
          </div>
        )}
      </>
    );
  }

  // ------------------------- screen 3: the result -------------------------
  function renderResult() {
    const picks = state.picks;
    if (picks.length === 0) {
      return (
        <EmptyState title="No pick this time" text="We couldn't find a movie for that mood. Try again."
                    buttonText="Start over" onClick={startOver} />
      );
    }
    const p = picks[pickIndex];
    const others = picks.filter((_, i) => i !== pickIndex).slice(0, 4);
    return (
      <>
        <div className="pick">
          <TitleCard item={p} />
          <div>
            <p className="chip chip-sky">{pickIndex === 0 ? "Your pick" : `Pick ${pickIndex + 1} of ${picks.length}`}</p>
            <h2>{p.title}</h2>
            {p.overview && <p>{p.overview.length > 320 ? p.overview.slice(0, 317) + "…" : p.overview}</p>}
            <ul className="reasons">{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            <div className="row">
              <Link className="btn btn-primary" to={detailsPath(p)}>See details</Link>
              <button className="btn" type="button" onClick={() => addToWishlist(p)}>+ Wishlist</button>
              {picks.length > 1 && (
                <button className="btn" type="button" onClick={() => setPickIndex((pickIndex + 1) % picks.length)}>Throw me another</button>
              )}
              <button className="btn btn-small" type="button" onClick={startOver}>Start over</button>
            </div>
          </div>
        </div>
        {others.length > 0 && (
          <div>
            <h3 style={{ marginTop: 40 }}>Also good tonight</h3>
            <div className="mini-row">{others.map((o) => <TitleCard key={o.tmdb_id} item={o} />)}</div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">The Reel</h1>
      <ErrorMessage text={error} />
      <div className="stage wide">
        {!state && renderIntro()}
        {state && !state.done && renderQuestion()}
        {state && state.done && renderResult()}
      </div>
    </>
  );
}
