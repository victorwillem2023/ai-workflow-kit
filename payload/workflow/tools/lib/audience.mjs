// Who the project is for (`project.audience` in workflow/config.json, set by /setup): "me" (a personal, learning or hobby
// project), "team" (people at work use it) or "customers" (people outside, who may pay). Everything about running it for others
// (access reviews, restore drills, launch, market, privacy texts) is optional: the kit raises it only when the audience needs it.
// Not set: treated as "customers", the careful default, until /setup asks.

/** "me" | "team" | "customers". */
export const audienceOf = (config) => (['me', 'team', 'customers'].includes(config?.project?.audience) ? config.project.audience : 'customers');

/** True when other people use it, so checks about people, access and recovery apply. */
export const forOthers = (config) => audienceOf(config) !== 'me';

/** True when outside people use or pay for it, so launch, market, privacy and terms apply. */
export const forCustomers = (config) => audienceOf(config) === 'customers';
