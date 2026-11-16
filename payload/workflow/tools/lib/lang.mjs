// Which files the gate reads as code: `code` in workflow/config.json (file endings); TypeScript and JavaScript when it is left out.
// (a .vue or .svelte file is code too: its <script> imports are followed like any other)
export const DEFAULT_CODE = ['.ts', '.tsx', '.mts', '.cts', '.mjs', '.cjs', '.js', '.jsx', '.vue', '.svelte'];

export function codeTest(config) {
  const ends = config.code ?? DEFAULT_CODE;
  return (file) => ends.some((e) => file.endsWith(e));
}
