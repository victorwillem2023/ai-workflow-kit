// Kit 4.0.3: the gate's npm audit checks what ships (--omit=dev). A dev tool's advisory (knip and Vite pulled in picomatch's, with
// no fix yet) failed every TypeScript project's gate for code no user ever runs; the weekly security scan (OSV-Scanner on the
// lock files) and Dependabot's alerts still report the dev tools, and /next shows a security alert first. Only an audit check
// still as the kit wrote it changes; one the project changed is its own.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rewriteJson } from '../install-config.mjs';

export const OLD_AUDIT = 'npm audit --audit-level=high';
export const NEW_AUDIT = 'npm audit --audit-level=high --omit=dev';

export default {
  version: '4.0.3',
  what: 'the audit checks what ships',
  phase: 'config',
  run({ target }) {
    const at = join(target, 'workflow', 'config.json');
    if (!existsSync(at)) return { said: [] };
    const was = readFileSync(at, 'utf8');
    let cfg;
    try { cfg = JSON.parse(was); } catch { return { said: [] }; }
    if (!(cfg.checks ?? []).some((c) => c.name === 'audit' && c.command === OLD_AUDIT)) return { said: [] };
    const checks = cfg.checks.map((c) => (c.name === 'audit' && c.command === OLD_AUDIT ? { ...c, command: NEW_AUDIT } : c));
    writeFileSync(at, rewriteJson(was.replace(/\r\n/g, '\n'), { ...cfg, checks }));
    return { said: ['workflow/config.json: the audit checks what ships (--omit=dev); the weekly security scan still reports the dev tools'] };
  },
};
