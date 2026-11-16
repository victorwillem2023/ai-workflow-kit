// Which files the gate reads as code: `code` in workflow/config.json (file endings); TypeScript and JavaScript when it is left out.
export const DEFAULT_CODE = ['.ts', '.tsx', '.mjs', '.js'];

export function codeTest(config) {
  const ends = config.code ?? DEFAULT_CODE;
  return (file) => ends.some((e) => file.endsWith(e));
}
