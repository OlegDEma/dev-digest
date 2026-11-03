/**
 * Render one skill as the block the review prompt's "Skills / rules" section
 * carries. Pure: the server's review run and the eval run share this format so
 * a skill reads identically to the model in both.
 */
export function formatSkillBlock(name: string, body: string): string {
  return `### ${name}\n${body.trim()}`;
}
