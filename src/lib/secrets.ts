import { getSecret } from "astro:env/server";

// Read at request time: on Cloudflare Workers secrets are bound per request, not at build
export function requireSecret(name: string): string {
  const value = getSecret(name);
  if (!value)
    throw new Error(`Missing required secret: ${name}`);
  return value;
}
