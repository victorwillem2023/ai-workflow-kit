// Protecting main: the GitHub rule (main is never deleted or rewritten) and the same guard on this computer, as a git hook.
// Pure: text and objects in and out. tools/workflow/protect.mjs talks to GitHub and writes the hook.
export const RULE_NAME = 'main is never deleted or rewritten';

/** The body of the GitHub ruleset: the default branch may not be deleted and takes only pushes that add to it (no force push). */
export function ruleset(flow = 'direct') {
  const rules = [{ type: 'deletion' }, { type: 'non_fast_forward' }];
  // the pull-request flow: nothing reaches main before the gate passed on GitHub
  if (flow === 'pr') rules.push({ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'gate' }], strict_required_status_checks_policy: false } });
  return {
    name: flow === 'pr' ? `${RULE_NAME}, and takes only checked work` : RULE_NAME, target: 'branch', enforcement: 'active',
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules,
  };
}

/** What GitHub's answer means, in one plain line: { ok, line }. `out` is what gh printed, `status` its exit code. */
export function verdict(status, out) {
  if (status === 0) return { ok: true, line: 'GitHub: main can no longer be deleted or rewritten' };
  if (/Upgrade to GitHub|make this repository public/i.test(out)) return { ok: false, line: 'GitHub: not set. Rules for a private repository need a paid plan (GitHub Pro) or a public repository; the guard on this computer still works' };
  if (/not found|404/i.test(out)) return { ok: false, line: 'GitHub: not set. The repository was not found or you are not its admin (check board.owner and board.repo in workflow.config.json, and gh auth status)' };
  if (/gh auth login|not logged in|authentication/i.test(out)) return { ok: false, line: 'GitHub: not set. gh is not signed in: gh auth login' };
  return { ok: false, line: `GitHub: not set (${String(out).trim().split('\n').pop().slice(0, 200) || 'gh failed'})` };
}

/** The pre-push hook: refuses a push that deletes main on the remote or rewrites it. Plain sh, so it runs wherever git does. */
export function hookText(flow = 'direct') {
  const direct = flow === 'pr' ? '\n  echo "refused: this project works with pull requests, nothing is pushed to main directly. Use: node scripts/session.mjs --finish <topic>, then --merge <topic>"; exit 1' : '';
  return `#!/bin/sh
# written by tools/workflow/protect.mjs: main on the remote is never deleted or rewritten from this computer
while read local_ref local_sha remote_ref remote_sha; do
  [ "$remote_ref" = "refs/heads/main" ] || continue${direct}
  case "$local_sha" in 0000000*) echo "refused: this push would delete main on the remote"; exit 1;; esac
  case "$remote_sha" in 0000000*) continue;; esac
  if ! git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
    echo "refused: this push would rewrite main on the remote (a force push, or main moved there). Use: node scripts/session.mjs --push"
    exit 1
  fi
done
exit 0
`;
}
