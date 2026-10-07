// login.js - the login page.
if (initPage("")) {
  if (getUser()) window.location.href = "index.html"; // already logged in

  const form = document.getElementById("form");
  const errorBox = document.getElementById("error");
  const submit = document.getElementById("submit");

  // api.js sends us here with ?expired=1 when a saved login stopped working
  if (new URLSearchParams(window.location.search).get("expired")) {
    document.getElementById("expired").hidden = false;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();                 // do not reload the page, we send it with JavaScript
    showError(errorBox, "");
    submit.disabled = true;                 // no double clicks
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: { username: form.username.value, password: form.password.value },
      });
      saveLogin(data);                      // remember the token and user
      goAfterLogin();
    } catch (error) {
      showError(errorBox, error.message);   // e.g. "Invalid username or password"
      submit.disabled = false;
    }
  });

  setupGoogleButton();
}
