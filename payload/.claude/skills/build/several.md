# /build: several topics, or one spec in work packages

Read by `/build` only for `/build a b c` or a spec whose *Work packages* section has two or more packages. Steps 1 to 7 of
`SKILL.md` still hold; this says what changes.

## One spec with work packages
When the spec has a "Work packages" section with two or more packages, one topic is built by several builders in the same session folder:
1. Do steps 1 to 3 once. Check the packages: a file named by two packages, or a package under about 300 changed lines, is merged into
   the earlier or neighbouring package (say so). Packages are never split or invented here; the spec decides.
2. **Waves.** Wave 1 is every package with no `after:`; a package whose `after:` is done goes in the next wave. At most 3 builders per
   wave, started in **one message** (several Agent calls, named `build-<topic>-<package>`). Start the next wave when the whole wave has reported.
3. Add this to each builder's prompt (step 4): "You own only these files: <list>. Edit no other file; if you need one, say so in your
   report. Run only the tests that reach your files (`node --test` on them), not `npm run gate`: neighbours are mid-edit. Do not touch
   a shared file (the list under *Parallel work* in CLAUDE.md) unless your package owns it."
4. After the last wave, you (the lead) make the shared-file edits, run `npm run gate` once and fix the seams (or send them to the
   owning builder). Then step 5: one summary, with each package's "unsure" list.
5. Feedback goes to the builder that owns the file (SendMessage). Nothing is committed; `/ship <topic>` as usual.
No spec packages, or a single package: step 4 above, one builder.

## Several topics at once (`/build a b c`)
1. Read every spec (step 1 per topic). A topic whose spec is missing or not approved is left out and named; the others go on.
2. **Overlap check.** From each spec's "Files that change" list take the backticked paths. Two specs overlap when they name the
   same file. Ignore the shared files (the list under *Parallel work* in CLAUDE.md): the rebase at `--finish` handles them.
   Different files in the same folder do not overlap. Go through the topics in the order given: a topic that overlaps an earlier
   one that is starting or waiting becomes *waiting*; say which topic, which file, and that it is built after the first is shipped (`/ship`).
3. **Cap of 3.** Start at most 3 independent topics; the rest wait until one of the three is shipped (say so). Then `/build <waiting topic>` as usual.
4. Do steps 2 and 3 above for each starting topic (one session folder, its own port), then start all their subagents (step 4) in
   **one message**, several Agent calls, so they run at the same time. Name each `build-<topic>`.
5. When the builders have reported, give one summary: for each topic its folder, URL (`http://127.0.0.1:<port>`, `npm run dev` there)
   and its "unsure" list, plus the waiting topics with the reason. Stop there.
6. Feedback names a topic and goes to that topic's builder only (SendMessage, step 6). Shipping is one topic at a time: `/ship a`, then `/ship b`.
7. `ui` cards keep their own route (`/ui`): they join a batch only after the variant is picked. One topic behaves exactly as above.
