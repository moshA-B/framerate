// vite.config.js - settings for Vite, the tool that turns our React code into plain files
// (HTML + JS + CSS) that every browser understands. "npm run build" creates the folder dist/.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";   // teaches Vite to read JSX (HTML-like code inside JavaScript)

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },   // "npm run dev" opens http://localhost:5173 (only for developing without Docker)
});
