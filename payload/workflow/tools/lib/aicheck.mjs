// The AI check (no I/O here): an app that calls a language model does it through one file, the wrapper (`ai.wrapper` in
// workflow/config.json), where the guards live: the spend cap, the limits, the untrusted-content markers, the output schema,
// the log without personal data (workflow/guides/AI-SECURITY.md). A model SDK imported anywhere else, or a model API called directly,
// fails the gate; so does using one with no wrapper declared, so AI in the app is always a decision the owner made.

/** The SDKs and API hosts of the common model providers and frameworks. */
const SDK = /^(@anthropic-ai\/|openai$|@openai\/|@google\/genai|@google\/generative-ai|@google-cloud\/vertexai|@mistralai\/|@ai-sdk\/|ai$|langchain|@langchain\/|llamaindex|ollama$|groq-sdk|cohere-ai|@huggingface\/inference|@aws-sdk\/client-bedrock|replicate$|together-ai)/;
const PY_SDK = /^\s*(?:import|from)\s+(anthropic|openai|google\.genai|google\.generativeai|mistralai|langchain\w*|llama_index|ollama|groq|cohere|litellm)\b/m;
const HOSTS = /["'`]https:\/\/(api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.mistral\.ai|api\.groq\.com|api\.cohere\.(ai|com)|openrouter\.ai|api\.deepseek\.com)/;

/** The model SDKs or API addresses a file uses: [name]. */
export function modelUses(path, text) {
  const out = [];
  const t = String(text);
  for (const m of t.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|^import\s+)["']([^"']+)["']/gm)) if (SDK.test(m[1])) out.push(m[1]);
  if (/\.py$/.test(path)) { const m = PY_SDK.exec(t); if (m) out.push(m[1]); }
  const h = HOSTS.exec(t);
  if (h) out.push(h[1]);
  return [...new Set(out)];
}

/** What breaks the AI rule: [line]. `files`: Map path -> text of the app's code (no tests); `wrapper`: the one file, or none. */
export function aiProblems(files, wrapper) {
  const out = [];
  for (const [path, text] of files) {
    if (path === wrapper) continue;
    const uses = modelUses(path, text);
    if (!uses.length) continue;
    out.push(wrapper
      ? `${path} uses ${uses.join(', ')} directly: call the model only through ${wrapper}, where the spend cap, the limits and the guards live (workflow/guides/AI-SECURITY.md)`
      : `${path} uses ${uses.join(', ')}, and no "ai.wrapper" is set in workflow/config.json: put every model call in one file and name it there (workflow/guides/AI-SECURITY.md says what that file must hold)`);
  }
  return out;
}
