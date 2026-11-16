// Who may do what: the one function every route and query asks (docs/workflow/PERMISSIONS.md, *Permissions: the rules*).
// An example to make your own: replace the roles, the actions and the rules with this app's and keep the shape. Nothing is
// allowed until a rule here allows it; every row of the table in tests/security/permissions.test.ts says who is let in and who
// is refused. Pure, so the server and the screens ask the same question.

type Role = 'owner' | 'member' | 'support';
export type Action = 'read' | 'change' | 'delete' | 'invite';

/** The person the session names, never anything taken from the request. */
export interface Who {
  id: string;
  customerId: string;
  role: Role;
}

/** The thing asked about: whose it is, and which customer it belongs to. */
export interface Thing {
  ownerId: string;
  customerId: string;
}

/** May this person do this to this thing? `null` is nobody signed in. No rule, no entry. */
export function can(who: Who | null, action: Action, thing: Thing): boolean {
  if (!who) return false;
  // another customer's thing does not exist for anyone, whatever their role
  if (who.customerId !== thing.customerId) return false;
  if (who.role === 'owner') return true;
  if (who.role === 'support') return action === 'read';
  // a member: their own things, and never an invite
  return thing.ownerId === who.id && action !== 'invite';
}

/** What a route answers when `can` says no: 401 to nobody signed in, else 404, the same as for an id that was never used. */
export function refusalStatus(who: Who | null): 401 | 404 {
  return who ? 404 : 401;
}
