// wishlist.js - the user's "want to watch" list.
if (initPage("wishlist", { login: true })) {
  const grid = document.getElementById("list");
  const emptyBox = document.getElementById("empty");
  const errorBox = document.getElementById("error");

  function showEmptyIfNeeded() {
    if (grid.children.length === 0) {
      emptyBox.replaceChildren(emptyState("Nothing here yet", "Your wishlist is empty. Find something you want to watch."));
    }
  }

  // A card with a Remove button under it.
  function wishlistItem(item) {
    const wrapper = el("div", {});
    const remove = el("button", { className: "btn btn-small", type: "button", "aria-label": `Remove ${item.title} from wishlist` }, "Remove");
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await api(`/api/me/wishlist/${item.media_type}/${item.tmdb_id}`, { method: "DELETE" });
        wrapper.remove();
        toast("Removed from your wishlist");
        showEmptyIfNeeded();
      } catch (error) {
        toast(error.message, "warn");
        remove.disabled = false;
      }
    });
    wrapper.append(titleCard(item), el("div", { className: "card-actions" }, remove));
    return wrapper;
  }

  async function load() {
    showSkeletons(grid, 6);
    try {
      const items = await api("/api/me/wishlist");
      grid.replaceChildren(...items.map(wishlistItem));
      showEmptyIfNeeded();
    } catch (error) {
      grid.replaceChildren();
      showError(errorBox, error.message);
    }
  }

  load();
}
