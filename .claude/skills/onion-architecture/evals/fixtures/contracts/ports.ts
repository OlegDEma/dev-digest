export interface RepoRef {
  owner: string;
  name: string;
}

export interface GitHubClient {
  getPull(repo: RepoRef, number: number): Promise<{ number: number; title: string; head_sha: string }>;
  createIssueComment(repo: RepoRef, issueNumber: number, body: string): Promise<{ id: number }>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface LLMProvider {
  readonly id: 'openai' | 'anthropic';
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export interface SecretsProvider {
  get(key: string): Promise<string | undefined>;
}
