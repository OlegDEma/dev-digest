/**
 * Lowercase slug of `[a-z0-9-]`, at most `max` chars, never empty. Every run of
 * other characters collapses to one `-`; leading/trailing `-` are trimmed.
 */
export function slugify(text: string, max = 60): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return slug === '' ? 'case' : slug;
}
