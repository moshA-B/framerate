// Login.jsx - the login page.
import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { useAfterLogin, useTitle } from "../hooks.js";
import ErrorMessage from "../components/ErrorMessage.jsx";
import GoogleButton from "../components/GoogleButton.jsx";

export default function Login() {
  useTitle("Login");
  const { user, login } = useAuth();
  const goAfterLogin = useAfterLogin();
  const [params] = useSearchParams();

  // Each input is "controlled": React keeps its text in a state variable.
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;   // already logged in

  async function submit(event) {
    event.preventDefault();                 // do not reload the page, we send it with JavaScript
    setError("");
    setBusy(true);                          // no double clicks
    try {
      const data = await api("/api/auth/login", { method: "POST", body: { username, password } });
      login(data);                          // remember the token and user
      goAfterLogin();
    } catch (e) {
      setError(e.message);                  // e.g. "Invalid username or password"
      setBusy(false);
    }
  }

  return (
    <div className="form-card">
      <h1>Login</h1>
      {/* api.js sends us here with ?expired=1 when a saved login stopped working */}
      {params.get("expired") && <p className="msg msg-info">Your session ended. Please log in again.</p>}
      <ErrorMessage text={error} />
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="username">Username</label>
          <input id="username" name="username" autoComplete="username" required
                 value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" id="submit" disabled={busy}>Login</button>
      </form>
      <GoogleButton />
      <div className="form-links">
        <Link to="/forgot-password">Forgot your password?</Link>
        <Link to="/register">New here? Create an account</Link>
      </div>
    </div>
  );
}
