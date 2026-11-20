// workflow/tools/lib/folderenv.mjs: the folder's .env decides, never a name left set in the shell, for the gate and the session scripts.
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { envNames, folderEnv, projectEnvNames, withoutNames } from '../../workflow/tools/lib/folderenv.mjs';
import { makeRepo, roots, ran } from './session-repo';

after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

describe('the .env decides, not the shell', () => {
  it('reads the names a .env sets, not its comments or values', () => {
    assert.deepEqual(envNames('# PORT=1\nPORT=8787\n export DATA_DIR = "data"\n\nbad line\nHOST=\n'), ['PORT', 'DATA_DIR', 'HOST']);
  });
  it('takes those names out whatever their case, and leaves the rest', () => {
    assert.deepEqual(withoutNames({ Port: '1', PATH: 'p', DATA_DIR: 'real' }, ['PORT', 'DATA_DIR']), { PATH: 'p' });
  });
  it('a session folder also drops what only the main folder\'s .env names, so the real data folder never comes back from the shell', () => {
    const r = makeRepo();
    writeFileSync(join(r.main, '.env'), 'PORT=8787\nDATA_DIR=data\n');
    ran(r, 'a');
    // the session's copy has its own PORT; were DATA_DIR one of the session.env names, the copy would leave it out
    writeFileSync(join(r.wt('a'), '.env'), 'PORT=18788\n');
    assert.deepEqual(projectEnvNames(r.wt('a')).sort(), ['DATA_DIR', 'PORT']);
    assert.deepEqual(projectEnvNames(r.main).sort(), ['DATA_DIR', 'PORT']);
    assert.deepEqual(folderEnv(r.wt('a'), { EXTRA: 'x' }, { PORT: '8787', DATA_DIR: 'C:/real', HOME: 'h' }), { HOME: 'h', EXTRA: 'x' });
  });
});
