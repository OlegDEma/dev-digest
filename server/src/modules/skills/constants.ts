/** Constants for the skills module. */

/** Initial version recorded for a newly-created skill (mirrors agents). */
export const INITIAL_SKILL_VERSION = 1;

/** `source` recorded for skills created in the editor. */
export const MANUAL_SOURCE = 'manual' as const;

/**
 * `source` recorded for skills that came in through `POST /skills/import`.
 * The shared `SkillSource` enum has no file-specific member; `imported_url` is
 * its "came from outside" bucket and is what the UI labels *Imported*.
 */
export const IMPORTED_SOURCE = 'imported_url' as const;

/** `type` used when an import carries no (or an unknown) `type` in its frontmatter. */
export const DEFAULT_IMPORT_TYPE = 'custom' as const;

/** Stats window (days) for pull frequency / accept rate / findings (§10.3). */
export const STATS_WINDOW_DAYS = 30;

// ---- import limits (enforced before anything is decoded in full) -----------

/** Largest decoded upload we accept (base64 body → bytes). */
export const MAX_UPLOAD_BYTES = 512 * 1024;
/** Most members a `.zip` may carry. */
export const MAX_ZIP_MEMBERS = 200;
/** Sum of the members' uncompressed sizes, per the zip's own directory. */
export const MAX_ZIP_UNCOMPRESSED_BYTES = 2 * 1024 * 1024;
/** Largest markdown member we will decompress and use as the skill body. */
export const MAX_CORE_BYTES = 256 * 1024;
/** Derived description (first paragraph) is clipped to this many characters. */
export const MAX_DERIVED_DESCRIPTION_CHARS = 300;

/** File name that marks the skill core inside an archive (case-insensitive). */
export const SKILL_CORE_BASENAME = 'skill.md';

/** Upload extensions we know how to parse. */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const;
export const ARCHIVE_EXTENSIONS = ['.zip'] as const;

/**
 * Archive members with these extensions are flagged in the import preview as
 * executable-looking. They are never run, extracted or written — the flag is
 * purely so the user sees what they are NOT importing.
 */
export const EXECUTABLE_EXTENSIONS = [
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.mts',
  '.cts',
  '.py',
  '.rb',
  '.php',
  '.pl',
  '.lua',
  '.bat',
  '.cmd',
  '.ps1',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.jar',
  '.wasm',
] as const;

/** Archive members that are packaging noise, never a skill core. */
export const IGNORED_MEMBER_PATTERNS: readonly RegExp[] = [
  /(^|\/)__MACOSX\//,
  /(^|\/)\._[^/]*$/,
  /(^|\/)\.DS_Store$/,
];
