# dsh-ponytail

[Ponytail](https://github.com/DietrichGebert/ponytail) — the lazy senior dev — as a
DeepSeek Harness plugin. Always-on minimal-code persona with intensity levels
decided at session start, slash commands, and model-invocable skills.

> **Disclaimer:** This is a vibecoded project — written fast, for personal use only. It's public solely for easy installation; there's no support, no guarantees, and no promise it'll be maintained.

> **Status: written, not installed.** This plugin is built and self-checked but
> deliberately not added to any profile yet — see [Install](#install).

## What it does

- **Level decided at session start.** The intensity (lite / full / ultra / off)
  is resolved when the conversation starts — from `PONYTAIL_DEFAULT_MODE`, the
  persisted default (`/ponytail default <mode>`), or `full` — and the
  mode-filtered ruleset is baked into that session's system prompt. It never
  changes mid-session: **no switching, no re-bake**.
- **Always-on persona** — the baked ruleset: the 7-rung ladder (YAGNI → reuse →
  stdlib → native → installed dep → one line → minimum), root-cause fix rule,
  intensity line, output discipline, and the "never lazy about" list.
- **Subagents** — a compact static global section gives them the persona and
  command vocabulary (agent-scoped sections don't propagate to subagents, so
  the global layer is the vehicle).
- **Work-order commands** — `/ponytail-review`, `/ponytail-audit`,
  `/ponytail-debt` steer one model turn (the only places that inject extra
  prompt information); `/ponytail-gain` and `/ponytail-help` are instant,
  zero-token reference cards.
- **Skills** — the six ponytail skills registered as runtime skills, so the
  model can invoke them on its own via the skill tool.
- **"stop ponytail" / "normal mode"** — handled conversationally by the baked
  section; the model reverts for the rest of the session.

## Cache safety (why it won't break your DeepSeek cache)

DeepSeek caches the request **prefix**. The design guarantees the prefix is
byte-stable:

| Concern | Design |
|---|---|
| System prompt | Static global section + one **agent-scoped section baked once at session start**. Both are byte-identical for the whole conversation — the level can't change, so the prefix never invalidates. |
| Work orders (`/ponytail-review` & co.) | Append-only user-role messages — a new tail; everything before keeps cache-hitting. |
| `/ponytail` report, `-gain`, `-help` | UI command plane: **zero model tokens, zero cache effect**. |
| Skills | Durable catalog + append-only loads (owned by `dsh-tool-skill`). |
| Mode state | Host-side JSON file — never part of any request. |
| Per-turn injection | None. No timestamps, no state, no `{{variables}}` in any section. |

Compare the upstream: Claude Code re-emits the ruleset as hook context on every
session start and prompt submit, and supports mid-session mode switches — both
per-prompt churn points. Baking once at session start is strictly more
cache-stable.

## Commands

| Command | What it does |
|---|---|
| `/ponytail` | Report the current session's level. |
| `/ponytail default <mode>` | Set the default for **new** sessions (`off\|lite\|full\|ultra`); the current session keeps its baked level. |
| `/ponytail-review` | Review the current changes for over-engineering; one line per finding. |
| `/ponytail-audit` | Whole-workspace over-engineering audit; ranked list of what to delete. |
| `/ponytail-debt` | Harvest `ponytail:` shortcut comments into a tracked ledger. |
| `/ponytail-gain` | Measured-impact scoreboard (less code, less cost, more speed). |
| `/ponytail-help` | Quick-reference card. |

Mid-session level switches are deliberately refused (`/ponytail lite` returns
an error): re-baking the section would invalidate the request prefix once,
which is exactly the cache cost this design exists to avoid.

## Install (when you want it)

From a profile (e.g. the `web` profile):

```sh
dsh plugin --profile web add github:Lynixenn/dsh-ponytail
```

Requires `dsh >= 0.1.0-rc.6` and Node `^22.19 || >=24`.

## Development

```sh
pnpm install
pnpm run check    # typecheck + build + selfcheck
node selfcheck.mjs
```

## Deliberate simplifications (ponytail: notes)

- **No mid-session switching.** User decision: the level is fixed at session
  start so the prompt prefix (and the cache) never churns. Change the default
  and start a new session to change the level.
- **No "review" session mode.** `/ponytail-review` is a one-shot steer of one
  review turn, not a persistent mode.
- **No statusline badge.** Claude Code has a `statusLine`; DSH web has no
  equivalent surface. A header badge would need a client half (like
  `dsh-markdown-color`'s) — deferred.
- **Config location** is `$DSH_HOME/ponytail.json` (default `~/.dsh`), not
  upstream's `~/.config/ponytail/config.json`; the `PONYTAIL_DEFAULT_MODE` env
  var is honored. Resolution: env var > persisted default > `full`.
- **Subagents run on the global compact section** (persona + vocabulary, no
  level-specific text), not the parent's baked level — global sections can't
  be per-session.

## License

MIT.
