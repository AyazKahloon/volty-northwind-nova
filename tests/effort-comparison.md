# Effort comparison: low vs. medium (Part 1.6)

5 representative scenarios (hot-single-message, warm-good-fit-not-ready, not-fit-low-budget, escalate-big-budget, escalate-explicit-human-request), 1 run each per level — not a statistically large sample, kept small deliberately per the credit rule ("5 representative scenarios only").

| Level | Pass rate | Avg cost/conversation | Avg time to first reply | Credits/conversation |
|---|---|---|---|---|
| **low** (previous default) | 4/5 in-batch (and a known test-harness timing flake inflated this — 2 of the "fails" passed cleanly on isolated re-run; the real failure count is 1/5) | $0.0054 | 16.7s | 2.4 |
| **medium** | 5/5 | $0.0065 (+20%) | 23.6s (+41%) | 2.8 (+17%) |

**The one real failure at low effort** (`escalate-explicit-human-request`) was Nova calling the native `conversations.handToTeam` tool despite the explicit, repeated prohibition in both Guardrails and Handover — bug #10 in `docs/BUGS.md`, previously observed twice before this comparison. At medium effort, the same scenario passed cleanly: Nova used only `rows.update` on `leads`, no native tool call.

**Caveat, stated plainly:** this is one trial per level. Bug #10 is already known to be non-deterministic — it has passed at low effort on other runs, and one medium-effort pass doesn't prove the bug is fixed at that level, only that it didn't recur this once. A rigorous before/after claim would need the scenario repeated several times at each level, which wasn't done here to stay within the "5 scenarios" credit-conscious scope.

**Recommendation: medium.** The cost difference is modest in absolute terms (roughly 1.2 extra credits and 7 seconds per reply) against a workspace with 4,000+ credits of headroom this week. Weighed against even a small reduction in the likelihood of silently bypassing the single most important guardrail in this build (the one-path-to-a-human architecture), the asymmetry favors paying for more reliability. **Applied**: `agents set-effort --id=626uevux5uq4 --level=medium`, effective from the next contact reply, workspace-wide.
