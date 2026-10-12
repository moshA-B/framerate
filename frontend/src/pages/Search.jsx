// Search.jsx - search TMDB and show the results as cards.
// While typing, a dropdown suggests titles that start with the letters typed so far.
// The search word lives in the address (/search?q=matrix), so the browser's Back button and links work.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, detailsPath } from "../api.js";
import { useTitle } from "../hooks.js";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Skeletons from "../components/Skeletons.jsx";
import TitleCard from "../components/TitleCard.jsx";

export default function Search() {
  useTitle("Search");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = (params.get("q") || "").trim();       // the word we are searching for

  // ------------------------- state -------------------------
  const [text, setText] = useState(params.get("q") || "");   // what is typed in the box
  const [results, setResults] = useState([]);                 // everything loaded so far
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);            // true once a search has finished
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");                // "all", "movie" or "tv"

  // the dropdown
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);    // true only while the user is typing
  const [active, setActive] = useState(-1);   // which suggestion the arrow keys are on (-1 = none)
  const form = useRef(null);

  // ------------------------- searching -------------------------
  // Runs every time the word in the address changes (also on the first visit).
  useEffect(() => {
    if (!query) { setResults([]); setSearched(false); return; }
    let cancelled = false;
    setLoading(true);
    setError("");
    setResults([]);
    setPage(1);
    api(`/api/titles/search?q=${encodeURIComponent(query)}&page=1`)
      .then((data) => {
        if (cancelled) return;
        setResults(data.results);
        setTotalPages(data.total_pages);
        setSearched(true);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  async function loadMore() {
    setLoading(true);
    try {
      const data = await api(`/api/titles/search?q=${encodeURIComponent(query)}&page=${page + 1}`);
      setResults((old) => old.concat(data.results));
      setPage(page + 1);
      setTotalPages(data.total_pages);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  function submit(event) {
    event.preventDefault();
    setOpen(false);
    setParams({ q: text.trim() });    // changing the address triggers the effect above
  }

  // ------------------------- the dropdown -------------------------
  // After the user pauses typing for 250 ms, ask for suggestions.
  useEffect(() => {
    const typed = text.trim();
    if (!open || typed.length < 2) { setSuggestions([]); return; }   // one letter would match everything
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/api/titles/suggest?q=${encodeURIComponent(typed)}`);
        if (!cancelled) { setSuggestions(data); setActive(-1); }
      } catch (e) {
        if (!cancelled) setSuggestions([]);   // the dropdown is only a help, so we do not show errors for it
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };   // typing again cancels the waiting request
  }, [text, open]);

  // A click anywhere outside the form closes the dropdown.
  useEffect(() => {
    function outside(event) {
      if (form.current && !form.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, []);

  function onKeyDown(event) {
    const n = suggestions.length;
    if (event.key === "ArrowDown" && n) { event.preventDefault(); setActive((active + 1) % n); }
    else if (event.key === "ArrowUp" && n) { event.preventDefault(); setActive((active - 1 + n) % n); }
    else if (event.key === "Escape") setOpen(false);
    else if (event.key === "Enter" && open && active >= 0 && suggestions[active]) {
      event.preventDefault();                                     // open the highlighted title instead of searching
      navigate(detailsPath(suggestions[active]));
    }
  }

  const showList = open && suggestions.length > 0;
  const shown = results.filter((item) => filter === "all" || item.media_type === filter);

  return (
    <>
      <h1 className="page-title">Search</h1>

      <form ref={form} className="section" role="search" autoComplete="off" onSubmit={submit}>
        <label htmlFor="q" className="muted">Movie or series name</label>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="combo">
            <input id="q" className="search-input" type="search" maxLength={100} placeholder="e.g. Matrix" required
                   role="combobox" aria-autocomplete="list" aria-expanded={showList} aria-controls="suggest-list"
                   aria-activedescendant={active >= 0 ? `opt-${active}` : undefined}
                   value={text} onChange={(e) => { setText(e.target.value); setOpen(true); }} onKeyDown={onKeyDown} />
            {showList && (
              <ul id="suggest-list" className="suggest" role="listbox" aria-label="Suggestions">
                {suggestions.map((item, i) => (
                  <li key={`${item.media_type}-${item.tmdb_id}`} id={`opt-${i}`} role="option" aria-selected={i === active}>
                    <Link to={detailsPath(item)}>
                      {item.poster_url ? <img src={item.poster_url} alt="" /> : <span className="thumb"></span>}
                      <span className="name">{item.title}{item.year ? ` (${item.year})` : ""}</span>
                      <span className="chip kind">{item.media_type === "tv" ? "Series" : "Movie"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className="btn btn-primary" type="submit" style={{ minHeight: 60 }}>Search</button>
        </div>
      </form>

      {/* Filters the results that are already loaded */}
      {searched && (
        <div className="toggle section" role="group" aria-label="Show">
          {[["all", "All"], ["movie", "Movies"], ["tv", "Series"]].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
      )}

      <ErrorMessage text={error} />
      {loading && results.length === 0 && <Skeletons count={12} />}
      {shown.length > 0 && (
        <div className="grid">{shown.map((item) => <TitleCard key={`${item.media_type}-${item.tmdb_id}`} item={item} />)}</div>
      )}

      {searched && shown.length === 0 && (
        results.length === 0
          ? <EmptyState title="No results" text={`Nothing found for "${query}". Try another name.`} buttonText="Back to home" to="/" />
          : <EmptyState title="Nothing here" text="None of the loaded results match this filter. Try 'Load more' or 'All'."
                        buttonText="Show all" onClick={() => setFilter("all")} />
      )}

      {searched && page < totalPages && (
        <div className="row section" style={{ justifyContent: "center", marginTop: 32 }}>
          <button className="btn btn-primary" type="button" disabled={loading} onClick={loadMore}>Load more</button>
        </div>
      )}
    </>
  );
}
