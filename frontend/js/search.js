// search.js - search TMDB and show the results as cards.
// While typing, a dropdown suggests titles that start with the letters typed so far.
if (initPage("search")) {
  const form = document.getElementById("form");
  const input = document.getElementById("q");
  const list = document.getElementById("suggest-list");
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

  // ------------------------- the results grid -------------------------
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

  function search(text) {
    query = text.trim();
    closeList();
    if (query) load(true);
  }

  // ------------------------- the dropdown -------------------------
  let items = [];        // the suggestions on screen
  let active = -1;       // which one the arrow keys are on (-1 = none)
  let timer = null;      // waits for a short pause in typing
  let lastAsked = 0;     // numbers the requests, so a slow old answer is ignored

  function closeList() {
    list.hidden = true;
    list.replaceChildren();
    items = [];
    active = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function highlight(index) {
    active = index;
    [...list.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === index)));
    if (index >= 0) input.setAttribute("aria-activedescendant", `opt-${index}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function showList(suggestions) {
    items = suggestions;
    if (items.length === 0) { closeList(); return; }
    list.replaceChildren(...items.map((item, i) =>
      el("li", { id: `opt-${i}`, role: "option", "aria-selected": "false" },
        el("a", { href: `details.html?type=${item.media_type}&id=${item.tmdb_id}` },
          item.poster_url ? el("img", { src: item.poster_url, alt: "" }) : el("span", { className: "thumb" }),
          el("span", { className: "name" }, item.title, item.year ? ` (${item.year})` : ""),
          el("span", { className: "chip kind" }, item.media_type === "tv" ? "Series" : "Movie")))));
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    active = -1;
  }

  async function suggest() {
    const text = input.value.trim();
    if (text.length < 2) { closeList(); return; }   // one letter would match everything
    const mine = ++lastAsked;
    try {
      const data = await api(`/api/titles/suggest?q=${encodeURIComponent(text)}`);
      if (mine === lastAsked && input.value.trim() === text) showList(data);
    } catch (error) {
      closeList();   // the dropdown is only a help, so we do not show errors for it
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(suggest, 250);   // wait until the user pauses, so we do not send a request per key
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && items.length) { event.preventDefault(); highlight((active + 1) % items.length); }
    else if (event.key === "ArrowUp" && items.length) { event.preventDefault(); highlight((active - 1 + items.length) % items.length); }
    else if (event.key === "Escape") closeList();
    else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();                          // open the highlighted title instead of searching
      const item = items[active];
      window.location.href = `details.html?type=${item.media_type}&id=${item.tmdb_id}`;
    }
  });

  document.addEventListener("click", (event) => {
    if (!form.contains(event.target)) closeList();     // click anywhere else closes it
  });

  // ------------------------- wiring -------------------------
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(timer);
    lastAsked += 1;                                    // ignore any suggestion still on its way
    search(input.value);
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
    search(first);
  }
}
