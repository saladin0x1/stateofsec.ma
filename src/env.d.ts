/// <reference path="../.astro/types.d.ts" />
/// <reference path="../.astro/actions.d.ts" />
/// <reference types="astro/client" />

// Server secrets are declared in astro.config.mjs (env.schema) and read with getSecret()

interface ImportMetaEnv {
  // Client-side variables
  readonly PUBLIC_FIREBASE_API_KEY: string;
  readonly PUBLIC_FIREBASE_AUTH_DOMAIN: string;
  readonly PUBLIC_FIREBASE_PROJECT_ID: string;
  readonly PUBLIC_FIREBASE_STORAGE_BUCKET: string;
  readonly PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly PUBLIC_FIREBASE_APP_ID: string;

  // captcha
  readonly CAPTCHA_ENABLED: string;
  readonly PUBLIC_TURNSTILE_SECRET_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
