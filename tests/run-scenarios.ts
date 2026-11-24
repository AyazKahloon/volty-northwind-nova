// End-state test runner for the scenario list in tests/scenarios.ts.
// Grades from the final `leads` row + Contact Labels (Part 2.A2), not from reply wording,
// except for a few `replyContains`/`replyNotContains` assertions where the end-state alone
// can't capture it (e.g. "did the booking link actually go out").
//
// Usage: bun run tests/run-scenarios.ts [--runs=N] [scenarioName ...]
// --runs=N (default 1) runs each scenario N times and reports pass^N (all N must pass).
// Per docs/PLAN.md Part 1: during development, rerun only failing scenarios (--runs=1 is the
// default for exactly this reason); the full suite only runs --runs=3 once, at the very end.

import { scenarios, type Assertion, type Scenario } from './scenarios'

const ORG = '3vdy1kmdwel0'
const WEB_CHAT_CHANNEL = 'jm3dx6apti0e'
const LEADS_TABLE_ID = 's1e46y1j2hx0'

function run(args: string[]): { stdout: string; ok: boolean } {
  const proc = Bun.spawnSync(['volty', ...args, '--json'], {
    env: { ...process.env, VOLTY_ORG: ORG },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = proc.stdout.toString()
  return { stdout, ok: proc.exitCode === 0 }
}

function parseJson(stdout: string): any {
  // CLI prints a "→ prod · ..." header line before the JSON body.
  const firstBrace = stdout.indexOf('{')
  if (firstBrace === -1) return null
  try {
    return JSON.parse(stdout.slice(firstBrace))
  } catch {
    return null
  }
}

type TurnResult = { conversationId: string; costMicros: number; waitedMs: number }

function wakeSync(text: string, from: string): TurnResult | null {
  const { stdout } = run(['debug', 'wake-sync', `--text=${text}`, `--web-chat=${WEB_CHAT_CHANNEL}`, `--from=${from}`])
  const json = parseJson(stdout)
  const sc = json?.structuredContent
  if (!sc?.conversationId) return null
  return { conversationId: sc.conversationId, costMicros: sc.costMicros ?? 0, waitedMs: sc.waitedMs ?? 0 }
}

function getLeadsRowByConversation(conversationId: string): Record<string, any> | null {
  const { stdout } = run([
    'rows',
    'query',
    `--table-id=${LEADS_TABLE_ID}`,
    `--where=[{"column":"conversation_id","op":"eq","value":"${conversationId}"}]`,
  ])
  const json = parseJson(stdout)
  const rows = json?.structuredContent?.rows
  return rows && rows.length > 0 ? rows[0].fields : null
}

/** All public agent replies in the conversation, joined — a fact (like the booking link) may
 *  have been stated on an earlier turn, with later turns only referencing it back. */
function getAllAgentReplyText(conversationId: string): string {
  const { stdout } = run(['debug', 'trace', `--conversation-id=${conversationId}`])
  const json = parseJson(stdout)
  const items: Array<any> = json?.structuredContent?.items ?? []
  const agentMessages = items.filter((i) => i.kind === 'message' && i.role === 'agent' && i.visibility === 'public')
  return agentMessages.map((m) => m.text ?? '').join('\n---\n')
}

function getContactLabels(contactId: string): string[] {
  // contacts get --id returns segments; cheaper than re-deriving from `contacts labels` counts.
  const { stdout } = run(['contacts', 'get', `--id=${contactId}`])
  const json = parseJson(stdout)
  const contact = json?.structuredContent?.contacts?.[0] ?? json?.structuredContent?.contact
  return contact?.segments ?? []
}

function checkAssertion(a: Assertion, row: Record<string, any> | null, reply: string, labels: string[]): { pass: boolean; detail: string } {
  switch (a.kind) {
    case 'leadExists':
      return { pass: row !== null, detail: row ? 'row found' : 'no row found' }
    case 'noLeadExists':
      return { pass: row === null, detail: row ? 'row unexpectedly exists' : 'no row, as expected' }
    case 'field': {
      const actual = row?.[a.field]
      return { pass: actual === a.equals, detail: `${a.field}=${JSON.stringify(actual)} (want ${JSON.stringify(a.equals)})` }
    }
    case 'fieldExists': {
      const actual = row?.[a.field]
      const pass = actual !== undefined && actual !== null && actual !== ''
      return { pass, detail: `${a.field}=${JSON.stringify(actual)}` }
    }
    case 'fieldAbsent': {
      const actual = row?.[a.field]
      const pass = actual === undefined || actual === null
      return { pass, detail: `${a.field}=${JSON.stringify(actual)}` }
    }
    case 'label':
      return { pass: labels.includes(a.value), detail: `labels=[${labels.join(',')}]` }
    case 'noLabel':
      return { pass: !labels.includes(a.value), detail: `labels=[${labels.join(',')}]` }
    case 'replyContains':
      return { pass: reply.toLowerCase().includes(a.text.toLowerCase()), detail: reply.slice(0, 120) }
    case 'replyNotContains':
      return { pass: !reply.toLowerCase().includes(a.text.toLowerCase()), detail: reply.slice(0, 120) }
  }
}

type RunResult = {
  pass: boolean
  costMicros: number
  conversationId: string | null
  details: string[]
  firstReplyWaitedMs: number | null
  timeToNotifyMs: number | null // for a hot/escalated lead: side_effects_at - conversation start
  finalStatus: string | null
}

async function runScenario(s: Scenario, runIndex: number): Promise<RunResult> {
  const from = `test-${s.name}-r${runIndex}-${Date.now()}`
  let conversationId: string | null = null
  let costMicros = 0
  let firstReplyWaitedMs: number | null = null
  const conversationStartedAt = Date.now()

  for (const turn of s.turns) {
    const result = wakeSync(turn, from)
    if (!result) return { pass: false, costMicros, conversationId, details: ['wake-sync call failed'], firstReplyWaitedMs, timeToNotifyMs: null, finalStatus: null }
    conversationId = result.conversationId
    costMicros += result.costMicros
    if (firstReplyWaitedMs === null) firstReplyWaitedMs = result.waitedMs
  }

  if (!conversationId) return { pass: false, costMicros, conversationId, details: ['no conversation id'], firstReplyWaitedMs, timeToNotifyMs: null, finalStatus: null }

  // Poll instead of a fixed sleep: a fixed 6s wait passed in isolation but silently failed in
  // a full back-to-back batch run, where the automation event queue had a backlog (a real bug
  // in this test harness, not in Nova/the automations — see docs/BUGS.md). Poll until the row
  // has a `status` (or `intent` for a non-scoring path) or a generous ceiling is hit.
  let row = getLeadsRowByConversation(conversationId)
  const pollStart = Date.now()
  while ((!row || row.status === undefined) && Date.now() - pollStart < 20000) {
    await new Promise((r) => setTimeout(r, 2000))
    row = getLeadsRowByConversation(conversationId)
  }
  const reply = getAllAgentReplyText(conversationId)
  const labels = row?.contact_id ? getContactLabels(row.contact_id) : []

  let timeToNotifyMs: number | null = null
  if (row && (row.status === 'hot' || row.status === 'escalated') && typeof row.side_effects_at === 'string') {
    timeToNotifyMs = new Date(row.side_effects_at).getTime() - conversationStartedAt
  }

  const details: string[] = []
  let allPass = true
  for (const a of s.assertions) {
    const { pass, detail } = checkAssertion(a, row, reply, labels)
    if (!pass) allPass = false
    details.push(`${pass ? 'PASS' : 'FAIL'} [${a.kind}] ${detail}`)
  }

  return { pass: allPass, costMicros, conversationId, details, firstReplyWaitedMs, timeToNotifyMs, finalStatus: row?.status ?? null }
}

async function main() {
  const args = process.argv.slice(2)
  const runsArg = args.find((a) => a.startsWith('--runs='))
  const numRuns = runsArg ? parseInt(runsArg.split('=')[1] ?? '1', 10) : 1
  const filterNames = args.filter((a) => !a.startsWith('--'))
  const toRun = filterNames.length > 0 ? scenarios.filter((s) => filterNames.includes(s.name)) : scenarios

  console.log(`Running ${toRun.length} scenario(s), ${numRuns} run(s) each...\n`)

  const usageBefore = parseJson(run(['usage', 'summary']).stdout)?.structuredContent?.trialCredits?.used ?? null

  const rows: string[] = []
  const conversationIds: string[] = []
  let totalCostMicros = 0
  let qualifiedLeads = 0 // reached hot/warm/not-fit, i.e. actually got scored as a new_lead
  const firstReplyTimes: number[] = []
  const notifyTimes: number[] = []

  for (const s of toRun) {
    const runResults: RunResult[] = []
    for (let r = 1; r <= numRuns; r++) {
      const result = await runScenario(s, r)
      runResults.push(result)
      totalCostMicros += result.costMicros
      if (result.conversationId) conversationIds.push(result.conversationId)
      if (result.firstReplyWaitedMs !== null) firstReplyTimes.push(result.firstReplyWaitedMs)
      if (result.timeToNotifyMs !== null) notifyTimes.push(result.timeToNotifyMs)
      if (result.finalStatus === 'hot' || result.finalStatus === 'warm' || result.finalStatus === 'not-fit') qualifiedLeads += 1
    }
    const passCount = runResults.filter((r) => r.pass).length
    const passN = passCount === numRuns
    const status = passN ? 'PASS' : `FAIL (${passCount}/${numRuns})`
    const avgCost = runResults.reduce((a, r) => a + r.costMicros, 0) / numRuns / 1_000_000
    console.log(`${status}  ${s.name}  (avg $${avgCost.toFixed(4)})`)
    for (const d of runResults[runResults.length - 1]!.details) console.log(`    ${d}`)
    const failDetails = runResults.flatMap((r) => r.details.filter((d) => d.startsWith('FAIL')))
    rows.push(`| ${s.name} | ${passCount}/${numRuns} | $${avgCost.toFixed(4)} | ${failDetails.length > 0 ? [...new Set(failDetails)].join('; ') : '-'} |`)
  }

  const usageAfter = parseJson(run(['usage', 'summary']).stdout)?.structuredContent?.trialCredits?.used ?? null
  const creditsSpent = usageBefore !== null && usageAfter !== null ? usageAfter - usageBefore : null
  const totalConversations = toRun.length * numRuns
  const creditsPerConversation = creditsSpent !== null ? (creditsSpent / totalConversations).toFixed(1) : 'n/a'
  const creditsPerQualifiedLead = creditsSpent !== null && qualifiedLeads > 0 ? (creditsSpent / qualifiedLeads).toFixed(1) : 'n/a'

  const avgFirstReply = firstReplyTimes.length > 0 ? (firstReplyTimes.reduce((a, b) => a + b, 0) / firstReplyTimes.length / 1000).toFixed(1) : 'n/a'
  const avgNotify = notifyTimes.length > 0 ? (notifyTimes.reduce((a, b) => a + b, 0) / notifyTimes.length / 1000).toFixed(1) : 'n/a'

  console.log(`\nTotal cost: $${(totalCostMicros / 1_000_000).toFixed(4)}`)
  if (creditsSpent !== null) console.log(`Credits spent this batch: ${creditsSpent} (${creditsPerConversation}/conversation)`)
  console.log(`Avg time to first reply: ${avgFirstReply}s | Avg time status=hot/escalated -> staff notified: ${avgNotify}s`)

  const md = [
    `# Test results (${numRuns}x run${numRuns > 1 ? ', pass^' + numRuns : ''})`,
    '',
    `Run at ${new Date().toISOString()}`,
    '',
    `| Scenario | Pass rate | Avg cost | Failures |`,
    '|---|---|---|---|',
    ...rows,
    '',
    `Total cost: $${(totalCostMicros / 1_000_000).toFixed(4)}`,
    creditsSpent !== null ? `Credits spent this batch: ${creditsSpent}` : '',
    creditsSpent !== null ? `Credits per conversation: ${creditsPerConversation}` : '',
    `Avg time to first reply: ${avgFirstReply}s`,
    `Avg time from status=hot/escalated to staff notification: ${avgNotify}s (industry B2B average lead response: ~42 hours = 151200s)`,
  ].join('\n')
  await Bun.write('tests/results.md', md)

  console.log('\nCleaning up synthetic contacts...')
  for (const id of conversationIds) {
    run(['debug', 'sandbox-cleanup', `--conversation-id=${id}`])
  }
  console.log(`Cleaned up ${conversationIds.length} conversation(s).`)
}

main()
