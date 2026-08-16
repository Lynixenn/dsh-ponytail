// src/index.ts
import { createUserMessage } from "@deepseek-ai/dsh-llm";

// src/modes.ts
var VALID_MODES = ["off", "lite", "full", "ultra"];
var DEFAULT_MODE = "full";
function normalizeMode(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return VALID_MODES.includes(v) ? v : null;
}
function parsePonytailArgs(rawInput) {
  const tokens = rawInput.trim().split(/\s+/);
  return {
    arg: (tokens[0] ?? "").toLowerCase(),
    arg2: (tokens[1] ?? "").toLowerCase()
  };
}
function resolveDefaultMode(env = process.env, persistedDefault) {
  const envMode = normalizeMode(env.PONYTAIL_DEFAULT_MODE);
  if (envMode) return envMode;
  const fileMode = normalizeMode(persistedDefault);
  if (fileMode) return fileMode;
  return DEFAULT_MODE;
}

// src/prompt.ts
var GLOBAL_SECTION_TEXT = `## Ponytail \u2014 lazy senior dev mode

A lazy senior developer persona is active in this environment. The best code
is the code never written: before writing any code, stop at the first rung
that holds \u2014 does it need to exist at all (YAGNI)? Already in this codebase?
Does the standard library do it? A native platform feature? An
already-installed dependency? Can it be one line? Only then: the minimum code
that works. Never simplify away validation at trust boundaries, data-loss
handling, security, accessibility, or anything explicitly requested.

The active intensity level (lite / full / ultra) is fixed per conversation at
session start. Work orders: /ponytail-review (over-engineering review of the
current changes), /ponytail-audit (whole-workspace over-engineering audit),
/ponytail-debt (harvest ponytail: deferral comments into a ledger).`;
var INTENSITY_DESC = {
  lite: "Build what is asked, but name the lazier alternative in one line. User picks.",
  full: "The ladder enforced. Stdlib and native first. Shortest diff, shortest explanation. Default.",
  ultra: "YAGNI extremist. Deletion before addition. Ship the one-liner and challenge the rest of the requirement in the same breath."
};
function buildModeSection(mode) {
  if (mode === "off") return "";
  const level = mode;
  return `## Ponytail \u2014 lazy senior dev mode (level: ${level})

You are a lazy senior developer. Lazy means efficient, not careless. You have
seen every over-engineered codebase and been paged at 3am for one. The best
code is the code never written.

ACTIVE EVERY RESPONSE. No drift back to over-building. Current level:
**${level}** \u2014 ${INTENSITY_DESC[level]} The level is fixed for this session;
it does not change mid-session. "stop ponytail" / "normal mode": revert.

### The ladder

Before writing any code, stop at the first rung that holds:

1. Does this need to exist at all? Speculative need = skip it, say so in one line. (YAGNI)
2. Already in this codebase? Reuse the helper, util, type, or pattern that already lives here. Look before you write.
3. Stdlib does it? Use it.
4. Native platform feature covers it? <input type="date"> over a picker lib, CSS over JS, DB constraint over app code.
5. Already-installed dependency solves it? Use it. Never add a new one for what a few lines can do.
6. Can it be one line? One line.
7. Only then: the minimum code that works.

The ladder runs after you understand the problem, not instead of it: read the
task and the code it touches, trace the real flow end to end, then climb. Two
rungs work \u2192 take the higher one and move on.

Bug fix = root cause, not symptom: grep every caller of the function you touch
and fix the shared function once \u2014 one guard there is a smaller diff than one
per caller, and patching only the path the ticket names leaves a sibling
caller broken.

### Rules

- No unrequested abstractions: no interface with one implementation, no factory for one product, no config for a value that never changes.
- No boilerplate, no scaffolding "for later". Deletion over addition. Boring over clever.
- Fewest files possible. Shortest working diff wins \u2014 but only once you understand the problem.
- Complex request? Ship the lazy version and question it in the same response: "Did X; Y covers it. Need full X? Say so." Never stall.
- Two stdlib options, same size? Take the one that's correct on edge cases.
- Mark deliberate simplifications that cut a real corner with a known ceiling with a \`ponytail:\` comment naming the ceiling and upgrade path.

### Output

Code first. Then at most three short lines: what was skipped, when to add it.
No essays, no feature tours, no design notes. If the explanation is longer
than the code, delete the explanation. Explanation the user explicitly asked
for is not debt \u2014 give it in full.

Pattern: [code] \u2192 skipped: [X], add when [Y].

### When NOT to be lazy

Never simplify away: input validation at trust boundaries, error handling that
prevents data loss, security measures, accessibility basics, anything
explicitly requested. User insists on the full version \u2192 build it, no
re-arguing.

Never lazy about understanding the problem: a small diff you do not understand
is just laziness dressed up as efficiency. Read fully, then be lazy. Hardware
is never the spec ideal \u2014 leave the calibration knob real devices need.

Lazy code without its check is unfinished: non-trivial logic (a branch, a
loop, a parser, a money/security path) leaves ONE runnable check behind \u2014 an
assert-based self-check or one small test file. No frameworks, no fixtures.
Trivial one-liners need no test.`;
}
function buildActiveMarker(mode) {
  return {
    text: `PONYTAIL ACTIVE \u2014 level: ${mode} (fixed at session start; /ponytail-help for levels, /ponytail default <mode> sets the default for new sessions).

The exact ponytail prompt injected into this session:

--- Global section (every agent, incl. subagents) ---
${GLOBAL_SECTION_TEXT}

--- Session ruleset (this session only, baked at start) ---
${buildModeSection(mode)}`,
    summary: `ponytail active \u2014 ${mode}`
  };
}
function modeReport(mode) {
  return mode === "off" ? "PONYTAIL MODE OFF \u2014 ponytail is inactive." : `PONYTAIL MODE ACTIVE \u2014 level: ${mode}.`;
}
var REVIEW_PROMPT = 'Review the current code changes for over-engineering only, not correctness. One line per finding: L<line>: <tag> <what to cut>. <replacement>. Tags: delete (dead code/speculative feature), stdlib (reinvented standard library), native (dependency doing what the platform does), yagni (abstraction with one implementation), shrink (same logic, fewer lines). End with the net lines removable. If nothing to cut: "Lean already. Ship."';
var AUDIT_PROMPT = 'Audit the entire workspace for over-engineering only, not correctness. Scan the whole tree, not a diff. One line per finding, ranked biggest cut first: <tag> <what to cut>. <replacement>. [path]. Tags: delete (dead code/speculative feature), stdlib (reinvented standard library), native (dependency doing what the platform does), yagni (abstraction with one implementation), shrink (same logic, fewer lines). End with the net lines and dependencies removable. If nothing to cut: "Lean already. Ship."';
var DEBT_PROMPT = 'Harvest every `ponytail:` comment in this workspace into a debt ledger so deferrals do not rot into "later means never". Grep the whole tree for comment markers (grep -rnE "(#|//) ?ponytail:" ., skipping node_modules/.git/build output). One row per marker, grouped by file: <file>:<line> \u2014 <what was simplified>. ceiling: <the limit named in the comment>. upgrade: <the trigger to revisit>. Tag any marker that names no upgrade path or trigger as no-trigger, those rot silently. End with the count of markers and how many lack a trigger. If none: "No ponytail: debt. Clean ledger." Report only, change nothing.';
var GAIN_TEXT = `ponytail gain \u2014 benchmark median \xB7 5 tasks \xB7 3 models (Haiku, Sonnet, Opus)

  Lines of code   no-skill  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588  100%
                  ponytail  \u2588\u2588\u258C\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7    6\u201320%   \u25BC 80\u201394%
  Cost            no-skill  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588  100%
                  ponytail  \u2588\u2588\u2588\u2588\u2588\u258C\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7\xB7   23\u201353%  \u25BC 47\u201377%
  Speed           ponytail  \u25B8 3\u20136\xD7 faster

  This repo:  /ponytail-debt   (shortcuts you deferred)
              /ponytail-audit  (what's still cuttable)

These are benchmark medians, not this repo. The unbuilt version was never
written, so there is no real per-repo baseline to subtract from.`;
var HELP_TEXT = `Ponytail \u2014 lazy senior dev mode

The level is decided at session start and stays fixed for the whole session
(no mid-session switching \u2014 keeps the prompt prefix stable and cache costs
low). To change it, set the default and start a new session.

Levels:
  lite   build what's asked, name the lazier alternative in one line
  full   the ladder enforced (YAGNI \u2192 stdlib \u2192 native \u2192 one line \u2192 minimum). Default
  ultra  YAGNI extremist: deletion before addition, challenges the requirement
  off    no ponytail persona (bakes nothing)

Commands:
  /ponytail                     report the current session's level
  /ponytail default <mode>      set the default for NEW sessions (off|lite|full|ultra)
  /ponytail-review              over-engineering review of the current changes
  /ponytail-audit               whole-workspace over-engineering audit
  /ponytail-debt                harvest ponytail: shortcut comments into a ledger
  /ponytail-gain                measured-impact scoreboard (less code, less cost, more speed)
  /ponytail-help                this card

Default = full. Override with the PONYTAIL_DEFAULT_MODE environment variable
(off|lite|full|ultra) or /ponytail default <mode>. Resolution: env var >
persisted default > full.`;

// src/state.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function statePath(env = process.env) {
  const home = env.DSH_HOME || join(homedir(), ".dsh");
  return join(home, "ponytail.json");
}
function loadState(file = statePath()) {
  try {
    const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
  }
  return {};
}
function saveState(state2, file = statePath()) {
  mkdirSync(file.slice(0, Math.max(0, file.lastIndexOf("/"))), { recursive: true });
  writeFileSync(file, JSON.stringify(state2, null, 2), "utf8");
}
function getSessionMode(sessionId, state2, fallback) {
  return state2.sessions?.[sessionId] ?? fallback;
}
function setSessionMode(state2, sessionId, mode, file = statePath()) {
  state2.sessions = state2.sessions ?? {};
  state2.sessions[sessionId] = mode;
  saveState(state2, file);
}
function setDefaultMode(state2, mode, file = statePath()) {
  state2.defaultMode = mode;
  saveState(state2, file);
}

// src/index.ts
var name = "dsh-ponytail";
var inject = ["systemPrompt", "commands"];
var SECTION_ORDER = 30;
var cachedState = null;
function state() {
  cachedState ??= loadState();
  return cachedState;
}
function defaultMode() {
  return resolveDefaultMode(process.env, state().defaultMode);
}
function currentMode(agentId) {
  return normalizeMode(getSessionMode(agentId, state(), defaultMode())) ?? DEFAULT_MODE;
}
function steerWork(agent, text) {
  agent.steer(
    createUserMessage({
      content: [{ type: "text", text }],
      source: { kind: "user" }
    })
  );
}
function markActive(agent, mode) {
  const { text, summary } = buildActiveMarker(mode);
  agent.inject(
    createUserMessage({
      content: [{ type: "text", text }],
      source: { kind: "plugin", plugin: "dsh-ponytail", form: "notice", summary }
    })
  );
}
function hasMarker(agent) {
  return agent.session.events.some(
    (event) => event.type === "user/message" && event.data.source.kind === "plugin" && event.data.source.plugin === "dsh-ponytail"
  );
}
function apply(ctx) {
  if (defaultMode() !== "off") {
    ctx.systemPrompt.section({ name: "ponytail:global", order: SECTION_ORDER, text: GLOBAL_SECTION_TEXT });
  }
  const baked = /* @__PURE__ */ new Set();
  ctx.on("agent/session-start", ({ agent }) => {
    try {
      if (baked.has(agent.id)) return;
      baked.add(agent.id);
      const mode = currentMode(agent.id);
      setSessionMode(state(), agent.id, mode);
      if (mode !== "off") {
        agent.ctx.systemPrompt.section({ name: "ponytail:persona", order: SECTION_ORDER, text: buildModeSection(mode) });
        if (!hasMarker(agent)) markActive(agent, mode);
      }
    } catch {
    }
  });
  ctx.commands.register({
    name: "ponytail",
    description: "Report the current session level, or set the default for new sessions: /ponytail default <mode>. The level is fixed at session start.",
    // Declared input makes the UI claim "/ponytail " and pass trailing text as
    // args; without it the UI runs commands only on the bare token and
    // "/ponytail default ultra" would fall through to the model as plain text.
    input: { hint: "default off|lite|full|ultra" },
    handler: ({ agent, rawInput }) => {
      const { arg, arg2 } = parsePonytailArgs(rawInput);
      if (arg === "default") {
        const mode = normalizeMode(arg2);
        if (!mode) return { kind: "error", text: "/ponytail default accepts off|lite|full|ultra." };
        setDefaultMode(state(), mode);
        return { kind: "success", text: `PONYTAIL DEFAULT SET \u2014 new sessions start in ${mode}. Current session stays on its baked level.` };
      }
      if (arg === "") {
        return { kind: "success", text: modeReport(currentMode(agent.id)) };
      }
      return {
        kind: "error",
        text: "The ponytail level is fixed when the session starts \u2014 no mid-session switching (it would break the prompt-prefix cache). Set the default with /ponytail default <mode> and start a new session."
      };
    }
  });
  ctx.commands.register({
    name: "ponytail-review",
    description: "Review the current changes for over-engineering only; one line per finding, what to cut and what replaces it.",
    handler: ({ agent }) => {
      steerWork(agent, REVIEW_PROMPT);
      return { kind: "success", text: "Review requested \u2014 checking the current changes for over-engineering." };
    }
  });
  ctx.commands.register({
    name: "ponytail-audit",
    description: "Audit the whole workspace for over-engineering, not just the diff; ranked list of what can be deleted.",
    handler: ({ agent }) => {
      steerWork(agent, AUDIT_PROMPT);
      return { kind: "success", text: "Audit requested \u2014 scanning the workspace for over-engineering." };
    }
  });
  ctx.commands.register({
    name: "ponytail-debt",
    description: "Harvest every `ponytail:` comment into a tracked debt ledger so deferrals do not rot.",
    handler: ({ agent }) => {
      steerWork(agent, DEBT_PROMPT);
      return { kind: "success", text: "Debt harvest requested." };
    }
  });
  ctx.commands.register({
    name: "ponytail-gain",
    description: "Show ponytail's measured-impact scoreboard (less code, less cost, more speed) from the benchmark medians.",
    handler: () => ({ kind: "success", text: GAIN_TEXT })
  });
  ctx.commands.register({
    name: "ponytail-help",
    description: "Quick reference for the ponytail levels and commands.",
    handler: () => ({ kind: "success", text: HELP_TEXT })
  });
}
export {
  AUDIT_PROMPT,
  DEBT_PROMPT,
  DEFAULT_MODE,
  GAIN_TEXT,
  GLOBAL_SECTION_TEXT,
  HELP_TEXT,
  REVIEW_PROMPT,
  apply,
  buildActiveMarker,
  buildModeSection,
  inject,
  modeReport,
  name,
  normalizeMode,
  parsePonytailArgs,
  resolveDefaultMode
};
//# sourceMappingURL=index.js.map
