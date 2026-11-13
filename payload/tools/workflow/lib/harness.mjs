// Multi-agent support: the skills live once in .claude/skills/<name>/SKILL.md; this writes what other agents need to run them.
// OpenCode gets one short command file per skill (.opencode/commands/<name>.md: the skill, the agent, the model) and, once, an
// opencode.jsonc whose permissions mirror .claude/settings.local.json. Other agents that read AGENTS.md get a pointer to CLAUDE.md.
// Pure: text in, text out. tools/workflow/harness.mjs does the file reading and writing.

// The short line OpenCode shows for each kit skill, and what its command adds to the skill. Other skills take their description.
const KNOWN = {
  work: { says: 'Work on one board card: plan, stop for a yes, then the build in a new chat' },
  spec: { says: 'Write the spec for a new feature in specs/<topic>.md and wait for the owner\'s approval' },
  build: { says: 'Build an approved spec in its session folder', extra: 'For the subagent the skill starts, use the task tool with the `general` agent.' },
  ship: { says: 'Finish a feature after the owner says it is done: full gate, docs check, one commit, session finish',
    extra: 'Where a security review is due, review the branch\'s diff yourself against CLAUDE.md\'s Security rules and report what you found before the commit.' },
  ui: { says: 'Work on one ui card: a board with variants A, B, C, then the pick built in src/web' },
  setup: { says: 'Set the project up: interview the owner, fill CLAUDE.md, the config and the first docs, make the board' },
  idea: { says: 'Add an idea, bug or workflow wish to the board as a Backlog card' },
  docs: { says: 'Small edit to the hand-written docs, never code, no commit' },
  check: { says: 'Run the gate and explain what failed, read-only', readOnly: true },
  find: { says: 'Where is X / how does Y work in the code, read-only', readOnly: true },
};

export const DEFAULTS = {
  model: 'deepseek/deepseek-v4-pro',          // the flow: Plan, Build, every command that plans, builds or ships, subagents
  cheapModel: 'opencode/glm-5.3-flash-free',  // only the skills whose front matter says `model: haiku` (jobs you start and can rerun)
  smallModel: 'opencode/deepseek-v4.1-flash-free', // session titles
  exploreModel: 'deepseek/deepseek-flash',    // code searches by the explore subagent
};

/** The front matter of a SKILL.md: name, description, model (strings; missing ones are ''). */
export function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text ?? ''));
  const out = { name: '', description: '', model: '' };
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(name|description|model):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

// The first clause of a description, for a skill the kit does not know: up to the first " (", ":" or ". ", at most 100 characters.
function shortSays(description) {
  const cut = description.split(/ \(|: |\. /)[0].trim();
  return cut.length > 100 ? cut.slice(0, 97).trimEnd() + '...' : cut;
}

const CHEAP = new Set(['haiku']);

/** The text of .opencode/commands/<name>.md for one skill. `cfg` is the config's harness.opencode block (models). */
export function commandFile(name, skillText, cfg = {}) {
  const fm = frontMatter(skillText);
  const k = KNOWN[name] ?? {};
  const models = { ...DEFAULTS, ...cfg };
  const cheap = CHEAP.has(fm.model);
  const readOnly = k.readOnly ?? /\bread-only\b/i.test(fm.description);
  const says = (k.says ?? shortSays(fm.description || name)) + (cheap ? ' (free model)' : '');
  const extra = [k.extra, readOnly ? 'Change no file.' : ''].filter(Boolean).join(' ');
  return [
    '---',
    `description: ${says}`,
    `agent: ${readOnly ? 'plan' : 'build'}`,
    `model: ${cheap ? models.cheapModel : models.model}`,
    '---',
    '',
    `Load the skill \`${name}\` with the skill tool (it is \`.claude/skills/${name}/SKILL.md\`) and follow it step by step, exactly as written, with CLAUDE.md's rules. Arguments: $ARGUMENTS`,
    '',
    `Where the skill names a Claude Code tool you don't have (AskUserQuestion, a task list), do the same with what you have: ask in plain text and wait for the answer; keep the steps in your reply.${extra ? ' ' + extra : ''}`,
    '',
  ].join('\n');
}

/** OpenCode shell patterns from Claude Code's allow list: `Bash(git status:*)` becomes `git status*`. */
export function shellPatterns(claudeSettings) {
  const allow = claudeSettings?.permissions?.allow ?? [];
  const out = [];
  for (const rule of allow) {
    const m = /^Bash\((.+?)(?::\*)?\)$/.exec(rule);
    if (m && !out.includes(m[1] + '*')) out.push(m[1] + '*');
  }
  return out;
}

/**
 * The first opencode.jsonc (written once; the owner edits it after that), in OpenCode 2's format: a `permissions` list of
 * { action, resource, effect } rules (the last match wins) and `agents` (OpenCode 1 used `permission`, `bash`, `agent`; the
 * two must not be mixed, and OpenCode 1 refuses a file with `permissions`). The flow on the paid model, the cheap model only
 * for session titles; shell commands ask except those Claude Code may run without asking; `private` paths (.env, data
 * folders) can be neither read, searched nor edited, so they are never sent to a model provider.
 */
export function opencodeConfig({ project, cfg = {}, claudeSettings, private: priv = [] }) {
  const models = { ...DEFAULTS, ...cfg };
  const rule = (action, resource, effect) => ({ action, resource, effect });
  const permissions = [rule('shell', '*', 'ask')];
  for (const p of shellPatterns(claudeSettings)) permissions.push(rule('shell', p, 'allow'));
  permissions.push(rule('shell', '*.env*', 'deny'));
  permissions.push(rule('read', '*.env', 'deny'), rule('read', '*.env.*', 'deny'), rule('read', '*.env.example', 'allow'));
  for (const p of priv) {
    if (/^\.env/.test(p)) continue;
    const glob = p.endsWith('/') ? `${p}*` : p;
    for (const action of ['read', 'glob', 'grep', 'edit']) permissions.push(rule(action, glob, 'deny'));
  }
  const body = {
    $schema: 'https://opencode.ai/config.json',
    model: models.model,
    small_model: models.smallModel,
    agents: {
      plan: { model: models.model },
      build: { model: models.model },
      general: { model: models.model },
      explore: { model: models.exploreModel },
    },
    permissions,
  };
  const head = [
    `// OpenCode for ${project}: the same flow as Claude Code (CLAUDE.md, .claude/skills; commands in .opencode/commands,`,
    '// written by `npm run harness`). Written once by the kit; edit it freely. Tab switches Plan (no edits) and Build.',
    '// OpenCode 2 format (`permissions`, `agents`, the `shell` action); OpenCode 1 refuses it.',
    '// The flow runs only on the paid model, so a free model running out never stops a build. Free models only for jobs you',
    '// start yourself and can rerun (the skills marked `model: haiku`: /idea /docs /check /find) and session titles.',
    '// Permissions: the last matching rule wins. Shell commands ask, except those .claude/settings.local.json allows;',
    '// .env and the private data folders are never read, so they are never sent to the model provider.',
  ].join('\n');
  const json = JSON.stringify(body, null, 2)
    // one rule per line, like a hand-written file
    .replace(/\{\n\s+"action": ("[^"]+"),\n\s+"resource": ("[^"]*"),\n\s+"effect": ("[^"]+")\n\s+\}/g, '{ "action": $1, "resource": $2, "effect": $3 }');
  return `${head}\n${json}\n`;
}

/**
 * AGENTS.md, for agents that read only that file. It points at CLAUDE.md and says nothing else, so the rules live in one place.
 * Opt-in (`harness.agentsMd: true`): OpenCode reads AGENTS.md *instead of* CLAUDE.md when both exist, so with it OpenCode no
 * longer loads CLAUDE.md by itself and depends on the model following this pointer.
 */
export function agentsMd(project) {
  return [
    `# ${project}`,
    '',
    'Read `CLAUDE.md` in this folder now, before anything else, and follow it: it holds all the rules for this repo.',
    '',
  ].join('\n');
}
