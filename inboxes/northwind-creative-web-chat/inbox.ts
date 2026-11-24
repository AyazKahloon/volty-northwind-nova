// The Northwind Creative Web Chat inbox: hours, reply targets, hand-off, priority guide, routing, Volty's reply mode and its web chat.
// Written by volty pull from the live inbox. Who works the inbox, team members and channels stay in the app.
import { defineInbox } from '~/inbox'

export default defineInbox({
  name: "Northwind Creative Web Chat",
  icon: null,
  autoEnrollOrgMembers: false,
  businessHours: null,
  idleClose: {
    afterMinutes: 1440,
    owned: false,
  },
  firstResponseMinutes: 60,
  // Empty by design: a topic match here preempts Nova's own turn entirely before she can write
  // anything, which was verified live to skip the leads row, the escalated label and staff
  // notification for "talk to a human" (see docs/BUGS.md). Every escalation trigger — budget,
  // explicit human request, anger, contracts/legal — now goes through Nova's own instructed
  // judgment + the leads-side-effects automation instead, keeping one single path. The lost
  // safety net (automatic draft-mode switch, SLA queue) is replaced by stepBackMinutes below
  // (silence after a staff reply) and the hand-off-sla-safety-net automation (SLA breach).
  handoff: {
    targetMinutes: 60,
    topics: [],
    tellContact: true,
  },
  priority: {
    smartPriority: "off",
    smartSegments: "off",
    guide: {
      high: null,
      medium: null,
      low: null,
    },
  },
  routing: {
    mode: "rules_only",
    policy: null,
    openCap: null,
    rules: [],
  },
  volty: {
    agent: "Volty",
    defaultResponder: true,
    replyMode: "live",
    afterHoursReplyMode: null,
    window: null,
    liveForNewContacts: true,
    stepBackMinutes: 5,
    newContactWindowDays: null,
    waitExtends: false,
    selfStepDown: null,
  },
  webChat: {
    name: "Northwind Creative Web Chat",
    cardTitle: "Northwind Creative",
    launcherLabel: "Let's chat",
    icon: "chat",
    greeting: "Hi there 👋 How can we help?",
    prefillBody: "Hi, I saw {page} on your website and would like to know more.",
    prefillFallback: "Hi, I saw your website and would like to know more.",
    primaryColor: "#2563eb",
    position: "bottom-right",
    defaultCountry: "SG",
    allowedDomains: [
      "landing-page-one-eta-54.vercel.app",
    ],
    font: "inter",
    showBranding: true,
    googleAnalytics: false,
    logo: null,
    requireEmailCode: false,
    verifyPhone: false,
    verifyEmail: false,
    handoffWhatsapp: true,
    handoffEmail: true,
    askTiming: "after",
    headline: {
      first: null,
      second: "What can we help your business with?",
    },
    openingStyle: "aurora",
    heroImage: null,
    lookMatched: true,
    startName: "off",
    startEmail: "off",
    startPhone: "off",
    startFields: [],
    handoffWhatsappNumber: null,
    handoffEmailAddress: null,
  },
  quickPaths: {
    enabled: false,
    channels: [
      "web",
    ],
  },
})
