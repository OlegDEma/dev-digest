import type { Provider } from "@devdigest/shared";

/** Actions-secret variable the CI runner reads the provider key from (mirrors the server's export). */
export function providerKeyVar(provider: Provider): string {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    default:
      return "OPENROUTER_API_KEY";
  }
}

/** Only http(s) URLs become links — a server-provided string never becomes a `javascript:` href. */
export function safeHref(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}
