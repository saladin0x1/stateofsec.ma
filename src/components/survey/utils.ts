import { actions } from "astro:actions";

export async function submitAnswers(data: Parameters<typeof actions.submitAnswers>[0]) {
  const result = await actions.submitAnswers(data);
  // Expired or missing session cookie: answers are kept in localStorage, so resume after /before-start
  if (result.error?.code === "UNAUTHORIZED")
    window.location.href = "/before-start";
  return result;
}

export function goToThanksPage() {
  window.location.href = "/thanks";
}
