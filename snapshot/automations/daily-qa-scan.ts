import { defineAutomation, z } from '~/automation'

const STAFF_USER_ID = 'svueosu4am5cr7w'
// Lexical, not semantic: a cheap proxy for "sounds like an unguaranteed promise or an
// outside-the-range exact price," not a guarantee of catching every violation. Good enough for
// a daily sweep that flags things for a human glance, not a hard compliance gate.
const BANNED_TERMS = ['guarantee', 'guaranteed', '100%', 'promise you', 'always deliver']
const MAX_CONVERSATIONS = 50 // bounds the call budget for a daily sweep

export default defineAutomation({
  id: 'daily-qa-scan',
  trigger: { kind: 'schedule', cron: '0 8 * * *' },
  input: z.object({ intendedRunAt: z.string().optional() }),
  output: z.object({ scanned: z.number(), flagged: z.number() }),
  async run({ input, ctx }) {
    const now = input.intendedRunAt ?? (await ctx.now())
    const cutoffMs = new Date(now).getTime() - 24 * 60 * 60 * 1000

    const { conversations } = (await ctx.volty.conversations.list({ limit: MAX_CONVERSATIONS })) as {
      conversations: Array<{ id: string; lastMessageAt?: string }>
    }

    let scanned = 0
    const hits: string[] = []
    for (const conv of conversations) {
      // conversations.list is most-recent-activity-first — stop once we're past the window
      // rather than scanning the whole history every day.
      if (conv.lastMessageAt && new Date(conv.lastMessageAt).getTime() < cutoffMs) break
      scanned += 1

      const { messages } = (await ctx.volty.messaging.listMessages({ conversationId: conv.id, limit: 50 })) as {
        messages: Array<{ role: string; text?: string; createdAt: string }>
      }

      for (const m of messages) {
        if (m.role !== 'agent' || !m.text) continue
        if (new Date(m.createdAt).getTime() < cutoffMs) continue
        const lower = m.text.toLowerCase()
        for (const term of BANNED_TERMS) {
          if (lower.includes(term)) {
            hits.push(`"${term}" in conv ${conv.id}: "${m.text.slice(0, 100)}"`)
          }
        }
      }
    }

    if (hits.length > 0) {
      await ctx.volty.staff.notify({
        userId: STAFF_USER_ID,
        message: `Daily QA scan: ${hits.length} message(s) in the last 24h matched a banned pattern. ${hits.slice(0, 5).join(' | ')}`.slice(0, 500),
      })
    }

    return { scanned, flagged: hits.length }
  },
})
