// History.jsx - what the user already watched (with their rating) and the series they are in the middle of.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, detailsPath } from "../api.js";
import { useToast } from "../ToastContext.jsx";
import { useTitle } from "../hooks.js";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Skeletons from "../components/Skeletons.jsx";
import TitleCard from "../components/TitleCard.jsx";

// A card + (optional review) + Edit and Remove buttons.
function Entry({ item, chip, deleteUrl, removeLabel, review, onGone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api(deleteUrl, { method: "DELETE" });
      toast("Removed");
      onGone(item);
    } catch (error) {
      toast(error.message, "warn");
      setBusy(false);
    }
  }

  return (
    <div>
      <TitleCard item={item} chip={chip} />
      {review && <p className="review">"{review}"</p>}
      <div className="row card-actions">
        {/* Editing happens on the details page, where the rating form is */}
        <Link className="btn btn-small" to={detailsPath(item)}>Edit</Link>
        <button className="btn btn-small" type="button" disabled={busy}
                aria-label={`${removeLabel}: ${item.title}`} onClick={remove}>{removeLabel}</button>
      </div>
    </div>
  );
}

const sameTitle = (a, b) => a.media_type === b.media_type && a.tmdb_id === b.tmdb_id;

export default function History() {
  useTitle("History");
  const [watched, setWatched] = useState(null);     // null = loading
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api("/api/me/watched"), api("/api/me/progress")])
      .then(([w, p]) => { setWatched(w); setProgress(p); })
      .catch((e) => { setError(e.message); setWatched([]); setProgress([]); });
  }, []);

  return (
    <>
      <h1 className="page-title">History</h1>
      <ErrorMessage text={error} />

      <section className="section">
        <h2 className="section-title cobalt">Currently watching</h2>
        {progress === null && <Skeletons count={3} />}
        {progress !== null && progress.length > 0 && (
          <div className="grid">
            {progress.map((item) => (
              <Entry key={item.tmdb_id} item={item} chip={{ text: `S${item.season} E${item.episode}`, cls: "chip-cobalt" }}
                     deleteUrl={`/api/me/progress/${item.tmdb_id}`} removeLabel="Stop tracking" review={null}
                     onGone={(gone) => setProgress((list) => list.filter((x) => x.tmdb_id !== gone.tmdb_id))} />
            ))}
          </div>
        )}
        {progress !== null && progress.length === 0 && !error && (
          <EmptyState title="Nothing here yet" text="You are not tracking any series. Open a series and set the episode you are on." />
        )}
      </section>

      <section className="section">
        <h2 className="section-title sky">Watched</h2>
        {watched === null && <Skeletons count={6} />}
        {watched !== null && watched.length > 0 && (
          <div className="grid">
            {watched.map((item) => (
              <Entry key={`${item.media_type}-${item.tmdb_id}`} item={item}
                     chip={{ text: item.my_rating ? `Your rating ${item.my_rating}/10` : "Watched", cls: "chip-sky" }}
                     deleteUrl={`/api/me/watched/${item.media_type}/${item.tmdb_id}`} removeLabel="Remove" review={item.my_review}
                     onGone={(gone) => setWatched((list) => list.filter((x) => !sameTitle(x, gone)))} />
            ))}
          </div>
        )}
        {watched !== null && watched.length === 0 && !error && (
          <EmptyState title="Nothing here yet" text="Nothing marked as watched yet." />
        )}
      </section>
    </>
  );
}
