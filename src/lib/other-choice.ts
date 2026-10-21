// Only an explicit "Other"/"Others" choice (optionally "Other (please specify)") opens the
// free-text field; a substring match also caught choices like "Networking with other developers"
export function isOtherChoice(choice: string) {
  return /^others?(?:\s*\(.*\))?$/i.test(choice.trim());
}
