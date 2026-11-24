/**
 * Pure, deterministic lead-scoring function. No I/O, no ctx, no randomness.
 *
 * IMPORTANT — platform constraint, not a design choice: a Volty automation may import only
 * `~/automation` (defineAutomation/z/phone), so this function cannot be imported by
 * automations/leads-side-effects-created.ts / -updated.ts. Those files carry a byte-identical
 * COPY of this function's body. If you change the logic here, copy the change into both
 * automation files too (see the comment at the top of each). This file exists so the logic has
 * one buildable, unit-testable home (tests/score-lead.test.ts) — duplication is the accepted
 * cost of testability under that single-import constraint, not an oversight.
 */

export type LeadScoringInput = {
  monthlyBudgetSgd: number | null
  timelineDays: number | null
  serviceOffered: boolean
  minViableBudget: number | null
  hotBudget: number
  escalateBudget: number
}

export type LeadStatus = 'hot' | 'warm' | 'not-fit' | 'escalated'

/** Returns null when there isn't yet enough information to decide. */
export function computeLeadStatus(input: LeadScoringInput): LeadStatus | null {
  const { monthlyBudgetSgd, timelineDays, serviceOffered, minViableBudget, hotBudget, escalateBudget } = input

  // Escalation-tier budget wins over everything, INCLUDING an unmatched service name: a
  // SGD 15k/mo "full marketing overhaul" is clearly worth a human's attention even though it
  // doesn't match one of the four named services exactly. Checking serviceOffered first was a
  // real bug caught in live testing (test-escalate-1) — it sent that lead to not-fit instead.
  if (monthlyBudgetSgd !== null && monthlyBudgetSgd >= escalateBudget) return 'escalated'
  if (!serviceOffered) return 'not-fit'
  if (monthlyBudgetSgd === null) return null
  if (minViableBudget !== null && monthlyBudgetSgd < minViableBudget) return 'not-fit'
  if (monthlyBudgetSgd >= hotBudget && timelineDays !== null && timelineDays <= 30) return 'hot'
  return 'warm'
}
