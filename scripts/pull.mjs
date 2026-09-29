#!/usr/bin/env node
// Installs or updates the Generator (the ssych-design skill) into ~/.claude/skills.
//
//   node pull.mjs <kit-key>      first time: saves the key, downloads, installs
//   node pull.mjs                later: checks the version, downloads only if it changed
//   node pull.mjs --check        says whether an update exists, changes nothing
//
// The key comes from your account page at https://ssych.com/account (Generator → Create a kit key).
// It is saved to ~/.ssych/kit-key (readable by you only) and sent only to ssych.com.
// Your edits survive updates: SOURCES.md and anything under the skill's local/ folder are kept.
import { execFileSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { API as ME } from './key.mjs'
const API = `${ME}/kit`
const KEY_FILE = join(homedir(), '.ssych', 'kit-key')
const SKILLS = join(homedir(), '.claude', 'skills')
const DEST = join(SKILLS, 'ssych-design')
const VERSION_FILE = join(DEST, '.kit-version')
const KEEP = ['SOURCES.md', 'local']

const arg = process.argv.slice(2).find((a) => !a.startsWith('--'))
const checkOnly = process.argv.includes('--check')

let key = arg || process.env.SSYCH_KIT_KEY || (existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8').trim() : '')
if (!/^ssk_[A-Za-z0-9_-]+_[A-Za-z0-9_-]{20,}$/.test(key)) {
  console.error('No kit key. Create one at https://ssych.com/account (Generator → Create a kit key), then run: node pull.mjs <key>')
  process.exit(1)
}
if (arg) { mkdirSync(join(homedir(), '.ssych'), { recursive: true }); writeFileSync(KEY_FILE, key + '\n'); chmodSync(KEY_FILE, 0o600) }

const headers = { Authorization: `Kit ${key}` }
const meta = await fetch(`${API}?meta=1`, { headers })
if (meta.status === 401) { console.error('The key was not accepted. Create a new one on your account page (a new key replaces the old).'); process.exit(1) }
if (meta.status === 402) { console.error('The full kit comes with All access (yearly or lifetime). On a free account, make pages with: node use.mjs start'); process.exit(1) }
if (!meta.ok) { console.error(`ssych.com answered ${meta.status}. Try again in a minute.`); process.exit(1) }
const { version, bytes } = await meta.json()
const have = existsSync(VERSION_FILE) ? readFileSync(VERSION_FILE, 'utf8').trim() : null

if (have === version) { console.log(`The Generator is up to date (${version}).`); process.exit(0) }
if (checkOnly) { console.log(have ? `Update available: ${have} → ${version}. Run node pull.mjs to install it.` : `Not installed yet. Run node pull.mjs to install ${version}.`); process.exit(0) }

console.log(`${have ? 'Updating' : 'Installing'} the Generator ${version} (${(bytes / 1e6).toFixed(1)} MB)…`)
const res = await fetch(API, { headers })
if (!res.ok) { console.error(`Download failed (${res.status}).`); process.exit(1) }
const work = mkdtempSync(join(tmpdir(), 'ssych-kit-'))
const tgz = join(work, 'kit.tgz')
writeFileSync(tgz, Buffer.from(await res.arrayBuffer()))

// keep the user's own edits across the update
const saved = join(work, 'keep')
mkdirSync(saved)
for (const k of KEEP) if (existsSync(join(DEST, k))) cpSync(join(DEST, k), join(saved, k), { recursive: true })

mkdirSync(SKILLS, { recursive: true })
rmSync(DEST, { recursive: true, force: true })
execFileSync('tar', ['-xzf', tgz, '-C', SKILLS])
for (const k of KEEP) {
  if (!existsSync(join(saved, k))) continue
  if (k === 'SOURCES.md' && existsSync(join(DEST, k))) cpSync(join(DEST, k), join(DEST, 'SOURCES.default.md'))
  cpSync(join(saved, k), join(DEST, k), { recursive: true })
}
writeFileSync(VERSION_FILE, version + '\n')
rmSync(work, { recursive: true, force: true })
console.log(`Done. The Generator is in ${DEST}. Start a new Claude Code session to use it, then ask for a landing page.`)
if (existsSync(join(DEST, 'SOURCES.default.md'))) console.log('Your SOURCES.md was kept; the new default is beside it as SOURCES.default.md.')
