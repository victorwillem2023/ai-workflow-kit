// The one way the kit's scripts run GitHub's gh: an argument list and no shell, and on Windows also where gh's installer puts
// it when the PATH lacks it. WORKFLOW_GH (tests): a node script that stands in for gh. Every script that talks to GitHub uses
// this one, so a fix to how gh is found or run is made once.
import { spawnSync } from 'node:child_process';

const WINDOWS_GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';
let ghPath = 'gh';

/** Runs gh with `args` (and `input` on stdin): spawnSync's result. `timeout` in ms (none by default). */
export function ghRun(args, input, { timeout } = {}) {
  const custom = process.env.WORKFLOW_GH;
  const go = () => spawnSync(custom ? process.execPath : ghPath, custom ? [custom, ...args] : args,
    { input, encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 64 << 20, ...(timeout ? { timeout } : {}) });
  let res = go();
  if (!custom && res.error?.code === 'ENOENT' && process.platform === 'win32' && ghPath === 'gh') { ghPath = WINDOWS_GH; res = go(); }
  return res;
}
