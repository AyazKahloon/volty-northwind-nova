import { describe, expect, it } from 'bun:test'
import { computeLeadStatus, type LeadScoringInput } from '../lib/score-lead'

const BASE: LeadScoringInput = {
  monthlyBudgetSgd: null,
  timelineDays: null,
  serviceOffered: true,
  minViableBudget: 1200,
  hotBudget: 3000,
  escalateBudget: 10000,
}

function i(overrides: Partial<LeadScoringInput>): LeadScoringInput {
  return { ...BASE, ...overrides }
}

describe('computeLeadStatus', () => {
  it('service not offered -> not-fit, even with no budget known', () => {
    expect(computeLeadStatus(i({ serviceOffered: false }))).toBe('not-fit')
  })

  it('REGRESSION (test-escalate-1): unmatched service name + escalation-tier budget -> escalated, not not-fit', () => {
    // A $15k/mo "full marketing overhaul" doesn't match any of the four named services, but
    // the budget alone must still pull in a human. Caught live before this test existed.
    expect(computeLeadStatus(i({ serviceOffered: false, monthlyBudgetSgd: 15000, timelineDays: 5 }))).toBe('escalated')
  })

  it('service not offered, budget below escalateBudget -> not-fit', () => {
    expect(computeLeadStatus(i({ serviceOffered: false, monthlyBudgetSgd: 5000, timelineDays: 5 }))).toBe('not-fit')
  })

  it('no budget yet, service offered -> null (not enough info)', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: null }))).toBeNull()
  })

  it('budget below the service floor -> not-fit', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 500, timelineDays: 10 }))).toBe('not-fit')
  })

  it('budget exactly at the service floor, below hot, long timeline -> warm', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 1200, timelineDays: 10 }))).toBe('warm')
  })

  it('budget just below the service floor -> not-fit', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 1199, timelineDays: 10 }))).toBe('not-fit')
  })

  it('budget >= hotBudget, timeline <=30 days -> hot', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 3500, timelineDays: 14 }))).toBe('hot')
  })

  it('budget exactly at hotBudget, timeline exactly 30 days -> hot', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 3000, timelineDays: 30 }))).toBe('hot')
  })

  it('budget >= hotBudget but timeline 31 days -> warm', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 3500, timelineDays: 31 }))).toBe('warm')
  })

  it('budget >= hotBudget but timeline unknown -> warm', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 3500, timelineDays: null }))).toBe('warm')
  })

  it('budget >= hotBudget but timeline very long (180 days) -> warm', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 5000, timelineDays: 180 }))).toBe('warm')
  })

  it('budget between floor and hotBudget, short timeline -> warm (budget gates hot, not timeline alone)', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 2000, timelineDays: 5 }))).toBe('warm')
  })

  it('budget >= escalateBudget -> escalated, regardless of timeline', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 15000, timelineDays: 5 }))).toBe('escalated')
  })

  it('budget >= escalateBudget -> escalated, even with no timeline known', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 12000, timelineDays: null }))).toBe('escalated')
  })

  it('budget exactly at escalateBudget -> escalated', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 10000, timelineDays: 10 }))).toBe('escalated')
  })

  it('budget just below escalateBudget, hot otherwise -> hot, not escalated', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 9999, timelineDays: 10 }))).toBe('hot')
  })

  it('no service floor known (minViableBudget null) and tiny budget -> warm, not not-fit', () => {
    // When we can't find the service's floor (data issue), don't punish the lead for it.
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 50, timelineDays: 10, minViableBudget: null }))).toBe('warm')
  })

  it('no service floor known, budget hits hot+timeline -> hot', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 3500, timelineDays: 10, minViableBudget: null }))).toBe('hot')
  })

  it('zero budget -> not-fit (treated as a real, very low number, not as unknown)', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 0, timelineDays: 10 }))).toBe('not-fit')
  })

  it('negative timelineDays (bad extraction) still scores on budget; hot if budget qualifies', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 3500, timelineDays: -1 }))).toBe('hot')
  })

  it('timelineDays = 0 ("today") counts as <=30 -> hot when budget qualifies', () => {
    expect(computeLeadStatus(i({ monthlyBudgetSgd: 3500, timelineDays: 0 }))).toBe('hot')
  })
})
