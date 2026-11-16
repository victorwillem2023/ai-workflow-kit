// Who may do what (src/core/permissions.ts): one table, every kind of person against every action, the refusals too.
// The pattern of docs/workflow/TESTING.md: several inputs and one behaviour are one test over a list of cases, each with its own
// words, and the data comes from a builder that takes only what the case is about.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Action, can, refusalStatus, type Thing, type Who } from '../../src/core/permissions';

const person = (over: Partial<Who> = {}): Who => ({ id: 'u1', customerId: 'c1', role: 'member', ...over });
const thing = (over: Partial<Thing> = {}): Thing => ({ ownerId: 'u1', customerId: 'c1', ...over });
const ACTIONS: Action[] = ['read', 'change', 'delete', 'invite'];

describe('who may do what', () => {
  const cases: { name: string; who: Who | null; thing: Thing; may: Action[] }[] = [
    { name: 'refuses someone who is signed out everything', who: null, thing: thing(), may: [] },
    {
      name: 'lets a member read, change and delete their own thing, and refuses an invite',
      who: person(),
      thing: thing(),
      may: ['read', 'change', 'delete'],
    },
    { name: "refuses a member another user's thing", who: person(), thing: thing({ ownerId: 'u2' }), may: [] },
    { name: 'lets support read, and refuses it every change', who: person({ id: 'u9', role: 'support' }), thing: thing(), may: ['read'] },
    {
      name: 'lets the owner do everything inside their own customer',
      who: person({ id: 'u8', role: 'owner' }),
      thing: thing(),
      may: ACTIONS,
    },
    { name: "refuses even an owner another customer's thing", who: person({ role: 'owner' }), thing: thing({ customerId: 'c2' }), may: [] },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const allowed = ACTIONS.filter((action) => can(c.who, action, c.thing));

      assert.deepEqual(allowed, c.may);
    });
  }

  it('answers "not found" to a signed-in person who is refused, and "sign in first" to nobody', () => {
    assert.equal(refusalStatus(person()), 404);
    assert.equal(refusalStatus(null), 401);
  });
});
