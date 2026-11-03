/** A failure the runner reports verbatim and turns into exit code 1. */
export class RunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunnerError';
  }
}
