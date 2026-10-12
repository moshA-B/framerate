// Register.jsx - the register page. Creating an account does not log you in,
// so after it succeeds we log in with the same details.
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { useAfterLogin, useTitle } from "../hooks.js";
import ErrorMessage from "../components/ErrorMessage.jsx";
import GoogleButton from "../components/GoogleButton.jsx";

export default function Register() {
  useTitle("Register");
  const { user, login } = useAuth();
  const goAfterLogin = useAfterLogin();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/auth/register", { method: "POST", body: { username, email, password } });
      // Account created. Log in right away.
      const data = await api("/api/auth/login", { method: "POST", body: { username, password } });
      login(data);
      goAfterLogin();
    } catch (e) {
      setError(e.message);   // e.g. "Username or email already taken"
      setBusy(false);
    }
  }

  return (
    <div className="form-card">
      <h1>Register</h1>
      <ErrorMessage text={error} />
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="username">Username (3-50 characters)</label>
          <input id="username" name="username" autoComplete="username" minLength={3} maxLength={50} required
                 value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required
                 value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password (at least 6 characters)</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={6} maxLength={128} required
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-accent" type="submit" id="submit" disabled={busy}>Create account</button>
      </form>
      <GoogleButton />
      <div className="form-links">
        <Link to="/login">Already have an account? Login</Link>
      </div>
    </div>
  );
}
