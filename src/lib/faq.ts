import { website } from "@/website";

function link(href: string, label: string) {
  return `<a href='${href}' target='_blank' rel='noopener noreferrer' class='text-primary hover:opacity-90'>${label}</a>`;
}

const authors = website.authors
  .map(author => link(author.url, author.handle))
  .join(" and ");

// Shared by the FAQ page and llms.txt. Answers are HTML: links open in a new tab
export const faqs = [
  {
    question: "Who runs this survey?",
    answer: `${website.name} is an independent, open source project by ${authors}. It is built on ${link(website.basedOn.url, website.basedOn.name)}, the developer survey run by the ${link(website.basedOn.byUrl, website.basedOn.by)} community. Their open source code and survey format made this project possible.`
  },
  {
    question: "Who was the survey for?",
    answer:
      "The 2026 survey invited anyone working or studying in cybersecurity in Morocco, and Moroccans doing security work abroad: pentesters, SOC and incident response, GRC and compliance, AppSec, cloud and infrastructure security, researchers and students. Response collection is now closed."
  },
  {
    question: "Is it anonymous?",
    answer:
      "We never ask for your name or email. Answers are stored against a random anonymous session, which we only use to avoid spam and duplicate submissions. Please keep personal or identifying details out of free-text answers. Analytics (PostHog) only runs if you accept it in the cookie banner."
  },
  {
    question: "How will the data be used?",
    answer:
      "The results are published as an open report, with the totals behind every chart, so anyone can check the numbers. To keep everyone anonymous, individual answers are not published this year."
  },
  {
    question: "When will the results be released?",
    answer: `The survey closed on 15 November 2026. The data is being checked and the white paper is being finalized for publication on 16 or 17 November 2026. ${link(website.linkedin, "Follow State of Sec Morocco on LinkedIn")} or ${link(website.repoGithub, "watch the GitHub repository")} for publication updates.`
  },
  {
    question: "How can I contribute?",
    answer: `The project is open source. Report problems or send improvements through ${link(website.repoGithub, "GitHub")}, and share the published research with your colleagues, your team and your CTF crew.`
  }
];
