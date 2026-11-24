// The values an admin may change in the app without a push: each has a type, a label and a default.
// Written by volty pull. The values admins set stay in the app; an inbox's own params are in its inbox.ts.
import { defineParams } from '~/params'

export default defineParams({
  hotBudget: {
    type: 'number',
    label: 'Hot lead budget threshold (SGD/mo)',
    default: 3000,
  },
  escalateBudget: {
    type: 'number',
    label: 'Escalate-to-human budget threshold (SGD/mo)',
    default: 10000,
  },
  followupDays: {
    type: 'number',
    label: 'Days of silence before a warm lead gets an email nudge',
    default: 3,
  },
  brandName: {
    type: 'text',
    label: 'Brand name Nova uses in conversation',
    default: 'Northwind Creative',
  },
  bookingUrl: {
    type: 'text',
    label: 'Discovery-call booking link (e.g. Calendly) sent to hot leads',
    default: 'PLACEHOLDER_NEEDS_REAL_CALENDLY_LINK',
  },
  careersEmail: {
    type: 'text',
    // Still gets tokenized the instant Volty stores it (confirmed live: even this literal
    // becomes `pii:...` the moment it's set) — see docs/BUGS.md #11. That tokenization is not
    // itself what blocks `push`, though: push kept failing with the identical "no longer has on
    // record" error even after this value AND its live override were both swapped for a
    // non-email placeholder, which rules out careersEmail as the cause. The real source is
    // almost certainly dangling `pii:` tokens left in table data (e.g. `leads.email`) by sandbox
    // test contacts that `debug sandbox-cleanup` later deleted — a workspace-wide `push` scans
    // everything, not just this file. Kept as a real literal here since the type intent is a
    // real email either way, and the live value (set via `params set-value`, not push) is
    // correct and in effect regardless of whether push ever works.
    label: 'Email address Nova points job-seekers to',
    default: 'careers@northwindcreative.sg',
  },
  slaMinutes: {
    type: 'number',
    label: 'Minutes an escalated lead may wait with no staff reply before a holding message + re-notify fires',
    default: 15,
  },
  // NOT YET LIVE: declaring a new param needs `volty push`, which is blocked (docs/BUGS.md #11).
  // Business hours are hardcoded as plain text in instructions/org.md for now (still editable
  // live via `instructions update`) — this declaration is ready to deploy once push is fixed,
  // at which point the hardcoded text should be replaced with {params.businessHours} reads.
  businessHours: {
    type: 'text',
    label: 'Business hours Nova quotes for after-hours follow-up (e.g. "Mon-Fri 10:00-18:00 SGT")',
    default: 'Mon-Fri 10:00-18:00 SGT',
  },
})
