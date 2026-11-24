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

## 10. Nova calls the native hand-off tool on her own initiative — non-deterministically
**Caught:** `test-human-1` (before the prohibition was added) and `test-sla-1` (**after** the prohibition was added and pushed) — same input, different behavior across two separate conversations.
**Cause:** `conversations.handToTeam` is available to Nova as a tool regardless of `handoff.topics`; an instruction not to use it was followed on one run and silently ignored on another.
**Fix:** moved the prohibition into Guardrails (higher-salience section) with explicit, repeated emphasis. **Not fully closed** — this is an LLM-reliability limitation, not something a single instruction change guarantees against. Flagged for the case study; the 3×-run test methodology exists partly to catch exactly this kind of non-determinism rather than assume one passing run generalizes.
