import { runCi } from './run.js';
import { makeLlm } from './llm.js';

const result = await runCi({
  env: process.env,
  devdigestDir: '.devdigest',
  resultPath: 'devdigest-result.json',
  makeLlm,
});
process.exitCode = result.exitCode;
