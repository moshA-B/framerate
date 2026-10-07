// register.js - the register page. Creating an account does not log you in,
// so after it succeeds we log in with the same details.
if (initPage("")) {
  if (getUser()) window.location.href = "index.html";

  const form = document.getElementById("form");
  const errorBox = document.getElementById("error");
  const submit = document.getElementById("submit");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError(errorBox, "");
    submit.disabled = true;
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: { username: form.username.value, email: form.email.value, password: form.password.value },
      });
      // Account created. Log in right away.
      const data = await api("/api/auth/login", {
        method: "POST",
        body: { username: form.username.value, password: form.password.value },
      });
      saveLogin(data);
      goAfterLogin();
    } catch (error) {
      showError(errorBox, error.message);   // e.g. "Username or email already taken"
      submit.disabled = false;
    }
  });

  setupGoogleButton();
}
