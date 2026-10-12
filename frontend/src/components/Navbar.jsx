// Navbar.jsx - the bar at the top of every page.
// NavLink is a link that knows if it points at the page we are on: it adds the class "active" by itself.
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

export default function Navbar() {
  const { user, logout } = useAuth();

  // [address, label]. "end" on Home means: only highlight it on exactly "/", not on every page.
  const links = [
    ["/", "Home"],
    ["/search", "Search"],
    ["/reel", "The Reel"],
    ["/wishlist", "Wishlist"],
    ["/history", "History"],
  ];
  if (user) links.push(["/taste", "My taste"]);
  if (user && user.role === "manager") links.push(["/admin", "Admin"]);

  return (
    <header className="navbar">
      <Link className="logo" to="/">Framerate</Link>

      <nav className="nav-links" aria-label="Main">
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"}>{label}</NavLink>
        ))}
      </nav>

      {user ? (
        <div className="nav-user">
          <span className="chip">{user.username}</span>
          <button className="btn btn-small" type="button" onClick={logout}>Logout</button>
        </div>
      ) : (
        <div className="nav-user">
          <Link className="btn btn-small" to="/login">Login</Link>
          <Link className="btn btn-small btn-accent" to="/register">Register</Link>
        </div>
      )}
    </header>
  );
}
