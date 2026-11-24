import { defineAutomation, z } from '~/automation'

const LEADS_TABLE_ID = 's1e46y1j2hx0'
const STAFF_USER_ID = 'svueosu4am5cr7w'
const PAGE_SIZE = 100
const MAX_PAGES = 4

export default defineAutomation({
  id: 'lead-warm-followup',
  trigger: { kind: 'schedule', cron: '0 9 * * *' },
  input: z.object({ intendedRunAt: z.string().optional() }),
  output: z.object({ flagged: z.number(), skipped: z.number() }),
  async run({ input, ctx }) {
    const now = input.intendedRunAt ?? (await ctx.now())
    const followupDays = typeof ctx.params.followupDays === 'number' ? ctx.params.followupDays : 3
    const cutoffMs = new Date(now).getTime() - followupDays * 24 * 60 * 60 * 1000

    let flagged = 0
    let skipped = 0
    const seen = new Set<string>()
    let offset = 0

    for (let page = 0; page < MAX_PAGES; page++) {
      const { rows: pageRows } = (await ctx.volty.rows.query({
        tableId: LEADS_TABLE_ID,
        where: [{ column: 'status', op: 'eq', value: 'warm' }],
        limit: PAGE_SIZE,
        offset,
      })) as {
        rows: Array<{ id: string; createdAt: string; fields: Record<string, string | number | boolean | null> }>
      }

      if (pageRows.length === 0) break

      // NOTE: this was originally designed to email the lead directly (messaging.compose to a
      // raw address). That call fails with `channel_none` on this trial workspace — outbound
      // email needs a chosen paid plan (`email setup` refuses with `tier_feature_required` on
      // trial). Falling back to a staff reminder: a human sends the actual follow-up, using the
      // email Nova already collected on the row. See docs/BUGS.md.
      //
      // `last_followup_at` means "last time a reminder was SENT TO STAFF", not "lead was
      // followed up" — Volty's own reviewer caught the first version treating a sent reminder
      // as done, which would permanently exclude a lead staff never actually acted on. The due
      // check below re-fires every `followupDays` of silence since the last reminder (or since
      // creation, if none has fired yet), so an ignored reminder repeats rather than vanishing.
      const flaggedRows: Array<{ id: string; fields: { last_followup_at: string } }> = []
      for (const row of pageRows) {
        if (seen.has(row.id)) continue
        seen.add(row.id)

        // PDPA: a lead that asked not to be contacted is never flagged for follow-up, staff
        // reminder included — the row stays as-is so it isn't picked up again next run either.
        if (row.fields.do_not_contact === true) {
          skipped += 1
          continue
        }

        const lastTouch = typeof row.fields.last_followup_at === 'string' ? row.fields.last_followup_at : row.createdAt
        if (new Date(lastTouch).getTime() > cutoffMs) continue // not due yet

        const hasEmail = typeof row.fields.email === 'string' && row.fields.email.length > 0
        if (!hasEmail) {
          skipped += 1
          continue
        }

        const name = typeof row.fields.name === 'string' && row.fields.name.length > 0 ? row.fields.name : 'A lead'
        const service = typeof row.fields.service_needed === 'string' ? row.fields.service_needed : 'an unspecified service'
        const summary = typeof row.fields.qualification_summary === 'string' ? row.fields.qualification_summary : ''

        // The "opt-out line every follow-up email includes" requirement is carried here as an
        // instruction to the human sending the actual email (we don't send it ourselves — see
        // the channel_none note above), since staff.notify is a one-line internal bell, not an
        // email to the lead.
        await ctx.volty.staff.notify({
          userId: STAFF_USER_ID,
          message: `Follow-up due: ${name} — ${service}, warm for ${followupDays}+ days. Email on file. Include an unsubscribe/opt-out line in your email. ${summary}`.slice(0, 500),
        })

        flaggedRows.push({ id: row.id, fields: { last_followup_at: now } })
        flagged += 1
      }

      if (flaggedRows.length > 0) {
        await ctx.volty.rows.update({ tableId: LEADS_TABLE_ID, rows: flaggedRows })
      }

      offset += pageRows.length
      if (pageRows.length < PAGE_SIZE) break
    }

    return { flagged, skipped }
  },
})
