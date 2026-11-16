// The pattern for test data: one builder per kind of thing, which returns a valid one and takes only what a test is about.
// Copy this file to tests/builders.ts, replace the example kind with yours (the types usually come from src/core), and make every
// test's data with it (workflow/guides/TESTING.md, *Test data*). Never real people's data: made-up values, addresses on example.com.

/** An example kind of thing. */
export interface Order {
  id: string;
  customerId: string;
  ownerId: string;
  email: string;
  /** the total in the smallest unit, with its currency beside it */
  cents: number;
  currency: string;
  createdAt: Date;
}

let made = 0;

/** A valid order. A test names only what it is about (`anOrder({ cents: 0 })`); every order gets an id of its own. */
export function anOrder(over: Partial<Order> = {}): Order {
  made += 1;
  return {
    id: `order-${made}`,
    customerId: 'customer-1',
    ownerId: 'user-1',
    email: 'runner@example.com',
    cents: 2500,
    currency: 'EUR',
    createdAt: new Date('2026-01-15T10:00:00Z'),
    ...over,
  };
}
