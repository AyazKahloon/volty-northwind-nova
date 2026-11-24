import { defineAutomation, z } from '~/automation'

const CONVERSATION_ID = '2k6ckajbq0h222a'

// Throwaway: seeds one real agent-role message containing a banned term, to verify
// daily-qa-scan against real data (item 6b of the fix list). Delete after use.
export default defineAutomation({
  id: 'qa-scan-seed-test',
  trigger: { kind: 'schedule', cron: '0 0 1 1 *' },
  input: z.object({ intendedRunAt: z.string().optional() }),
  output: z.object({ sent: z.boolean() }),
  async run({ ctx }) {
    await ctx.volty.messaging.send({
      conversationId: CONVERSATION_ID,
      content: 'We guarantee you will get amazing results from our campaigns.',
    })
    return { sent: true }
  },
})
