#!/usr/bin/env node
/**
 * dsh-ponytail self-check — the ONE runnable check behind this plugin.
 *
 * Exercises the pure logic (mode parsing, default resolution, baked-section
 * filtering, mode reports, skill catalog) against the built bundle. Fails
 * (non-zero exit) if any of it breaks. No frameworks, no fixtures.
 *
 * Run: node selfcheck.mjs   (after pnpm run build)
 */
import assert from 'node:assert/strict'
import {
  DEFAULT_MODE,
  GAIN_TEXT,
  GLOBAL_SECTION_TEXT,
  HELP_TEXT,
  SKILLS,
  buildActiveMarker,
  buildModeSection,
  modeReport,
  normalizeMode,
  parsePonytailArgs,
  resolveDefaultMode,
} from './lib/index.js'

let checks = 0
function ok(name, fn) {
  fn()
  checks += 1
  console.log(`  ok  ${name}`)
}

console.log('dsh-ponytail selfcheck')

// --- modes ---
ok('normalizeMode accepts valid levels', () => {
  assert.equal(normalizeMode('ultra'), 'ultra')
  assert.equal(normalizeMode(' FULL '), 'full')
  assert.equal(normalizeMode('off'), 'off')
})
ok('normalizeMode rejects unknown levels', () => {
  assert.equal(normalizeMode('review'), null) // no persistent review mode
  assert.equal(normalizeMode(''), null)
  assert.equal(normalizeMode(42), null)
})
ok('parsePonytailArgs splits raw input after the command name', () => {
  assert.deepEqual(parsePonytailArgs(' ultra'), { arg: 'ultra', arg2: '' }) // rawInput includes the leading separator
  assert.deepEqual(parsePonytailArgs('default lite'), { arg: 'default', arg2: 'lite' })
  assert.deepEqual(parsePonytailArgs(''), { arg: '', arg2: '' })
  assert.deepEqual(parsePonytailArgs('  '), { arg: '', arg2: '' })
})
ok('resolveDefaultMode: env > persisted > full', () => {
  assert.equal(resolveDefaultMode({ PONYTAIL_DEFAULT_MODE: 'lite' }), 'lite')
  assert.equal(resolveDefaultMode({ PONYTAIL_DEFAULT_MODE: 'bogus' }, 'ultra'), 'ultra')
  assert.equal(resolveDefaultMode({}, 'off'), 'off')
  assert.equal(resolveDefaultMode({}), DEFAULT_MODE)
})

// --- prompt: baked-at-session-start sections ---
ok('buildModeSection bakes exactly the active level (mode-filtered)', () => {
  const ultra = buildModeSection('ultra')
  assert.match(ultra, /\*\*ultra\*\*/)
  assert.match(ultra, /deletion before addition/i) // ultra description
  assert.doesNotMatch(ultra, /name the lazier alternative/i) // lite row must not leak in
  assert.doesNotMatch(ultra, /\{\{/) // no interpolated variables → cache-safe

  const lite = buildModeSection('lite')
  assert.match(lite, /\*\*lite\*\*/)
  assert.match(lite, /name the lazier alternative/i)
  assert.doesNotMatch(lite, /deletion before addition/i)

  assert.equal(buildModeSection('off'), '') // off bakes nothing
})
ok('GLOBAL_SECTION_TEXT is static and neutral', () => {
  assert.equal(GLOBAL_SECTION_TEXT, GLOBAL_SECTION_TEXT)
  assert.match(GLOBAL_SECTION_TEXT, /The active intensity level/)
  assert.doesNotMatch(GLOBAL_SECTION_TEXT, /\{\{/)
})
ok('modeReport renders per level', () => {
  assert.equal(modeReport('full'), 'PONYTAIL MODE ACTIVE — level: full.')
  assert.equal(modeReport('off'), 'PONYTAIL MODE OFF — ponytail is inactive.')
})
ok('buildActiveMarker is static, level-tagged, and notice-bounded', () => {
  const ultra = buildActiveMarker('ultra')
  assert.match(ultra.text, /PONYTAIL ACTIVE — level: ultra/)
  assert.match(ultra.summary, /ultra/)
  assert.ok(ultra.summary.length <= 120, 'summary within the notice bound')
  assert.doesNotMatch(ultra.text, /\{\{/) // no interpolated variables → cache-safe
  assert.deepEqual(buildActiveMarker('full'), buildActiveMarker('full')) // static per session
})
ok('GAIN_TEXT and HELP_TEXT are static and switching-free', () => {
  assert.match(GAIN_TEXT, /▼ 80–94%/)
  assert.match(HELP_TEXT, /ponytail default/)
  assert.doesNotMatch(HELP_TEXT, /ponytail lite\s*\n/) // no switch command advertised
})

// --- skills ---
ok('all six skills registered with names, descriptions, and content', () => {
  assert.equal(SKILLS.length, 6)
  const names = SKILLS.map((s) => s.name).sort()
  assert.deepEqual(names, ['ponytail', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help', 'ponytail-review'])
  for (const s of SKILLS) {
    assert.ok(s.description.length > 20, `${s.name}: description`)
    assert.ok(s.content.length > 200, `${s.name}: content`)
  }
})

console.log(`\n${checks} checks passed.`)
