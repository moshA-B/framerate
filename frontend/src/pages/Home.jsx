// Home.jsx - the home page.
//   - a Movies / Series switch
//   - genre tabs:  For you | All | Action | Comedy | ...
//   - "All" shows a featured title plus Trending and Popular
//   - a genre tab shows the titles of that genre
//   - "For you" shows picks based on the user's own history (needs a login)
//
// Home only keeps the CHOICES (movies or series, which tab). The three views below load their own data.
// Each view gets a `key`, so when a choice changes React throws the old view away and starts a fresh one.
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, detailsPath, yearOf } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { useAddToWishlist, useTitle } from "../hooks.js";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Poster from "../components/Poster.jsx";
import Skeletons from "../components/Skeletons.jsx";
import TitleCard from "../components/TitleCard.jsx";

// A heading chip + whatever is inside (usually a grid of cards).
function Section({ title, color = "", children }) {
  return (
    <section className="section">
      <h2 className={`section-title ${color}`}>{title}</h2>
      {children}
    </section>
  );
}

function CardsGrid({ items }) {
  return <div className="grid">{items.map((t) => <TitleCard key={`${t.media_type}-${t.tmdb_id}`} item={t} />)}</div>;
}

// The featured panel at the top ("Tonight's pick").
function Hero({ item }) {
  const addToWishlist = useAddToWishlist();
  const overview = item.overview.length > 320 ? item.overview.slice(0, 320) + "…" : item.overview;
  return (
    <section aria-label="Featured title">
      <div className="hero">
        <div>
          <span className="chip chip-tangerine">Tonight's pick</span>
          <h1>{item.title}</h1>
          <div className="hero-meta">
            <span className="pill" style={{ background: "var(--tangerine)" }}>★ {item.rating.toFixed(1)}</span>
            <span className="pill">{item.media_type === "tv" ? "Series" : "Movie"}</span>
            {yearOf(item) && <span className="pill">{yearOf(item)}</span>}
          </div>
          <p>{overview}</p>
          <div className="row">
            <Link className="btn btn-primary" to={detailsPath(item)}>See details</Link>
            <button className="btn" type="button" onClick={() => addToWishlist(item)}>+ Wishlist</button>
          </div>
        </div>
        <Poster item={item} />
      </div>
    </section>
  );
}

// --- "All": trending and popular. It also picks the featured title and hands it up to Home (onHero),
// because the featured panel is drawn at the very top of the page, above the tabs.
function AllView({ mediaType, onHero }) {
  const [data, setData] = useState(null);      // null = still loading
  const [error, setError] = useState("");
  const word = mediaType === "tv" ? "series" : "movies";

  useEffect(() => {
    let cancelled = false;                     // becomes true if the user clicks elsewhere before the answer arrives
    async function load() {
      try {
        // Two requests at the same time
        const [trending, popular] = await Promise.all([
          api(`/api/titles/trending?media_type=${mediaType}`),
          api(`/api/titles/popular?media_type=${mediaType}`),
        ]);
        if (cancelled) return;
        const candidates = trending.results.slice(0, 5).filter((t) => t.overview);
        if (candidates.length) onHero(candidates[Math.floor(Math.random() * candidates.length)]);
        setData({ trending: trending.results.slice(0, 12), popular: popular.results.slice(0, 12) });
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }
    load();
    return () => { cancelled = true; };        // cleanup: runs when this view is replaced
  }, [mediaType]);

  if (error) return <ErrorMessage text={error} />;
  return (
    <>
      <Section title={`Trending ${word}`}>{data ? <CardsGrid items={data.trending} /> : <Skeletons count={6} />}</Section>
      <Section title={`Popular ${word}`} color="sky">{data ? <CardsGrid items={data.popular} /> : <Skeletons count={6} />}</Section>
    </>
  );
}

// --- one genre, with "Load more"
function GenreView({ mediaType, genre }) {
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Loads one page of titles. `replace` = true starts the list again; false adds to the end ("Load more").
  async function loadPage(next, replace) {
    setLoading(true);
    try {
      const data = await api(`/api/titles/discover?media_type=${mediaType}&genre=${genre.id}&page=${next}`);
      setItems((old) => (replace || !old ? data.results : old.concat(data.results)));
      setPage(next);
      setTotalPages(data.total_pages);
    } catch (e) {
      setError(e.message);
      setItems((old) => old || []);
    }
    setLoading(false);
  }

  useEffect(() => { loadPage(1, true); }, []);   // once, when this view appears (a new genre = a new view)

  return (
    <Section title={genre.name}>
      <ErrorMessage text={error} />
      {items ? <CardsGrid items={items} /> : <Skeletons count={12} />}
      {items && page < totalPages && (
        <div className="row" style={{ justifyContent: "center", marginTop: 32 }}>
          <button className="btn btn-primary" type="button" disabled={loading} onClick={() => loadPage(page + 1, false)}>Load more</button>
        </div>
      )}
    </Section>
  );
}

// --- "For you"
function ForYouView({ mediaType }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api(`/api/me/for-you?media_type=${mediaType}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [mediaType, user]);

  if (!user) {
    return (
      <div className="empty">
        <h2>Picks made for you</h2>
        <p>Log in and we will suggest movies and series based on what you rate, wishlist and watch.</p>
        <Link className="btn btn-primary" to="/login?next=%2F">Login</Link>
      </div>
    );
  }
  if (error) return <ErrorMessage text={error} />;
  if (!data) return <Section title="Picked for you"><Skeletons count={6} /></Section>;
  if (data.needs_more) {
    return (
      <div className="empty">
        <h2>We need to know you better</h2>
        <p>Rate a few titles (thumbs up, thumbs down or skip) and your picks will show up here. It takes a minute.</p>
        <Link className="btn btn-primary" to="/taste">Refine my taste</Link>
      </div>
    );
  }
  const colors = ["", "sky", "cobalt"];
  return (
    <>
      <div className="row section">
        <Link className="btn" to="/taste">Refine my taste</Link>
        <Link className="btn btn-accent" to="/reel">Roll the reel</Link>
      </div>
      {data.rows.map((row, i) => (
        <Section key={row.title} title={row.title} color={colors[i % 3]}><CardsGrid items={row.items} /></Section>
      ))}
    </>
  );
}

// ------------------------- the page -------------------------
export default function Home() {
  useTitle("Home");
  const location = useLocation();
  const navigate = useNavigate();

  // What the page is currently showing. State = values that, when they change, redraw the page.
  const [mediaType, setMediaType] = useState(localStorage.getItem("framerate.type") === "tv" ? "tv" : "movie");
  const [tab, setTab] = useState(location.hash === "#for-you" ? "foryou" : "all");   // "all", "foryou" or a genre id
  const [genres, setGenres] = useState([]);
  const [hero, setHero] = useState(null);   // the featured title (only shown on the "All" tab)

  // Load the genre list whenever Movies/Series changes.
  useEffect(() => {
    let cancelled = false;
    api(`/api/titles/genres?media_type=${mediaType}`)
      .then((list) => { if (!cancelled) setGenres(list); })
      .catch(() => { if (!cancelled) setGenres([]); });
    return () => { cancelled = true; };
  }, [mediaType]);

  // Keep "#for-you" in the address, so the tab survives a refresh and can be linked to.
  useEffect(() => {
    const wanted = tab === "foryou" ? "#for-you" : "";
    if (location.hash !== wanted) navigate({ pathname: "/", hash: wanted }, { replace: true });
  }, [tab]);

  function chooseType(value) {
    setMediaType(value);
    localStorage.setItem("framerate.type", value);
    setHero(null);
    if (typeof tab === "number") setTab("all");   // a genre id of movies is not valid for series
  }

  // Which genre is selected (only when `tab` is a genre id)
  const genre = typeof tab === "number" ? genres.find((g) => g.id === tab) : null;

  return (
    <>
      {tab === "all" && hero && <Hero item={hero} />}

      <section className="reel-strip" aria-label="The Reel">
        <div>
          <h2>Can't decide what to watch?</h2>
          <p>Answer a few quick scenarios and we will pick a movie for tonight.</p>
        </div>
        <Link className="btn btn-accent" to="/reel">Roll the reel</Link>
      </section>

      <div className="controls">
        <div className="toggle" role="group" aria-label="Show movies or series">
          {[["movie", "Movies"], ["tv", "Series"]].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={mediaType === value} onClick={() => chooseType(value)}>{label}</button>
          ))}
        </div>
        <div className="toggle wrap" role="group" aria-label="Genres">
          <button type="button" aria-pressed={tab === "foryou"} onClick={() => setTab("foryou")}>★ For you</button>
          <button type="button" aria-pressed={tab === "all"} onClick={() => setTab("all")}>All</button>
          {genres.map((g) => (
            <button key={g.id} type="button" aria-pressed={tab === g.id} onClick={() => setTab(g.id)}>{g.name}</button>
          ))}
        </div>
      </div>

      <div>
        {tab === "all" && <AllView key={`all-${mediaType}`} mediaType={mediaType} onHero={setHero} />}
        {tab === "foryou" && <ForYouView key={`foryou-${mediaType}`} mediaType={mediaType} />}
        {typeof tab === "number" && (genre
          ? <GenreView key={`genre-${mediaType}-${tab}`} mediaType={mediaType} genre={genre} />
          : <Skeletons count={12} />)}
      </div>
    </>
  );
}
