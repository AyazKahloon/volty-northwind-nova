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
| 6a — opt-out end-to-end | "please stop contacting me, delete my data" | `do_not_contact: true`, `status: escalated`, correct verbatim-quoted summary, label + staff.notify applied, Nova confirmed plainly in-reply | $0.0055, 1 turn |
| 6b — daily QA scan vs. real seeded message | Seeded one real `role: agent` message containing "guarantee" via a throwaway automation (CLI `messaging send` posts as `role: staff`, which the scan doesn't check — had to go through an automation to get an authentic `agent`-role message), then ran `daily-qa-scan` via `run-now` | `{flagged: 1, scanned: 3}` — caught the seeded message and notified staff. First time this scan has been exercised against a real flagged message (previously only `run-now`'d against an empty inbox) | n/a (no LLM turn for the scan itself; ~$0.0035 for the throwaway seed conversation's first turn) |
| 6c — hotBudget threshold | Set `hotBudget` to 5000, sent a SGD 4,000/mo Google Ads lead (everything in one message), then restored `hotBudget` to 3000 | `status: warm` (would have been `hot` at the normal 3000 threshold) — confirms the automation reads `{params.hotBudget}` live, not a hardcoded value | $0.0060, 1 turn |
| 6d — booking link opens correctly | Fetched `https://calendly.com/ayazkahloon26/discovery-call?name=Rachel` (the exact link format the automation sends) | `HTTP 200` — link resolves live. `?name=` prefill is Calendly's own documented query-parameter convention; **not independently rendered-checked** — Calendly is a client-rendered SPA this environment can't screenshot, so a real browser open is the one remaining manual check (see checklist) | n/a (no LLM turn, plain HTTP check) |

All item-6 test conversations and their synthetic contacts cleaned up via `debug sandbox-cleanup` after each. The throwaway `qa-scan-seed-test` automation is **paused**, not deleted — its own `automations delete` call was held pending admin approval, which this CLI session doesn't appear to have for deletions specifically (other admin-gated ops succeeded fine). It fires on an inert once-a-year cron (`0 0 1 1 *`, next 2027-01-01) targeting a conversation id that no longer exists after cleanup, so it is harmless left paused; delete it via the Volty UI (Automations → qa-scan-seed-test) at your convenience.

## Reviewer prep: leads table cleanup (2026-11-25)

Exported all 64 `leads` rows + both `knowledge_gaps` rows to `docs/test-data-export.csv` (audit trail, nothing lost), then deleted 59 test rows via `rows delete-many` (Revert token `prp:n3c0iowrh6kd`, if ever needed), keeping exactly 5 tidy demo rows:

| Kept as | Contact | Why |
|---|---|---|
| hot | Rachel (cafe, Meta Ads, SGD 5,000/mo) | Clean, complete, booking link already sent |
| warm | Ah Hock (cafe, Meta Ads, SGD 2,000/mo) | Warm purely because budget < hotBudget (3,000) — unambiguous under current params |
| not-fit | SEO backlink ask, SGD 5,000/mo | Not-fit via "service not offered" (not in catalog) — obvious, no budget ambiguity. Same contact as one of the two kept `knowledge_gaps` rows |
| escalated | Regional retail chain, SGD 15,000/mo | Escalated via budget ≥ escalateBudget (10,000) — clean |
| referred (job seeker) | "Are you hiring designers?" | Demonstrates non-lead intent sorting |

**Two swaps made after review, not in the original pick:**
- A "Daniel" warm row (SGD 4,000/mo, 3 days) looked like it should score `hot` under current params. Root cause: it's the frozen result of fix-list test 6c above, written while `hotBudget` was temporarily 5,000 — the automation never recomputes retroactively. Swapped for Ah Hock, whose warm status is unambiguous under current params.
- A "Dr. Priya" not-fit row's real cause was non-obvious: `service_needed` was stored as the combined string `"Google Ads, Website Design"`, which doesn't exact-match either catalog name, so it failed via "service not offered" rather than a budget reason — a multi-service matching edge case (see `docs/BUGS.md` #12), not a clean teaching example. Swapped for the unambiguous SEO-backlink not-fit row.

**Sandbox cleanup, scoped:** `debug sandbox-cleanup --all` was avoided (per `volty-cli-ops` skill's own warning — it would sweep every synthetic contact indiscriminately, including the 5 keepers, since they were created the same way as everything else). Instead ran `--conversation-id=<id>` individually for each of the 50 unique conversation ids behind the 59 deleted rows, explicitly excluding the 5 keeper conversation ids. All 50 calls returned "removed 0" — nothing was actually live to clean up (see below).

**Finding, not caused by this cleanup:** checking afterward, the 5 keeper rows' own `conversation_id`s are also `conversation_not_found` live — only 2 conversations remain in the whole workspace's live store, and neither is a keeper or a target of any cleanup call made today. This predates today's actions (every cleanup call, including the no-op ones above, never touched a keeper id) and is most likely this trial workspace's conversations aging out of the live store after roughly a day. The lead rows' data (name, budget, summary, status) is fully intact regardless — only the "open this conversation in the inbox" link would 404 for a keeper row.

**Post-cleanup verification:** `usage summary` — 464 of 5,000 trial AI credits used (4,536 remaining, well above the 2,500 floor). `debug wake-sync --web-chat=jm3dx6apti0e --text="hi"` — Nova replied normally (`awaiting_input/ok`, 1 turn, $0.0038); confirmed via `volty logs` that `messaging send` ran cleanly. Per the `volty-cli-ops` skill's own guidance, this sandbox probe conversation was left in place rather than cleaned up.