// ConfirmButton.jsx - a button that needs TWO clicks, so nothing is deleted by accident.
// The first click turns it into "Sure?", the second runs `onConfirm`.
// After 4 seconds without a second click it goes back.
import { useEffect, useRef, useState } from "react";
import { useToast } from "../ToastContext.jsx";

export default function ConfirmButton({ text, label, onConfirm }) {
  const toast = useToast();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);   // stop the timer if the button disappears

  async function click() {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    clearTimeout(timer.current);
    setBusy(true);
    try {
      await onConfirm();            // may remove this button from the page, so we do not touch state after success
    } catch (error) {
      toast(error.message, "warn");
      setBusy(false);
      setArmed(false);
    }
  }

  return (
    <button className={armed ? "btn btn-small btn-accent" : "btn btn-small"} type="button"
            aria-label={label} disabled={busy} onClick={click}>
      {armed ? "Sure?" : text}
    </button>
  );
}
