// The project's main branch: `git.main` in workflow/config.json ("trunk", "master", "develop"), else main. The gate, the sessions,
// the retro and the stage read it from here, so a project whose main branch has another name works the same way.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function mainBranch() {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return JSON.parse(readFileSync(join(root, 'workflow', 'config.json'), 'utf8')).git?.main || 'main';
  } catch {
    return 'main';
  }
}

/** The main branch's name, and its copy on origin. */
export const MAIN = mainBranch();
export const ORIGIN_MAIN = `origin/${MAIN}`;
