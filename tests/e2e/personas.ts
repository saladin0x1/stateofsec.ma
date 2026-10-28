import type { Persona } from "./support/walker";

// Question labels, exactly as in survey/*.yml (validatePersona checks them against the YAML)
export const Q = {
  gender: "What is your gender?",
  age: "What is your age?",
  location: "Where are you currently located?",
  country: "Which country?",
  education: "What is your IT or security education? (completed or in progress)",
  experience: "How many years have you worked in security? (jobs, freelance, internships; bug bounty only as main income)",
  employment: "What is your current employment situation?",
  domain: "Which security domain best describes your current work? (no security work yet: the area you focus on)",
  seniority: "What is your seniority level in your current security role?",
  bugBounty: "Do you take part in bug bounty or VDP programs (organizations invite you to test, e.g. HackerOne, YesWeHack, Bugcrowd)?",
  certifications: "Which security certifications do you hold?",
  learnedBy: "How did you learn cybersecurity? (select all that helped)",
  languages: "What languages can you read/write?",
  madIncome: "Net monthly income in MAD (employees: main job pay slip, fixed allowances included; 13th month, bonuses and side jobs excluded; interns: stipend; founders: take-home after tax and charges; convert other currencies)",
  usdSalary: "Gross yearly salary in USD, before tax (convert other currencies; excl. bug bounty)",
  organization: "What type of organization do you work for (or run)?",
  remote: "What remote work arrangement does your current employer offer?",
  bugBountyEarnings: "Bug bounty earnings in the last 12 months? (USD before tax; convert EUR)",
  bugBountyBarriers: "What made bug bounty harder, made you stop, or kept you from starting?",
  jobHurdles: "What makes it hard to get your first (or next) security job?",
  marketChallenges: "What are the biggest challenges in the Moroccan security job market?",
  plansAbroad: "Do you have any plans to work outside Morocco?",
  comeBack: "Do you plan to come back to live in Morocco?",
  afterStudies: "After your studies, where would you like to work?",
  defensiveTools: "Which defensive, engineering or GRC tools do you use (you or your team) at work or in labs?",
  rulesAndBodies: "Which of these rules or bodies have you dealt with at work (current or past)?",
  socialNetwork: "When it comes to security, what is your primary social network?"
} as const;

export const EMPLOYMENT = [
  "Employee of an organization in Morocco (public or private, incl. nearshore)",
  "Employee of a foreign organization (abroad or remote, incl. employer-of-record)",
  "Freelancer / independent (incl. full-time bug bounty, foreign clients)",
  "Founder or running my own company",
  "Internship or apprenticeship (incl. PFE, ANAPEC / Idmaj contract)",
  "Student (school, university, 1337, OFPPT; if you also work, pick your job)",
  "Looking for work",
  "Other"
] as const;

const EMPLOYMENT_SLUGS = ["employee-morocco", "employee-foreign", "freelancer", "founder", "intern", "student", "looking", "other"];

const EXPERIENCE = {
  none: "None yet (security has not been part of my job)",
  some: "3-4 years"
} as const;

// The profile section is a tree: age, then education, then experience x employment.
// One persona per leaf of that tree.
const leaves: Persona[] = [
  {
    name: "leaf-under-18",
    description: "Under 18: education, experience and employment are not asked",
    answers: { [Q.age]: "Younger than 18 years" },
    neverSees: ["profile-q-4", "profile-q-5", "profile-q-6"]
  },
  {
    name: "leaf-lycee-18-24",
    description: "18-24 still at lycee: experience and employment are not asked",
    answers: {
      [Q.age]: "18 to 24 years",
      [Q.education]: "Still at lycée / preparing the Bac (incl. repeating or candidat libre)"
    },
    sees: ["profile-q-4"],
    neverSees: ["profile-q-5", "profile-q-6"]
  },
  ...(["none", "some"] as const).flatMap(experience =>
    EMPLOYMENT.map((employment, index): Persona => ({
      name: `leaf-${experience}-${EMPLOYMENT_SLUGS[index]}`,
      description: `25-34, Bac +5, experience ${experience}, ${EMPLOYMENT_SLUGS[index]}`,
      answers: {
        [Q.age]: "25 to 34 years",
        [Q.education]: "University/Public school - Bac +5 (Master's)",
        [Q.experience]: EXPERIENCE[experience],
        [Q.employment]: employment
      },
      sees: ["profile-q-4", "profile-q-5", "profile-q-6"],
      // Founders with under 3 years of security work are rare but real: confirmed, not hidden
      softChecks: experience === "none" && employment.startsWith("Founder") ? ["profile-q-6"] : []
    }))
  )
];

const extremes: Persona[] = [
  {
    name: "minor-bug-bounty-earner",
    description: "16-year-old hunter in Casablanca earning from bug bounty",
    answers: {
      [Q.gender]: "Male",
      [Q.age]: "Younger than 18 years",
      [Q.location]: "Casablanca-Settat",
      [Q.domain]: "Offensive security (pentest, red team, bug bounty)",
      [Q.bugBounty]: "Yes, regularly",
      [Q.learnedBy]: ["Hands-on labs (HTB, TryHackMe, PortSwigger Academy)", "Bug bounty"],
      // Minors get one top band so top teen hunters cannot be singled out
      [Q.bugBountyEarnings]: "$2,000 or more",
      [Q.bugBountyBarriers]: ["Platform age limit or parental consent", "No bank account in my own name"]
    },
    sees: ["work-q-9", "work-q-10", "work-q-18"],
    neverSees: ["profile-q-4", "work-q-0", "work-q-16"]
  },
  {
    name: "career-switcher-over-35",
    description: "35-44, diploma in another field, under a year in a SOC job in Morocco",
    answers: {
      [Q.age]: "35 to 44 years",
      [Q.education]: "Other field's diploma (career transition)",
      [Q.experience]: "Less than a year (incl. a current internship)",
      [Q.employment]: EMPLOYMENT[0],
      [Q.domain]: "Security operations (SOC) / blue team",
      [Q.seniority]: "Junior / entry-level",
      [Q.learnedBy]: ["Courses & training (online or in person)", "On-the-job"],
      [Q.marketChallenges]: ["Recruiters filter on diploma (Bac+5) or age", "Few entry-level roles"]
    },
    sees: ["roles-q-1", "work-q-0"],
    neverSees: ["work-q-18"]
  },
  {
    name: "remote-foreign-employee-casablanca",
    description: "Lives in Casablanca, works remotely for a foreign company, paid in USD",
    answers: {
      [Q.age]: "25 to 34 years",
      [Q.location]: "Casablanca-Settat",
      [Q.education]: "Coding school (1337, YouCode, Solicode, etc.)",
      [Q.experience]: "5-6 years",
      [Q.employment]: EMPLOYMENT[1],
      [Q.domain]: "Cloud security",
      [Q.seniority]: "Senior",
      [Q.usdSalary]: "50 000 - 80 000",
      [Q.organization]: "Tech / software company (startup to big tech, e-commerce)",
      [Q.remote]: "Full remote",
      [Q.plansAbroad]: "No"
    },
    sees: ["work-q-2", "work-q-4", "work-q-6"],
    neverSees: ["profile-q-3", "work-q-0", "work-q-17"]
  },
  {
    name: "woman-grc-laayoune",
    description: "Woman in GRC at a public administration in Laayoune-Sakia El Hamra",
    answers: {
      [Q.gender]: "Female",
      [Q.age]: "25 to 34 years",
      [Q.location]: "Laâyoune-Sakia El Hamra",
      [Q.education]: "University/Public school - Bac +5 (Master's)",
      [Q.experience]: "3-4 years",
      [Q.employment]: EMPLOYMENT[0],
      [Q.domain]: "Governance, risk & compliance (GRC)",
      [Q.seniority]: "Mid-level",
      [Q.certifications]: ["ISO 27001 / 27005 / EBIOS RM", "CISSP / CISM / CISA"],
      [Q.languages]: ["Arabic", "French", "English"],
      [Q.madIncome]: "8 000 - 12 000",
      [Q.organization]: "Public administration",
      [Q.defensiveTools]: ["GRC & risk platforms (Archer, ServiceNow, Egerie, CISO Assistant, spreadsheets)"],
      [Q.rulesAndBodies]: ["Law 05-20 on cybersecurity / DGSSI directives (DNSSI)", "Law 09-08 / CNDP (personal data)"]
    },
    sees: ["work-q-0", "tech-q-1"],
    neverSees: ["tech-q-0", "work-q-2"]
  },
  {
    name: "abroad-canada",
    description: "Works in Canada for a foreign employer, unsure about coming back",
    answers: {
      [Q.age]: "25 to 34 years",
      [Q.location]: "US & Canada",
      [Q.country]: "Canada",
      [Q.education]: "Private engineering/tech school",
      [Q.experience]: "5-6 years",
      [Q.employment]: EMPLOYMENT[1],
      [Q.domain]: "Application security (AppSec)",
      [Q.usdSalary]: "80 000 - 120 000",
      [Q.comeBack]: "Still hesitating",
      [Q.socialNetwork]: { choices: ["Other"], other: "Mastodon" }
    },
    // Living abroad: straight to coming back, no plans-to-work-abroad question
    sees: ["profile-q-3", "work-q-17"],
    // No MAD income, no unemployment question at 5-6 years, no plans to work abroad
    neverSees: ["work-q-0", "work-q-11", "work-q-16"]
  }
];

export const personas: Persona[] = [...leaves, ...extremes];

export function persona(name: string): Persona {
  const found = personas.find(p => p.name === name);
  if (!found)
    throw new Error(`No persona named ${name}`);
  return found;
}
