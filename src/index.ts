/**
 * dsh-ponytail — Ponytail, the lazy senior dev, as a DeepSeek Harness plugin.
 *
 * Port of https://github.com/DietrichGebert/ponytail onto the DSH plugin
 * surface. Design (per user decision):
 *
 *   - The intensity level is DECIDED AT SESSION START and never changes
 *     mid-session. No switching, no re-bake → the system-prompt prefix is
 *     byte-stable for the whole conversation → DeepSeek cache stays intact.
 *   - The mode-filtered ruleset is baked into an agent-scoped prompt section
 *     at agent/session-start (startup AND resume, from persisted state).
 *   - A compact static GLOBAL section (registered once) gives subagents the
 *     persona: agent-scoped sections do not propagate to subagents, and the
 *     global layer is merged into every agent's assembly.
 *   - Only work-order commands (/ponytail-review, /ponytail-audit,
 *     /ponytail-debt) inject extra prompt information, as append-only user
 *     messages — a new tail, so everything before keeps cache-hitting.
 *   - /ponytail-gain and /ponytail-help are pure UI text: zero model tokens.
 *   - A visible session-start marker (plugin notice) shows the baked level —
 *     the full injected text — as a collapsed chat row. See buildActiveMarker.
 *   - Commands only: no runtime skills. The six operations are slash commands
 *     (deterministic host-side handlers); skills would duplicate the commands
 *     and the baked persona, and their catalog costs prefix tokens per session.
 *
 * Mapping to upstream:
 *   SessionStart mode-filtered ruleset  → buildModeSection baked agent-scoped
 *   SubagentStart hook                  → static GLOBAL_SECTION_TEXT
 *   skills (review/audit/debt/gain/help) → slash commands (work orders)
 *   statusline badge                    → the session-start marker (see above)
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
// Type-only: bring the ctx.commands / ctx.systemPrompt / agent/session-start
// Context merges into this program.
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-system-prompt'

import { DEFAULT_MODE, normalizeMode, parsePonytailArgs, resolveDefaultMode } from './modes.ts'
import type { PonytailLevel, PonytailMode } from './modes.ts'
import { AUDIT_PROMPT, buildActiveMarker, buildModeSection, DEBT_PROMPT, GAIN_TEXT, GLOBAL_SECTION_TEXT, HELP_TEXT, modeReport, REVIEW_PROMPT } from './prompt.ts'
import { getSessionMode, loadState, setDefaultMode, setSessionMode } from './state.ts'
import type { PonytailState } from './state.ts'

/** Cordis plugin name — also the Loader entry. */
export const name = 'dsh-ponytail'

/** Services this plugin needs before load; fail loud if a host lacks them. */
export const inject = ['systemPrompt', 'commands']

/** Static section order: after persona (0), before tool guidance (100–199). */
const SECTION_ORDER = 30

// Re-export pure helpers so selfcheck.mjs can exercise the logic without a host.
export { AUDIT_PROMPT, buildActiveMarker, DEBT_PROMPT, DEFAULT_MODE, GAIN_TEXT, GLOBAL_SECTION_TEXT, HELP_TEXT, REVIEW_PROMPT, buildModeSection, modeReport, normalizeMode, parsePonytailArgs, resolveDefaultMode }

/** In-memory state cache: the plugin is the only writer, so the object stays in sync. */
let cachedState: PonytailState | null = null
function state(): PonytailState {
  cachedState ??= loadState()
  return cachedState
}

/** Resolved default for new sessions: env var > persisted default > full. */
function defaultMode(): PonytailMode {
  return resolveDefaultMode(process.env, state().defaultMode)
}

/** Current level for a session: what was baked at session start, else the default. */
function currentMode(agentId: string): PonytailMode {
  return normalizeMode(getSessionMode(agentId, state(), defaultMode())) ?? DEFAULT_MODE
}

/** Steer a work-order prompt as a user-role message (append-only; wakes the driver). */
function steerWork(agent: Agent, text: string): void {
  agent.steer(
    createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    }),
  )
}

/**
 * Visible session-start marker: one static user-role context message injected
 * WITHOUT waking the driver (agent.inject → next-step, wakeup=false). The web
 * UI renders it as a collapsed "context injection" row with the notice
 * summary; the text rides the model request. Static per session → the prefix
 * stays byte-identical (see the cache contract in prompt.ts).
 */
function markActive(agent: Agent, mode: PonytailLevel): void {
  const { text, summary } = buildActiveMarker(mode)
  agent.inject(
    createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: 'dsh-ponytail', form: 'notice', summary },
    }),
  )
}

/** Resume dedup: never inject a second marker into a session that already has one. */
function hasMarker(agent: Agent): boolean {
  return agent.session.events.some(
    (event) =>
      event.type === 'user/message' &&
      event.data.source.kind === 'plugin' &&
      event.data.source.plugin === 'dsh-ponytail',
  )
}

/** Start the plugin when Harness loads it. */
export function apply(ctx: Context): void {
  // 1. Compact global section (static, mode-neutral): the subagent vehicle.
  //    Registered only when the deployment default isn't 'off', so an
  //    off-by-default deployment bakes nothing anywhere.
  if (defaultMode() !== 'off') {
    ctx.systemPrompt.section({ name: 'ponytail:global', order: SECTION_ORDER, text: GLOBAL_SECTION_TEXT })
  }

  // 2. Bake the mode-filtered ruleset per agent at session start. Registered
  //    agent-scoped: shadows nothing global, and is byte-identical for the
  //    whole session (no switching). Persisted so a resume after restart
  //    re-bakes the exact same text.
  const baked = new Set<string>()
  ctx.on('agent/session-start', ({ agent }) => {
    try {
      if (baked.has(agent.id)) return // same agent re-fired in-process: keep the bake
      baked.add(agent.id)
      const mode = currentMode(agent.id)
      setSessionMode(state(), agent.id, mode) // persist what we baked (resume fidelity)
      if (mode !== 'off') {
        agent.ctx.systemPrompt.section({ name: 'ponytail:persona', order: SECTION_ORDER, text: buildModeSection(mode) })
        if (!hasMarker(agent)) markActive(agent, mode)
      }
    } catch {
      // Never break session start over a state read or registration.
    }
  })

  // 3. Slash commands (UI command plane: no model tokens, no cache impact).
  ctx.commands.register({
    name: 'ponytail',
    description:
      'Report the current session level, or set the default for new sessions: /ponytail default <mode>. The level is fixed at session start.',
    // Declared input makes the UI claim "/ponytail " and pass trailing text as
    // args; without it the UI runs commands only on the bare token and
    // "/ponytail default ultra" would fall through to the model as plain text.
    input: { hint: 'default off|lite|full|ultra' },
    handler: ({ agent, rawInput }) => {
      const { arg, arg2 } = parsePonytailArgs(rawInput)

      // /ponytail default <mode> — persist for NEW sessions only.
      if (arg === 'default') {
        const mode = normalizeMode(arg2)
        if (!mode) return { kind: 'error', text: '/ponytail default accepts off|lite|full|ultra.' }
        setDefaultMode(state(), mode)
        return { kind: 'success', text: `PONYTAIL DEFAULT SET — new sessions start in ${mode}. Current session stays on its baked level.` }
      }

      // Bare /ponytail — report only, no model interaction.
      if (arg === '') {
        return { kind: 'success', text: modeReport(currentMode(agent.id)) }
      }

      // Any level argument is a mid-session switch — deliberately refused:
      // re-baking would invalidate the request prefix (cache cost).
      return {
        kind: 'error',
        text: 'The ponytail level is fixed when the session starts — no mid-session switching (it would break the prompt-prefix cache). Set the default with /ponytail default <mode> and start a new session.',
      }
    },
  })

  ctx.commands.register({
    name: 'ponytail-review',
    description: 'Review the current changes for over-engineering only; one line per finding, what to cut and what replaces it.',
    handler: ({ agent }) => {
      steerWork(agent, REVIEW_PROMPT)
      return { kind: 'success', text: 'Review requested — checking the current changes for over-engineering.' }
    },
  })

  ctx.commands.register({
    name: 'ponytail-audit',
    description: 'Audit the whole workspace for over-engineering, not just the diff; ranked list of what can be deleted.',
    handler: ({ agent }) => {
      steerWork(agent, AUDIT_PROMPT)
      return { kind: 'success', text: 'Audit requested — scanning the workspace for over-engineering.' }
    },
  })

  ctx.commands.register({
    name: 'ponytail-debt',
    description: 'Harvest every `ponytail:` comment into a tracked debt ledger so deferrals do not rot.',
    handler: ({ agent }) => {
      steerWork(agent, DEBT_PROMPT)
      return { kind: 'success', text: 'Debt harvest requested.' }
    },
  })

  ctx.commands.register({
    name: 'ponytail-gain',
    description: 'Show ponytail\'s measured-impact scoreboard (less code, less cost, more speed) from the benchmark medians.',
    handler: () => ({ kind: 'success', text: GAIN_TEXT }),
  })

  ctx.commands.register({
    name: 'ponytail-help',
    description: 'Quick reference for the ponytail levels and commands.',
    handler: () => ({ kind: 'success', text: HELP_TEXT }),
  })
}
