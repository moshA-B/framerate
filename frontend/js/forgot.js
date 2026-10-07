// forgot.js - "I forgot my password": asks the backend to email a reset link.
if (initPage("")) {
  const form = document.getElementById("form");
  const errorBox = document.getElementById("error");
  const doneBox = document.getElementById("done");
  const submit = document.getElementById("submit");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError(errorBox, "");
    submit.disabled = true;
    try {
      const data = await api("/api/auth/forgot-password", { method: "POST", body: { email: form.email.value } });
      doneBox.textContent = data.message;   // always the same text, even for unknown emails
      doneBox.hidden = false;
    } catch (error) {
      showError(errorBox, error.message);
    }
    submit.disabled = false;
  });
}
