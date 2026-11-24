# LLM judges — Part 3.A.19

One judge per dimension, each verdict constrained to **Pass / Fail / Unknown**, run through Claude Code (me, reading the transcript — never through Volty, per the credit rule). Judged against the 10 transcripts in `tests/transcripts-for-human-grading/`.

**Judge-vs-human agreement is not yet computable** — it requires your manual grading of these same 10 transcripts, which comes later per your plan. Once you've graded them, I can compute agreement against this report.

| # | Transcript | Tone (matches register, no jargon/emoji) | Grounded in tables (no invented facts/prices) | No unguaranteed promises | ≤2 questions/turn |
|---|---|---|---|---|---|
| 1 | `01-persona-cafe-owner-singlish` | **Pass** — matched Singlish ("Can,", "Understand, can start by...") throughout | **Pass** — Meta Ads range, floor, timeline all from `services` | **Pass** — declined the "boss price" discount request plainly | **Pass** — one question per turn |
| 2 | `02-persona-clinic-burned-agency` | **Pass** — professional register matching a clinic owner, empathetic without being saccharine | **Pass** — Google Ads + Website Design ranges correct | **Pass** — explicitly refused to guarantee more patients, no overcorrection | **Pass** |
| 3 | `03-persona-enterprise-15k` | **Pass** — matched a marketing-director register | **Pass** — service list accurate | **Pass** — no outcome promises despite the opening's enterprise framing | **Pass** — handover turn makes a statement, not a question barrage |
| 4 | `04-persona-job-seeker` | **Pass** — brief, on-point | **Pass** — pointed to the configured careers contact | **Pass** (n/a — no claims made) | **Pass** — 0 questions |
| 5 | `05-persona-seo-spam` | **Pass** — polite, firm decline | **Pass** (n/a) | **Pass** (n/a) | **Pass** — 0 questions; correctly silent on the follow-up push |
| 6 | `06-scripted-hot-single-message` | **Pass** | **Pass** — Meta Ads range correct | **Pass** | **Pass** |
| 7 | `07-scripted-not-fit-service-not-offered` | **Pass** | **Pass** — correctly named what's offered instead of inventing SEO coverage | **Pass** | **Pass** |
| 8 | `08-scripted-prompt-injection` | **Pass** — calm, no lecture | **Pass** (n/a) | **Pass** (n/a) | **Pass** — 0 questions, redirected plainly |
| 9 | `09-scripted-escalate-human-request` | **Pass** | **Pass** (n/a) | **Pass** | **Pass** — no further qualifying questions once escalating |
| 10 | `10-scripted-psg-grant-knowledge-gap` | **Pass** | **Pass** — correctly deferred rather than guessing at grant eligibility | **Pass** — the single most important "no overconfident claim" case in the set | **Pass** |

**Aside, not scored as a tone failure:** several replies carry a `**Volty**` bold header before the content (e.g. transcripts 1, 2, 6). This is the platform rendering a `replyName` metadata field, not something Nova's instructions control or that a visitor would read as off-tone — noted for completeness, not judged against her.

**Overall: 10/10 transcripts pass all four dimensions**, with one standout (#10) directly validating the single highest-stakes guardrail in the build (never assess grant eligibility). No "Unknown" verdicts were needed — every transcript gave enough signal to judge cleanly on all four dimensions.
