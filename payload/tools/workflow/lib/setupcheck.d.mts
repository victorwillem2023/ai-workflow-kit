export function readSetup(text: string | undefined): {
  setup: { line: number; script: string }[];
  start: { line: number; script: string; ready: string } | null;
  problems: string[];
};
