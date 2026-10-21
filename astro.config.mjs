import cloudflare from "@astrojs/cloudflare";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import yaml from "@rollup/plugin-yaml";

import { defineConfig, envField } from "astro/config";
import { SURVEY_OPEN } from "./src/site-config.mjs";

const redirects = !SURVEY_OPEN
  ? {
      "/before-start": "/",
      "/survey": "/",
      "/thanks": "/"
    }
  : {};

// https://astro.build/config
export default defineConfig({
  integrations: [tailwind(), mdx(), react()],
  trailingSlash: "never",
  output: "server",
  // sharp cannot run on Workers; optimize images at build time instead
  adapter: cloudflare({ imageService: "compile" }),
  // Optional so a missing secret only breaks the survey flow (requireSecret throws there),
  // not every page: Astro validates the schema when the actions module loads
  env: {
    schema: {
      FIREBASE_PROJECT_ID: envField.string({ context: "server", access: "secret", optional: true }),
      FIREBASE_CLIENT_EMAIL: envField.string({ context: "server", access: "secret", optional: true }),
      FIREBASE_PRIVATE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      SESSION_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
      TURNSTILE_SECRET_KEY: envField.string({ context: "server", access: "secret", optional: true })
    }
  },
  redirects: {
    ...redirects
  },
  vite: {
    plugins: [yaml()]
  }
});
