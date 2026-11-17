// How strict the gate is (workflow/tools/lib/levels.mjs): phases the owner can read, a level per quality check, none for the
// safety stops, and what is loosened said on every run.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { levelOf, loosenedLine, needs, readLevels } from '../../workflow/tools/lib/levels.mjs';

describe('the levels', () => {
  it('with no file, or the production preset, every check fails and nothing is loosened', () => {
    const none = readLevels(null);
    assert.deepEqual([none.preset, levelOf(none, 'untested'), none.loosened], ['production', 'fail', []]);
    assert.match(loosenedLine(none), /nothing loosened/);
  });
  it('the prototype preset loosens the structure checks to advise, and says so', () => {
    const p = readLevels('{ "preset": "prototype" }');
    assert.equal(levelOf(p, 'untested'), 'advise');
    assert.equal(levelOf(p, 'layers'), 'fail', 'the layers keep failing');
    assert.match(loosenedLine(p), /phase prototype\): loosened .*untested advise \(phase prototype\)/);
    assert.equal(p.ship, 'reached', '/ship runs the tests the change reaches');
  });
  it('the three phases: "phase" is the name, "preset" still read; a pilot holds untested code and docs again', () => {
    assert.deepEqual(['prototype', 'pilot', 'production'].map((ph) => readLevels(`{ "phase": "${ph}" }`).ship), ['reached', 'all', 'all']);
    const pilot = readLevels('{ "phase": "pilot" }');
    assert.deepEqual([levelOf(pilot, 'untested'), levelOf(pilot, 'docs'), levelOf(pilot, 'size')], ['fail', 'fail', 'advise']);
    assert.equal(readLevels('{ "preset": "prototype" }').phase, 'prototype');
    assert.equal(readLevels(null).ship, 'all', 'no file: production, the whole suite at /ship');
    assert.match(readLevels('{ "phase": "beta" }').problems[0], /"phase" is "beta"; it is one of prototype, pilot, production/);
  });
  it('"reach" and "cache" are the owner\'s speed settings: off by default, said when on, and a wrong value is named', () => {
    assert.deepEqual([readLevels(null).reach, readLevels(null).cache], ['chain', 'picked']);
    const fast = readLevels('{ "phase": "production", "reach": "direct", "cache": "all" }');
    assert.deepEqual([fast.reach, fast.cache], ['direct', 'all']);
    assert.match(loosenedLine(fast), /tests reach direct .*tests cache all/);
    assert.match(readLevels('{ "cache": "always" }').problems[0], /"cache" is "always"; it is one of picked, all/);
  });
  it("the project's own lines win over the preset, a project check counts, and each is named", () => {
    const l = readLevels('{ "preset": "production", "checks": { "naming": "off", "e2e": "advise" } }', ['e2e']);
    assert.deepEqual([levelOf(l, 'naming'), levelOf(l, 'e2e')], ['off', 'advise']);
    assert.deepEqual(l.loosened, ['e2e advise', 'naming off']);
  });
  it('a safety stop has no level: giving one is a problem, and it still fails', () => {
    const l = readLevels('{ "checks": { "secrets": "off", "tests": "advise" } }');
    assert.equal(l.problems.length, 2);
    assert.match(l.problems[0], /safety stop and has no level/);
    assert.equal(levelOf(l, 'secrets'), 'fail');
  });
  it('an unknown check, level or preset is named', () => {
    const l = readLevels('{ "preset": "relaxed", "checks": { "nothing": "off", "size": "maybe" }, "process": { "spec": "huge" } }');
    assert.equal(l.problems.length, 4);
  });
  it('process weight: from which card size a spec, a pitch and a board are needed', () => {
    const prod = readLevels(null).process, proto = readLevels('{ "preset": "prototype" }').process;
    assert.deepEqual([needs(prod.spec, 'small'), needs(prod.spec, 'medium'), needs(proto.spec, 'medium'), needs(proto.spec, 'large')], [false, true, false, true]);
    assert.deepEqual([needs(prod.pitch, 'large'), needs(proto.pitch, 'large')], [true, false]);
    assert.equal(needs(readLevels('{ "process": { "spec": "always" } }').process.spec, 'small'), true);
  });
});
