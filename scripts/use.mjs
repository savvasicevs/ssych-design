#!/usr/bin/env node
// One Generator page, metered on the server (free accounts: 2 pages a day; paid: unlimited).
//
//   node use.mjs status                       full kit installed? key saved? pages left?
//   node use.mjs key <ssk_…>                  save your kit key (once)
//   node use.mjs start [--page <useId>]       open a page: fetches the playbook into a temp folder
//   node use.mjs pack <in.html> <out.html>    put the house into the page, print the checks
//   node use.mjs check <out.html>             the browser finish check (needs: npm i -D playwright axe-core)
//
// A page stays open for 24 hours: starting it again with --page, or packing it again,
// costs nothing more. The playbook is fetched fresh for each page and kept only in a
// temp folder; old folders are cleared on the next start.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { API, KEY_RE, readKey, saveKey } from './key.mjs'

const [cmd, ...args] = process.argv.slice(2)
const CURRENT = join(homedir(), '.ssych', 'current-page.json')
const ROOT = join(tmpdir(), 'ssych-generator')
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }

async function post(action, body) {
  const res = await fetch(`${API}/${action}`, {
    method: 'POST',
    headers: { Authorization: `Kit ${readKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) { console.error(json.error ?? `ssych.com answered ${res.status}`); process.exit(1) }
  return json
}

const FULL_KIT = process.env.SSYCH_FULL_KIT_DIR || join(homedir(), '.claude', 'skills', 'ssych-design')

if (cmd === 'status') {
  if (existsSync(join(FULL_KIT, 'SKILL.md'))) console.log(`FULL KIT at ${FULL_KIT}: follow ${join(FULL_KIT, 'SKILL.md')} and ignore the rest of the plugin skill.`)
  else console.log('No full kit installed: use start / pack / check.')
  console.log(existsSync(join(homedir(), '.ssych', 'kit-key')) || process.env.SSYCH_KIT_KEY ? 'Kit key: saved.' : 'Kit key: missing. Run: node use.mjs key <ssk_…>')
} else if (cmd === 'key') {
  if (!KEY_RE.test(args[0] ?? '')) { console.error('That does not look like a kit key (ssk_…).'); process.exit(1) }
  saveKey(args[0]); console.log('Key saved to ~/.ssych/kit-key.')
} else if (cmd === 'start') {
  /* clear playbooks older than a day */
  if (existsSync(ROOT)) for (const d of readdirSync(ROOT)) { const p = join(ROOT, d); if (Date.now() - statSync(p).mtimeMs > 864e5) rmSync(p, { recursive: true, force: true }) }
  const r = await post('playbook', flag('--page') ? { page: flag('--page') } : {})
  const dir = join(ROOT, r.useId)
  for (const [rel, f] of Object.entries(r.files)) {
    const out = join(dir, rel)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, f.text !== undefined ? f.text : Buffer.from(f.base64, 'base64'))
  }
  mkdirSync(dirname(CURRENT), { recursive: true })
  writeFileSync(CURRENT, JSON.stringify({ useId: r.useId, dir, at: new Date().toISOString() }))
  console.log(`Page open: ${r.useId}`)
  console.log(`Playbook: ${dir}  (start with FREE.md)`)
  console.log(r.unlimited ? 'Unlimited on your plan.' : `${r.left} page${r.left === 1 ? '' : 's'} left today.`)
} else if (cmd === 'pack') {
  const [src, out] = args.filter((a) => !a.startsWith('--'))
  if (!src || !out) { console.error('usage: node use.mjs pack <in.html> <out.html>'); process.exit(1) }
  const useId = flag('--use') ?? (existsSync(CURRENT) ? JSON.parse(readFileSync(CURRENT, 'utf8')).useId : '')
  if (!useId) { console.error('No open page. Run: node use.mjs start'); process.exit(1) }
  const r = await post('pack', { useId, html: readFileSync(src, 'utf8') })
  writeFileSync(out, r.html)
  console.log(`${out}: ${(Buffer.byteLength(r.html) / 1024).toFixed(0)} KB, self-contained`)
  for (const c of r.report.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok || !c.detail ? '' : `\n      ${c.detail}`}`)
  if (r.report.missingIcons.length) console.log(`FAIL  unknown icons: ${r.report.missingIcons.join(', ')} (see icon-names.txt)`)
  const fails = r.report.checks.filter((c) => !c.ok).length + (r.report.missingIcons.length ? 1 : 0)
  console.log(fails ? `\n${fails} to fix. Packing this page again is free for 24 hours.` : '\nAll text checks pass.')
} else if (cmd === 'check') {
  const page = args.find((a) => !a.startsWith('--'))
  const cur = existsSync(CURRENT) ? JSON.parse(readFileSync(CURRENT, 'utf8')) : null
  if (!page || !cur || !existsSync(join(cur.dir, 'gate.mjs'))) { console.error('usage: node use.mjs check <packed.html>  (after start and pack)'); process.exit(1) }
  try { execFileSync('node', [join(cur.dir, 'gate.mjs'), page, '--shots', join(dirname(page), 'shots')], { stdio: 'inherit' }) } catch { process.exit(1) }
} else {
  console.error('usage: node use.mjs key <ssk_…> | start [--page <id>] | pack <in.html> <out.html> | check <out.html>')
  process.exit(1)
}
