import type { GitHubClient, LLMProvider, SecretsProvider } from '../contracts/ports.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import type { Db } from '../db/client.js';
import { ConfigError } from './errors.js';
import { JobRunner } from './jobs.js';

type LlmId = LLMProvider['id'];

export interface ContainerOverrides {
  github?: GitHubClient;
  llm?: Partial<Record<LlmId, LLMProvider>>;
}

export class Container {
  readonly jobs: JobRunner;
  private _github?: GitHubClient;
  private llmCache = new Map<LlmId, LLMProvider>();

  constructor(
    readonly db: Db,
    readonly secrets: SecretsProvider,
    private overrides: ContainerOverrides = {},
  ) {
    this.jobs = new JobRunner(db);
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (this._github) return this._github;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._github = new OctokitGitHubClient(token);
    return this._github;
  }

  async llm(id: LlmId): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cached = this.llmCache.get(id);
    if (cached) return cached;
    const key = await this.secrets.get(id === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError(`${id} key is not configured`);
    const provider = id === 'openai' ? new OpenAIProvider(key) : new AnthropicProvider(key);
    this.llmCache.set(id, provider);
    return provider;
  }
}
