// A stand-in for Claude Code in tests/slow/skilltest.test.mjs: takes `-p <prompt>` like the real CLI and does what FAKE_AGENT says
// (nothing, commit, edit the README, write to the board, change a kit part of CLAUDE.md), so the scenario checks are proven to
// catch a misbehaving agent without spending money. Prints the same JSON shape the real one does.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const does = (process.env.FAKE_AGENT ?? '').split(',');
const git = (...a) => execFileSync('git', a, { stdio: 'ignore' });
if (does.includes('edit-readme')) writeFileSync('README.md', readFileSync('README.md', 'utf8').replace('teh', 'the'));
if (does.includes('readme-other')) appendFileSync('README.md', '\nAnother line.\n');
if (does.includes('own-rule')) appendFileSync('CLAUDE.md', '\n- Never rename an exported function without listing its users first.\n');
if (does.includes('kit-part')) writeFileSync('CLAUDE.md', readFileSync('CLAUDE.md', 'utf8').replace('<!-- /kit:changing-code -->', '- Never rename an exported function.\n<!-- /kit:changing-code -->'));
if (does.includes('board')) execFileSync('gh', ['issue', 'create', '--title', 'x'], { stdio: 'ignore', shell: process.platform === 'win32' });
if (does.includes('commit')) { git('add', '-A'); git('commit', '-q', '--allow-empty', '-m', 'the agent committed'); }
// the plan -> build -> done -> ship loop, one step per turn, read from the owner's message (`-p <prompt>`)
const prompt = process.argv[process.argv.indexOf('-p') + 1] ?? '';
if (does.includes('loop')) {
  const session = '../st-welcome';
  if (prompt.startsWith('/spec')) { mkdirSync('workflow/specs', { recursive: true }); writeFileSync('workflow/specs/welcome.md', '# Welcome\n'); }
  if (prompt.includes('/build')) { git('worktree', 'add', '-q', '-b', 'welcome', session); appendFileSync(`${session}/README.md`, '\nWelcome, new riders.\n'); }
  if (/done/.test(prompt)) {
    execFileSync('git', ['add', '-A'], { cwd: session, stdio: 'ignore' });
    execFileSync('git', ['commit', '-q', '-m', does.includes('bad-subject') ? 'stuff' : 'Readme: a welcome for new riders'], { cwd: session, stdio: 'ignore' });
    git('merge', '-q', '--ff-only', 'welcome');
  }
  if (does.includes('build-commits') && prompt.includes('/build')) execFileSync('git', ['commit', '-qam', 'early'], { cwd: session, stdio: 'ignore' });
}
process.stdout.write(JSON.stringify({ result: `fake agent did: ${does.join(', ') || 'nothing'}`, total_cost_usd: 0 }));
