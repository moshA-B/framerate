// ToastContext.jsx - the little pop-up message in the corner that disappears after 3 seconds.
//   const toast = useToast();   toast("Saved");   toast("Something failed", "warn");
import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext(null);
let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);   // [{id, text, kind}]

  // useCallback keeps the same function between renders, so components that use it do not re-run needlessly.
  const toast = useCallback((text, kind = "ok") => {
    const id = nextId++;
    setToasts((list) => [...list, { id, text, kind }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div id="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={t.kind === "warn" ? "toast warn" : "toast"}>{t.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
