// hooks.js - small reusable pieces of logic. A "hook" is a function whose name starts with "use".
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import { useToast } from "./ToastContext.jsx";

// Sets the browser tab title: useTitle("Search") -> "Search - Framerate".
export function useTitle(text) {
  useEffect(() => {
    document.title = text ? `${text} - Framerate` : "Framerate";
  }, [text]);
}

// Gives a function that adds a title to the logged-in user's wishlist
// (used by the "+ Wishlist" buttons on the home page and in The Reel).
export function useAddToWishlist() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const here = useLocation();

  return async function addToWishlist(item) {
    if (!user) {
      // you must be logged in to keep a wishlist
      navigate(`/login?next=${encodeURIComponent(here.pathname + here.search)}`);
      return;
    }
    try {
      await api("/api/me/wishlist", { method: "POST", body: { tmdb_id: item.tmdb_id, media_type: item.media_type } });
      toast("Added to your wishlist");
    } catch (error) {
      toast(error.message, "warn");   // e.g. "Already in your wishlist"
    }
  };
}

// After a successful login: go to the page the visitor wanted (?next=...), or to the home page.
export function useAfterLogin() {
  const navigate = useNavigate();
  const { search } = useLocation();

  return function goAfterLogin() {
    const next = new URLSearchParams(search).get("next");
    // Only allow addresses inside our own site ("/something"), never a link to another website.
    const safe = next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\");
    navigate(safe ? next : "/", { replace: true });
  };
}
