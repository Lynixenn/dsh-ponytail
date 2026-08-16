/**
 * Ponytail intensity levels and command-line parsing.
 *
 * Pure module — no DSH imports, so selfcheck.mjs can exercise it directly.
 *
 * Levels mirror the upstream ponytail repo: lite / full / ultra, plus off.
 * The level is DECIDED AT SESSION START and never changes mid-session (no
 * switching, no re-bake — keeps the system-prompt prefix byte-stable and the
 * DeepSeek cache intact). The upstream "review" session mode is not ported:
 * /ponytail-review is a one-shot work-order command instead.
 */

export const VALID_MODES = ['off', 'lite', 'full', 'ultra'] as const
export type PonytailMode = (typeof VALID_MODES)[number]

/** Runtime levels that carry a ruleset (off means "bake nothing"). */
export type PonytailLevel = Exclude<PonytailMode, 'off'>

export const DEFAULT_MODE: PonytailMode = 'full'

/** Normalize a raw level token; anything unknown → null (caller picks default). */
export function normalizeMode(value: unknown): PonytailMode | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  return (VALID_MODES as readonly string[]).includes(v) ? (v as PonytailMode) : null
}

export interface PonytailArgs {
  /** First argument token ('' when absent). */
  readonly arg: string
  /** Second argument token ('' when absent) — used by `ponytail default <mode>`. */
  readonly arg2: string
}

/**
 * Split a command's raw input into argument tokens.
 *
 * DSH's command registry delivers rawInput as the exact text FOLLOWING the
 * registered command name, separator whitespace included (e.g. `/ponytail
 * ultra` → " ultra"). The name itself is known from the registration, so this
 * parser never sees it.
 */
export function parsePonytailArgs(rawInput: string): PonytailArgs {
  const tokens = rawInput.trim().split(/\s+/)
  return {
    arg: (tokens[0] ?? '').toLowerCase(),
    arg2: (tokens[1] ?? '').toLowerCase(),
  }
}

/** Resolve the session-start default: env var, then persisted default, then 'full'. */
export function resolveDefaultMode(
  env: NodeJS.ProcessEnv = process.env,
  persistedDefault?: string,
): PonytailMode {
  const envMode = normalizeMode(env.PONYTAIL_DEFAULT_MODE)
  if (envMode) return envMode
  const fileMode = normalizeMode(persistedDefault)
  if (fileMode) return fileMode
  return DEFAULT_MODE
}

