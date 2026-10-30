import type { APIRoute } from "astro";
import { faqs } from "@/lib/faq";
import { surveySections } from "@/lib/survey";
import { website } from "@/website";

export const prerender = true;

// Summary of the site for AI assistants (https://llmstxt.org), built from the same data as the pages

// FAQ answers are HTML: keep their links as markdown, drop any other tag
function toMarkdown(html: string) {
  return html
    .replace(/<a href='([^']+)'[^>]*>([^<]+)<\/a>/g, "[$2]($1)")
    .replace(/<[^>]+>/g, "");
}

const authors = website.authors.map(author => `[${author.handle}](${author.url})`).join(" and ");
const parts = surveySections.map(section => section.title).join(", ");

export const GET: APIRoute = () => {
  const body = [
    `# ${website.name}`,
    "",
    `> ${website.description} ${website.editionYear} edition. The results are published as an open report.`,
    "",
    `${website.name} (${website.url}) is an independent, open source project by ${authors}, built on [${website.basedOn.name}](${website.basedOn.url}), the developer survey run by the [${website.basedOn.by}](${website.basedOn.byUrl}) community.`,
    "",
    `The survey is anonymous (no name or email) and takes about 10 to 15 minutes. It has ${surveySections.length} parts: ${parts}.`,
    "",
    "## Pages",
    "",
    `- [Home](${website.url}/): what the survey is and why it exists`,
    `- [FAQ](${website.url}/faq): who runs it, who should take part, anonymity, how the data is used`,
    `- [Before you start](${website.url}/before-start): rules, analytics consent and the ${surveySections.length} parts of the survey`,
    "",
    "## FAQ",
    "",
    ...faqs.flatMap(faq => [`### ${faq.question}`, "", toMarkdown(faq.answer), ""]),
    "## Source",
    "",
    `- [GitHub repository](${website.repoGithub}): site code and the survey questions (survey/*.yml)`,
    `- [${website.basedOn.name}](${website.basedOn.repo}): the open source project this site is built on`,
    "",
    "## Optional",
    "",
    `- [Instagram](${website.instagram}): announcements`,
    `- [LinkedIn](${website.linkedin}): announcements`,
    `- [X](${website.x}): announcements`,
    ""
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
