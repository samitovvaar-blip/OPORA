import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// base "./" — чтобы работало на GitHub Pages по адресу /OPORA/
export default defineConfig({ plugins: [react()], base: "./" });
