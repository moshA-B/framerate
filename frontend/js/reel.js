// reel.js - "The Reel": a short mood quiz that ends with a movie to watch tonight.
// The server remembers nothing between questions. We send ALL answers every time and it
// replies with the next question, or (when finished) a list of picks with reasons.
if (initPage("reel")) {
  const stage = document.getElementById("stage");
  const errorBox = document.getElementById("error");

  let answers = [];     // [{id, answer}] answer: -1 dislike, 0 meh, 1 like
  let lean = [];        // up to 3 genre ids the user fancies today
  let seed = 0;         // random number: a different question order each time
  let state = null;     // the last reply from the server
  let picks = [];
  let pickIndex = 0;
  let busy = false;
  let genres = [];

  // ------------------------- talking to the server -------------------------
  async function ask(finish = false) {
    if (busy) return;
    busy = true;
    showError(errorBox, "");
    try {
      state = await api("/api/reel/next", { method: "POST", body: { answers, seed, lean, finish } });
      if (state.done) {
        picks = state.picks;
        pickIndex = 0;
        drawResult();
      } else {
        drawQuestion();
      }
    } catch (error) {
      showError(errorBox, error.message);
    } finally {
      busy = false;
    }
  }

  // ------------------------- screen 1: intro -------------------------
  async function drawIntro() {
    answers = []; lean = []; picks = []; state = null;
    seed = Math.floor(Math.random() * 2_000_000_000);
    if (!genres.length) {
      try { genres = await api("/api/titles/genres?media_type=movie"); } catch (e) { genres = []; }
    }
    const pills = el("div", { className: "toggle wrap", role: "group", "aria-label": "Genres you fancy today" });
    genres.forEach((g) => {
      const b = el("button", { type: "button", "aria-pressed": "false" }, g.name);
      b.addEventListener("click", () => {
        if (lean.includes(g.id)) lean = lean.filter((x) => x !== g.id);
        else if (lean.length < 3) lean.push(g.id);
        else toast("Pick up to 3 genres", "warn");
        b.setAttribute("aria-pressed", String(lean.includes(g.id)));
      });
      pills.append(b);
    });
    stage.replaceChildren(el("div", { className: "intro-card" },
      el("h2", {}, "Can't decide what to watch?"),
      el("p", {}, "Answer a few quick \"would you enjoy this?\" scenarios. In about 8 questions we pick a movie for tonight."
        + (getUser() ? " Your ratings and history make it even better." : " Log in and your own history makes it even better.")),
      genres.length ? el("p", { className: "muted" }, "Any genres you fancy today? (optional, up to 3)") : null,
      genres.length ? pills : null,
      el("div", { className: "row section" },
        el("button", { className: "btn btn-primary", type: "button", onclick: () => ask() }, "Start the Reel"))));
  }

  // ------------------------- screen 2: a question -------------------------
  function drawQuestion() {
    const q = state.question;
    const button = (text, cls, value) =>
      el("button", { className: `btn ${cls}`, type: "button", onclick: () => answer(q.id, value) }, text);
    const canFinish = answers.length >= 4;
    stage.replaceChildren(
      el("div", { className: "progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": state.total,
                  "aria-valuenow": state.asked, "aria-label": "Quiz progress" },
        el("div", { style: `width:${Math.round((state.asked / state.total) * 100)}%` })),
      el("p", { className: "muted" }, `Question ${state.asked + 1} of ${state.total}`),
      el("p", { className: "scenario" }, q.text),
      el("div", { className: "answer-row" },
        button("👎 No thanks", "", -1), button("😐 Meh", "", 0), button("👍 Sounds great", "btn-primary", 1)),
      canFinish ? el("div", { className: "answer-row" },
        el("button", { className: "btn btn-small", type: "button", onclick: () => ask(true) }, "Show me my pick now")) : null);
  }

  function answer(id, value) {
    if (busy) return;
    answers.push({ id, answer: value });
    ask();
  }

  // ------------------------- screen 3: the result -------------------------
  function drawResult() {
    if (!picks.length) {
      stage.replaceChildren(emptyState("No pick this time", "We couldn't find a movie for that mood. Try again.", "Start over", "reel.html"));
      return;
    }
    const p = picks[pickIndex];
    const others = picks.filter((_, i) => i !== pickIndex).slice(0, 4);
    stage.replaceChildren(
      el("div", { className: "pick" },
        titleCard(p),
        el("div", {},
          el("p", { className: "chip chip-sky" }, pickIndex === 0 ? "Your pick" : `Pick ${pickIndex + 1} of ${picks.length}`),
          el("h2", {}, p.title),
          p.overview ? el("p", {}, p.overview.length > 320 ? p.overview.slice(0, 317) + "…" : p.overview) : null,
          el("ul", { className: "reasons" }, p.reasons.map((r) => el("li", {}, r))),
          el("div", { className: "row" },
            el("a", { className: "btn btn-primary", href: `details.html?type=${p.media_type}&id=${p.tmdb_id}` }, "See details"),
            el("button", { className: "btn", type: "button", onclick: () => addToWishlist(p) }, "+ Wishlist"),
            picks.length > 1 ? el("button", { className: "btn", type: "button", onclick: nextPick }, "Throw me another") : null,
            el("button", { className: "btn btn-small", type: "button", onclick: drawIntro }, "Start over")))),
      others.length ? el("div", {}, el("h3", { style: "margin-top:40px" }, "Also good tonight"),
        el("div", { className: "mini-row" }, others.map((o) => titleCard(o)))) : null);
  }

  function nextPick() {
    pickIndex = (pickIndex + 1) % picks.length;
    drawResult();
  }

  drawIntro();
}
