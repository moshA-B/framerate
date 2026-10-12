// TitleCard.jsx - one movie/series card. It is a link to the details page.
// `chip` is an optional extra label, e.g. {text: "Your rating 9/10", cls: "chip-sky"}.
import { Link } from "react-router-dom";
import { detailsPath, yearOf } from "../api.js";
import Poster from "./Poster.jsx";

export default function TitleCard({ item, chip = null }) {
  return (
    <Link className="card" to={detailsPath(item)}>
      <span className="score" title="TMDB score">{item.rating ? item.rating.toFixed(1) : "–"}</span>
      <Poster item={item} />
      <p className="card-title">{item.title}</p>
      <span className="card-year">{yearOf(item)}</span>
      {chip && <div><span className={`chip ${chip.cls}`}>{chip.text}</span></div>}
    </Link>
  );
}
