// home.js - the home page.
//   - a Movies / Series switch
//   - genre tabs:  For you | All | Action | Comedy | ...
//   - "All" shows a featured title plus Trending and Popular
//   - a genre tab shows the titles of that genre
//   - "For you" shows picks based on the user's own history (needs a login)
if (initPage("home")) {
  const user = getUser();
  const errorBox = document.getElementById("error");
  const hero = document.getElementById("hero");
  const content = document.getElementById("content");
  const typeToggle = document.getElementById("type-toggle");
  const pillBox = document.getElementById("genre-pills");

  // What the page is currently showing
  let mediaType = localStorage.getItem("framerate.type") === "tv" ? "tv" : "movie";
  let tab = window.location.hash === "#for-you" ? "foryou" : "all";   // "all", "foryou" or a genre id
  let genres = [];
  let request = 0;   // grows with every click, so a slow old answer cannot overwrite a newer one

  // ------------------------- the switch and the tabs -------------------------
  function drawToggle() {
    typeToggle.replaceChildren(...[["movie", "Movies"], ["tv", "Series"]].map(([value, label]) =>
      el("button", { type: "button", "aria-pressed": String(mediaType === value), onclick: () => chooseType(value) }, label)));
  }

  function drawPills() {
    const pill = (value, label) =>
      el("button", { type: "button", "aria-pressed": String(tab === value), onclick: () => chooseTab(value) }, label);
    pillBox.replaceChildren(pill("foryou", "★ For you"), pill("all", "All"), ...genres.map((g) => pill(g.id, g.name)));
  }

  async function chooseType(value) {
    mediaType = value;
    localStorage.setItem("framerate.type", value);
    if (typeof tab === "number") tab = "all";   // a genre id of movies is not valid for series
    drawToggle();
    await loadGenres();
    show();
  }

  function chooseTab(value) {
    tab = value;
    drawPills();
    show();
  }

  async function loadGenres() {
    try {
      genres = await api(`/api/titles/genres?media_type=${mediaType}`);
    } catch (error) {
      genres = [];
    }
    drawPills();
  }

  // ------------------------- the content -------------------------
  function show() {
    showError(errorBox, "");
    hero.replaceChildren();
    window.location.hash = tab === "foryou" ? "for-you" : "";
    if (tab === "all") showAll();
    else if (tab === "foryou") showForYou();
    else showGenre();
  }

  // A heading chip + a grid of title cards.
  function section(title, color, grid) {
    return el("section", { className: "section" }, el("h2", { className: `section-title ${color}` }, title), grid);
  }

  function cardsGrid(items) {
    return el("div", { className: "grid" }, items.map((t) => titleCard(t)));
  }

  function skeletonGrid() {
    const grid = el("div", { className: "grid" });
    showSkeletons(grid, 6);
    return grid;
  }

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
      el("p", {}, item.overview.length > 320 ? item.overview.slice(0, 320) + "…" : item.overview),
      el("div", { className: "row" },
        el("a", { className: "btn btn-primary", href: `details.html?type=${item.media_type}&id=${item.tmdb_id}` }, "See details"),
        el("button", { className: "btn", type: "button", onclick: () => addToWishlist(item) }, "+ Wishlist")));
    hero.replaceChildren(el("div", { className: "hero" }, text, posterEl(item)));
  }

  // --- "All": featured title, trending, popular
  async function showAll() {
    const mine = ++request;
    const word = mediaType === "tv" ? "series" : "movies";
    content.replaceChildren(section(`Trending ${word}`, "", skeletonGrid()), section(`Popular ${word}`, "sky", skeletonGrid()));
    try {
      // Two requests at the same time
      const [trending, popular] = await Promise.all([
        api(`/api/titles/trending?media_type=${mediaType}`),
        api(`/api/titles/popular?media_type=${mediaType}`),
      ]);
      if (mine !== request) return;                    // the user already clicked something else
      const candidates = trending.results.slice(0, 5).filter((t) => t.overview);
      if (candidates.length) showHero(candidates[Math.floor(Math.random() * candidates.length)]);
      content.replaceChildren(
        section(`Trending ${word}`, "", cardsGrid(trending.results.slice(0, 12))),
        section(`Popular ${word}`, "sky", cardsGrid(popular.results.slice(0, 12))));
    } catch (error) {
      if (mine !== request) return;
      content.replaceChildren();
      showError(errorBox, error.message);
    }
  }

  // --- one genre, with "Load more"
  async function showGenre() {
    const mine = ++request;
    const genre = genres.find((g) => g.id === tab);
    const grid = el("div", { className: "grid" });
    const more = el("button", { className: "btn btn-primary", type: "button", hidden: true }, "Load more");
    content.replaceChildren(
      el("section", { className: "section" },
        el("h2", { className: "section-title" }, genre ? genre.name : "Genre"), grid,
        el("div", { className: "row", style: "justify-content:center; margin-top:32px" }, more)));
    showSkeletons(grid, 12);

    let page = 0;
    async function loadPage(first) {
      page += 1;
      more.disabled = true;
      try {
        const data = await api(`/api/titles/discover?media_type=${mediaType}&genre=${tab}&page=${page}`);
        if (mine !== request) return;
        const cards = data.results.map((t) => titleCard(t));
        if (first) grid.replaceChildren(...cards); else grid.append(...cards);
        more.hidden = page >= data.total_pages;
      } catch (error) {
        if (mine !== request) return;
        if (first) grid.replaceChildren();
        showError(errorBox, error.message);
      }
      more.disabled = false;
    }
    more.addEventListener("click", () => loadPage(false));
    loadPage(true);
  }

  // --- "For you"
  async function showForYou() {
    const mine = ++request;
    if (!user) {
      content.replaceChildren(el("div", { className: "empty" },
        el("h2", {}, "Picks made for you"),
        el("p", {}, "Log in and we will suggest movies and series based on what you rate, wishlist and watch."),
        el("a", { className: "btn btn-primary", href: "login.html?next=index.html" }, "Login")));
      return;
    }
    content.replaceChildren(section("Picked for you", "", skeletonGrid()));
    try {
      const data = await api(`/api/me/for-you?media_type=${mediaType}`);
      if (mine !== request) return;
      if (data.needs_more) {
        content.replaceChildren(el("div", { className: "empty" },
          el("h2", {}, "We need to know you better"),
          el("p", {}, "Rate a few titles (thumbs up, thumbs down or skip) and your picks will show up here. It takes a minute."),
          el("a", { className: "btn btn-primary", href: "taste.html" }, "Refine my taste")));
        return;
      }
      const colors = ["", "sky", "cobalt"];
      const rows = data.rows.map((row, i) => section(row.title, colors[i % 3], cardsGrid(row.items)));
      content.replaceChildren(
        el("div", { className: "row section" },
          el("a", { className: "btn", href: "taste.html" }, "Refine my taste"),
          el("a", { className: "btn btn-accent", href: "reel.html" }, "Roll the reel")),
        ...rows);
    } catch (error) {
      if (mine !== request) return;
      content.replaceChildren();
      showError(errorBox, error.message);
    }
  }

  // ------------------------- start -------------------------
  drawToggle();
  drawPills();      // draws "For you" and "All" immediately, the genres follow
  loadGenres().then(show);
}
