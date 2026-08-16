/**
 * Host-side mode persistence: $DSH_HOME/ponytail.json.
 *
 * Shape: { defaultMode?, sessions?: { [sessionId]: mode } }
 *
 * Deliberately a plain JSON file next to the harness home, not ctx.storage:
 * the storage hub needs its domain form mounted (form-not-mounted risk across
 * profile compositions), while a file has zero dependencies and mirrors the
 * upstream ponytail's own flag-file + config.json design. Host-side state
 * never touches a model request, so this file has no cache effect either way.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface PonytailState {
  defaultMode?: string
  sessions?: Record<string, string>
}

/** $DSH_HOME defaults to ~/.dsh, same as the harness (dsh-agent-instructions). */
export function statePath(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'ponytail.json')
}

export function loadState(file = statePath()): PonytailState {
  try {
    const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as PonytailState
    }
  } catch {
    // Missing or corrupt file → empty state (a fresh session map).
  }
  return {}
}

export function saveState(state: PonytailState, file = statePath()): void {
  mkdirSync(file.slice(0, Math.max(0, file.lastIndexOf('/'))), { recursive: true })
  writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
}

/** Session mode: persisted per-session value, else the resolved default. */
export function getSessionMode(sessionId: string, state: PonytailState, fallback: string): string {
  return state.sessions?.[sessionId] ?? fallback
}

export function setSessionMode(
  state: PonytailState,
  sessionId: string,
  mode: string,
  file = statePath(),
): void {
  state.sessions = state.sessions ?? {}
  state.sessions[sessionId] = mode
  // ponytail: sessions map grows one entry per session id, never pruned —
  // fine for a personal single-user deployment; add an LRU cap if it ever
  // outlives its usefulness.
  saveState(state, file)
}

export function setDefaultMode(state: PonytailState, mode: string, file = statePath()): void {
  state.defaultMode = mode
  saveState(state, file)
}
