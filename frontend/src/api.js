// api.js - everything about TALKING to the backend, plus remembering the login.
// This is a normal JavaScript module (no React in it). Components import what they need.

// Where the backend lives: the same computer that served this page, on port 8000.
// On your PC this is http://localhost:8000. Through the SSH tunnel to the VM it is also
// localhost:8000. (If you open the site by the VM's IP, it becomes http://VM_IP:8000.)
export const API_URL = `${window.location.protocol}//${window.location.hostname}:8000`;

// ------------------------- remembering the login -------------------------
// localStorage keeps small texts in the browser, even after it is closed.
// We keep the login token (the "JWT") and the user's info (name, role).
export function getToken() {
  return localStorage.getItem("token");
}

export function getUser() {
  const text = localStorage.getItem("user");
  return text ? JSON.parse(text) : null;
}

export function saveLogin(data) {
  // `data` is what POST /api/auth/login returns: {access_token, user}
  localStorage.setItem("token", data.access_token);
  localStorage.setItem("user", JSON.stringify(data.user));
}

export function clearLogin() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

// ------------------------- talking to the API -------------------------
// api("/api/titles/popular")                                  -> GET
// api("/api/me/wishlist", {method: "POST", body: {...}})      -> POST with JSON
// It returns the answer as a JavaScript object. If something goes wrong it THROWS an
// Error whose message is readable, so components just do:  try { ... } catch (e) { setError(e.message) }
export async function api(path, { method = "GET", body = null } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`; // proves who we are
  if (body !== null) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(API_URL + path, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    // fetch only fails like this when the server cannot be reached at all
    throw new Error("Cannot reach the server. Is the backend running?");
  }

  if (response.status === 204) return null; // "done, nothing to send back" (deletes)

  // Most answers are JSON. Read it safely in case the body is empty or not JSON.
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    // Our token stopped working (expired or invalid): log out and go to the login page.
    // A full page load (not React Router) also resets every React state in one go.
    if (response.status === 401 && token) {
      clearLogin();
      window.location.href = "/login?expired=1";
    }
    throw new Error(errorText(data, response.status));
  }
  return data;
}

// Turns the backend's error into one readable sentence.
function errorText(data, status) {
  if (data && typeof data.detail === "string") return data.detail;
  // Validation errors (422) come as a list. Show the first one.
  if (data && Array.isArray(data.detail) && data.detail.length) {
    const first = data.detail[0];
    const field = first.loc ? first.loc[first.loc.length - 1] : "";
    return `${field}: ${first.msg}`;
  }
  return `Something went wrong (error ${status})`;
}

// ------------------------- small helpers shared by pages -------------------------
export function yearOf(item) {
  return item.release_date ? item.release_date.slice(0, 4) : "";
}

// Where a title's details page lives.
export function detailsPath(item) {
  return `/details/${item.media_type}/${item.tmdb_id}`;
}
