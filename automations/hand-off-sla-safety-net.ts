import { defineAutomation, z } from '~/automation'

const LEADS_TABLE_ID = 's1e46y1j2hx0'
const STAFF_USER_ID = 'svueosu4am5cr7w'
// Bounded so the worst case (every row in range breaches: 1 listMessages + 1 send + 1 notify +
// 1 batched row.update per row, plus the page read itself) stays well under the 500-call cap.
const PAGE_SIZE = 25
const MAX_PAGES = 2

export default defineAutomation({
  id: 'hand-off-sla-safety-net',
  trigger: { kind: 'schedule', cron: '*/10 * * * *' },
  input: z.object({ intendedRunAt: z.string().optional() }),
  output: z.object({ held: z.number(), skipped: z.number() }),
  async run({ input, ctx }) {
    const now = input.intendedRunAt ?? (await ctx.now())
    const slaMinutes = typeof ctx.params.slaMinutes === 'number' ? ctx.params.slaMinutes : 15
    const cutoffMs = new Date(now).getTime() - slaMinutes * 60 * 1000

    let held = 0
    let skipped = 0
    const seen = new Set<string>()
    let offset = 0

    for (let page = 0; page < MAX_PAGES; page++) {
      const { rows: pageRows } = (await ctx.volty.rows.query({
        tableId: LEADS_TABLE_ID,
        where: [{ column: 'status', op: 'eq', value: 'escalated' }],
        limit: PAGE_SIZE,
        offset,
      })) as {
        rows: Array<{ id: string; createdAt: string; fields: Record<string, string | number | boolean | null> }>
      }

      if (pageRows.length === 0) break

      for (const row of pageRows) {
        if (seen.has(row.id)) continue
        seen.add(row.id)

        // Already held once for the current escalation — don't repeat. (A later re-escalation
        // on the same row would need a fresh trigger to re-arm this; out of scope for now.)
        if (typeof row.fields.sla_holding_sent_at === 'string') {
          skipped += 1
          continue
        }

        const escalatedAt = typeof row.fields.side_effects_at === 'string' ? row.fields.side_effects_at : row.createdAt
        if (new Date(escalatedAt).getTime() > cutoffMs) {
          skipped += 1
          continue // not breached yet
        }

        const conversationId = row.fields.conversation_id
        if (typeof conversationId !== 'string' || conversationId.length === 0) {
          skipped += 1
          continue // nothing to send the holding message into
        }

        // `after: escalatedAt` bounds this to messages since escalation specifically, so a busy
        // conversation can't push an earlier staff reply out of a fixed "last N" window — the
        // gap Volty's own reviewer caught on the first submission. If the read itself fails,
        // skip this row rather than guess: the next run, 10 minutes later, re-checks cleanly —
        // sending an unverified holding message risked double-messaging a lead staff already
        // answered, which the reviewer also caught.
        let messages: Array<{ role: string; createdAt: string }>
        try {
          const result = (await ctx.volty.messaging.listMessages({ conversationId, after: escalatedAt, limit: 100 })) as {
            messages: Array<{ role: string; createdAt: string }>
          }
          messages = result.messages
        } catch {
          skipped += 1
          continue
        }

        if (messages.some((m) => m.role === 'staff')) {
          skipped += 1
          continue
        }

        await ctx.volty.messaging.send({
          conversationId,
          content: "Sorry for the wait — we're still connecting you with a team member. Thanks for your patience, someone will be with you shortly.",
        })

        const name = typeof row.fields.name === 'string' ? row.fields.name : 'A lead'
        const summary = typeof row.fields.qualification_summary === 'string' ? row.fields.qualification_summary : ''
        await ctx.volty.staff.notify({
          userId: STAFF_USER_ID,
          message: `SLA breach: ${name}'s escalated conversation has waited ${slaMinutes}+ min with no staff reply. ${summary}`.slice(0, 500),
          conversationId,
        })

        await ctx.volty.rows.update({
          tableId: LEADS_TABLE_ID,
          rows: [{ id: row.id, fields: { sla_holding_sent_at: now } }],
        })
        held += 1
      }

      offset += pageRows.length
      if (pageRows.length < PAGE_SIZE) break
    }

    return { held, skipped }
  },
})
