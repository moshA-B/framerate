// history.js - what the user already watched (with their rating) and the series they are in the middle of.
if (initPage("history", { login: true })) {
  const errorBox = document.getElementById("error");
  const watchedGrid = document.getElementById("watched");
  const progressGrid = document.getElementById("progress");
  const watchedEmpty = document.getElementById("watched-empty");
  const progressEmpty = document.getElementById("progress-empty");

  // Shows the "nothing here" card when a grid has no cards left.
  function checkEmpty(grid, box, text) {
    box.replaceChildren(grid.children.length === 0 ? emptyState("Nothing here yet", text) : "");
  }

  // A card + (optional review) + Edit and Remove buttons.
  function entry(item, chip, deleteUrl, removeLabel, onGone, review) {
    const wrapper = el("div", {});
    const remove = el("button", { className: "btn btn-small", type: "button", "aria-label": `${removeLabel}: ${item.title}` }, removeLabel);
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        await api(deleteUrl, { method: "DELETE" });
        wrapper.remove();
        toast("Removed");
        onGone();
      } catch (error) {
        toast(error.message, "warn");
        remove.disabled = false;
      }
    });
    wrapper.append(
      titleCard(item, chip),
      review ? el("p", { className: "review" }, `"${review}"`) : null,
      el("div", { className: "row card-actions" },
        // Editing happens on the details page, where the rating form is
        el("a", { className: "btn btn-small", href: `details.html?type=${item.media_type}&id=${item.tmdb_id}` }, "Edit"),
        remove));
    return wrapper;
  }

  async function load() {
    showSkeletons(watchedGrid, 6);
    showSkeletons(progressGrid, 3);
    try {
      const [watched, progress] = await Promise.all([api("/api/me/watched"), api("/api/me/progress")]);

      progressGrid.replaceChildren(...progress.map((item) =>
        entry(item, { text: `S${item.season} E${item.episode}`, cls: "chip-cobalt" },
          `/api/me/progress/${item.tmdb_id}`, "Stop tracking",
          () => checkEmpty(progressGrid, progressEmpty, "You are not tracking any series. Open a series and set the episode you are on."),
          null)));
      checkEmpty(progressGrid, progressEmpty, "You are not tracking any series. Open a series and set the episode you are on.");

      watchedGrid.replaceChildren(...watched.map((item) =>
        entry(item,
          { text: item.my_rating ? `Your rating ${item.my_rating}/10` : "Watched", cls: "chip-sky" },
          `/api/me/watched/${item.media_type}/${item.tmdb_id}`, "Remove",
          () => checkEmpty(watchedGrid, watchedEmpty, "Nothing marked as watched yet."),
          item.my_review)));
      checkEmpty(watchedGrid, watchedEmpty, "Nothing marked as watched yet.");
    } catch (error) {
      watchedGrid.replaceChildren();
      progressGrid.replaceChildren();
      showError(errorBox, error.message);
    }
  }

  load();
}
