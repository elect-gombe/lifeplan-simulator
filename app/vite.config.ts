import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/sim/",  // GitHub Pages: https://<user>.github.io/sim/
});
