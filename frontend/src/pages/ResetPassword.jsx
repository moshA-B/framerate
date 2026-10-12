// ResetPassword.jsx - the page the email link opens: /reset-password?token=...
// The token in the link proves the person owns that email.
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useTitle } from "../hooks.js";
import ErrorMessage from "../components/ErrorMessage.jsx";

export default function ResetPassword() {
  useTitle("New password");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [error, setError] = useState(token ? "" : "This link is missing its token. Ask for a new reset email.");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api("/api/auth/reset-password", { method: "POST", body: { token, new_password: password } });
      setDone(data.message);
      setTimeout(() => navigate("/login"), 2000);
    } catch (e) {
      setError(e.message);   // e.g. "This reset link is invalid or has expired"
      setBusy(false);
    }
  }

  return (
    <div className="form-card">
      <h1>New password</h1>
      <ErrorMessage text={error} />
      {done && <p className="msg msg-info" role="status">{done}</p>}
      {/* the form disappears when the link has no token, and after success */}
      {token && !done && (
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="password">New password (at least 6 characters)</label>
            <input id="password" name="password" type="password" autoComplete="new-password" minLength={6} maxLength={128} required
                   value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" id="submit" disabled={busy}>Change password</button>
        </form>
      )}
      <div className="form-links">
        <Link to="/login">Back to login</Link>
      </div>
    </div>
  );
}
