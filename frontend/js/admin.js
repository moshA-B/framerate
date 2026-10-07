// admin.js - the manager page: numbers, most watched titles, and the users table.
// The backend refuses everything here for non-managers, so this page is only a view of it.
if (initPage("admin", { manager: true })) {
  const errorBox = document.getElementById("error");
  const me = getUser();

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

    const top = document.getElementById("top");
    top.replaceChildren(...stats.most_watched.map((t) =>
      titleCard(t, { text: `${t.watch_count} watched`, cls: "chip-sky" })));
    document.getElementById("top-empty").replaceChildren(
      stats.most_watched.length === 0 ? emptyState("Nothing here yet", "Nobody has marked anything as watched.") : "");
  }

  // Delete needs two clicks: the first turns the button into "Sure?", the second deletes.
  function deleteButton(user, row) {
    const button = el("button", { className: "btn btn-small", type: "button", "aria-label": `Delete ${user.username}` }, "Delete");
    let armed = false;
    button.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        button.textContent = "Sure?";
        button.classList.add("btn-accent");
        setTimeout(() => { armed = false; button.textContent = "Delete"; button.classList.remove("btn-accent"); }, 4000);
        return;
      }
      button.disabled = true;
      try {
        await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
        row.remove();
        toast(`Deleted ${user.username}`);
      } catch (error) {
        toast(error.message, "warn");
        button.disabled = false;
      }
    });
    return button;
  }

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
      row.append(el("td", {}, user.id === me.id ? el("span", { className: "chip chip-sky" }, "You") : deleteButton(user, row)));
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
}
