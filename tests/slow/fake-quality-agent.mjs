// A stand-in for Claude Code in tests/slow/qualitytest.test.mjs: answers with FAKE_ANSWER and, with FAKE_WRITE ("<path>=<text>"),
// writes that file, so the quality scenarios' grading is proven without spending money. Prints the JSON shape the real one does.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const w = process.env.FAKE_WRITE;
if (w) { const at = w.indexOf('='); mkdirSync(dirname(w.slice(0, at)), { recursive: true }); writeFileSync(w.slice(0, at), w.slice(at + 1)); }
process.stdout.write(JSON.stringify({ result: process.env.FAKE_ANSWER ?? '', total_cost_usd: 0.01 }));
