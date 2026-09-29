// The kit key, shared by pull.mjs and use.mjs. Saved once to ~/.ssych/kit-key (owner-only).
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const API = process.env.SSYCH_API || 'https://ssych.com/api/me'
const KEY_FILE = join(homedir(), '.ssych', 'kit-key')
export const KEY_RE = /^ssk_[A-Za-z0-9_-]+_[A-Za-z0-9_-]{20,}$/

export function saveKey(key) {
  mkdirSync(join(homedir(), '.ssych'), { recursive: true })
  writeFileSync(KEY_FILE, key + '\n')
  chmodSync(KEY_FILE, 0o600)
}

export function readKey() {
  const key = process.env.SSYCH_KIT_KEY || (existsSync(KEY_FILE) ? readFileSync(KEY_FILE, 'utf8').trim() : '')
  if (!KEY_RE.test(key)) {
    console.error('No kit key. Create one at https://ssych.com/account (free accounts too), then run: node use.mjs key <your key>')
    process.exit(1)
  }
  return key
}
