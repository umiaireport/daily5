/** Return the server-side Nansen key without exposing it to the browser. */
export function configuredNansenApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.NANSEN_API?.trim();
  return value || undefined;
}

/** An optional local request guard; live operation has no application default. */
export function configuredNansenCreditBudget(
  env: NodeJS.ProcessEnv = process.env,
): number | undefined {
  const raw = env.NANSEN_CREDIT_BUDGET?.trim();
  return raw ? Number(raw) : undefined;
}
