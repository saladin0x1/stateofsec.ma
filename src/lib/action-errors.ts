import { ActionError } from "astro:actions";

/**
 * Runs an action handler so that only ActionErrors reach the browser. Astro returns the
 * message of any other error to the client, even in production (a missing secret would
 * show its name): those are logged and replaced by a generic error.
 */
export async function withGenericErrors<T>(action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  }
  catch (error) {
    if (error instanceof ActionError)
      throw error;
    console.error(`Unexpected error in ${action}:`, error);
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong, please try again"
    });
  }
}
