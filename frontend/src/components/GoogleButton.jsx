// GoogleButton.jsx - "Sign in with Google". It appears only if the backend has a Google client ID,
// so the rest of the page works fine without it.
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { useToast } from "../ToastContext.jsx";
import { useAfterLogin } from "../hooks.js";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

export default function GoogleButton() {
  const { login } = useAuth();
  const toast = useToast();
  const goAfterLogin = useAfterLogin();
  const box = useRef(null);                 // the <div> Google draws its button into
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function setup() {
      try {
        const config = await api("/api/auth/config");
        if (!config.google_client_id || cancelled) return;        // not configured: keep it hidden
        await loadScript("https://accounts.google.com/gsi/client");
        if (cancelled) return;

        window.google.accounts.id.initialize({
          client_id: config.google_client_id,
          // Google calls this with a signed token once the user picked an account.
          callback: async (response) => {
            try {
              const data = await api("/api/auth/google", { method: "POST", body: { credential: response.credential } });
              login(data);
              goAfterLogin();
            } catch (error) {
              toast(error.message, "warn");
            }
          },
        });
        window.google.accounts.id.renderButton(box.current,
          { theme: "outline", size: "large", text: "continue_with", width: 300 });
        setAvailable(true);
      } catch (error) {
        // Google blocked or offline: just leave the normal login form.
      }
    }
    setup();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div hidden={!available}>
      <p className="divider">or</p>
      <div id="google-button" ref={box}></div>
    </div>
  );
}
