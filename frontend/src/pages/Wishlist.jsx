// Wishlist.jsx - the user's "want to watch" list.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../ToastContext.jsx";
import { useTitle } from "../hooks.js";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Skeletons from "../components/Skeletons.jsx";
import TitleCard from "../components/TitleCard.jsx";

// A card with a Remove button under it.
function WishlistItem({ item, onRemoved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/me/wishlist/${item.media_type}/${item.tmdb_id}`, { method: "DELETE" });
      toast("Removed from your wishlist");
      onRemoved(item);
    } catch (error) {
      toast(error.message, "warn");
      setBusy(false);
    }
  }

  return (
    <div>
      <TitleCard item={item} />
      <div className="card-actions">
        <button className="btn btn-small" type="button" disabled={busy}
                aria-label={`Remove ${item.title} from wishlist`} onClick={remove}>Remove</button>
      </div>
    </div>
  );
}

export default function Wishlist() {
  useTitle("Wishlist");
  const [items, setItems] = useState(null);   // null = loading
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/me/wishlist").then(setItems).catch((e) => { setError(e.message); setItems([]); });
  }, []);

  // Remove one card from the list on screen (the server already deleted it).
  function removed(item) {
    setItems((list) => list.filter((x) => !(x.media_type === item.media_type && x.tmdb_id === item.tmdb_id)));
  }

  return (
    <>
      <h1 className="page-title">Wishlist</h1>
      <ErrorMessage text={error} />
      {items === null && <Skeletons count={6} />}
      {items !== null && items.length > 0 && (
        <div className="grid">
          {items.map((item) => <WishlistItem key={`${item.media_type}-${item.tmdb_id}`} item={item} onRemoved={removed} />)}
        </div>
      )}
      {items !== null && items.length === 0 && !error && (
        <EmptyState title="Nothing here yet" text="Your wishlist is empty. Find something you want to watch." />
      )}
    </>
  );
}
