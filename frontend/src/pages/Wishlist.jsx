// Wishlist.jsx - two sections, like the home page:
//   "Series I'm watching"  the series the user tracks, each with a chip like "S2 E5" (same data as History)
//   "Wishlist"             everything the user wants to watch
// A series can be in both. The two lists are separate on the server, so each section has its own buttons.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, detailsPath } from "../api.js";
import { useToast } from "../ToastContext.jsx";
import { useTitle } from "../hooks.js";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Skeletons from "../components/Skeletons.jsx";
import TitleCard from "../components/TitleCard.jsx";

// A card with its buttons under it. `buttons` are extra links shown before the delete button.
//   deleteUrl     the request that removes it from this list
//   removeLabel   text of the delete button
function ListItem({ item, chip = null, showEdit = false, deleteUrl, removeLabel, doneText, onGone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api(deleteUrl, { method: "DELETE" });
      toast(doneText);
      onGone(item);
    } catch (error) {
      toast(error.message, "warn");
      setBusy(false);
    }
  }

  return (
    <div>
      <TitleCard item={item} chip={chip} />
      <div className="row card-actions">
        {/* progress is edited on the details page, where the season/episode form is */}
        {showEdit && <Link className="btn btn-small" to={detailsPath(item)}>Edit</Link>}
        <button className="btn btn-small" type="button" disabled={busy}
                aria-label={`${removeLabel}: ${item.title}`} onClick={remove}>{removeLabel}</button>
      </div>
    </div>
  );
}

const sameTitle = (a, b) => a.media_type === b.media_type && a.tmdb_id === b.tmdb_id;

export default function Wishlist() {
  useTitle("Wishlist");
  const [wishlist, setWishlist] = useState(null);   // null = loading
  const [watching, setWatching] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api("/api/me/wishlist"), api("/api/me/progress")])
      .then(([w, p]) => { setWishlist(w); setWatching(p); })
      .catch((e) => { setError(e.message); setWishlist([]); setWatching([]); });
  }, []);

  return (
    <>
      <h1 className="page-title">Wishlist</h1>
      <ErrorMessage text={error} />

      {/* only shown when you are tracking at least one series */}
      {watching !== null && watching.length > 0 && (
        <section className="section">
          <h2 className="section-title cobalt">Series I'm watching</h2>
          <div className="grid grid-rows">
            {watching.map((item) => (
              <ListItem key={item.tmdb_id} item={item} showEdit
                        chip={{ text: `S${item.season} E${item.episode}`, cls: "chip-cobalt" }}
                        deleteUrl={`/api/me/progress/${item.tmdb_id}`} removeLabel="Stop tracking" doneText="Stopped tracking"
                        onGone={(gone) => setWatching((list) => list.filter((x) => x.tmdb_id !== gone.tmdb_id))} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        {watching !== null && watching.length > 0 && <h2 className="section-title">Want to watch</h2>}
        {wishlist === null && <Skeletons count={6} />}
        {wishlist !== null && wishlist.length > 0 && (
          <div className="grid grid-rows">
            {wishlist.map((item) => (
              <ListItem key={`${item.media_type}-${item.tmdb_id}`} item={item}
                        deleteUrl={`/api/me/wishlist/${item.media_type}/${item.tmdb_id}`} removeLabel="Remove"
                        doneText="Removed from your wishlist"
                        onGone={(gone) => setWishlist((list) => list.filter((x) => !sameTitle(x, gone)))} />
            ))}
          </div>
        )}
        {wishlist !== null && wishlist.length === 0 && !error && (
          <EmptyState title="Nothing here yet" text="Your wishlist is empty. Find something you want to watch." />
        )}
      </section>
    </>
  );
}
