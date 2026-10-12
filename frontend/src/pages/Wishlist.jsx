// Wishlist.jsx - the user's "want to watch" list.
// It also shows the series the user is in the middle of (from History's "Currently watching"),
// each with a chip like "S2 E5" so you can see where you are. A series can be in both lists.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, detailsPath } from "../api.js";
import { useToast } from "../ToastContext.jsx";
import { useTitle } from "../hooks.js";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Skeletons from "../components/Skeletons.jsx";
import TitleCard from "../components/TitleCard.jsx";

const sameTitle = (a, b) => a.media_type === b.media_type && a.tmdb_id === b.tmdb_id;

// A card with its buttons under it.
//   item.progress    = {season, episode} when the user is watching this series, otherwise null
//   item.onWishlist  = true when the title is on the wishlist
function WishlistItem({ item, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const chip = item.progress ? { text: `S${item.progress.season} E${item.progress.episode}`, cls: "chip-cobalt" } : null;

  // "Remove" takes it off the wishlist. A series that is only being tracked (not wishlisted)
  // gets "Stop tracking" instead.
  async function remove() {
    setBusy(true);
    try {
      if (item.onWishlist) {
        await api(`/api/me/wishlist/${item.media_type}/${item.tmdb_id}`, { method: "DELETE" });
        toast("Removed from your wishlist");
      } else {
        await api(`/api/me/progress/${item.tmdb_id}`, { method: "DELETE" });
        toast("Stopped tracking");
      }
      onChanged(item);
    } catch (error) {
      toast(error.message, "warn");
      setBusy(false);
    }
  }

  const label = item.onWishlist ? "Remove" : "Stop tracking";
  return (
    <div>
      <TitleCard item={item} chip={chip} />
      <div className="row card-actions">
        {/* progress is edited on the details page, where the season/episode form is */}
        {item.progress && <Link className="btn btn-small" to={detailsPath(item)}>Edit</Link>}
        <button className="btn btn-small" type="button" disabled={busy}
                aria-label={`${label}: ${item.title}`} onClick={remove}>{label}</button>
      </div>
    </div>
  );
}

export default function Wishlist() {
  useTitle("Wishlist");
  const [items, setItems] = useState(null);   // null = loading
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api("/api/me/wishlist"), api("/api/me/progress")])
      .then(([wishlist, progress]) => {
        // Start from the wishlist, add the progress to series that have it, then add the
        // series that are only being tracked. Series with progress come first.
        const merged = wishlist.map((w) => {
          const p = progress.find((x) => x.tmdb_id === w.tmdb_id && w.media_type === "tv");
          return { ...w, onWishlist: true, progress: p ? { season: p.season, episode: p.episode } : null };
        });
        for (const p of progress) {
          if (!merged.some((m) => m.media_type === "tv" && m.tmdb_id === p.tmdb_id)) {
            merged.push({ ...p, onWishlist: false, progress: { season: p.season, episode: p.episode } });
          }
        }
        merged.sort((a, b) => Number(!!b.progress) - Number(!!a.progress));   // stable: keeps the order inside each group
        setItems(merged);
      })
      .catch((e) => { setError(e.message); setItems([]); });
  }, []);

  // Called after a card's button worked. A wishlisted series that is also being tracked stays on the
  // page (it just stops being wishlisted, so its button becomes "Stop tracking"); anything else disappears.
  function changed(item) {
    setItems((list) => list.flatMap((x) => {
      if (!sameTitle(x, item)) return [x];
      return item.onWishlist && item.progress ? [{ ...x, onWishlist: false }] : [];
    }));
  }

  return (
    <>
      <h1 className="page-title">Wishlist</h1>
      <ErrorMessage text={error} />
      {items === null && <Skeletons count={6} />}
      {items !== null && items.length > 0 && (
        <div className="grid">
          {items.map((item) => <WishlistItem key={`${item.media_type}-${item.tmdb_id}`} item={item} onChanged={changed} />)}
        </div>
      )}
      {items !== null && items.length === 0 && !error && (
        <EmptyState title="Nothing here yet" text="Your wishlist is empty. Find something you want to watch." />
      )}
    </>
  );
}
