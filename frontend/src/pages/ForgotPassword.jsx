// ForgotPassword.jsx - "I forgot my password": asks the backend to email a reset link.
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useTitle } from "../hooks.js";
import ErrorMessage from "../components/ErrorMessage.jsx";

export default function ForgotPassword() {
  useTitle("Forgot password");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");     // the message to show after sending
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api("/api/auth/forgot-password", { method: "POST", body: { email } });
      setDone(data.message);   // always the same text, even for unknown emails
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="form-card">
      <h1>Forgot password</h1>
      <p>Type the email of your account and we will send you a link to choose a new password.</p>
      <ErrorMessage text={error} />
      {done && <p className="msg msg-info" role="status">{done}</p>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required
                 value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" id="submit" disabled={busy}>Send reset link</button>
      </form>
      <div className="form-links">
        <Link to="/login">Back to login</Link>
      </div>
    </div>
  );
}
