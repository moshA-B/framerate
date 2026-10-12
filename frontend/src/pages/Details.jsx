// Details.jsx - the page for ONE movie or series: info, cast, where to watch,
// and (when logged in) the buttons to wishlist / rate / track progress.
// The address looks like /details/movie/603  (type = movie or tv, id = the TMDB number)
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, yearOf } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { useToast } from "../ToastContext.jsx";
import { useTitle } from "../hooks.js";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Poster from "../components/Poster.jsx";

function runtimeText(minutes) {
  if (!minutes) return "";
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
}

// ------------------------- the "your list" panel -------------------------
// `status` is what THIS user did with the title: {in_wishlist, watched, progress}.
// `setStatus` changes it. `save` is a function from the page that saves a series position.
function ActionsPanel({ type, id, status, setStatus, saveProgress }) {
  const { user } = useAuth();
  const toast = useToast();

  // Form fields. They start from what is saved, and are reset when the saved data changes.
  const watched = status ? status.watched : null;
  const progress = status ? status.progress : null;
  const [rating, setRating] = useState("");
  const [review, setReview] = useState("");
  const [season, setSeason] = useState("1");
  const [episode, setEpisode] = useState("1");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRating(watched && watched.my_rating ? String(watched.my_rating) : "");
    setReview(watched && watched.my_review ? watched.my_review : "");
  }, [watched]);
  useEffect(() => {
    setSeason(String(progress ? progress.season : 1));
    setEpisode(String(progress ? progress.episode : 1));
  }, [progress]);

  // Runs a request, shows a toast on failure. Returns the answer, or undefined if it failed.
  async function attempt(path, options, successText) {
    setBusy(true);
    try {
      const result = await api(path, options);
      if (successText) toast(successText);
      return result === null ? true : result;
    } catch (error) {
      toast(error.message, "warn");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  // Logged out: explain and offer a login button.
  if (!user) {
    const next = encodeURIComponent(`/details/${type}/${id}`);
    return (
      <div className="panel">
        <h2>Your list</h2>
        <p className="msg msg-info">Log in to add this to your wishlist, rate it, or track your episodes.</p>
        <Link className="btn btn-primary" to={`/login?next=${next}`}>Login</Link>
      </div>
    );
  }
  if (!status) return <div className="panel"><h2>Your list</h2></div>;   // still loading

  const base = "/api/me";

  async function toggleWishlist() {
    const ok = status.in_wishlist
      ? await attempt(`${base}/wishlist/${type}/${id}`, { method: "DELETE" }, "Removed from your wishlist")
      : await attempt(`${base}/wishlist`, { method: "POST", body: { tmdb_id: id, media_type: type } }, "Added to your wishlist");
    if (ok) setStatus({ ...status, in_wishlist: !status.in_wishlist });
  }

  async function saveWatched(event) {
    event.preventDefault();
    const result = await attempt(`${base}/watched/${type}/${id}`, {
      method: "PUT",
      body: { my_rating: rating ? Number(rating) : null, my_review: review.trim() || null },
    }, "Saved");
    // the backend also removes it from the wishlist when you mark it watched
    if (result) setStatus({ ...status, watched: result, in_wishlist: false });
  }

  async function unwatch() {
    if (await attempt(`${base}/watched/${type}/${id}`, { method: "DELETE" }, "Removed from watched")) {
      setStatus({ ...status, watched: null });
    }
  }

  async function stopTracking() {
    if (await attempt(`${base}/progress/${id}`, { method: "DELETE" }, "Stopped tracking")) {
      setStatus({ ...status, progress: null });
    }
  }

  return (
    <div className="panel">
      <h2>Your list</h2>

      {/* Wishlist toggle (hidden once you watched it, because watching removes it from the wishlist) */}
      {!status.watched && (
        <>
          <div className="row">
            <button className={status.in_wishlist ? "btn btn-done" : "btn"} type="button"
                    aria-pressed={status.in_wishlist} disabled={busy} onClick={toggleWishlist}>
              {status.in_wishlist ? "✓ In your wishlist" : "+ Add to wishlist"}
            </button>
          </div>
          <hr />
        </>
      )}

      {/* Watched form: rating 1-10 and an optional review */}
      <h3>Watched it?</h3>
      <form onSubmit={saveWatched}>
        <div className="field">
          <label htmlFor="rating">Your rating (1-10)</label>
          <select id="rating" value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">No rating</option>
            {Array.from({ length: 10 }, (_, i) => <option key={i} value={String(i + 1)}>{i + 1}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="review">Your review</label>
          <textarea id="review" maxLength={2000} placeholder="What did you think? (optional)"
                    value={review} onChange={(e) => setReview(e.target.value)} />
        </div>
        <div className="row">
          <button className={watched ? "btn btn-done" : "btn btn-primary"} type="submit" disabled={busy}>
            {watched ? "✓ Watched - save changes" : "Mark as watched"}
          </button>
          {watched && <button className="btn" type="button" disabled={busy} onClick={unwatch}>Not watched</button>}
        </div>
      </form>

      {/* Series only: "I'm on season X, episode Y" */}
      {type === "tv" && (
        <>
          <hr />
          <h3>Where are you in the series?</h3>
          <form onSubmit={(e) => { e.preventDefault(); saveProgress(Number(season), Number(episode)); }}>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="p-season">Season</label>
                <input id="p-season" type="number" min="1" max="1000" required value={season} onChange={(e) => setSeason(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="p-episode">Episode</label>
                <input id="p-episode" type="number" min="1" max="10000" required value={episode} onChange={(e) => setEpisode(e.target.value)} />
              </div>
            </div>
            <div className="row">
              <button className={progress ? "btn btn-done" : "btn btn-primary"} type="submit">
                {progress ? "✓ Progress saved" : "Save progress"}
              </button>
              {progress && <button className="btn" type="button" disabled={busy} onClick={stopTracking}>Stop tracking</button>}
            </div>
          </form>
        </>
      )}
    </div>
  );
}

// ------------------------- episodes (series) -------------------------
function Episodes({ id, seasons, onHere }) {
  const { user } = useAuth();
  const [seasonNumber, setSeasonNumber] = useState(seasons[0].season_number);
  const [episodes, setEpisodes] = useState(null);   // null = loading
  const [error, setError] = useState("");

  // Load the episodes again whenever another season is chosen.
  useEffect(() => {
    let cancelled = false;
    setEpisodes(null);
    setError("");
    api(`/api/titles/tv/${id}/season/${seasonNumber}`)
      .then((list) => { if (!cancelled) setEpisodes(list); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [id, seasonNumber]);

  return (
    <section className="section">
      <h2 className="section-title cobalt">Episodes</h2>
      <div className="field" style={{ maxWidth: 380 }}>
        <select aria-label="Season" value={seasonNumber} onChange={(e) => setSeasonNumber(Number(e.target.value))}>
          {seasons.map((s) => (
            <option key={s.season_number} value={s.season_number}>{s.name} ({s.episode_count} episodes)</option>
          ))}
        </select>
      </div>
      {error && <p className="msg msg-error">{error}</p>}
      {!error && !episodes && <p className="muted">Loading episodes…</p>}
      {episodes && episodes.map((ep) => (
        <div key={ep.episode_number} className="episode">
          <span className="num">{ep.episode_number}</span>
          <div>
            <b>{ep.name}</b>
            <div><small>{ep.air_date || ""}</small></div>
            {/* quick way to say "this is the episode I'm on" */}
            {user && (
              <div style={{ marginTop: 6 }}>
                <button className="btn btn-small" type="button" onClick={() => onHere(seasonNumber, ep.episode_number)}>I'm here</button>
              </div>
            )}
          </div>
          {ep.overview && <p>{ep.overview}</p>}
        </div>
      ))}
    </section>
  );
}

function ProviderGroup({ label, providers }) {
  if (!providers || providers.length === 0) return null;
  return (
    <div className="provider-group">
      <h3>{label}</h3>
      <div className="logos">
        {providers.map((p) => (
          p.logo_url
            ? <img key={p.name} src={p.logo_url} alt={p.name} title={p.name} />
            : <span key={p.name} className="chip">{p.name}</span>
        ))}
      </div>
    </div>
  );
}

// ------------------------- the page -------------------------
export default function Details() {
  const { user } = useAuth();
  const toast = useToast();
  const params = useParams();                 // {type: "movie", id: "603"} from the address
  const type = params.type;
  const id = Number(params.id);
  const valid = ["movie", "tv"].includes(type) && Number.isInteger(id) && id > 0;

  const [title, setTitle] = useState(null);   // the info from TMDB
  const [status, setStatus] = useState(null); // what THIS user did with it (null if logged out / loading)
  const [error, setError] = useState(valid ? "" : "This link is not valid. Go back and pick a title again.");

  useTitle(title ? title.title : "Details");

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    setTitle(null);
    setStatus(null);
    setError("");
    async function load() {
      try {
        const info = await api(`/api/titles/${type}/${id}`);
        const mine = user ? await api(`/api/me/status/${type}/${id}`) : null;
        if (cancelled) return;
        setTitle(info);
        setStatus(mine);
      } catch (e) {
        if (!cancelled) setError(e.message);   // e.g. "Not found"
      }
    }
    load();
    return () => { cancelled = true; };
  }, [type, id, user]);

  // Saves "I'm on season X, episode Y". Used by the form and by the "I'm here" buttons.
  async function saveProgress(seasonNumber, episodeNumber) {
    try {
      const result = await api(`/api/me/progress/${id}`, { method: "PUT", body: { season: seasonNumber, episode: episodeNumber } });
      toast(`Saved: season ${seasonNumber}, episode ${episodeNumber}`);
      setStatus((old) => ({ ...old, progress: result }));
    } catch (e) {
      toast(e.message, "warn");
    }
  }

  if (error) return <ErrorMessage text={error} />;
  if (!title) return <div className="skeleton" style={{ maxWidth: 280 }}></div>;

  const w = title.where_to_watch;
  const hasProviders = w && (w.streaming.length || w.rent.length || w.buy.length);

  return (
    <div>
      {title.backdrop_url && <img className="backdrop" src={title.backdrop_url} alt="" />}

      {/* Top: poster + main info */}
      <div className="details-top">
        <div className="card">
          <span className="score" title="TMDB score">{title.rating ? title.rating.toFixed(1) : "–"}</span>
          <Poster item={title} />
        </div>
        <div>
          <h1>{title.title}</h1>
          <div className="chips">
            {yearOf(title) && <span className="chip">{yearOf(title)}</span>}
            {title.runtime ? <span className="chip">{runtimeText(title.runtime)}</span> : null}
            <span className="chip">{title.media_type === "tv" ? "Series" : "Movie"}</span>
            {title.genres.map((g) => <span key={g} className="chip chip-sky">{g}</span>)}
          </div>
          {title.tagline && <p className="tagline">{title.tagline}</p>}
          <p>{title.overview || "No description yet."}</p>
          <p className="muted">{title.vote_count} votes on TMDB</p>
        </div>
      </div>

      {/* Your list panel */}
      <section className="section">
        <ActionsPanel type={type} id={id} status={status} setStatus={setStatus} saveProgress={saveProgress} />
      </section>

      {/* Cast */}
      {title.cast.length > 0 && (
        <section className="section">
          <h2 className="section-title sky">Cast</h2>
          <div className="cast-grid">
            {title.cast.map((c, i) => (
              <div key={i} className="cast-card">
                {c.photo_url
                  ? <img src={c.photo_url} alt={c.name} loading="lazy" />
                  : <div className="poster-ph ph1">{c.name}</div>}
                <b>{c.name}</b>
                <span className="muted">{c.character}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Where to watch */}
      <section className="section">
        <h2 className="section-title">Where to watch</h2>
        {hasProviders ? (
          <div>
            <ProviderGroup label="Stream" providers={w.streaming} />
            <ProviderGroup label="Rent" providers={w.rent} />
            <ProviderGroup label="Buy" providers={w.buy} />
            {w.link && <p><a href={w.link} target="_blank" rel="noopener noreferrer">More options on TMDB</a></p>}
            <p className="muted">Availability for region {w.region}.</p>
          </div>
        ) : (
          <p className="muted">No streaming information for your region.</p>
        )}
      </section>

      {/* Seasons and episodes (series only) */}
      {title.media_type === "tv" && title.seasons.length > 0 && (
        <Episodes id={id} seasons={title.seasons} onHere={saveProgress} />
      )}
    </div>
  );
}
