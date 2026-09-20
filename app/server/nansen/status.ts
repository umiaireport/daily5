import { configuredNansenApiKey } from './config.js';

export function providerStatus(): { available: false; reason: string } {
  return {
    available: false,
    reason: configuredNansenApiKey()
      ? 'A Nansen key is configured. Set DATA_MODE=live to use current provider-backed Daily Five data.'
      : 'Live challenges need a Nansen API key and verified collection setup. Synthetic practice is ready to play; no provider requests are sent.',
  };
}
