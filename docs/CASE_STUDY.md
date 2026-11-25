# Nova — Case Study

## Summary

Nova is an AI agent that answers Northwind Creative's website chat, a fictional Singapore marketing agency. She talks to visitors, works out if they're a real lead, and hands qualified ones to a human — fast. In testing, her first reply landed in about 24 seconds, against an industry average of about 42 hours for B2B leads. All scripted test scenarios passed. Live testing found 13 real bugs, all fixed or clearly documented. Cost: about 2.8 AI credits (roughly $0.006) per conversation.

- **Try it:** https://landing-page-one-eta-54.vercel.app
- **Code:** https://github.com/AyazKahloon/volty-northwind-nova

## The problem

Small agencies lose leads because nobody replies fast enough — by the time a human sees the chat, the visitor has moved on. Staff also waste time on messages that were never going to become clients. Real visitors don't message like a form: they ask "how much?" first, write in Singlish, ask about jobs, or are vendors spamming their own services. A good agent has to handle all of that, not just a clean script.

## What I built

Nova is a chat agent that asks a few natural questions, works out what a visitor needs, and writes the facts to a table — a second system then decides what happens next.

- **Knowledge:** answers pricing/process only from real tables (services, FAQs, case studies) — never invents a number.
- **Tools:** writes one row per contact to a `leads` table — her only action. Never calls a hand-off tool herself.
- **Rules:** budget, timeline, and service decide hot/warm/not-fit/escalated — but tested code decides, not Nova.
- **Hand-off:** anger, legal topics, or "talk to a human" escalate the row; a safety-net re-pings staff if nobody replies in time.
- **Tests:** unit tests on the scoring code, scripted conversations, simulated personas, and an AI judge for tone and accuracy.

**The AI collects the facts; tested code makes the decisions.**

```
Visitor types a message
        │
        ▼
Nova asks questions, extracts facts (budget, timeline, service)
        │
        ▼
Lead row saved (no scoring yet)
        │
        ▼
Tested code scores it: hot / warm / not-fit / escalated
        │
        ▼
Action: booking link sent / staff told / lead declined
```

This split matters: an LLM can be inconsistent at arithmetic-like decisions. Plain code never is — same answer every time, and it's unit-tested.

## How I tested it

| Test type | Result |
|---|---|
| Scoring function (unit tests) | 22/22 passed |
| Scripted conversation scenarios (5 shown live) | 5/5 passed |
| Simulated personas (realistic, messy conversations) | 5/5 passed |
| AI judge review (tone, accuracy, no false promises) | 10/10 transcripts passed |
| Final 3×-repeat full suite | **Not yet run** — deliberately held back for manual testing first |

Three real bugs found by testing, not guessing:

1. **Scoring order bug:** a SGD 15,000/mo lead with no matched service name was marked "not a fit" instead of "escalate" — the code checked service match before budget. Fixed: budget-based escalation now checked first.
2. **Infinite loop risk:** the automation's own save could re-trigger itself forever. Fixed: it now checks whether this exact status was already saved, and stops if so.
3. **Agent bypassing the rules:** Nova sometimes used Volty's built-in "hand to a human" button instead of her one intended path, which skips the lead record entirely. Partly fixed (a second automation catches it either way) — **not fully solved**, logged as a known AI-reliability limit.

## What I'd improve

- **WhatsApp, with real follow-up messages** — right now, warm-lead follow-up just reminds a staff member, because this trial account can't send outbound email.
- **Calendly booking confirmations** — right now Nova sends the booking link but doesn't know if the visitor actually booked.
- **Separate Sales and Accounts teams** — right now one inbox handles both new leads and existing clients.
- **A built-in repeatable test runner inside Volty itself** — today the test suite lives outside the platform.
- **Platform limits hit along the way:** a workspace-wide bug blocked `push`/`pull` for most of this build (filed with Volty); outbound email isn't available on a trial account.
