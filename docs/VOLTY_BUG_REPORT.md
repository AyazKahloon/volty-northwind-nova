# Bug report: `volty push`/`volty pull` permanently blocked by an unresolvable email reference

## Symptom

`volty push --dry-run` (and `volty pull`) in a previously-working project folder started failing on every invocation with:

```
volty: project push: This holds an email address that Volty no longer has on record (it was forgotten, or it is not from this workspace), so it cannot be sent or used. Ask the contact for it again, or write it out in full.
```

(`project pull` for the pull-side error, same message otherwise.) The error gives no resource id, file, or field name — nothing to act on directly.

## Environment

- Workspace: `3vdy1kmdwel0` (renamed to "Northwind Creative" mid-session), Plus trial.
- `volty` CLI, Windows, via Git Bash.
- Reproduced consistently over roughly 45 minutes of retries and diagnosis; still present at time of writing.

## Steps to reproduce

We don't have a minimal repro — this emerged organically during a multi-hour build session. The closest thing to a trigger we can point to:

1. An automation (`lead-warm-followup`) called `ctx.volty.messaging.compose({ to: { kind: 'email', value: '<a real address>' }, ... })` and failed with `channel_none` (no email channel configured on this trial — a separate, expected refusal, not itself a bug).
2. The automation was rewritten to avoid email entirely (`staff.notify` instead) and redeployed successfully.
3. A mix of `debug wake-sync` test conversations (creating synthetic contacts whose chat messages included typed email addresses, which Volty tokenizes into `pii:` references on storage) and `debug sandbox-cleanup` calls (both per-conversation and `--all`) followed.
4. At some point after this, `volty push --dry-run` on an otherwise-unchanged project folder started returning the error above, and has returned it on every attempt since (dozens of retries, across both `push` and `pull`, with and without local file changes).

## What we ruled out

Each of the following was checked and confirmed clean, yet the error persisted after each check:

- **Local project files**: reproduced the error on a byte-identical re-push of the last known-good commit (`git stash -u` to remove every uncommitted/untracked file first).
- **Params**: changed both the declared default (in `params.ts`) and the live value (`params set-value`) of the one text param that happened to hold an email-shaped string (it had been silently auto-tokenized to a `pii:` reference on first use — see the related finding below). Error persisted after both changes.
- **Contacts**: ran `debug sandbox-cleanup --all`, removing all 13 synthetic contacts in the workspace. Error persisted (`contacts list` confirmed 0 contacts afterward).
- **Conversations**: 0 remained after the cleanup above.
- **Table rows**: found and cleared every `pii:` email token across the one table (`leads`) that stored emails, including several now-orphaned by the contact purge above. Error persisted.
- **Companies, org members**: both empty/clean (`companies list`, `org list-members`).
- **Email setup/suppressions/addresses**: email was never set up on this trial (`email addresses` confirms `setUp: false`); `email suppressions` reports nothing being skipped.
- **Canned responses, SLA policies, webhooks, email signatures, chat-flow, follow-ups, account settings, automation run history, widgets, sources**: all checked via their respective read ops; all clean or unremarkable. The one plain-text email found anywhere (`sources list`'s `createdBy.email` on the auto-created website source) is the real account owner's own valid address — not an orphaned or unresolvable one.
- **`--json`/`--verbose`/`--debug` on `push`**: `--json` gives no additional detail beyond the same message; `--verbose` and `--debug` are not recognized flags at all (`volty: usage: volty push [dir] [--env <target>|all] [--dry-run] [--confirm] [--json]`).

## What does still work

Every single-target live operation continued to succeed throughout, both before and after the above: `instructions update`, `automations update-source`/`approve`, `params set-value`, `rows.insert`/`update`/`query`, `tables create`/`update-column`/`update`, `contacts.update`, `staff.notify`, `widgets create`/`update`, `debug wake-sync`/`trace`/`sandbox-cleanup`. Only the full-workspace-reconciliation path — `push` and `pull`, which diff instructions + params + automations + tables + project files together in one pass — is affected.

## Related finding (possibly a contributing factor, not confirmed as root cause)

A `text`-type param whose **default value** is an email-shaped string (e.g. `default: 'careers@example.com'`) gets silently auto-tokenized into a `pii:` reference the first time it's read or displayed (`params list` shows `pii:em...` instead of the literal string, even for a value that was never typed by a real contact — just a static default in source). We worked around this by changing the default to a non-email-shaped placeholder string and setting the real value live via `params set-value` instead of via the declared default. This did not, on its own, resolve the push/pull block, but it seems like a plausible category of bug adjacent to the one reported here: an email-shaped value with no real contact behind it ending up as an unresolvable token somewhere in the system.

## Workaround adopted

We've stopped using `volty push`/`volty pull` for this project and now deploy every change through the single-target live ops listed above instead (`instructions update` for instruction text, `automations update-source` for automation code, `params set-value` for params). To avoid the local project folder silently drifting from the live workspace state while push/pull are unusable, we wrote a snapshot script (`scripts/snapshot-live.ts`) that reads the live state back into the repo via those same read ops after every change, so version control stays accurate without relying on `pull`.

## Suggested fix

1. **Name the resource in the error.** The single biggest gap: the error gives no id, table, column, field, or record type — just "this holds an email address," with no way to find out what "this" refers to. Even a resource type + id would have turned a 45-minute blind diagnostic into a 2-minute fix.
2. **Offer a way to clear/resolve it directly**, e.g. a `volty <resource> clear-stale-reference` or similar, once the resource is identified — rather than requiring the admin to either guess-and-check every candidate subsystem or wait for the affected record to time out/expire on its own.
3. **Consider whether auto-tokenizing a static param *default* is correct at all** — a default declared in source isn't a real contact's PII; tokenizing it (and then being unable to resolve that token later) seems like the wrong behavior for a value that was never actually typed by a person.
