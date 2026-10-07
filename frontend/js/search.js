// search.js - search TMDB and show the results as cards.
if (initPage("search")) {
  const form = document.getElementById("form");
  const input = document.getElementById("q");
  const grid = document.getElementById("results");
  const message = document.getElementById("message");
  const errorBox = document.getElementById("error");
  const moreButton = document.getElementById("more");
  const filters = document.getElementById("filters");

  // What we remember between clicks
  let query = "";
  let page = 1;
  let totalPages = 1;
  let results = [];      // everything loaded so far
  let filter = "all";    // "all", "movie" or "tv"

  // Draws the loaded results, applying the Movies/Series filter.
  function render() {
    const shown = results.filter((item) => filter === "all" || item.media_type === filter);
    grid.replaceChildren(...shown.map((item) => titleCard(item)));
    if (shown.length === 0) {
      message.replaceChildren(results.length === 0
        ? emptyState("No results", `Nothing found for "${query}". Try another name.`, "Back to home", "index.html")
        : emptyState("Nothing here", "None of the loaded results match this filter. Try 'Load more' or 'All'.", "Show all", "#"));
      // the second button is just a link, so make it switch the filter instead
      const link = message.querySelector("a");
      if (results.length > 0) link.addEventListener("click", (e) => { e.preventDefault(); setFilter("all"); });
    } else {
      message.replaceChildren();
    }
    moreButton.hidden = page >= totalPages;
  }

  function setFilter(value) {
    filter = value;
    for (const button of filters.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", button.dataset.filter === value ? "true" : "false");
    }
    render();
  }

  // Asks the backend for one page of results.
  async function load(newSearch) {
    showError(errorBox, "");
    if (newSearch) {
      page = 1;
      results = [];
      showSkeletons(grid, 12);
      message.replaceChildren();
      moreButton.hidden = true;
    }
    moreButton.disabled = true;
    try {
      const data = await api(`/api/titles/search?q=${encodeURIComponent(query)}&page=${page}`);
      totalPages = data.total_pages;
      results = results.concat(data.results);
      filters.hidden = false;
      render();
    } catch (error) {
      grid.replaceChildren();
      showError(errorBox, error.message);
    }
    moreButton.disabled = false;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    query = input.value.trim();
    if (query) load(true);
  });

  moreButton.addEventListener("click", () => {
    page += 1;
    load(false);
  });

  for (const button of filters.querySelectorAll("button")) {
    button.addEventListener("click", () => setFilter(button.dataset.filter));
  }

  // Allows a link like search.html?q=matrix to search straight away
  const first = new URLSearchParams(window.location.search).get("q");
  if (first) {
    input.value = first;
    query = first.trim();
    if (query) load(true);
  }
}
