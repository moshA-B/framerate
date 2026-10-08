// taste.js - "Refine my taste": one title at a time, the user gives a thumb up, thumb down or skip.
// Every thumb is saved on the server and feeds the recommender (For you tab and The Reel).
if (initPage("taste", { login: true })) {
  const stage = document.getElementById("stage");
  const errorBox = document.getElementById("error");
  const countBox = document.getElementById("count");
  const profileBox = document.getElementById("profile");
  const toggleButtons = document.querySelectorAll("#type-toggle button");

  let mediaType = "movie";
  let queue = [];        // titles fetched but not shown yet
  let current = null;    // the title on screen
  let busy = false;      // true while a thumb is being saved (stops double clicks)
  let request = 0;       // makes slow old answers harmless when the user switches Movies/Series

  // ------------------------- loading titles -------------------------
  // We fetch a few at a time so the next card is ready instantly.
  async function fillQueue() {
    const mine = ++request;
    const batch = await api(`/api/me/taste/next?media_type=${mediaType}&count=8`);
    if (mine !== request) return false;               // the user switched type meanwhile
    const known = new Set(queue.map((t) => t.tmdb_id));
    if (current) known.add(current.tmdb_id);
    queue.push(...batch.filter((t) => !known.has(t.tmdb_id)));
    return true;
  }

  async function showNext() {
    showError(errorBox, "");
    try {
      if (queue.length < 2) await fillQueue();        // top up before we run out
    } catch (error) {
      showError(errorBox, error.message);
    }
    current = queue.shift() || null;
    draw();
  }

  // ------------------------- drawing -------------------------
  function draw() {
    if (!current) {
      stage.replaceChildren(emptyState("That's everything for now",
        "You have answered all the titles we had. Check your picks, or try the other type.",
        "See my picks", "index.html#for-you"));
      return;
    }
    const button = (text, cls, score, label) =>
      el("button", { className: `btn ${cls}`, type: "button", "aria-label": label, onclick: () => rate(score) }, text);

    stage.replaceChildren(
      titleCardStatic(current),
      el("div", { className: "answer-row" },
        button("👎 Not for me", "", -1, `Not for me: ${current.title}`),
        button("Haven't seen it", "", 0, `Skip ${current.title}`),
        button("👍 Like it", "btn-primary", 1, `Like ${current.title}`)));
  }

  // The same look as a normal card, but not a link (a click must not leave the page).
  function titleCardStatic(item) {
    return el("div", { className: "card" },
      el("span", { className: "score", title: "TMDB score" }, item.rating ? item.rating.toFixed(1) : "–"),
      posterEl(item),
      el("p", { className: "stage-title" }, item.title),
      el("span", { className: "card-year" }, yearOf(item)),
      item.overview ? el("p", { className: "muted" }, item.overview.length > 180 ? item.overview.slice(0, 177) + "…" : item.overview) : null);
  }

  // ------------------------- saving a thumb -------------------------
  async function rate(score) {
    if (busy || !current) return;
    busy = true;
    const item = current;
    try {
      const result = await api("/api/me/taste", { method: "POST", body: { tmdb_id: item.tmdb_id, media_type: item.media_type, score } });
      countBox.textContent = countText(result.signals);
      await showNext();
      loadProfile();                                   // refresh "Your taste so far" in the background
    } catch (error) {
      showError(errorBox, error.message);
    } finally {
      busy = false;
    }
  }

  function countText(n) {
    return n === 0 ? "No answers yet." : `You have answered ${n} title${n === 1 ? "" : "s"}.`;
  }

  // ------------------------- "Your taste so far" -------------------------
  async function loadProfile() {
    try {
      const profile = await api("/api/me/taste/profile");
      countBox.textContent = countText(profile.signals);
      const line = (g) => el("li", {}, `${g.name} `, el("span", { className: "muted" }, `${g.score}%`));
      // el() skips empty (null) children, so we build the box with it instead of replaceChildren.
      profileBox.replaceChildren(el("div", {},
        profile.top.length ? el("div", {}, el("h3", {}, "You like"), el("ul", {}, profile.top.map(line))) : null,
        profile.low.length ? el("div", {}, el("h3", {}, "Not your thing"), el("ul", {}, profile.low.map(line))) : null,
        profile.top.length || profile.low.length ? null : el("p", { className: "muted" }, "Answer a few titles and your taste will show up here.")));
    } catch (error) {
      showError(errorBox, error.message);
    }
  }

  // ------------------------- controls -------------------------
  toggleButtons.forEach((b) => b.addEventListener("click", () => {
    mediaType = b.dataset.type;
    toggleButtons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    queue = [];
    current = null;
    showNext();
  }));

  // Keyboard shortcuts: left = dislike, right = like, down = skip.
  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input, textarea, select")) return;
    const score = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: 0 }[event.key];
    if (score === undefined) return;
    event.preventDefault();
    rate(score);
  });

  // Reset needs two clicks, so it cannot happen by accident.
  const resetButton = document.getElementById("reset");
  let armed = false;
  resetButton.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      resetButton.textContent = "Click again to confirm";
      setTimeout(() => { armed = false; resetButton.textContent = "Reset my taste"; }, 4000);
      return;
    }
    armed = false;
    resetButton.textContent = "Reset my taste";
    try {
      await api("/api/me/taste", { method: "DELETE" });
      toast("Your thumbs were cleared");
      queue = [];
      await showNext();
      loadProfile();
    } catch (error) {
      showError(errorBox, error.message);
    }
  });

  showNext();
  loadProfile();
}
