import { defineAutomation, z } from '~/automation'

const STAFF_USER_ID = 'svueosu4am5cr7w'
const SERVICES_TABLE_ID = 'bnkfhq6cmd9o'
const ALL_STATUSES = ['hot', 'warm', 'not-fit', 'escalated', 'referred', 'spam'] as const
const NOTIFY_STATUSES = ['hot', 'escalated'] as const

// --- Pure scoring logic. KEEP THIS IN SYNC, BYTE FOR BYTE, WITH:
//   - lib/score-lead.ts (the testable copy — see its header comment for why this exists)
//   - automations/leads-side-effects-updated.ts (the sibling event-trigger variant)
// An automation may only import '~/automation', so none of those three can import each other.
function computeLeadStatus(input: {
  monthlyBudgetSgd: number | null
  timelineDays: number | null
  serviceOffered: boolean
  minViableBudget: number | null
  hotBudget: number
  escalateBudget: number
}): 'hot' | 'warm' | 'not-fit' | 'escalated' | null {
  const { monthlyBudgetSgd, timelineDays, serviceOffered, minViableBudget, hotBudget, escalateBudget } = input
  // Escalation-tier budget wins over an unmatched service name — see lib/score-lead.ts header.
  if (monthlyBudgetSgd !== null && monthlyBudgetSgd >= escalateBudget) return 'escalated'
  if (!serviceOffered) return 'not-fit'
  if (monthlyBudgetSgd === null) return null
  if (minViableBudget !== null && monthlyBudgetSgd < minViableBudget) return 'not-fit'
  if (monthlyBudgetSgd >= hotBudget && timelineDays !== null && timelineDays <= 30) return 'hot'
  return 'warm'
}
// --- end shared logic

export default defineAutomation({
  id: 'leads-side-effects-updated',
  trigger: { kind: 'event', name: 'row.updated', filter: { tableId: 's1e46y1j2hx0' } },
  input: z.object({ tableId: z.string(), rowId: z.string() }),
  output: z.object({ labeled: z.boolean(), notified: z.boolean() }),
  async run({ input, ctx }) {
    let row: { id: string; fields: Record<string, string | number | boolean | null> }
    try {
      const result = (await ctx.volty.rows.get({ tableId: input.tableId, rowId: input.rowId })) as {
        row: { id: string; fields: Record<string, string | number | boolean | null> }
      }
      row = result.row
    } catch {
      // A malformed or already-gone row (including a test run's synthetic payload) is not an
      // error worth failing the run over — there is simply nothing to process.
      return { labeled: false, notified: false }
    }

    const contactId = row.fields.contact_id
    if (typeof contactId !== 'string' || contactId.length === 0) {
      return { labeled: false, notified: false }
    }

    const intent = row.fields.intent
    let status: string | null = typeof row.fields.status === 'string' ? row.fields.status : null

    // Only a new_lead's status is computed here — existing_client/job_seeker/vendor_spam/other
    // are terminal statuses Nova sets directly (escalated/referred/spam), since there is
    // nothing to score for them. "escalated" is also sticky/terminal once set: Nova sets it
    // directly for a non-budget reason (explicit human request, anger, contracts/legal) while
    // intent is still new_lead, and recomputing from raw fields must never downgrade that back
    // to hot/warm/not-fit.
    if ((intent === 'new_lead' || intent === null || intent === undefined) && status !== 'escalated') {
      const budget = typeof row.fields.monthly_budget_sgd === 'number' ? row.fields.monthly_budget_sgd : null
      const timelineDays = typeof row.fields.timeline_days === 'number' ? row.fields.timeline_days : null
      const serviceNeeded = typeof row.fields.service_needed === 'string' ? row.fields.service_needed.trim().toLowerCase() : ''

      let serviceOffered = false
      let minViableBudget: number | null = null
      if (serviceNeeded.length > 0) {
        const { rows: serviceRows } = (await ctx.volty.rows.query({ tableId: SERVICES_TABLE_ID, limit: 50 })) as {
          rows: Array<{ fields: Record<string, string | number | boolean | null> }>
        }
        const match = serviceRows.find(
          (s) => typeof s.fields.name === 'string' && s.fields.name.trim().toLowerCase() === serviceNeeded,
        )
        if (match) {
          serviceOffered = true
          minViableBudget = typeof match.fields.min_viable_budget === 'number' ? match.fields.min_viable_budget : null
        }
      }

      const hotBudget = typeof ctx.params.hotBudget === 'number' ? ctx.params.hotBudget : 3000
      const escalateBudget = typeof ctx.params.escalateBudget === 'number' ? ctx.params.escalateBudget : 10000

      const computed =
        serviceNeeded.length === 0
          ? null
          : computeLeadStatus({ monthlyBudgetSgd: budget, timelineDays, serviceOffered, minViableBudget, hotBudget, escalateBudget })

      status = computed
    }

    if (status === null || !ALL_STATUSES.includes(status as (typeof ALL_STATUSES)[number])) {
      // Not enough information yet to score this lead, or no actionable status set — nothing
      // to label or notify about. Nova will write again as the conversation progresses.
      return { labeled: false, notified: false }
    }

    const processedKey = `${contactId}:${status}`
    if (row.fields.last_processed_status === processedKey) {
      return { labeled: false, notified: false }
    }

    await ctx.volty.contacts.update({
      id: contactId,
      addSegments: [status],
      removeSegments: ALL_STATUSES.filter((s) => s !== status),
    })

    let notified = false
    const lastNotified = row.fields.last_notified_status
    const needsNotify = NOTIFY_STATUSES.includes(status as (typeof NOTIFY_STATUSES)[number]) && lastNotified !== processedKey
    if (needsNotify) {
      const name = typeof row.fields.name === 'string' ? row.fields.name : 'A lead'
      const service = typeof row.fields.service_needed === 'string' ? row.fields.service_needed : 'an unspecified service'
      const budgetField = row.fields.monthly_budget_sgd
      const budgetText = typeof budgetField === 'number' ? `SGD ${budgetField}/mo` : 'an unstated budget'
      const summary = typeof row.fields.qualification_summary === 'string' ? row.fields.qualification_summary : ''
      const label = status === 'escalated' ? 'Escalated' : 'Hot lead'
      await ctx.volty.staff.notify({
        userId: STAFF_USER_ID,
        message: `${label}: ${name} — ${service}, ${budgetText}. ${summary}`.slice(0, 500),
      })
      notified = true
    }

    await ctx.volty.rows.update({
      tableId: input.tableId,
      rows: [
        {
          id: input.rowId,
          fields: {
            status,
            side_effects_at: await ctx.now(),
            last_processed_status: processedKey,
            ...(notified ? { last_notified_status: processedKey } : {}),
          },
        },
      ],
    })

    return { labeled: true, notified }
  },
})
