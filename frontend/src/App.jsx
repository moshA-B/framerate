// App.jsx - the frame of the site and the LIST OF PAGES.
// Every page shows the same Navbar on top and Footer at the bottom; the middle changes with the address.
import { Navigate, Route, Routes } from "react-router-dom";

import Navbar from "./components/Navbar.jsx";
import Footer from "./components/Footer.jsx";
import RequireAuth from "./components/RequireAuth.jsx";

import Home from "./pages/Home.jsx";
import Search from "./pages/Search.jsx";
import Details from "./pages/Details.jsx";
import Wishlist from "./pages/Wishlist.jsx";
import History from "./pages/History.jsx";
import Taste from "./pages/Taste.jsx";
import Reel from "./pages/Reel.jsx";
import Admin from "./pages/Admin.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";

export default function App() {
  return (
    <>
      <Navbar />
      <main className="page">
        <Routes>
          {/* public pages */}
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/details/:type/:id" element={<Details />} />
          <Route path="/reel" element={<Reel />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* pages that need a login: RequireAuth sends visitors to /login first */}
          <Route path="/wishlist" element={<RequireAuth><Wishlist /></RequireAuth>} />
          <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
          <Route path="/taste" element={<RequireAuth><Taste /></RequireAuth>} />

          {/* managers only */}
          <Route path="/admin" element={<RequireAuth manager><Admin /></RequireAuth>} />

          {/* any other address: back to the home page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
