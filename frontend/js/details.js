// details.js - the page for ONE movie or series: info, cast, where to watch,
// and (when logged in) the buttons to wishlist / rate / track progress.
// The address looks like details.html?type=movie&id=603
if (initPage("")) {
  const content = document.getElementById("content");
  const errorBox = document.getElementById("error");
  const user = getUser();

  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const id = Number(params.get("id"));

  let title = null;    // the info from TMDB
  let status = null;   // what THIS user did with it: {in_wishlist, watched, progress} (null if logged out)

  // ------------------------- small helpers -------------------------
  function runtimeText(minutes) {
    if (!minutes) return "";
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`;
  }

  // Runs a request, shows a toast on failure. Returns the answer, or undefined if it failed.
  async function attempt(path, options, successText) {
    try {
      const result = await api(path, options);
      if (successText) toast(successText);
      return result === null ? true : result;
    } catch (error) {
      toast(error.message, "warn");
      return undefined;
    }
  }

  // ------------------------- the "your list" panel -------------------------
  const actions = el("div", { className: "panel" });

  function renderActions() {
    // Logged out: explain and offer a login button.
    if (!user) {
      const next = encodeURIComponent(`details.html?type=${type}&id=${id}`);
      actions.replaceChildren(
        el("h2", {}, "Your list"),
        el("p", { className: "msg msg-info" }, "Log in to add this to your wishlist, rate it, or track your episodes."),
        el("a", { className: "btn btn-primary", href: `login.html?next=${next}` }, "Login"));
      return;
    }

    const base = `/api/me`;
    const parts = [el("h2", {}, "Your list")];

    // --- Wishlist toggle (hidden once you watched it, because watching removes it from the wishlist)
    if (!status.watched) {
      const wish = el("button", {
        className: status.in_wishlist ? "btn btn-done" : "btn", type: "button",
        "aria-pressed": String(status.in_wishlist),
      }, status.in_wishlist ? "✓ In your wishlist" : "+ Add to wishlist");
      wish.addEventListener("click", async () => {
        wish.disabled = true;
        const ok = status.in_wishlist
          ? await attempt(`${base}/wishlist/${type}/${id}`, { method: "DELETE" }, "Removed from your wishlist")
          : await attempt(`${base}/wishlist`, { method: "POST", body: { tmdb_id: id, media_type: type } }, "Added to your wishlist");
        if (ok) status.in_wishlist = !status.in_wishlist;
        renderActions();
      });
      parts.push(el("div", { className: "row" }, wish), el("hr"));
    }

    // --- Watched form: rating 1-10 and an optional review
    const watched = status.watched;
    const rating = el("select", { id: "rating" }, el("option", { value: "" }, "No rating"),
      ...Array.from({ length: 10 }, (_, i) => el("option", { value: String(i + 1) }, String(i + 1))));
    rating.value = watched && watched.my_rating ? String(watched.my_rating) : "";
    const review = el("textarea", { id: "review", maxLength: 2000, placeholder: "What did you think? (optional)" });
    review.value = watched && watched.my_review ? watched.my_review : "";

    const save = el("button", { className: watched ? "btn btn-done" : "btn btn-primary", type: "submit" },
      watched ? "✓ Watched - save changes" : "Mark as watched");
    const watchedRow = el("div", { className: "row" }, save);
    if (watched) {
      const undo = el("button", { className: "btn", type: "button" }, "Not watched");
      undo.addEventListener("click", async () => {
        if (await attempt(`${base}/watched/${type}/${id}`, { method: "DELETE" }, "Removed from watched")) status.watched = null;
        renderActions();
      });
      watchedRow.append(undo);
    }
    const watchedForm = el("form", {},
      el("div", { className: "field" }, el("label", { htmlFor: "rating" }, "Your rating (1-10)"), rating),
      el("div", { className: "field" }, el("label", { htmlFor: "review" }, "Your review"), review),
      watchedRow);
    watchedForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      const result = await attempt(`${base}/watched/${type}/${id}`, {
        method: "PUT",
        body: { my_rating: rating.value ? Number(rating.value) : null, my_review: review.value.trim() || null },
      }, "Saved");
      if (result) {
        status.watched = result;
        status.in_wishlist = false;   // the backend removed it from the wishlist
      }
      renderActions();
    });
    parts.push(el("h3", {}, "Watched it?"), watchedForm);

    // --- Series only: "I'm on season X, episode Y"
    if (type === "tv") {
      const progress = status.progress;
      const season = el("input", { id: "p-season", type: "number", min: "1", max: "1000", required: true, value: String(progress ? progress.season : 1) });
      const episode = el("input", { id: "p-episode", type: "number", min: "1", max: "10000", required: true, value: String(progress ? progress.episode : 1) });
      const saveProgress = el("button", { className: progress ? "btn btn-done" : "btn btn-primary", type: "submit" },
        progress ? "✓ Progress saved" : "Save progress");
      const progressRow = el("div", { className: "row" }, saveProgress);
      if (progress) {
        const clear = el("button", { className: "btn", type: "button" }, "Stop tracking");
        clear.addEventListener("click", async () => {
          if (await attempt(`${base}/progress/${id}`, { method: "DELETE" }, "Stopped tracking")) status.progress = null;
          renderActions();
        });
        progressRow.append(clear);
      }
      const progressForm = el("form", {},
        el("div", { className: "row" },
          el("div", { className: "field", style: "flex:1" }, el("label", { htmlFor: "p-season" }, "Season"), season),
          el("div", { className: "field", style: "flex:1" }, el("label", { htmlFor: "p-episode" }, "Episode"), episode)),
        progressRow);
      progressForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        await saveProgressValue(Number(season.value), Number(episode.value));
      });
      parts.push(el("hr"), el("h3", {}, "Where are you in the series?"), progressForm);
    }

    actions.replaceChildren(...parts);
  }

  async function saveProgressValue(seasonNumber, episodeNumber) {
    const result = await attempt(`/api/me/progress/${id}`, {
      method: "PUT", body: { season: seasonNumber, episode: episodeNumber },
    }, `Saved: season ${seasonNumber}, episode ${episodeNumber}`);
    if (result) status.progress = result;
    renderActions();
  }

  // ------------------------- episodes (series) -------------------------
  const episodesBox = el("div", {});

  async function loadEpisodes(seasonNumber) {
    episodesBox.replaceChildren(el("p", { className: "muted" }, "Loading episodes…"));
    try {
      const episodes = await api(`/api/titles/tv/${id}/season/${seasonNumber}`);
      episodesBox.replaceChildren(...episodes.map((ep) => {
        const row = el("div", { className: "episode" },
          el("span", { className: "num" }, String(ep.episode_number)),
          el("div", {},
            el("b", {}, ep.name),
            el("div", {}, el("small", {}, ep.air_date || "")),
          ),
          ep.overview ? el("p", {}, ep.overview) : null);
        if (user) {
          // quick way to say "this is the episode I'm on"
          const here = el("button", { className: "btn btn-small", type: "button" }, "I'm here");
          here.addEventListener("click", () => saveProgressValue(seasonNumber, ep.episode_number));
          row.querySelector("div").append(el("div", { style: "margin-top:6px" }, here));
        }
        return row;
      }));
    } catch (error) {
      episodesBox.replaceChildren(el("p", { className: "msg msg-error" }, error.message));
    }
  }

  // ------------------------- building the page -------------------------
  function providerGroup(label, providers) {
    if (!providers || providers.length === 0) return null;
    return el("div", { className: "provider-group" },
      el("h3", {}, label),
      el("div", { className: "logos" }, providers.map((p) =>
        p.logo_url ? el("img", { src: p.logo_url, alt: p.name, title: p.name }) : el("span", { className: "chip" }, p.name))));
  }

  function render() {
    document.title = `${title.title} - Framerate`;
    const parts = [];

    if (title.backdrop_url) parts.push(el("img", { className: "backdrop", src: title.backdrop_url, alt: "" }));

    // Top: poster + main info
    const chips = el("div", { className: "chips" },
      yearOf(title) ? el("span", { className: "chip" }, yearOf(title)) : null,
      title.runtime ? el("span", { className: "chip" }, runtimeText(title.runtime)) : null,
      el("span", { className: "chip" }, title.media_type === "tv" ? "Series" : "Movie"),
      title.genres.map((g) => el("span", { className: "chip chip-sky" }, g)));
    parts.push(el("div", { className: "details-top" },
      el("div", { className: "card" },
        el("span", { className: "score", title: "TMDB score" }, title.rating ? title.rating.toFixed(1) : "–"),
        posterEl(title)),
      el("div", {},
        el("h1", {}, title.title),
        chips,
        title.tagline ? el("p", { className: "tagline" }, title.tagline) : null,
        el("p", {}, title.overview || "No description yet."),
        el("p", { className: "muted" }, `${title.vote_count} votes on TMDB`))));

    // Your list panel
    renderActions();
    parts.push(el("section", { className: "section" }, actions));

    // Cast
    if (title.cast.length) {
      parts.push(el("section", { className: "section" },
        el("h2", { className: "section-title sky" }, "Cast"),
        el("div", { className: "cast-grid" }, title.cast.map((c) =>
          el("div", { className: "cast-card" },
            c.photo_url
              ? el("img", { src: c.photo_url, alt: c.name, loading: "lazy" })
              : el("div", { className: "poster-ph ph1" }, c.name),
            el("b", {}, c.name),
            el("span", { className: "muted" }, c.character))))));
    }

    // Where to watch
    const w = title.where_to_watch;
    const hasProviders = w && (w.streaming.length || w.rent.length || w.buy.length);
    parts.push(el("section", { className: "section" },
      el("h2", { className: "section-title" }, "Where to watch"),
      hasProviders
        ? el("div", {}, providerGroup("Stream", w.streaming), providerGroup("Rent", w.rent), providerGroup("Buy", w.buy),
            w.link ? el("p", {}, el("a", { href: w.link, target: "_blank", rel: "noopener" }, "More options on TMDB")) : null,
            el("p", { className: "muted" }, `Availability for region ${w.region}.`))
        : el("p", { className: "muted" }, "No streaming information for your region.")));

    // Seasons and episodes (series only)
    if (title.media_type === "tv" && title.seasons.length) {
      const select = el("select", { id: "season", "aria-label": "Season" },
        title.seasons.map((s) => el("option", { value: String(s.season_number) }, `${s.name} (${s.episode_count} episodes)`)));
      select.addEventListener("change", () => loadEpisodes(Number(select.value)));
      parts.push(el("section", { className: "section" },
        el("h2", { className: "section-title cobalt" }, "Episodes"),
        el("div", { className: "field", style: "max-width:380px" }, select),
        episodesBox));
      loadEpisodes(title.seasons[0].season_number);
    }

    content.replaceChildren(...parts);
  }

  async function load() {
    content.replaceChildren(el("div", { className: "skeleton", style: "max-width:280px" }));
    try {
      title = await api(`/api/titles/${type}/${id}`);
      if (user) status = await api(`/api/me/status/${type}/${id}`);
      render();
    } catch (error) {
      content.replaceChildren();
      showError(errorBox, error.message);   // e.g. "Not found"
    }
  }

  if (!["movie", "tv"].includes(type) || !Number.isInteger(id) || id <= 0) {
    showError(errorBox, "This link is not valid. Go back and pick a title again.");
  } else {
    load();
  }
}
