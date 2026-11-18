#!/usr/bin/env node
// What changed for the users since the last release (or since a commit you name), from the commit subjects.
//   npm run changelog                       since the last tag (or every commit when there is none), printed
//   npm run changelog -- --since <ref>      since that tag or commit
//   npm run changelog -- --title "v1.4.0"   the heading (default: today's date)
//   npm run changelog -- --prepend          put it at the top of CHANGELOG.md instead of printing it
//   npm run changelog -- --release v1.4.0   a release: the section under that version at the top of CHANGELOG.md, and package.json set to it
import './lib/nowindow.mjs'; // no console window per child process on Windows (lib/nowindow.mjs): first, before anything starts one
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { changelogText, groupCommits } from './lib/changelog.mjs';

const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
process.chdir(git('rev-parse', '--show-toplevel'));
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const since = opt('--since') ?? git('describe', '--tags', '--abbrev=0');
const log = git('log', '--first-parent', '--format=%h%x09%s', ...(since ? [`${since}..HEAD`] : ['HEAD'])) ?? '';
const commits = log.split('\n').filter(Boolean).map((l) => { const [hash, ...s] = l.split('\t'); return { hash, subject: s.join('\t') }; });
const text = changelogText(opt('--release') ?? opt('--title') ?? new Date().toISOString().slice(0, 10), groupCommits(commits));
if (args.includes('--prepend') || opt('--release')) {
  const old = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8').replace(/^# Changelog\s*/, '') : '';
  writeFileSync('CHANGELOG.md', `# Changelog\n\n${text}\n${old}`);
  console.log(`changelog: ${commits.length} commits since ${since ?? 'the start'} at the top of CHANGELOG.md`);
  // a release also sets the version in package.json; the tag is made after the commit (git tag <version>), and the next
  // changelog starts from it
  const v = opt('--release');
  if (v && existsSync('package.json')) {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    pkg.version = v.replace(/^v/, '');
    writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`changelog: package.json is now ${pkg.version}. Commit both ("Release ${v}"), then: git tag ${v} && git push --tags (when the owner says so)`);
  }
} else console.log(text);
