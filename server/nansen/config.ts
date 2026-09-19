/**
 * Return the first configured Nansen key using the submission key name first.
 *
 * `NANSEN_API2` and `NANSEN_API_KEY` remain supported for older workspace
 * setups, but a non-empty `NANSEN_API` always wins when more than one alias is
 * present. The key value is never logged or sent to the browser.
 */
export function configuredNansenApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return [env.NANSEN_API, env.NANSEN_API2, env.NANSEN_API_KEY]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value));
}
