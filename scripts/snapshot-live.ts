// Snapshots the live workspace into snapshot/ using single-target READ ops only.
//
// Why this exists: volty push/pull (the normal way to keep a local project folder in sync with
// the live workspace) is currently blocked workspace-wide by an unresolved platform bug (see
// docs/VOLTY_BUG_REPORT.md and docs/BUGS.md #11). Every change from here on is deployed via
// individual live ops (instructions update, automations update-source, params set-value, ...)
// instead of push. Without pull working, the local repo would silently drift from what's
// actually live. Run this after every live change and commit the result — it's the substitute
// for `volty pull` until push/pull are fixed.
//
// Usage: bun run scripts/snapshot-live.ts

const ORG = '3vdy1kmdwel0'
const OUT_DIR = 'snapshot'

function run(args: string[]): any {
  const proc = Bun.spawnSync(['volty', ...args, '--json'], {
    env: { ...process.env, VOLTY_ORG: ORG },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = proc.stdout.toString()
  const firstBrace = stdout.indexOf('{')
  if (firstBrace === -1) return { error: 'no JSON output', raw: stdout, stderr: proc.stderr.toString() }
  try {
    return JSON.parse(stdout.slice(firstBrace))
  } catch {
    return { error: 'unparseable JSON', raw: stdout }
  }
}

async function writeJson(path: string, data: unknown) {
  await Bun.write(`${OUT_DIR}/${path}`, JSON.stringify(data, null, 2) + '\n')
}

async function writeText(path: string, text: string) {
  await Bun.write(`${OUT_DIR}/${path}`, text)
}

async function main() {
  console.log('Snapshotting live workspace state...')

  // --- Instructions --- (one `instructions get` call returns org + team + every inbox at once;
  // structuredContent is { org: {text}, team: {text}, inboxes: [{inboxId, name, text}] })
  const instr = run(['instructions', 'get', '--field=org'])
  await writeText('instructions/org.md', instr?.structuredContent?.org?.text ?? '')
  await writeText('instructions/team.md', instr?.structuredContent?.team?.text ?? '')

  const inboxesList = run(['inboxes', 'list'])
  await writeJson('inboxes/_list.json', inboxesList?.structuredContent ?? {})
  const inboxTexts: Array<{ inboxId: string; name: string; text: string }> = instr?.structuredContent?.inboxes ?? []
  for (const ib of inboxTexts) {
    const slug = ib.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    await writeText(`inboxes/${slug}.instructions.md`, ib.text ?? '')
  }

  // --- Params ---
  const params = run(['params', 'list'])
  await writeJson('params.json', params?.structuredContent ?? {})

  // --- Automations (full source, not just the list) ---
  const automationsList = run(['automations', 'list'])
  await writeJson('automations/_list.json', automationsList?.structuredContent ?? {})
  const automationLines: string[] = automationsList?.content?.[0]?.text?.split('\n') ?? []
  for (const line of automationLines) {
    const match = line.match(/^- (\S+) (aut:\S+):/)
    if (!match) continue
    const [, name, id] = match
    const detail = run(['automations', 'get', `--id=${id}`])
    const source = detail?.structuredContent?.source ?? detail?.content?.[0]?.text ?? ''
    await writeText(`automations/${name}.ts`, typeof source === 'string' ? source : JSON.stringify(detail?.structuredContent ?? {}, null, 2))
  }

  // --- Table schemas (schema only, never row data) ---
  const tablesList = run(['tables', 'list'])
  await writeJson('tables/_list.json', tablesList?.structuredContent ?? {})
  const tables: Array<{ id: string; name: string }> = tablesList?.structuredContent?.tables ?? []
  for (const t of tables) {
    const detail = run(['tables', 'get', `--table-id=${t.id}`])
    await writeJson(`tables/${t.name}.schema.json`, detail?.structuredContent ?? {})
  }

  // --- Widgets ---
  const widgetsList = run(['widgets', 'list'])
  await writeJson('widgets/_list.json', widgetsList?.structuredContent ?? {})
  const widgets: Array<{ id: string; name: string }> = widgetsList?.structuredContent?.widgets ?? []
  for (const w of widgets) {
    const detail = run(['widgets', 'get', `--id=${w.id}`])
    await writeJson(`widgets/${w.id}.json`, detail?.structuredContent ?? {})
  }

  // --- SLA policies, channels, sources (small, useful for the case study + sanity checks) ---
  await writeJson('sla-policies.json', run(['sla-policies', 'list'])?.structuredContent ?? {})
  await writeJson('channels.json', run(['channels', 'list'])?.structuredContent ?? {})
  await writeJson('sources.json', run(['sources', 'list'])?.structuredContent ?? {})

  await writeText('SNAPSHOT_META.txt', `Snapshotted at ${new Date().toISOString()} from workspace ${ORG}.\nvolty push/pull are blocked (see docs/BUGS.md #11, docs/VOLTY_BUG_REPORT.md) — this snapshot is the substitute for \`volty pull\` until that's fixed.\n`)

  console.log('Done. Snapshot written to snapshot/.')
}

main()
