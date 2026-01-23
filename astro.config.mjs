// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: 'https://domovi.mapsoft.net',
  vite: {
    plugins: [tailwindcss()],
  },
});