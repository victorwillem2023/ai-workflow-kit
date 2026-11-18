// The end-state line of an approved spec: every plan says what the best version is before it picks one (/spec step 2). A spec
// whose "End state:" line is missing, empty or still the template's placeholder fails; a spec that is a step toward the end
// state but names no card for the rest gets an advice line. Specs not yet approved are still being written: not read. Pure.

/** The text after "End state:", or null when the spec has no such line. */
export function endStateOf(spec) {
  const m = /^End state:[ \t]*(.*)$/m.exec(String(spec ?? ''));
  return m ? m[1].trim() : null;
}

/** True when the spec says the owner approved it ("Owner approval: approved on ..."). */
export const isApproved = (spec) => /^Owner approval:\s*approved\b/im.test(String(spec ?? ''));

/** A line still as the template wrote it: empty, or the best version itself still in <angle brackets>. */
const unfilled = (line) => !line || /^<[^>]*>/.test(line) || /^\.?$/.test(line.replace(/This spec:.*$/i, '').trim());

/**
 * { fails, advice } for the approved specs given as [name, text] pairs: a missing or unfilled End state line fails; a spec
 * that is "a step" toward it with no card number (#n) for the rest is advice.
 */
export function endStateProblems(specs) {
  const fails = []; const advice = [];
  for (const [name, text] of specs) {
    if (!isApproved(text)) continue;
    const line = endStateOf(text);
    if (line == null || unfilled(line)) {
      fails.push(`workflow/specs/${name}: the "End state:" line is ${line == null ? 'missing' : 'empty'}: say the best version in one sentence, and whether this spec is it or a step toward it (.claude/skills/spec/SKILL.md, step 2)`);
      continue;
    }
    const thisSpec = /This spec:(.*)$/i.exec(line)?.[1] ?? '';
    if (/\bstep\b/i.test(thisSpec) && !/#\d+/.test(thisSpec)) {
      advice.push(`advice: workflow/specs/${name} is a step toward its end state but names no card for the rest: make that card (with "Depends on: #<this card>") and put its number on the End state line`);
    }
  }
  return { fails, advice };
}
