// Admin.jsx - the manager page: numbers, charts, top lists, review moderation and the users table.
// The backend refuses everything here for non-managers, so this page is only a view of it
// (App.jsx also keeps other visitors out with <RequireAuth manager>).
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, detailsPath } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { useToast } from "../ToastContext.jsx";
import { useTitle } from "../hooks.js";
import ConfirmButton from "../components/ConfirmButton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Poster from "../components/Poster.jsx";
import TitleCard from "../components/TitleCard.jsx";

// ------------------------- charts (plain HTML and CSS, no library) -------------------------
// Vertical bars. items = [{label, value}]. The tallest bar fills the chart.
function BarChart({ items, description }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div role="img" aria-label={description + " " + items.map((i) => `${i.label}: ${i.value}`).join(", ")}>
      <div className="bars">
        {items.map((i, index) => (
          <div key={index} className="bar-col" title={`${i.label}: ${i.value}`}>
            <span className="bar-value">{i.value ? String(i.value) : ""}</span>
            <div className={i.value ? "bar" : "bar zero"} style={{ height: `${Math.round((i.value / max) * 100)}%` }}></div>
          </div>
        ))}
      </div>
      <div className="bar-labels">{items.map((i, index) => <span key={index}>{i.label}</span>)}</div>
    </div>
  );
}

// Horizontal bars with the names on the left. items = [{label, value}]
function HBarChart({ items, emptyText }) {
  if (items.length === 0) return <p className="muted">{emptyText}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="hbars">
      {items.map((i) => (
        <li key={i.label} title={`${i.label}: ${i.value}`}>
          <span className="name">{i.label}</span>
          <div className="track"><div className="fill" style={{ width: `${Math.round((i.value / max) * 100)}%` }}></div></div>
          <span className="num">{String(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}

// "2026-10-08" -> "8/10"
function shortDate(text) {
  const [, month, day] = text.split("-");
  return `${Number(day)}/${Number(month)}`;
}

// A grid of title cards with a chip, or a "nothing here" card.
function TitleSection({ title, color, note, items, chip, emptyTitle, emptyText }) {
  return (
    <section className="section">
      <h2 className={`section-title ${color}`}>{title}</h2>
      {note && <p className="muted">{note}</p>}
      {items.length > 0
        ? <div className="grid">{items.map((t) => <TitleCard key={`${t.media_type}-${t.tmdb_id}`} item={t} chip={chip(t)} />)}</div>
        : <EmptyState title={emptyTitle} text={emptyText} buttonText={null} />}
    </section>
  );
}

// ------------------------- numbers, charts and top lists -------------------------
function Stats({ stats }) {
  const tiles = [
    ["Users", stats.users],
    ["Managers", stats.managers],
    ["New users (7 days)", stats.new_users_last_7_days],
    ["Wishlist items", stats.wishlist_items],
    ["Watched items", stats.watched_items],
    ["Shows in progress", stats.shows_in_progress],
    ["Average rating", stats.average_rating === null ? "–" : stats.average_rating.toFixed(1)],
  ];
  // Skip the day labels except every second one, so they never collide on a phone.
  const signups = stats.signups.map((d, i) => ({
    label: i % 2 === (stats.signups.length - 1) % 2 ? shortDate(d.date) : "", value: d.count,
  }));

  return (
    <>
      <section className="section">
        <h2 className="section-title">Numbers</h2>
        <div className="stats">
          {tiles.map(([label, value]) => <div key={label} className="stat"><b>{String(value)}</b><span>{label}</span></div>)}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title sky">Trends</h2>
        <div className="chart-grid">
          <figure className="chart"><figcaption>New users, last 14 days</figcaption>
            <BarChart items={signups} description="New users per day." /></figure>
          <figure className="chart"><figcaption>How people rate (1 to 10)</figcaption>
            <BarChart items={stats.rating_counts.map((r) => ({ label: String(r.rating), value: r.count }))}
                      description="Number of ratings for each score from 1 to 10." /></figure>
          <figure className="chart"><figcaption>Popular genres</figcaption>
            <HBarChart items={stats.popular_genres.map((g) => ({ label: g.name, value: g.count }))}
                       emptyText="No data yet. Genres appear once users watch or wishlist titles." /></figure>
          <figure className="chart"><figcaption>Most active users</figcaption>
            <HBarChart items={stats.active_users.map((u) => ({ label: u.username, value: u.items }))}
                       emptyText="No activity yet." /></figure>
        </div>
      </section>

      <TitleSection title="Most watched" color="" items={stats.most_watched}
                    chip={(t) => ({ text: `${t.watch_count} watched`, cls: "chip-sky" })}
                    emptyTitle="Nothing here yet" emptyText="Nobody has marked anything as watched." />
      <TitleSection title="Most wishlisted" color="sky" items={stats.most_wishlisted}
                    chip={(t) => ({ text: `${t.wish_count} wishlists`, cls: "chip-sky" })}
                    emptyTitle="Nothing here yet" emptyText="Nobody has wishlisted anything." />
      <TitleSection title="Best rated by the community" color="cobalt" note="Average of all users' ratings. A title needs at least 2 ratings."
                    items={stats.best_rated}
                    chip={(t) => ({ text: `${t.avg_rating.toFixed(1)}/10 · ${t.rating_count} ratings`, cls: "chip-sky" })}
                    emptyTitle="Not enough ratings yet" emptyText="A title needs at least 2 ratings from different users." />
    </>
  );
}

// ------------------------- review moderation -------------------------
function ReviewRow({ item, onDeleted }) {
  const t = item.title;
  return (
    <article className="review">
      <Poster item={t} />
      <div>
        <h3><Link to={detailsPath(t)}>{t.title}</Link></h3>
        <span className="muted">
          {item.username} · {item.rating ? `rated ${item.rating}/10` : "no rating"} · {item.watched_at.slice(0, 10)}
        </span>
        {/* plain text: React escapes it, so a review can never run as code */}
        <blockquote>{item.review}</blockquote>
      </div>
      <ConfirmButton text="Delete review" label={`Delete the review of ${t.title} by ${item.username}`}
                     onConfirm={async () => {
                       await api(`/api/admin/reviews/${item.id}`, { method: "DELETE" });
                       onDeleted(item);
                     }} />
    </article>
  );
}

function Reviews({ onError }) {
  const toast = useToast();
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");       // the words being searched
  const [typed, setTyped] = useState("");       // what is in the search box
  const latest = useRef(0);                     // grows with every request, so a slow old answer cannot overwrite a newer one

  async function load(nextPage, words, replace) {
    const mine = ++latest.current;
    try {
      const data = await api(`/api/admin/reviews?page=${nextPage}&q=${encodeURIComponent(words)}`);
      if (mine !== latest.current) return;
      setReviews((old) => (replace ? data.results : old.concat(data.results)));
      setPage(data.page);
      setTotalPages(data.total_pages);
      setTotal(data.total);
    } catch (e) {
      onError(e.message);
    }
  }

  useEffect(() => { load(1, "", true); }, []);

  function search(event) {
    event.preventDefault();
    const words = typed.trim();
    setQuery(words);
    load(1, words, true);
  }

  function deleted(item) {
    setReviews((old) => old.filter((r) => r.id !== item.id));
    setTotal((n) => n - 1);
    toast("Review deleted. The rating stays.");
    // The page emptied but there are more reviews: fetch from the start again.
    if (reviews.length === 1 && total > 1) load(1, query, true);
  }

  const countText = total === 0
    ? (query ? "No review contains those words." : "No written reviews yet.")
    : `${total} review${total === 1 ? "" : "s"}${query ? " found" : ""}.`;

  return (
    <section className="section">
      <h2 className="section-title">Review moderation</h2>
      <form className="row" role="search" onSubmit={search}>
        <input className="search-input" type="search" maxLength={100} aria-label="Search reviews"
               placeholder="Search words in reviews" style={{ flex: 1, minWidth: 220 }}
               value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button className="btn" type="submit">Search</button>
      </form>
      <p className="muted" aria-live="polite">{countText}</p>
      <div className="reviews">{reviews.map((r) => <ReviewRow key={r.id} item={r} onDeleted={deleted} />)}</div>
      {page < totalPages && <button className="btn" type="button" onClick={() => load(page + 1, query, false)}>Load more</button>}
    </section>
  );
}

// ------------------------- users table -------------------------
function UsersTable({ users, setUsers }) {
  const { user: me } = useAuth();
  const toast = useToast();
  return (
    <section className="section">
      <h2 className="section-title cobalt">Users</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{["ID", "Username", "Email", "Role", "Joined", ""].map((h, i) => <th key={i} scope="col">{h}</th>)}</tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{String(u.id)}</td>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.created_at ? u.created_at.slice(0, 10) : ""}</td>
                <td>
                  {/* You cannot delete your own account (the backend refuses it too). */}
                  {u.id === me.id
                    ? <span className="chip chip-sky">You</span>
                    : <ConfirmButton text="Delete" label={`Delete ${u.username}`} onConfirm={async () => {
                        await api(`/api/admin/users/${u.id}`, { method: "DELETE" });
                        setUsers((list) => list.filter((x) => x.id !== u.id));
                        toast(`Deleted ${u.username}`);
                      }} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------- the page -------------------------
export default function Admin() {
  useTitle("Admin");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api("/api/admin/stats"), api("/api/admin/users")])
      .then(([s, u]) => { setStats(s); setUsers(u); })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h1 className="page-title">Admin</h1>
      <ErrorMessage text={error} />
      {stats && <Stats stats={stats} />}
      <Reviews onError={setError} />
      {users && <UsersTable users={users} setUsers={setUsers} />}
    </>
  );
}
