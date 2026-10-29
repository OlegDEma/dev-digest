import { Octokit } from 'octokit';
import type { GitHubClient, RepoRef } from '../../contracts/ports.js';

export class OctokitGitHubClient implements GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async getPull(repo: RepoRef, number: number) {
    const { data } = await this.octokit.rest.pulls.get({ owner: repo.owner, repo: repo.name, pull_number: number });
    return { number: data.number, title: data.title, head_sha: data.head.sha };
  }

  async createIssueComment(repo: RepoRef, issueNumber: number, body: string) {
    const { data } = await this.octokit.rest.issues.createComment({
      owner: repo.owner,
      repo: repo.name,
      issue_number: issueNumber,
      body,
    });
    return { id: data.id };
  }
}
