# Bug log

Each entry: what broke, how it was caught, the fix. All found via live testing (`debug wake-sync` + `debug trace`, or a real automation run), not by reasoning alone.

## 1. Hot vs. warm misclassification (timeline phrasing)
**Caught:** `test-hot-lead-1/2` — a lead with budget 3,500 (≥ hotBudget 3,000) and timeline "hoping to start this month" was scored `warm`, not `hot`.
**Cause:** the model was reading timeline phrasing for *commitment confidence* ("hoping" sounds tentative) rather than calendar meaning (this month is clearly ≤30 days).
**Fix:** instruction added: apply the ≤30-day test mechanically on calendar meaning, "hoping to start this month" counts. Verified fixed on `test-hot-lead-3`. Superseded by A1 (deterministic scoring) — this class of bug can no longer happen at all once the rubric is a pure TS function the prompt doesn't touch.

## 2. Automation infinite-loop risk
**Caught:** Volty's own automation reviewer refused the first `leads-side-effects-*` submission.
**Cause:** the automation's own `rows.update` (to stamp a loop-guard timestamp) re-fires the `row.updated` event it listens for, with no termination condition.
**Fix:** `last_processed_status` column keyed on `contact_id:status` — a row already fully processed for its current state triggers no further write. Reviewer caught a second edge case (contact_id could theoretically change) on the next submission; fixed by keying on both.

## 3. PII tokenization on stored email
**Caught:** `test-hot-lead-4` — a visitor-typed email stored in `leads.email` came back as `"pii:em2o5fbvwdnzq4tj8t"`, not plain text.
**Cause:** an earlier Phase-1 finding (based on docs + a gallery template reading webhook-sourced data) wrongly concluded table storage is always plain text. It isn't, when the value is written live by the agent from conversation text.
**Fix:** none needed in code — `ctx.volty.messaging.compose` resolves a PII token directly, the same pattern documented for `phone.parse`. Doc corrected.

## 4. Vercel SSO/Deployment Protection blocking public access
**Caught:** inspecting the first production deploy's response — `deploymentProtection: ["vercel_authentication"]`.
**Cause:** Vercel's project default protects even production `.vercel.app` URLs unless a custom domain is used.
**Fix:** `vercel project protection disable landing-page --sso --yes` (asked the user first — a security-adjacent account setting).

## 5. `tables filter` has no "is empty" form
**Caught:** `lead-warm-followup`'s first `automations run-now` — failed with `tables filter is invalid: "eq" on "last_followup_at" needs a value`.
**Cause:** an unset cell stores no key at all, so `{op:'eq', value:null}` isn't a valid filter.
**Fix:** filter in code (`r.fields.last_followup_at === undefined`) instead of in the query's `where`.

## 6. Outbound email requires a paid plan (design-invalidating, not a code bug)
**Caught:** `lead-warm-followup`'s real run — `messaging.compose` to a raw email address failed with `channel_none`; `email setup` separately refused with `tier_feature_required`.
**Cause:** trial workspaces can't send email at all, contradicting an earlier (incomplete) Phase-1 finding that the pattern "just works" without a connected mailbox.
**Fix:** user decision — fall back to `staff.notify`; a human sends the actual follow-up using the email Nova already collected. Documented as a trial constraint for the case study.

## 7. Follow-up automation marked a reminder as "done"
**Caught:** Volty's reviewer, on the staff-notify fallback submission.
**Cause:** stamping `last_followup_at` when a reminder was *sent to staff* (not when the lead was actually followed up) permanently excludes a lead whose reminder staff ignored.
**Fix:** re-interpreted as "last reminder sent" and re-fires every `followupDays` of continued silence, instead of once-ever.

## 8. Scoring function checked `serviceOffered` before `escalateBudget`
**Caught:** `test-escalate-1` — a SGD 15,000/mo lead asking for a "full marketing overhaul" (no exact match in `services`) scored `not-fit` instead of `escalated`.
**Cause:** wrong order in `computeLeadStatus` — an unmatched service name short-circuited before the budget-escalation check ever ran.
**Fix:** escalateBudget checked first, "regardless of anything else" as originally intended. Added as a named regression test in `tests/score-lead.test.ts`.

## 9. Native `handoff.topics` preempts Nova's own turn
**Caught:** `test-escalate-1`/`test-human-1` — "talk to a human" and the budget-matching topic both triggered Volty's built-in hand-off (`conversations hand-to-team`) before Nova's own turn ran at all, so no `leads` row, no label, no staff notification via our pipeline.
**Cause:** a topic match in `inbox.ts`'s `handoff.topics` is a platform-level interception, not something the agent's own instructions can see or route around.
**Fix:** removed all native `handoff.topics`. Every escalation trigger (budget, explicit request, anger, legal) now goes through Nova's own judgment + the `leads` row + the automation — one path, no platform shortcut bypassing it. The lost safety net (auto draft-mode, SLA queue) is replaced by `stepBackMinutes` + the custom `hand-off-sla-safety-net` automation.

## 11. `volty push`/`pull` permanently blocked — "email address Volty no longer has on record"
**Caught:** `volty push --dry-run` started failing with `project push: This holds an email address that Volty no longer has on record (it was forgotten, or it is not from this workspace)...` after a batch of test runs. `volty pull` failed with the identical message.
**Diagnosis (extensive — ruled out in this order):** not my uncommitted files (reproduced with `git stash -u`, a byte-identical re-push of the last known-good commit); not the `careersEmail` param (reproduced after changing both its declared default in `params.ts` and its live value via `params set-value`); not contacts (reproduced after `debug sandbox-cleanup --all` removed all 13 synthetic contacts); not table rows (reproduced after clearing every `pii:` email token found across `leads`, including ones left orphaned by the contact cleanup); not companies or org members (both empty/clean).
**What does work:** single-target live ops — `instructions update`, `automations update-source`, `params set-value`, `rows.*`, `tables.*` — all continued to succeed throughout. Only the full-workspace-reconciliation path (`push`/`pull`, which diffs instructions+params+automations+tables+project files together) is affected.
**Root cause:** not identified after a timeboxed 30-minute second pass checking every remaining candidate: `email suppressions`/`email addresses` (both empty/clean — email was never set up on this trial), `canned-responses list` (empty), `sla-policies list` (clean, no stray recipients), `webhooks list` (empty, none created), `signatures list` (empty), `chat-flow get` on the website inbox (empty flow, params resolve cleanly including the now-fixed `careersEmail`), `account update` (no extra `emailAddresses`), `followups list` (empty), `automations runs` history for `lead-warm-followup` (no hit for the real test address), `widgets list`/`sources list` (clean, except the website source's own `createdBy.email` field — my real, valid account address, unlikely to be an unresolvable reference). `push --dry-run --json`/`--verbose`/`--debug` give no extra detail; `--verbose`/`--debug` aren't recognized flags at all. Not fixed; see `docs/VOLTY_BUG_REPORT.md` for the write-up filed with Volty.
**Workaround adopted:** deploy all further changes through the single-target live ops directly (`instructions update` for `org.md`-equivalent changes, `automations update-source` for automation code, `params set-value` for params) instead of `volty push`. This means the local project folder will drift from the live workspace state until push/pull work again — noted here so a future session doesn't trust a stale local pull.

## 13. Leads dashboard page — blocked, not just deferred
**Attempted:** item F (`pages/leads-dashboard`: funnel by status, handover rate, open knowledge gaps, latest test pass rate).
**Blocker:** pages have no live-deploy operation at all (`volty help` has no `pages` command group) — unlike instructions/automations/params, which all have a single-target live op working around the push/pull block, a page can only ship via `volty push`, which is down (bug #11). There's also no `pages` entry in the skills catalog (`volty skills view --name=pages` → not found), so there's no authoring reference to write the code correctly even speculatively.
**Status: not built.** Writing untested, undeployable, undocumented-syntax code would be guesswork with no way to verify it — listed under "what I'd improve with more time" instead of shipped as a guess.

## 12. Multi-service lead scored not-fit (found via simulated-user persona testing)
**Caught:** persona 2 (a clinic owner burned by a previous agency) said she wanted "Google Ads mainly, and maybe help with our website too" — Nova wrote `service_needed: "Google Ads, Website Design"`, which doesn't exactly match any single row in `services`, so the scoring function's `serviceOffered` check failed and a clearly-qualifying lead (budget 4000, timeline ~2 weeks) scored `not-fit` instead of `hot`.
**Cause:** the field-extraction instruction said "match to a services.name," but didn't forbid combining multiple services into the one field when a lead mentions more than one — and the deterministic scoring function only ever does an exact single-name match, by design (that's the whole point of A1).
**Fix:** instruction now says to pick exactly ONE service (whichever was emphasized most) and note any other mentioned service in `qualification_summary` only. This is exactly the kind of realistic multi-need phrasing the scripted single-need scenarios never would have surfaced — the value of the simulated-persona pass (Part 3.A).

## 10a. Test harness: fixed-wait race condition (test-infrastructure bug, not a Nova bug)
**Caught:** the first full 12-scenario batch reported 4 false failures (`status=undefined`, `labels=[]`) for scenarios that, on manual re-run in isolation, scored correctly.
**Cause:** `tests/run-scenarios.ts` waited a fixed 6s before grading end state. That was enough in isolation but not once several scenarios' automation triggers queued up back-to-back in a full batch.
**Fix:** poll for `row.status` (ceiling 20s) instead of a fixed sleep. All 5 previously-"failing" scenarios passed cleanly once re-run with the fix — confirming the earlier failures were the harness, not the product.
**Reinforced:** recurred during a `--runs=3` validation batch that happened to run concurrently with several other live deploys (`instructions update`, `automations update-source`, `tables update-column`) — `not-fit-low-budget` scored 1/3 instead of 3/3, then passed cleanly in isolation immediately after. The 20s ceiling isn't enough when other live ops are competing for the same backend queue. **Takeaway: never run a test batch at the same time as live deploys** — this isn't a flaw in the fix, it's an operating constraint on how this test harness is used.

**Mitigated: both paths converge.** Added `handoff-convergence.ts`, triggered on `conversation.assigned` (the event the native hand-off tool fires by assigning a staff member). It finds or creates the contact's `leads` row and writes `status: "escalated"` with a `qualification_summary` quoting the visitor's last message — nothing else. That write fires `row.updated`, which wakes the already-tested `leads-side-effects-updated` to apply the Contact Label and `staff.notify`, exactly as it does for every other escalation path. First version duplicated the label/notify logic directly in the new automation and Volty's reviewer caught a real race (both automations could notify the same row); fixed by removing the duplication and letting the one existing handler do it. Also fixed a real bug found in testing: `ctx.volty.conversations.get` returns the conversation object directly, not wrapped in `{ conversation: ... }` — the first deploy always read `contactId` as `undefined` because of this. **Verified live**: forced a `conversation.assigned` event with `conversations reassign-user` (same event the native tool produces) → row correctly escalated, quote captured, label applied, staff notified, all via the existing downstream automation. The prompt-level prohibition stays as the first line of defence; this is the second, independent of whether the first one holds.

## 10. Nova calls the native hand-off tool on her own initiative — non-deterministically
**Caught:** `test-human-1` (before the prohibition was added) and `test-sla-1` (**after** the prohibition was added and pushed) — same input, different behavior across two separate conversations.
**Cause:** `conversations.handToTeam` is available to Nova as a tool regardless of `handoff.topics`; an instruction not to use it was followed on one run and silently ignored on another.
**Fix:** moved the prohibition into Guardrails (higher-salience section) with explicit, repeated emphasis. **Not fully closed** — this is an LLM-reliability limitation, not something a single instruction change guarantees against. Flagged for the case study; the 3×-run test methodology exists partly to catch exactly this kind of non-determinism rather than assume one passing run generalizes.
**Recurred a 4th time** during the user's own manual testing (real browser conversation `y5315v1fwt9bj1s`, at `medium` effort): same pattern exactly — `conversations.handToTeam` called on "can i talk to someone," flipping the conversation to Draft reply mode. When the user sent a follow-up message, Nova reasoned "No reply sent: Acknowledgment of the team follow-up already arranged" and used `messaging.no-reply` — so the silence itself is correct (per Routing), but it was reached via the wrong mechanism (a native tool call the instructions explicitly forbid), and at the medium effort level the effort comparison had suggested might avoid this. It didn't. **This bug is not fixed by instruction wording or effort level alone** — logged as a known, unresolved limitation for the case study.
**Recurred a 3rd time** during the low-vs-medium effort comparison (`tests/effort-comparison.md`) — at `low` effort, isolated and reproduced cleanly. The same scenario passed cleanly at `medium` effort (no native tool call). One trial each, so not proof medium fixes it, but suggestive enough — combined with the asymmetric cost of missing it — to be part of the reasoning for recommending and applying `medium` workspace-wide.
