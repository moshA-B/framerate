// ui.js - small helpers for building page content: elements, title cards, messages.
// We build elements with el() instead of pasting HTML text. That is safer: text from
// the internet (movie titles, reviews) can never be mistaken for code (no "XSS").

// el("div", {className: "card"}, child1, "some text", ...) -> a new <div class="card">
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key in node) node[key] = value;      // normal properties: className, href, src, onclick...
    else node.setAttribute(key, value);      // others: aria-label, aria-pressed...
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);                      // a string becomes plain text, never HTML
  }
  return node;
}

// ------------------------- messages -------------------------
// A short pop-up message in the corner that disappears after 3 seconds.
// kind "ok" = cobalt (success), "warn" = tangerine (problem).
function toast(text, kind = "ok") {
  let box = document.getElementById("toasts");
  if (!box) {
    box = el("div", { id: "toasts", role: "status", "aria-live": "polite" });
    document.body.append(box);
  }
  const note = el("div", { className: kind === "warn" ? "toast warn" : "toast" }, text);
  box.append(note);
  setTimeout(() => note.remove(), 3000);
}

// Shows (or hides, with no text) the tangerine error box on a page.
function showError(box, text) {
  box.textContent = text || "";
  box.hidden = !text;
}

// ------------------------- title cards -------------------------
function yearOf(item) {
  return item.release_date ? item.release_date.slice(0, 4) : "";
}

// The poster picture. If TMDB has no image we draw a colored box with the title instead.
function posterEl(item, extraClass = "") {
  if (item.poster_url) {
    return el("img", { className: `poster ${extraClass}`, src: item.poster_url,
                       alt: `Poster of ${item.title}`, loading: "lazy" });
  }
  const color = (item.tmdb_id % 6) + 1; // pick one of the 6 placeholder colors (.ph1 - .ph6)
  return el("div", { className: `poster poster-ph ph${color} ${extraClass}`, role: "img",
                     "aria-label": `No poster for ${item.title}` }, item.title);
}

// One movie/series card. It is a link to the details page.
// `chip` is an optional extra label, e.g. {text: "Your rating 9/10", cls: "chip-sky"}.
function titleCard(item, chip = null) {
  const link = `details.html?type=${item.media_type}&id=${item.tmdb_id}`;
  return el("a", { className: "card", href: link },
    el("span", { className: "score", title: "TMDB score" }, item.rating ? item.rating.toFixed(1) : "–"),
    posterEl(item),
    el("p", { className: "card-title" }, item.title),
    el("span", { className: "card-year" }, yearOf(item)),
    chip ? el("div", {}, el("span", { className: `chip ${chip.cls}` }, chip.text)) : null,
  );
}

// Grey placeholder cards shown while a list is loading.
function showSkeletons(grid, count = 12) {
  grid.replaceChildren(...Array.from({ length: count }, () => el("div", { className: "skeleton" })));
}

// "Nothing here yet" card with a button.
function emptyState(title, text, buttonText = "Find something to watch", href = "search.html") {
  return el("div", { className: "empty" },
    el("h2", {}, title),
    el("p", {}, text),
    el("a", { className: "btn btn-primary", href }, buttonText),
  );
}

// "Trending" heading chip + grid, used on the home page.
function sectionHeading(text, color = "") {
  return el("h2", { className: `section-title ${color}` }, text);
}

// ------------------------- shared action -------------------------
// Adds a title to the logged-in user's wishlist (used by the home page button).
async function addToWishlist(item) {
  if (!getUser()) {
    window.location.href = "login.html";   // you must be logged in to keep a wishlist
    return;
  }
  try {
    await api("/api/me/wishlist", { method: "POST", body: { tmdb_id: item.tmdb_id, media_type: item.media_type } });
    toast("Added to your wishlist");
  } catch (error) {
    toast(error.message, "warn");          // e.g. "Already in your wishlist"
  }
}
