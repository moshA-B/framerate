// admin.js - the manager page: numbers, charts, top lists, review moderation and the users table.
// The backend refuses everything here for non-managers, so this page is only a view of it.
if (initPage("admin", { manager: true })) {
  const errorBox = document.getElementById("error");
  const me = getUser();

  // ------------------------- charts (plain HTML and CSS, no library) -------------------------
  // Vertical bars. items = [{label, value}]. The tallest bar fills the chart.
  function barChart(box, items, description) {
    const max = Math.max(1, ...items.map((i) => i.value));
    const columns = items.map((i) => el("div", { className: "bar-col", title: `${i.label}: ${i.value}` },
      el("span", { className: "bar-value" }, i.value ? String(i.value) : ""),
      el("div", { className: i.value ? "bar" : "bar zero", style: `height:${Math.round((i.value / max) * 100)}%` })));
    box.replaceChildren(
      el("div", { role: "img", "aria-label": description + " " + items.map((i) => `${i.label}: ${i.value}`).join(", ") },
        el("div", { className: "bars" }, columns),
        el("div", { className: "bar-labels" }, items.map((i) => el("span", {}, i.label)))));
  }

  // Horizontal bars with the names on the left. items = [{label, value}]
  function hbarChart(box, items, emptyText) {
    if (items.length === 0) {
      box.replaceChildren(el("p", { className: "muted" }, emptyText));
      return;
    }
    const max = Math.max(1, ...items.map((i) => i.value));
    box.replaceChildren(el("ul", { className: "hbars" }, items.map((i) =>
      el("li", { title: `${i.label}: ${i.value}` },
        el("span", { className: "name" }, i.label),
        el("div", { className: "track" }, el("div", { className: "fill", style: `width:${Math.round((i.value / max) * 100)}%` })),
        el("span", { className: "num" }, String(i.value))))));
  }

  // "2026-10-08" -> "8/10"
  function shortDate(text) {
    const [, month, day] = text.split("-");
    return `${Number(day)}/${Number(month)}`;
  }

  // ------------------------- numbers and lists -------------------------
  function titleSection(gridId, emptyId, items, chip, emptyTitle, emptyText) {
    document.getElementById(gridId).replaceChildren(...items.map((t) => titleCard(t, chip(t))));
    document.getElementById(emptyId).replaceChildren(items.length === 0 ? emptyState(emptyTitle, emptyText) : "");
  }

  function showStats(stats) {
    const tiles = [
      ["Users", stats.users],
      ["Managers", stats.managers],
      ["New users (7 days)", stats.new_users_last_7_days],
      ["Wishlist items", stats.wishlist_items],
      ["Watched items", stats.watched_items],
      ["Shows in progress", stats.shows_in_progress],
      ["Average rating", stats.average_rating === null ? "–" : stats.average_rating.toFixed(1)],
    ];
    document.getElementById("stats").replaceChildren(...tiles.map(([label, value]) =>
      el("div", { className: "stat" }, el("b", {}, String(value)), el("span", {}, label))));

    // Skip the day labels except every second one, so they never collide on a phone.
    barChart(document.getElementById("chart-signups"),
      stats.signups.map((d, i) => ({ label: i % 2 === (stats.signups.length - 1) % 2 ? shortDate(d.date) : "", value: d.count })),
      "New users per day.");
    barChart(document.getElementById("chart-ratings"),
      stats.rating_counts.map((r) => ({ label: String(r.rating), value: r.count })),
      "Number of ratings for each score from 1 to 10.");
    hbarChart(document.getElementById("chart-genres"),
      stats.popular_genres.map((g) => ({ label: g.name, value: g.count })),
      "No data yet. Genres appear once users watch or wishlist titles.");
    hbarChart(document.getElementById("chart-users"),
      stats.active_users.map((u) => ({ label: u.username, value: u.items })),
      "No activity yet.");

    titleSection("top", "top-empty", stats.most_watched, (t) => ({ text: `${t.watch_count} watched`, cls: "chip-sky" }),
      "Nothing here yet", "Nobody has marked anything as watched.");
    titleSection("wished", "wished-empty", stats.most_wishlisted, (t) => ({ text: `${t.wish_count} wishlists`, cls: "chip-sky" }),
      "Nothing here yet", "Nobody has wishlisted anything.");
    titleSection("best", "best-empty", stats.best_rated, (t) => ({ text: `${t.avg_rating.toFixed(1)}/10 · ${t.rating_count} ratings`, cls: "chip-sky" }),
      "Not enough ratings yet", "A title needs at least 2 ratings from different users.");
  }

  // ------------------------- two-click buttons -------------------------
  // The first click turns the button into "Sure?", the second does the action.
  // After 4 seconds without a second click it goes back, so nothing happens by accident.
  function confirmButton(text, label, action) {
    const button = el("button", { className: "btn btn-small", type: "button", "aria-label": label }, text);
    let armed = false;
    button.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        button.textContent = "Sure?";
        button.classList.add("btn-accent");
        setTimeout(() => { armed = false; button.textContent = text; button.classList.remove("btn-accent"); }, 4000);
        return;
      }
      button.disabled = true;
      try {
        await action();
      } catch (error) {
        toast(error.message, "warn");
        button.disabled = false;
      }
    });
    return button;
  }

  // ------------------------- review moderation -------------------------
  const reviewsBox = document.getElementById("reviews");
  const reviewCount = document.getElementById("review-count");
  const moreButton = document.getElementById("reviews-more");
  let reviewPage = 1;
  let reviewQuery = "";
  let reviewTotal = 0;
  let reviewRequest = 0;   // grows with every search, so a slow old answer cannot overwrite a newer one

  function reviewRow(item) {
    const t = item.title;
    const row = el("article", { className: "review" },
      posterEl(t),
      el("div", {},
        el("h3", {}, el("a", { href: `details.html?type=${t.media_type}&id=${t.tmdb_id}` }, t.title)),
        el("span", { className: "muted" },
          `${item.username} · ${item.rating ? `rated ${item.rating}/10` : "no rating"} · ${item.watched_at.slice(0, 10)}`),
        el("blockquote", {}, item.review)),   // plain text: the review can never run as code
      confirmButton("Delete review", `Delete the review of ${t.title} by ${item.username}`, async () => {
        await api(`/api/admin/reviews/${item.id}`, { method: "DELETE" });
        row.remove();
        reviewTotal -= 1;
        drawReviewCount();
        if (reviewsBox.children.length === 0) loadReviews(true);   // the page emptied: fetch the next reviews
        toast("Review deleted. The rating stays.");
      }));
    return row;
  }

  function drawReviewCount() {
    reviewCount.textContent = reviewTotal === 0
      ? (reviewQuery ? "No review contains those words." : "No written reviews yet.")
      : `${reviewTotal} review${reviewTotal === 1 ? "" : "s"}${reviewQuery ? " found" : ""}.`;
  }

  async function loadReviews(fromStart) {
    const mine = ++reviewRequest;
    if (fromStart) reviewPage = 1;
    try {
      const data = await api(`/api/admin/reviews?page=${reviewPage}&q=${encodeURIComponent(reviewQuery)}`);
      if (mine !== reviewRequest) return;
      if (fromStart) reviewsBox.replaceChildren();
      reviewsBox.append(...data.results.map(reviewRow));
      reviewTotal = data.total;
      drawReviewCount();
      moreButton.hidden = data.page >= data.total_pages;
    } catch (error) {
      showError(errorBox, error.message);
    }
  }

  document.getElementById("review-search").addEventListener("submit", (event) => {
    event.preventDefault();
    reviewQuery = document.getElementById("review-q").value.trim();
    loadReviews(true);
  });
  moreButton.addEventListener("click", () => { reviewPage += 1; loadReviews(false); });

  // ------------------------- users table -------------------------
  function showUsers(users) {
    const head = el("thead", {}, el("tr", {},
      ...["ID", "Username", "Email", "Role", "Joined", ""].map((h) => el("th", { scope: "col" }, h))));
    const body = el("tbody", {});
    for (const user of users) {
      const row = el("tr", {},
        el("td", {}, String(user.id)),
        el("td", {}, user.username),
        el("td", {}, user.email),
        el("td", {}, user.role),
        el("td", {}, user.created_at ? user.created_at.slice(0, 10) : ""));
      // You cannot delete your own account (the backend refuses it too).
      row.append(el("td", {}, user.id === me.id ? el("span", { className: "chip chip-sky" }, "You")
        : confirmButton("Delete", `Delete ${user.username}`, async () => {
          await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
          row.remove();
          toast(`Deleted ${user.username}`);
        })));
      body.append(row);
    }
    document.getElementById("users").replaceChildren(head, body);
  }

  async function load() {
    try {
      const [stats, users] = await Promise.all([api("/api/admin/stats"), api("/api/admin/users")]);
      showStats(stats);
      showUsers(users);
    } catch (error) {
      showError(errorBox, error.message);
    }
  }

  load();
  loadReviews(true);
}
