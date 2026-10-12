// Poster.jsx - the poster picture. If TMDB has no image we draw a colored box with the title instead.
export default function Poster({ item, extraClass = "" }) {
  if (item.poster_url) {
    return <img className={`poster ${extraClass}`} src={item.poster_url} alt={`Poster of ${item.title}`} loading="lazy" />;
  }
  const color = (item.tmdb_id % 6) + 1; // pick one of the 6 placeholder colors (.ph1 - .ph6)
  return (
    <div className={`poster poster-ph ph${color} ${extraClass}`} role="img" aria-label={`No poster for ${item.title}`}>
      {item.title}
    </div>
  );
}
