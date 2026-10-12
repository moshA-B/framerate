// EmptyState.jsx - the "Nothing here yet" card, with an optional button.
//   <EmptyState title="..." text="..." />                          button to the search page
//   <EmptyState ... buttonText="Back" to="/" />                    button to another page
//   <EmptyState ... buttonText="Show all" onClick={fn} />          button that runs a function
//   <EmptyState ... buttonText={null} />                           no button (the admin page uses this)
import { Link } from "react-router-dom";

export default function EmptyState({ title, text, buttonText = "Find something to watch", to = "/search", onClick = null }) {
  let button = null;
  if (buttonText && onClick) {
    button = <button className="btn btn-primary" type="button" onClick={onClick}>{buttonText}</button>;
  } else if (buttonText) {
    button = <Link className="btn btn-primary" to={to}>{buttonText}</Link>;
  }
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{text}</p>
      {button}
    </div>
  );
}
