// AuthContext.jsx - "who is logged in?", available to every component.
// React "context" is a way to share a value without passing it down through every component.
//   const { user, login, logout } = useAuth();
import { createContext, useContext, useState } from "react";
import { clearLogin, getUser, saveLogin } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // `user` is null when logged out. We start from what the browser remembered (localStorage).
  const [user, setUser] = useState(getUser());

  // Called after a successful login or register.
  function login(data) {
    saveLogin(data);      // remember the token and user in the browser
    setUser(data.user);   // and tell React, so the navbar and pages update
  }

  function logout() {
    clearLogin();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
