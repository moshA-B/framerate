// main.jsx - where the app STARTS. Browsers load index.html, which loads this file.
// Here we plug React into the empty <div id="root"> and wrap the app in three "providers":
//   BrowserRouter  - lets us have several pages (/search, /wishlist ...) without reloading
//   AuthProvider   - shares "who is logged in" with every component
//   ToastProvider  - shares the little pop-up messages
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import { ToastProvider } from "./ToastContext.jsx";
import "./css/style.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
