/** Pure helpers for the Add-skill modal's file tab. */

/**
 * Read a File as base64 (no data-URL prefix). Uses `readAsDataURL` — the one
 * FileReader path that is safe for binary (.zip) and text (.md) alike — then
 * strips the `data:…;base64,` head the server would otherwise have to tolerate.
 */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/** Whether an archive member path is one the server would flag as executable-looking. */
export function looksExecutable(path: string): boolean {
  return /\.(sh|bash|zsh|fish|js|mjs|cjs|ts|mts|cts|py|rb|php|pl|lua|bat|cmd|ps1|exe|dll|so|dylib|jar|wasm)$/i.test(path);
}
