// auth.js - "who is logged in?": the navbar, the footer, and protecting pages.
// Needs api.js and ui.js to be loaded before it.

// Every page calls this once, right at the start.
//   active  = which navbar link to highlight ("home", "search", "wishlist", "history", "admin")
//   options = {login: true}   -> this page needs a logged-in user
//             {manager: true} -> this page is for managers only
// It returns false when it is sending the visitor elsewhere, so the page can stop.
function initPage(active, options = {}) {
  const user = getUser();
  renderNavbar(active, user);
  renderFooter();

  if ((options.login || options.manager) && !user) {
    // remember where they wanted to go, so we can return after login
    const here = window.location.pathname.split("/").pop() + window.location.search;
    window.location.href = `login.html?next=${encodeURIComponent(here)}`;
    return false;
  }
  if (options.manager && user.role !== "manager") {
    window.location.href = "index.html";
    return false;
  }
  return true;
}

function renderNavbar(active, user) {
  const links = [
    ["home", "index.html", "Home"],
    ["search", "search.html", "Search"],
    ["reel", "reel.html", "The Reel"],
    ["wishlist", "wishlist.html", "Wishlist"],
    ["history", "history.html", "History"],
  ];
  if (user) links.push(["taste", "taste.html", "My taste"]);
  if (user && user.role === "manager") links.push(["admin", "admin.html", "Admin"]);

  const nav = el("nav", { className: "nav-links", "aria-label": "Main" },
    links.map(([key, href, label]) =>
      el("a", { href, className: key === active ? "active" : "",
                "aria-current": key === active ? "page" : null }, label)));

  let right;
  if (user) {
    right = el("div", { className: "nav-user" },
      el("span", { className: "chip" }, user.username),
      el("button", { className: "btn btn-small", type: "button", onclick: logout }, "Logout"));
  } else {
    right = el("div", { className: "nav-user" },
      el("a", { className: "btn btn-small", href: "login.html" }, "Login"),
      el("a", { className: "btn btn-small btn-accent", href: "register.html" }, "Register"));
  }

  document.getElementById("navbar").replaceChildren(
    el("a", { className: "logo", href: "index.html" }, "Framerate"), nav, right);
}

function renderFooter() {
  // The text TMDB requires us to show.
  document.getElementById("footer").textContent =
    "This product uses the TMDB API but is not endorsed or certified by TMDB.";
}

function logout() {
  clearLogin();
  window.location.href = "index.html";
}

// After a successful login: go to the page the visitor wanted, or to the home page.
function goAfterLogin() {
  const next = new URLSearchParams(window.location.search).get("next");
  // Only allow plain local page names, never a link to another website.
  const safe = next && /^[a-z-]+\.html(\?[\w=&%.-]*)?$/.test(next);
  window.location.href = safe ? next : "index.html";
}

// ------------------------- "Sign in with Google" button -------------------------
function loadScript(src) {
  return new Promise((resolve, reject) => {
    document.head.append(el("script", { src, async: true, onload: resolve, onerror: reject }));
  });
}

// Shows Google's button inside #google-button, but only if the backend has a Google
// client ID configured. The rest of the page works fine without it.
async function setupGoogleButton() {
  const section = document.getElementById("google-section");
  if (!section) return;
  try {
    const config = await api("/api/auth/config");
    if (!config.google_client_id) return;           // not configured: keep it hidden
    await loadScript("https://accounts.google.com/gsi/client");

    google.accounts.id.initialize({
      client_id: config.google_client_id,
      // Google calls this with a signed token once the user picked an account.
      callback: async (response) => {
        try {
          const data = await api("/api/auth/google", { method: "POST", body: { credential: response.credential } });
          saveLogin(data);
          goAfterLogin();
        } catch (error) {
          toast(error.message, "warn");
        }
      },
    });
    google.accounts.id.renderButton(document.getElementById("google-button"),
      { theme: "outline", size: "large", text: "continue_with", width: 300 });
    section.hidden = false;
  } catch (error) {
    // Google blocked or offline: just leave the normal login form.
  }
}
