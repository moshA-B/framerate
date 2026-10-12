// RequireAuth.jsx - wraps a page that needs a login.
//   <RequireAuth><Wishlist /></RequireAuth>          logged-in users only
//   <RequireAuth manager><Admin /></RequireAuth>     managers only
// Visitors who are not allowed are sent elsewhere. This only hides the page: the real
// protection is in the backend, which refuses the data to anyone without the right role.
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

export default function RequireAuth({ manager = false, children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    // remember where they wanted to go, so we can return after login
    const here = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />;
  }
  if (manager && user.role !== "manager") return <Navigate to="/" replace />;
  return children;
}
