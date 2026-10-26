import type {
  DiscoveredDocument,
  DocumentContent,
  DocumentStatus,
  ProjectContextListing,
} from '@devdigest/shared';
import { renderProjectContextDoc } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { RepoRepository, type RepoRow } from '../repos/repository.js';
import { MAX_DOC_BYTES, validateDocPath } from '../_shared/doc-path.js';
import { DISCOVERY_CAP, EXCLUDED_DOC_DIRS } from './constants.js';
import { EstimateCache, estimateCacheKey } from './estimate-cache.js';
import { docBucketOf, toDiscovered, usedByCounts } from './helpers.js';
import { ProjectContextRepository } from './repository.js';

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Project Context application service: discovery, read, save. All file access
 * goes through `container.cloneDocs`; no LLM, no git except `isTracked` on read.
 */
export class ProjectContextService {
  private repos: RepoRepository;
  private repo: ProjectContextRepository;
  private cache = new EstimateCache();

  constructor(private container: Container) {
    this.repos = new RepoRepository(container.db);
    this.repo = new ProjectContextRepository(container.db);
  }

  private async repoOf(workspaceId: string, repoId: string): Promise<RepoRow> {
    const row = await this.repos.getById(workspaceId, repoId);
    if (!row) throw new NotFoundError('Repository not found');
    return row;
  }

  private requireClone(row: RepoRow): string {
    if (!row.clonePath) throw new AppError('repo_not_cloned', 'Repository is not cloned', 409);
    return row.clonePath;
  }

  private async usedBy(workspaceId: string): Promise<Map<string, number>> {
    return usedByCounts(await this.repo.attachedPathsByAgent(workspaceId));
  }

  async list(workspaceId: string, repoId: string): Promise<ProjectContextListing> {
    const row = await this.repoOf(workspaceId, repoId);
    const empty = (): ProjectContextListing => ({
      repo_id: repoId,
      clone_available: false,
      total_found: 0,
      truncated: false,
      documents: [],
    });
    if (!row.clonePath) return empty();
    const buckets = this.container.config.projectContextBuckets;
    const entries = await this.container.cloneDocs.discover(row.clonePath, {
      buckets,
      excludedDirs: EXCLUDED_DOC_DIRS,
    });
    if (entries === null) return empty();

    const used = await this.usedBy(workspaceId);
    const shown = entries.slice(0, DISCOVERY_CAP);
    const root = row.clonePath;
    const documents: DiscoveredDocument[] = [];

    // Sequential, yielding to the event loop before each tokenisation: js-tiktoken
    // is synchronous, so a 2,000-doc listing must not hold the loop (SSE streams,
    // other requests). The exact tokenizer.count over the wrapped text is kept
    // (AC-4); the estimate cache still short-circuits unchanged files.
    for (const e of shown) {
      let status: DocumentStatus = 'ok';
      let tokens: number | null = null;
      if (e.sizeBytes > MAX_DOC_BYTES) {
        status = 'too_large';
      } else {
        const key = estimateCacheKey(root, e.path, e.sizeBytes, e.mtimeMs);
        const hit = this.cache.get(key);
        if (hit) {
          status = hit.status;
          tokens = hit.tokens;
        } else {
          const r = await this.container.cloneDocs.read(root, e.path, MAX_DOC_BYTES);
          if (r.kind === 'ok') {
            await yieldToEventLoop();
            tokens = this.container.tokenizer.count(renderProjectContextDoc({ path: e.path, text: r.text }));
          } else {
            status = r.kind === 'too_large' ? 'too_large' : 'unreadable';
          }
          this.cache.set(key, { status, tokens });
        }
      }
      documents.push(toDiscovered(e, docBucketOf(e.path, buckets), status, tokens, used.get(e.path) ?? 0));
    }

    return {
      repo_id: repoId,
      clone_available: true,
      total_found: entries.length,
      truncated: entries.length > DISCOVERY_CAP,
      documents,
    };
  }

  async read(workspaceId: string, repoId: string, path: string): Promise<DocumentContent> {
    const row = await this.repoOf(workspaceId, repoId);
    const root = this.requireClone(row);
    validateDocPath(path);
    const r = await this.container.cloneDocs.read(root, path, MAX_DOC_BYTES);
    if (r.kind === 'not_found' || r.kind === 'outside_repo') {
      throw new AppError('document_not_found', 'Document not found', 404);
    }
    if (r.kind === 'too_large') {
      throw new AppError('document_too_large', 'Document exceeds the 512 KB limit', 413);
    }
    if (r.kind === 'unreadable') {
      throw new AppError('document_unreadable', 'Document is not valid UTF-8 text', 422);
    }
    if (r.kind !== 'ok') throw new AppError('document_unreadable', 'Document is not readable', 422);
    const used = await this.usedBy(workspaceId);
    const tracked = await this.container.cloneDocs.isTracked(root, path);
    const buckets = this.container.config.projectContextBuckets;
    return {
      ...toDiscovered(
        { path, sizeBytes: r.sizeBytes },
        docBucketOf(path, buckets),
        'ok',
        this.container.tokenizer.count(renderProjectContextDoc({ path, text: r.text })),
        used.get(path) ?? 0,
      ),
      text: r.text,
      tracked,
    };
  }

  async save(
    workspaceId: string,
    repoId: string,
    path: string,
    text: string,
  ): Promise<DiscoveredDocument> {
    const row = await this.repoOf(workspaceId, repoId);
    const root = this.requireClone(row);
    validateDocPath(path);
    if (Buffer.byteLength(text, 'utf8') > MAX_DOC_BYTES) {
      throw new AppError('document_too_large', 'Document exceeds the 512 KB limit', 413);
    }
    const w = await this.container.cloneDocs.write(root, path, text);
    if (w === 'not_found' || w === 'outside_repo') {
      throw new AppError('document_not_found', 'Document not found', 404);
    }
    if (w === 'write_failed') {
      throw new AppError('document_write_failed', 'Could not write the document', 500);
    }
    const used = await this.usedBy(workspaceId);
    const buckets = this.container.config.projectContextBuckets;
    return toDiscovered(
      { path, sizeBytes: Buffer.byteLength(text, 'utf8') },
      docBucketOf(path, buckets),
      'ok',
      this.container.tokenizer.count(renderProjectContextDoc({ path, text })),
      used.get(path) ?? 0,
    );
  }
}
