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
    // Default deliberately NOT an email literal: an email-shaped param default gets tokenized
    // by Volty, and push then fails on every future push with "no longer has on record" since
    // that token can't resolve to a real contact. Found live, blocked all pushes until fixed —
    // see docs/BUGS.md. Set the real address with `params set-value` after push, not here.
    label: 'Email address Nova points job-seekers to (set live via params set-value, not here)',
    default: 'not yet set — ask an admin to set careersEmail',
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
