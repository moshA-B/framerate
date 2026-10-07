// reset.js - the page the email link opens: reset-password.html?token=...
// The token in the link proves the person owns that email.
if (initPage("")) {
  const form = document.getElementById("form");
  const errorBox = document.getElementById("error");
  const doneBox = document.getElementById("done");
  const submit = document.getElementById("submit");
  const token = new URLSearchParams(window.location.search).get("token");

  if (!token) {
    showError(errorBox, "This link is missing its token. Ask for a new reset email.");
    form.hidden = true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError(errorBox, "");
    submit.disabled = true;
    try {
      const data = await api("/api/auth/reset-password", {
        method: "POST",
        body: { token, new_password: form.password.value },
      });
      doneBox.textContent = data.message;
      doneBox.hidden = false;
      form.hidden = true;
      setTimeout(() => (window.location.href = "login.html"), 2000);
    } catch (error) {
      showError(errorBox, error.message);   // e.g. "This reset link is invalid or has expired"
      submit.disabled = false;
    }
  });
}
