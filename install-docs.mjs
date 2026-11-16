// The docs part of install.mjs: which stages a project has entered and what their folders hold (kit 2.9.1), moving an older
// project's docs into their folders (doc-layout.mjs), taking away a stage's untouched copies and keeping what the project's own
// pages point at, naming an added helper in its code doc, and giving CLAUDE.md its links back once a stage starts. Every function
// gets what it works on as arguments; install.mjs runs them in order.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CORRECTIONS, MOVES, movePaths } from './doc-layout.mjs';

/** The stages and the folder each brings: docs/run/ with /launch, docs/market/ with /market. */
export const STAGE_FOLDERS = { run: { folder: 'docs/run/', by: '/launch' }, market: { folder: 'docs/market/', by: '/market' } };

/**
 * The stages a project has entered, and what that leaves out: `skippedStage(key)` for a file of a stage not reached, `stageDocs`
 * ([doc, stage, by]) and `moduleDocs` ([doc, module]) for the mentions to mark. A project from before 2.9.1 (no stages= line)
 * keeps a stage it already went into: a launch decision record (run), a market page it wrote (market).
 */
export function stageSetup({ kit, target, mark, update, asked, fill, modules, allModules, list }) {
  const entered = () => {
    const out = [];
    const decisions = join(target, 'docs', 'decisions');
    if (existsSync(decisions) && readdirSync(decisions).some((f) => /-launch\.md$/.test(f))) out.push('run');
    // at its place since 2.9, or still at the old one (a project from before; the move comes later in this run). The old path is
    // spelled out of two parts, so the kit's own path rewrites never turn it into the new one.
    const page = ['docs/market/MARKET.md', ['docs', 'MARKET.md'].join('/')].map((p) => join(target, p)).find((p) => existsSync(p));
    const template = join(kit, 'starter', 'docs', 'market', 'MARKET.md');
    const plain = (t) => t.replace(/\r\n/g, '\n').trim();
    if (page && existsSync(template) && plain(readFileSync(page, 'utf8')) !== plain(fill(readFileSync(template, 'utf8')))) out.push('market');
    return out;
  };
  const stages = [...new Set([...(/^stages=/m.test(mark) ? list(/^stages=(.*)$/m.exec(mark)?.[1]) : update ? entered() : []), ...asked])];
  const skippedStage = (key) => Object.entries(STAGE_FOLDERS).some(([s, { folder }]) => !stages.includes(s) && key.startsWith(folder));
  // every doc a stage not reached yet would bring, from the kit's sources (and the infra map, which npm run map writes there)
  const kitRoots = [join(kit, 'payload'), join(kit, 'starter'), ...allModules.flatMap((m) => ['payload', 'starter'].map((d) => join(kit, 'modules', m, d)))];
  const stageDocs = Object.entries(STAGE_FOLDERS).filter(([s]) => !stages.includes(s)).flatMap(([s, { folder, by }]) => [...new Set([
    ...kitRoots.flatMap((r) => (existsSync(join(r, folder)) ? readdirSync(join(r, folder)).filter((f) => f.endsWith('.md')).map((f) => `${folder}${f}`) : [])),
    ...(s === 'run' ? ['docs/run/INFRA-MAP.md'] : []),
  ])].map((doc) => [doc, s, by]));
  // every doc a module left out would have brought (its payload and starter docs, folders included), unless another source brings it
  const docsUnder = (root, rel = 'docs') => (existsSync(join(root, rel)) ? readdirSync(join(root, rel), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? docsUnder(root, `${rel}/${e.name}`) : e.name.endsWith('.md') ? [`${rel}/${e.name}`] : [])) : []);
  const installedRoots = [join(kit, 'payload'), join(kit, 'starter'), ...modules.flatMap((m) => ['payload', 'starter'].map((d) => join(kit, 'modules', m, d)))];
  const broughtAnyway = new Set(installedRoots.flatMap((r) => docsUnder(r)));
  const moduleDocs = allModules.filter((m) => !modules.includes(m))
    .flatMap((m) => ['payload', 'starter'].flatMap((d) => docsUnder(join(kit, 'modules', m, d)).map((doc) => [doc, m])))
    .filter(([doc]) => !broughtAnyway.has(doc));
  return { stages, skippedStage, stageDocs, moduleDocs };
}

// every text file a project may name a doc in, whatever its language
const PROJECT_TEXT = /\.(md|mjs|cjs|js|jsx|ts|tsx|mts|json|txt|html|css|toml|cmd|ps1|sh|ya?ml|tpl|py|go|rs)$|(^|\/)Dockerfile$/;

/**
 * --update from before kit 2.9: the docs move into their folders before anything is copied, with git so their history follows; a
 * kit guide keeps its stamp under the new path (so it is still known as the kit's); and on every update, not only when a file
 * moved, every old path in the project's own text (tracked, untracked, and the waiting specs git ignores) is rewritten.
 * Returns what moved, the files rewritten, and the bytes the longer paths added to CLAUDE.md.
 */
const ALL_MOVE_TARGETS = [...MOVES, ...CORRECTIONS].map(([, to]) => to);
export function moveOldDocs({ target, written, stamp }) {
  const moved = [];
  let claudeGrowth = 0;
  for (const [from, to] of [...MOVES, ...CORRECTIONS]) {
    const a = join(target, from), b = join(target, to);
    if (!existsSync(a) || existsSync(b)) continue;
    mkdirSync(dirname(b), { recursive: true });
    if (spawnSync('git', ['mv', from, to], { cwd: target, stdio: 'ignore' }).status !== 0) renameSync(a, b);
    for (const m of [written, stamp]) if (m.has(from)) { m.set(to, m.get(from)); m.delete(from); }
    moved.push(from);
  }
  const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: target, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout ?? '';
  const specs = existsSync(join(target, 'specs')) ? readdirSync(join(target, 'specs')).map((f) => `specs/${f}`) : [];
  const rewritten = [], specsNaming = [];
  for (const f of [...new Set([...listed.split('\n'), ...specs])].filter((x) => x && PROJECT_TEXT.test(x) && !x.startsWith('node_modules/'))) {
    // history stays as it was written (the changelog, decision records)
    if (f === 'CHANGELOG.md' || f.startsWith('docs/decisions/')) continue;
    const p = join(target, f);
    if (!existsSync(p) || !statSync(p).isFile()) continue;
    const was = readFileSync(p, 'utf8');
    // a line that names the new place already is about the move itself ("moved from docs/X.md to docs/run/X.md"): left alone
    const now = was.split('\n').map((line) => (ALL_MOVE_TARGETS.some((to) => line.includes(to)) ? line : movePaths(line))).join('\n');
    if (now === was) continue;
    // a waiting spec is the owner's approved text: named, not changed (/build and /ship read the docs at their new places)
    if (f.startsWith('specs/')) { specsNaming.push(f); continue; }
    writeFileSync(p, now); rewritten.push(f);
    if (f === 'CLAUDE.md') claudeGrowth = Buffer.byteLength(now) - Buffer.byteLength(was);
  }
  return { moved, rewritten, specsNaming, claudeGrowth };
}

/** Removes a file and then its folders, as long as they are left empty (never the project folder itself). */
const removeWithEmptyFolders = (target, path) => {
  rmSync(path);
  for (let dir = dirname(path); dir.startsWith(target) && dir !== target && readdirSync(dir).length === 0; dir = dirname(dir)) rmSync(dir, { recursive: true });
};

/**
 * --update: a stage the project has not reached loses the copies an older kit wrote there and nobody changed since (the same text
 * as the kit's, or as the kit's stamp says it wrote); a changed one is the project's own work, so it stays and is named.
 */
export function pruneStageCopies({ target, stageSkipped, untouched, hash, stamp, done }) {
  for (const [key, { next: want }] of stageSkipped) {
    const path = join(target, key);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    if (hash(text) !== hash(want) && !untouched(key, text)) { done.stageKept.push(key); continue; }
    removeWithEmptyFolders(target, path);
    stamp.delete(key);
    done.staged.push(key);
  }
}

/**
 * A stage not entered can still be partly in use: a page of the project's own there (the deploy page /setup filled) or CLAUDE.md
 * pointing into it. A kit doc of that stage that what stays still names is put back (and what it names, a few rounds deep), so
 * nothing the project keeps leads nowhere.
 */
export function keepNamedStageDocs({ target, stageSkipped, hash, stamp, done }) {
  const mdUnder = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? mdUnder(join(d, e.name)) : e.name.endsWith('.md') ? [join(d, e.name)] : [])) : []);
  for (let round = 0; round < 5; round++) {
    const texts = [...mdUnder(join(target, 'docs')), join(target, 'CLAUDE.md')].filter((f) => existsSync(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
    const named = [...stageSkipped.keys()].filter((key) => !existsSync(join(target, key)) && texts.includes(`\`${key}\``));
    if (!named.length) break;
    for (const key of named) {
      const { next, machinery } = stageSkipped.get(key);
      mkdirSync(dirname(join(target, key)), { recursive: true });
      writeFileSync(join(target, key), next);
      if (machinery) stamp.set(key, hash(next));
      done.staged = done.staged.filter((k) => k !== key);
      done.stageNamed.push(key);
    }
  }
}

/**
 * A helper an update added (src/web/report.ts ...) is a new file in a folder a code doc covers ("covers new files: src/web/**"):
 * that doc gets its line, from the helper's own first comment, so the doc stays true and the gate's covers check holds.
 */
export function nameHelpersInCodeDocs({ target, done }) {
  if (!done.helpers.length || !existsSync(join(target, 'docs', 'code'))) return;
  for (const doc of readdirSync(join(target, 'docs', 'code')).filter((f) => f.endsWith('.md'))) {
    const path = join(target, 'docs', 'code', doc);
    const text = readFileSync(path, 'utf8');
    const globs = [...text.matchAll(/<!-- covers new files: ([^>]+?) -->/g)].flatMap((m) => m[1].split(',').map((g) => g.trim()));
    const mine = done.helpers.filter((h) => globs.some((g) => h.startsWith(g.replace(/\*\*$/, '').replace(/\*.*$/, ''))) && !text.includes(h));
    if (!mine.length) continue;
    const say = (h) => (/^\/\/\s*(.+?)(?:\.\s|$)/m.exec(readFileSync(join(target, h), 'utf8'))?.[1] ?? 'added by the kit').replace(/\.$/, '');
    writeFileSync(path, `${text.replace(/\n*$/, '\n')}\n## Added by the kit\n${mine.map((h) => `- \`${h}\`: ${say(h)}.`).join('\n')}\n`);
    done.helpers = done.helpers.map((h) => (mine.includes(h) ? `${h} (named in docs/code/${doc})` : h));
  }
}

/**
 * Sentences the kit itself once wrote into CLAUDE.md and has since changed, where the old one now contradicts a skill: rewritten
 * in the project's CLAUDE.md (which is otherwise never touched), wherever its lines were wrapped. Returns what changed.
 * - "No docs-only, tests-only or ... commits" (before 2.8.2) forbade the separate commit /ship makes of the notes left in the
 *   main folder (session.mjs --commit-notes). Since 2.9.8 that is the project's choice, `commits.notes`: only a project that chose
 *   "own" gets the new sentence; one that never chose keeps its rule, and its config says so ("with-feature": the notes go in
 *   with the feature's commit), so the update changes nothing about how it commits.
 */
const RULES_THAT_CHANGED = [
  [/No docs-only,(\s+)tests-only or(\s+)"fix after a check" commits/, 'No tests-only or$2"fix after a check" commits (notes left in the main folder go in first, on their own: /ship)',
    'the "no docs-only commits" rule: /ship commits the notes left in the main folder on their own', 'commits.notes'],
];
export function rewriteChangedRules({ target }) {
  const claude = join(target, 'CLAUDE.md');
  if (!existsSync(claude)) return [];
  let text = readFileSync(claude, 'utf8');
  const configAt = join(target, 'workflow.config.json');
  let notes;
  try { notes = JSON.parse(readFileSync(configAt, 'utf8')).commits?.notes; } catch { notes = undefined; }
  const changed = [];
  for (const [old, now, what, choice] of RULES_THAT_CHANGED) {
    if (!old.test(text)) continue;
    if (choice === 'commits.notes' && notes !== 'own') {
      // never chosen: the old rule stands, written down as the choice it is (a later update leaves both alone)
      if (notes === undefined && existsSync(configAt)) {
        const before = readFileSync(configAt, 'utf8');
        const cfg = JSON.parse(before);
        writeFileSync(configAt, before.replace(/\{/, '{\n  "commits": { "notes": "with-feature" },'));
        try { JSON.parse(readFileSync(configAt, 'utf8')); } catch { writeFileSync(configAt, `${JSON.stringify({ commits: { notes: 'with-feature' }, ...cfg }, null, 2)}\n`); }
        changed.push('kept "no docs-only commits": the notes left in the main folder go in with the feature (commits.notes "with-feature"; "own" makes them a commit of their own)');
      }
      continue;
    }
    text = text.replace(old, now); changed.push(what);
  }
  if (text !== readFileSync(claude, 'utf8')) writeFileSync(claude, text);
  return changed;
}

/** A stage now entered: CLAUDE.md (the project's own, never replaced) gets its "comes with the ... stage" mentions back as links. */
export function unmarkEnteredStages({ target, stages }) {
  const claude = join(target, 'CLAUDE.md');
  if (!existsSync(claude)) return;
  let text = readFileSync(claude, 'utf8');
  const was = text;
  for (const s of stages) text = text.replace(new RegExp(`(docs/${s}/[\\w-]+\\.md) \\(comes with the ${s} stage: [^)]*\\)`, 'g'), '`$1`');
  if (text !== was) writeFileSync(claude, text);
}
