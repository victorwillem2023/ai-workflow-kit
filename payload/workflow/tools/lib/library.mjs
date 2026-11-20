// The kit's library: guides no project gets from the start, because few need them (4.4.0 moved four more here that real
// projects never opened: the tool radar, the common parts, APIs and frontends; a project that has one keeps it), kept in the kit for the moment one does. An
// agent that sees the owner's app could use one (a service mesh, ads, agents of other makers) reads it straight from the kit
// (`npm run library -- --show <name>`), uses it to find the right answer for this app, and brings it into the project only when
// the owner says yes (`--add <name>`: the installer adds it as a part and keeps it current from then on). No I/O here.
// `files`: the guide's place in a project; `when`: the sign that it may help, which the skills (/advise, /arch, /launch, /market)
// and `--list` show; `read`: who reads it once it is in.

export const LIBRARY = {
  mesh: {
    files: ['docs/run/MESH.md'],
    title: 'a service mesh: whether the app needs one, which, and how to run it',
    when: 'several services that call each other, with mutual TLS, retries or a canary between them wanted without code in each',
    read: '/launch and /arch',
  },
  ads: {
    files: ['docs/market/ADS.md'],
    title: 'paid ads (Google Ads) and earning from ads on your own pages (AdSense)',
    when: 'the owner asks about ads, buying traffic, or earning from the visitors of free pages',
    read: '/market',
  },
  tools: {
    files: ['workflow/guides/TOOLS.md'],
    title: 'the tool radar: which tool is in use now for each job, and what it replaced',
    when: 'a new tool or library is being chosen, or the stack is set up (/setup)',
    read: '/setup and /advise',
  },
  common: {
    files: ['workflow/guides/COMMON.md'],
    title: 'the parts every app ends up needing: email, payments, uploads, scheduled jobs, time',
    when: 'a card adds email, payments, file uploads, a scheduled job, or works with dates and time zones',
    read: '/spec, /review and /estimate',
  },
  api: {
    files: ['workflow/guides/API.md'],
    title: 'an API the app offers: how it is built, documented, versioned and shared',
    when: 'the app offers an API to other programs or customers, not only to its own screens',
    read: '/spec',
  },
  frontend: {
    files: ['workflow/guides/FRONTEND.md'],
    title: 'which React framework fits the app, and content from a CMS',
    when: 'the screens are being set up (/setup), a framework is chosen or changed, or content should come from a CMS',
    read: '/setup',
  },
  a2a: {
    files: ['workflow/guides/A2A.md'],
    title: 'agent to agent (A2A): handing work to agents of other makers',
    when: 'the app must work with another organisation\'s agent, not only call a model or offer tools',
    read: '/advise ai and /spec',
  },
};

/** The library's names a project has taken: the record's `library=` line, plus any whose files the project has already. */
export function libraryTaken(recorded, has = () => false) {
  const listed = String(recorded ?? '').split(',').map((s) => s.trim()).filter((n) => n in LIBRARY);
  const there = Object.entries(LIBRARY).filter(([, g]) => g.files.some((f) => has(f))).map(([n]) => n);
  return [...new Set([...listed, ...there])].sort();
}

/** One line per guide for `--list` and the skills: name, what it is, when it may help, and whether this project has it. */
export function libraryLines(taken = []) {
  return Object.entries(LIBRARY).map(([n, g]) => `${n}${taken.includes(n) ? ' (in this project)' : ''}: ${g.title}. When: ${g.when}.`);
}
