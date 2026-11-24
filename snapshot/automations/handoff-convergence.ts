import { defineAutomation, z } from '~/automation'

const LEADS_TABLE_ID = 's1e46y1j2hx0'

// Convergence for bug #10: Nova sometimes calls the native conversations.handToTeam tool
// despite being told not to (docs/BUGS.md #10). That call assigns a staff member, which fires
// conversation.assigned — this automation reacts to that and makes the native path land in the
// same place as our own row-based escalation.
//
// Deliberately does ONLY the row write (status + qualification_summary), nothing else: writing
// here fires row.updated, which wakes leads-side-effects-updated — the SAME automation that
// already applies the Contact Label and staff.notify for every other escalation path, with its
// own tested loop guard and sticky-escalated rule. An earlier version of this file duplicated
// that label/notify logic here too, and Volty's reviewer flagged a real race: both automations
// could read last_notified_status as unset at the same time and both notify. Removing the
// duplicate doesn't prove no race is possible anywhere (the reviewer is right that two
// assignment events in quick succession on the same row is still a narrower, unaddressed edge
// case) — it just removes the specific double-notify this design would otherwise cause.
export default defineAutomation({
  id: 'handoff-convergence',
  trigger: { kind: 'event', name: 'conversation.assigned' },
  input: z.object({ conversationId: z.string(), assigneeUserId: z.string() }),
  output: z.object({ handled: z.boolean() }),
  async run({ input, ctx }) {
    let contactId: string | null = null
    try {
      // The result IS the conversation object — no wrapper key. Verified live: a first version
      // of this file destructured a non-existent `conversation` field and always got undefined.
      const conversation = (await ctx.volty.conversations.get({ conversationId: input.conversationId })) as {
        contactId: string | null
      }
      contactId = conversation?.contactId ?? null
    } catch {
      return { handled: false }
    }
    if (!contactId) return { handled: false }
    const contactRef = contactId.startsWith('cnt:') ? contactId : `cnt:${contactId}`

    let row: { id: string; fields: Record<string, string | number | boolean | null> } | undefined
    try {
      const { rows } = (await ctx.volty.rows.query({
        tableId: LEADS_TABLE_ID,
        where: [{ column: 'contact_id', op: 'eq', value: contactRef }],
        limit: 1,
      })) as { rows: Array<{ id: string; fields: Record<string, string | number | boolean | null> }> }
      row = rows[0]
    } catch {
      return { handled: false }
    }

    // Already escalated and already fully processed for it — nothing to do (also avoids
    // re-firing row.updated pointlessly on every re-assignment of an already-escalated thread).
    if (row && row.fields.status === 'escalated' && row.fields.last_processed_status === `${contactRef}:escalated`) {
      return { handled: false }
    }

    let quote = '(no message found)'
    try {
      const { messages } = (await ctx.volty.messaging.listMessages({ conversationId: input.conversationId, limit: 20 })) as {
        messages: Array<{ role: string; text?: string }>
      }
      const lastVisitorMsg = [...messages].reverse().find((m) => m.role === 'contact' && m.text)
      if (lastVisitorMsg?.text) quote = lastVisitorMsg.text
    } catch {
      // keep the placeholder quote rather than failing the whole convergence
    }
    const summary = `Escalated via platform hand-off — "${quote}"`

    if (!row) {
      await ctx.volty.rows.insert({
        tableId: LEADS_TABLE_ID,
        fields: {
          contact_id: contactRef,
          conversation_id: input.conversationId,
          intent: 'other',
          status: 'escalated',
          qualification_summary: summary,
        },
      })
    } else {
      await ctx.volty.rows.update({
        tableId: LEADS_TABLE_ID,
        rows: [{ id: row.id, fields: { status: 'escalated', qualification_summary: summary } }],
      })
    }

    return { handled: true }
  },
})
