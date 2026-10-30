import type { APIRoute } from "astro";
import { SURVEY_OPEN } from "@/site-config.mjs";
import { website } from "@/website";

export const prerender = true;

// Public pages only: /survey and /thanks need a session and redirect without one
const pages = ["/", "/faq", ...(SURVEY_OPEN ? ["/before-start"] : [])];

export const GET: APIRoute = () => {
  const urls = pages.map(path => `  <url><loc>${new URL(path, website.url).href}</loc></url>`);
  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
    ""
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
