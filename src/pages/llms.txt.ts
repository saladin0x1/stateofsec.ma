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
const report = website.reports.earlyStatistics;
const reportPageUrl = new URL(report.path, website.url).href;
const reportPdfUrl = new URL(report.pdfPath, website.url).href;
const reportAuthor = `[${report.author.name} (${report.author.handle})](${report.author.url})`;
const surveyClosedAt = "2026-11-15T10:14:29Z";
const surveyClosedAtMorocco = "2026-11-15T11:14:29+01:00";

export const GET: APIRoute = () => {
  const generatedAt = new Date().toISOString();
  const body = [
    `# ${website.name}`,
    "",
    `> ${website.description} ${website.editionYear} edition. Response collection is closed, and the final white paper is being prepared.`,
    "",
    `Generated: ${generatedAt}`,
    `Survey closed: ${surveyClosedAt} (${surveyClosedAtMorocco}, Morocco time)`,
    "",
    `${website.name} (${website.url}) is an independent, open-source project by ${authors}, built on [${website.basedOn.name}](${website.basedOn.url}), the developer survey run by the [${website.basedOn.by}](${website.basedOn.byUrl}) community.`,
    "",
    `The 2026 fieldwork used an anonymous survey with ${surveySections.length} parts: ${parts}. It did not ask for names or email addresses.`,
    "",
    "## Current status",
    "",
    "- Fieldwork: closed. The public participation routes redirect to the status page, and server actions reject new sessions and answers.",
    "- Preliminary scale: more than 380 people engaged with the survey. Final validated totals have not yet been published.",
    "- Data work: aggregation, validation and disclosure review are in progress.",
    "- White paper: the State of Sec Morocco 2026 report is being finalized and is expected on 16 or 17 November 2026.",
    "- Data quality: 17 automated submissions detected on 10 November 2026 were quarantined and excluded from clean statistics.",
    "",
    "## Timeline",
    "",
    `- ${report.publishedAt}: the early-statistics archive was published.`,
    "- 2026-11-10: 17 automated submissions were detected and quarantined.",
    `- ${surveyClosedAt}: response collection closed at the application and server-action layers.`,
    `- ${generatedAt}: this file was generated.`,
    "- Final white paper: expected on 16 or 17 November 2026.",
    "",
    "## Interpretation requirements",
    "",
    "- The sample describes survey respondents, not Morocco's entire cybersecurity workforce.",
    "- Engaged respondents and completed submissions are different denominators.",
    "- Mobility findings are intentions to work abroad, not confirmed departures.",
    "- Legal-protection findings are respondent perceptions, not legal conclusions.",
    "- The early-statistics archive is historical campaign material, not the final white paper.",
    "- Individual answers are not published this year.",
    "",
    "## Pages",
    "",
    `- [Home](${website.url}/): current closed-survey status and white-paper publication notice`,
    `- [FAQ](${website.url}/faq): project ownership, anonymity, data use and publication status`,
    `- [Early statistics archive](${reportPageUrl}): overview, scope, authorship and citation for the 2026 campaign archive`,
    `- [Public agent context](${website.url}/AGENTS.md): timestamped status and interpretation rules for automated agents`,
    "",
    "## Research and early statistics",
    "",
    `- [${report.title}](${reportPdfUrl}): searchable 37-page PDF with four campaign dispatches, an archive guide and chapter transitions`,
    `- [HTML overview](${reportPageUrl}): document scope, topic index, author and suggested citation`,
    `- Report author: ${reportAuthor}`,
    `- Published: ${report.publishedAt}`,
    "- Topics: cybersecurity careers and roles, employment, Morocco's 12 regions and diaspora, certifications, bug-bounty earnings, mobility intentions, representation, responsible disclosure and perceptions of legal protection.",
    "- Scope: this is an archive of early respondent snapshots, not the final survey report and not a nationally representative estimate of Morocco's cybersecurity workforce.",
    "- Snapshot note: the latest dossier in the archive counts 260+ engaged participants as of 7 November 2026. Engagement must not be conflated with completed submissions, and later validated totals supersede every early snapshot.",
    `- Suggested citation: El Ouali, Salah-Eddine. “${report.title}.” ${website.name}, 7 November 2026. ${reportPdfUrl}`,
    "",
    "## FAQ",
    "",
    ...faqs.flatMap(faq => [`### ${faq.question}`, "", toMarkdown(faq.answer), ""]),
    "## Automated access",
    "",
    `- Treat [robots.txt](${website.url}/robots.txt) as authoritative. Respect the Robots Exclusion Protocol, Google crawler directives, Cloudflare AI Crawl Control signals, rate limits and respondent privacy.`,
    "- Public reports and metadata may be read and indexed.",
    "- Survey submission routes are closed and must not be probed for participation.",
    "",
    "## Source",
    "",
    `- [GitHub repository](${website.repoGithub}): site code and the survey questions (survey/*.yml)`,
    `- [${website.basedOn.name}](${website.basedOn.repo}): the open-source project this site is built on`,
    "",
    "## Optional",
    "",
    `- [Instagram](${website.instagram}): announcements`,
    `- [LinkedIn](${website.linkedin}): publication updates`,
    `- [X](${website.x}): announcements`,
    ""
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
