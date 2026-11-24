# Test results (1x run)

Run at 2026-11-24T14:13:23.226Z

| Scenario | Pass rate | Avg cost | Failures |
|---|---|---|---|
| hot-single-message | 1/1 | $0.0074 | - |
| warm-good-fit-not-ready | 1/1 | $0.0057 | - |
| not-fit-low-budget | 1/1 | $0.0064 | - |
| escalate-big-budget | 1/1 | $0.0067 | - |
| escalate-explicit-human-request | 1/1 | $0.0064 | - |

Total cost: $0.0325
Credits spent this batch: 14
Credits per conversation: 2.8
Avg time to first reply: 23.6s
Avg time from status=hot/escalated to staff notification: 17.5s (industry B2B average lead response: ~42 hours = 151200s)

## Fix-list verification runs (2026-11-24, ad hoc, not part of the 1x suite above)

| Item | Scenario | Result | Cost |
|---|---|---|---|
| 1 — handoff convergence | Forced `conversation.assigned` via `conversations reassign-user` on a real test conversation | Row escalated, correct quote, label + staff.notify applied via the existing `leads-side-effects-updated` handler | n/a (no LLM turn) |
| 2 — booking link without lag | `hot-single-message`-style turn (Meta Ads, SGD 5,000/mo, this week, decision maker, name + email, all in one message) | Automation sent recap + `?name=`-prefilled booking link in the same run that first computed `hot`; `booking_link_sent_at` stamped; Nova's next-turn reply correctly did not resend the link | $0.0075, 2 turns |
| 3 — careersEmail / push bug | Set live `careersEmail` to the real address, swapped `params.ts`'s default for the same plain literal, retried `push --dry-run`; then isolated further by swapping both live value and default for a non-email placeholder and retrying again | Still blocked, identical error both times — confirms (a 2nd time) that `careersEmail` was never the cause of bug #11, and no new root cause found | n/a (no LLM turn) |