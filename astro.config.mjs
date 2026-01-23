// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: 'https://domovi.mapsoft.net',
  base: '/domovi',
  vite: {
    plugins: [tailwindcss()],
  },
});