export type IndexState = 'missing' | 'indexing' | 'ready' | 'stale';

export interface RepoIndexStatus {
  repoId: string;
  state: IndexState;
  lastIndexedAt: Date | null;
}
