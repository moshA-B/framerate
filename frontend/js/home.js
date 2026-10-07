// home.js - the home page: a featured title and three lists from TMDB.
if (initPage("home")) {
  const errorBox = document.getElementById("error");
  const grids = {
    trending: document.getElementById("trending"),
    movies: document.getElementById("movies"),
    shows: document.getElementById("shows"),
  };

  // The featured panel at the top ("Tonight's pick").
  function showHero(item) {
    const meta = el("div", { className: "hero-meta" },
      el("span", { className: "pill", style: "background: var(--tangerine)" }, `★ ${item.rating.toFixed(1)}`),
      el("span", { className: "pill" }, item.media_type === "tv" ? "Series" : "Movie"),
      yearOf(item) ? el("span", { className: "pill" }, yearOf(item)) : null);

    const text = el("div", {},
      el("span", { className: "chip chip-tangerine" }, "Tonight's pick"),
      el("h1", {}, item.title),
      meta,
      // keep the overview short so the panel stays tidy
      el("p", {}, item.overview.length > 320 ? item.overview.slice(0, 320) + "…" : item.overview),
      el("div", { className: "row" },
        el("a", { className: "btn btn-primary", href: `details.html?type=${item.media_type}&id=${item.tmdb_id}` }, "See details"),
        el("button", { className: "btn", type: "button", onclick: () => addToWishlist(item) }, "+ Wishlist")));

    document.getElementById("hero").replaceChildren(
      el("div", { className: "hero" }, text, posterEl(item)));
  }

  async function load() {
    for (const grid of Object.values(grids)) showSkeletons(grid, 6);
    try {
      // Three requests at the same time, so the page loads faster than one after another.
      const [trending, movies, shows] = await Promise.all([
        api("/api/titles/trending"),
        api("/api/titles/popular?media_type=movie"),
        api("/api/titles/popular?media_type=tv"),
      ]);

      // Pick the featured title at random among the first 5 trending ones that have a story.
      const candidates = trending.results.slice(0, 5).filter((t) => t.overview);
      if (candidates.length) showHero(candidates[Math.floor(Math.random() * candidates.length)]);

      grids.trending.replaceChildren(...trending.results.slice(0, 12).map((t) => titleCard(t)));
      grids.movies.replaceChildren(...movies.results.slice(0, 12).map((t) => titleCard(t)));
      grids.shows.replaceChildren(...shows.results.slice(0, 12).map((t) => titleCard(t)));
    } catch (error) {
      for (const grid of Object.values(grids)) grid.replaceChildren();
      showError(errorBox, error.message);   // e.g. "Could not reach TMDB"
    }
  }

  load();
}
