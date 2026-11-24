import { button, defineChatFlow, message } from '~/chat-flow'

// D28: quick-path buttons for service choice and budget brackets, ahead of Nova. One
// near-duplicate budget step per service is required — Flow: Level 1 is data-only (no
// variables/functions/loops per the format spec), so this can't be written as a loop. The path
// walked is itself readable by Nova once handed off ("volty reads the saved answers and the
// path"), so no explicit save is needed for which buttons were tapped.
export default defineChatFlow({
  start: 'welcome',
  steps: {
    welcome: message({
      say: 'Hi! What are you looking for help with?',
      buttons: [
        button('Meta Ads', 'budgetMeta'),
        button('Google Ads', 'budgetGoogle'),
        button('Social Media Mgmt', 'budgetSocial'),
        button('Website Design', 'budgetWebsite'),
        button('Something else', 'volty'),
      ],
      otherwise: 'volty',
    }),
    budgetMeta: message({
      say: "Good choice! What's your rough monthly budget for Meta Ads?",
      buttons: [
        button('Under $1k/mo', 'volty'),
        button('$1k-3k/mo', 'volty'),
        button('$3k-10k/mo', 'volty'),
        button('$10k+/mo', 'volty'),
      ],
      otherwise: 'volty',
    }),
    budgetGoogle: message({
      say: "Good choice! What's your rough monthly budget for Google Ads?",
      buttons: [
        button('Under $1k/mo', 'volty'),
        button('$1k-3k/mo', 'volty'),
        button('$3k-10k/mo', 'volty'),
        button('$10k+/mo', 'volty'),
      ],
      otherwise: 'volty',
    }),
    budgetSocial: message({
      say: "Good choice! What's your rough monthly budget for Social Media Management?",
      buttons: [
        button('Under $1k/mo', 'volty'),
        button('$1k-3k/mo', 'volty'),
        button('$3k-10k/mo', 'volty'),
        button('$10k+/mo', 'volty'),
      ],
      otherwise: 'volty',
    }),
    budgetWebsite: message({
      say: "Good choice! What's your rough budget for Website Design?",
      buttons: [
        button('Under $1k', 'volty'),
        button('$1k-3k', 'volty'),
        button('$3k-10k', 'volty'),
        button('$10k+', 'volty'),
      ],
      otherwise: 'volty',
    }),
  },
})
