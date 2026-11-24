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
    label: 'Email address Nova points job-seekers to',
    default: 'careers@northwindcreative.sg',
  },
  slaMinutes: {
    type: 'number',
    label: 'Minutes an escalated lead may wait with no staff reply before a holding message + re-notify fires',
    default: 15,
  },
})
