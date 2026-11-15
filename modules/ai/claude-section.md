
## AI inside the app (`docs/AI-SECURITY.md`; MCP and agents: `docs/AI-AGENTS.md`)
Every model call goes through `src/server/ai.ts` (`ai.ask`): the gate fails a model SDK or API used anywhere else. Untrusted
text goes in `untrusted`, never into `instructions`; the answer has a zod schema; the model writes words, code holds facts.
A new AI feature adds its real and hostile cases to `cases/` (`npm run cases`, the quality score: it costs money, so it runs
when the wrapper or a prompt changes). `ANTHROPIC_API_KEY` and `AI_MODEL` come from `.env`; never print them.
