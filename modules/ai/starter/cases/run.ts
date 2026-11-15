// How a case reaches a feature: `npm run cases` calls run(feature, input) for each case in cases/*.json. Point each feature at
// the app's own function, so the cases test what users get. With AI_CASES_FAKE=1 the fake provider answers (free, for wiring
// the cases up); without it the real model runs and it costs money.
import { z } from 'zod';
import { anthropicProvider, createAi, fakeProvider } from '../src/server/ai';

const provider = process.env.AI_CASES_FAKE === '1' ? fakeProvider((c) => ({ summary: c.user.slice(0, 80) })) : anthropicProvider();
const ai = createAi({ provider, model: process.env.AI_MODEL ?? 'claude-opus-5-5', monthlyBudgetUsd: Number(process.env.AI_CASES_BUDGET_USD ?? 2) });

const features: Record<string, (input: Record<string, string>) => Promise<unknown>> = {
  // an example: replace it with the app's real features
  summary: (input) => ai.ask({ feature: 'summary', userId: 'cases', instructions: 'Summarise the text in one sentence.', untrusted: { text: input.text ?? '' }, schema: z.object({ summary: z.string().max(300) }) }),
};

export async function run(feature: string, input: Record<string, string>): Promise<unknown> {
  const f = features[feature];
  if (!f) throw new Error(`no feature "${feature}" in cases/run.ts`);
  return f(input);
}
