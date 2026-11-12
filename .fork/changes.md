# Changes from upstream

Comparison baseline and maintenance rules: [FORK.md](../FORK.md). This is a cumulative record, including nonfunctional changes. Current installation and tool usage belong in [README.md](../README.md).

## Delivery and recovery

Introduced in `241b07d`; CLI correction in `69b561b`.

- **Outgoing cancellation:** `send_pi_message` forwards its tool signal through discovery and exchange. Cancellation checked before message exchange reports `cancelled_before_send` / `not_sent`, without remote submission. Cancellation after exchange begins remains conservatively `receipt_unknown`; it cannot retract work or justify automatic retry. Cancelled discovery no longer reaps peers as a side effect.
- **Receipt queries:** added `get_pi_message_status` using the existing authenticated status wire request. Requires the exact receiver runtime and message ID, remains sender-qualified, triggers no model turn and spends no communication allowance. `unknown` is not proof of non-delivery.
- **Queue retention:** separated the unchanged 30-second admission timestamp freshness check from busy-queue retention. The latter defaults to 600 seconds and is configurable from 30–3600 via `cross-session-queue-ttl-seconds`. Invalid configuration prevents registration. Queued receipts expose `expiresAt`; storage remains volatile and bounded to 50 messages.
- **Recovery:** opt-in `cross-session-auto-resume` reopens reception only after a successful genuine local-user turn. It never replays dropped messages, restores grants or refills allowance. Manual `/cross-session-resume` shares the reopening path. The footer reports paused reception and low allowance; cleanup clears its status.
- **Allowance:** `/cross-session-budget <1–4096>` lets an idle local user explicitly set remaining unscoped allowance. Initial 256-unit allowance, scoped-traffic exemption, rate/dedup limits and the separate RPC-request cap remain. The command does not reopen the inbox or renew a goal.

## Authority and pi-subagents

Introduced in `241b07d`; explicit CLI opt-out finalized in `69b561b`.

- **Guard defaults:** known unscoped peer delegation/configuration tools are gated by default rather than permitted. Added `subagents_enable` to known authority-bearing tools. An explicit SDK `cross-session-guard=false` or CLI `cross-session-unsafe-peer-tools` restores legacy unscoped behavior. Cancelled, unknown and goal-scoped restrictions remain even in that mode; completing a scoped goal cannot turn that same peer turn into unrestricted authority.
- **CLI correction:** supported SDKs treat boolean flags as presence switches, including `--flag=false`. The unsafe opt-out therefore has its own flag. `/cross-session-status` reports effective guard, queue retention and auto-resume settings. Real CLI smoke tests verify parsed values, not just manually injected fixture flags.
- **Direct pi-subagents adapter:** added `lib/subagents.ts` for explicit direct launches, exact goal-owned run controls and read-only actions. Top-level/`options` aliases are normalized; conflicting IDs and unreviewed launch/control options fail closed. Read-only actions do not grant mutation authority.
- **Ownership:** `peer_goal bind` accepts a separate `subagentRunIds` namespace. Successful launches/resumes associate `runId`/`asyncId` with the originating goal. Error receipts with launched handles also retain ownership; they do not renew permission. Completion `details.runs` is recognized so late or reloaded notifications retain revoked scope. Mesh and Direct `Agent` ownership remain separate.
- **Child exclusion:** capture `PI_SUBAGENT_CHILD=1` at extension factory time so managed children do not register independent inboxes. Other Hosts in the same PID are unaffected by later process-environment changes. Mesh's existing identity query remains supported. This is lifecycle policy, not an authentication boundary.
- **Deliberate boundary:** peer-scoped raw/named workflows, scheduling and agent-management mutations remain blocked. Internal workflow actions cannot all be scoped through observable tool calls; genuine local-user workflow launches remain available. The adapter is not a semantic verifier, Bash sandbox or replacement for native supervisor/intercom communication.

## Structure, packaging and tooling

Introduced in `241b07d`; formatting isolated in `b853a21`; CI action versions updated in `f3c3e49`.

- Extracted wire types, framing, validation and delivery errors into `lib/protocol.ts`; extracted the pi-subagents adapter into `lib/subagents.ts`.
- Reworked `PeerGoals` into readable methods and a single journal scan per ownership lookup rather than nested scans. No persistent unbounded ownership cache or grant recovery was added.
- Applied Prettier to **all** extension/library TypeScript and test/support JavaScript. Files listed as formatting-only in [files.md](files.md) have no intended behavior change.
- Added pinned development-only Prettier 3.6.2, its configuration and format/check scripts. No runtime dependency was added.
- Marked the package private and ESM, set version `2.5.0-fork.1`, and pointed repository metadata at this fork. Corrected stale lockfile version metadata. Bounded host peers to Pi/TUI `>=0.84.4 <2` and TypeBox `^1.3.25`; retained the existing baseline development SDK. These ranges are not proof that every intermediate host version has been tested.
- Included all `lib/**/*.ts` in typechecking, not only library modules reachable from the extension entry point.
- Made `test/run-clean.sh` discover Node/npm independently and check the minimum Node version, preserving isolated HOME/agent directories and network denial. Removed the original author's hardcoded Node/npm layout.
- Resolved the SDK's actual pi-ai package rather than assuming nested npm installation. Test defaults follow the enabled guard; TTL-expiry tests explicitly select 30 seconds instead of assuming the old default. SDK-version labels now reflect the host actually used.
- Added least-privilege, SHA-pinned GitHub Actions verification on Linux/macOS, Node 22.19/24 and Pi 0.84.4/1.5.2. Compatibility installs do not rewrite the lockfile; jobs assert no tracked files changed.
- Rewrote README for fork installation, current behavior, compatibility and honest security/delivery limits. Preserved upstream license/author attribution and historical reports without treating those reports as current policy.

## Regression and fixture changes

Introduced in `241b07d`, extended in `69b561b` and `f3c3e49`.

- Added focused fork regressions for cancellation before/during discovery, scoped direct launches and exact controls, late/error ownership, query isolation, retention bounds, unsafe configuration, recovery, budget commands, default guards, revoked-goal opt-out restrictions and per-instance managed-child detection.
- Added cancellation-after-transmission coverage: uncertain receipt, one transmission, no retry.
- Added real SDK/local-provider tests with an inert pi-subagents-shaped tool, including resume ownership and denial of old completion authority after reload. These are adapter-contract tests, not real worker launches.
- Extended CLI smoke to default and explicit flag variants, querying effective status and verifying real registration plus normal EOF cleanup without model/network use.
- **CI-discovered fixture race:** Pi 1.x may report idle and return from `prompt()` while a prompt is deferred behind `agent_settled` handlers. The command helper now awaits that request's preflight acknowledgement and actual idle completion. A deterministic held-settlement regression failed before this correction and passed after it; peer-denial and genuine-user positive-control assertions were not weakened. This new regression is skipped only on the older SDK where the deferred behavior does not apply.

## Fork record and strict-cleanup follow-up

Implemented in `cde5590` after `f3c3e49`; local checks and all four CI jobs passed. A documentation-only follow-up records that completed CI evidence in [verification.md](verification.md), without changing the verified source or tests.

- Added root `FORK.md` as the concise entry point; `.fork/` holds this complete change ledger, the exhaustive path inventory and verification evidence.
- Added `AGENTS.md` and a README pointer so future changes discover the maintenance contract without loading all detailed history by default.
- Added `.fork/check.mjs` and `fork:check` to compare every changed path against the fixed baseline, including staged/unstaged/new files, reject duplicate/stale entries and check local documentation links. CI fetches full history and runs it. The package includes `FORK.md`, `.fork/`, `AGENTS.md` and formatter configuration; formatting now covers maintained documentation, metadata and CI as well as source/tests.
- Enabled `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, unused-local/parameter checks, implicit-return/override checks, switch fallthrough and side-effect-import checks, and unreachable-code/unused-label errors across all production TypeScript. Existing `strict` remains enabled; `skipLibCheck` still excludes third-party declaration checking. The no-emit project now permits explicit `.ts` imports, which also keep native Node test imports resolvable.
- Replaced all explicit `any` types and non-null assertions in production code with validated unknown values, stable socket/server references, guarded peer/regex/queue selection and checked collection eviction. Removed the unused admission rollback interface/implementation and an obsolete project-specific comment. No runtime dependency was added.
- Added `lib/validation.ts` for reusable record/string/integer guards. Wire response guards now validate nested peer identity and PID, not just the surrounding response. Registration, RPC, bridge, display, managed-identity and completion-correlation boundaries no longer rely on unchecked object casts. Bridge extension fields remain preserved.
- Mesh continuations validate unknown requests and adaptive options, rejecting array-shaped objects and unsafe/ineligible run counts. Validated plan metadata is saved at authorization time rather than reparsed through `any` during issuance. Existing fixed/adaptive scope, generation, claim and revocation behavior remains covered.
- Journal ownership parsing rejects malformed fields without throwing and conservatively retains valid exact revoked ownership from otherwise malformed entries. It never restores grants. Valid entries retain the normal fast path.
- Added `lib/collections.ts` for bounded insertion-order eviction shared by dedup/rate/confirmation caches. The shared helper validates its limit and guards iterator exhaustion rather than asserting a value exists.
- Added `test/strict.test.mjs`: AST-based bans on explicit `any`/non-null assertions, suppression-directive checks, malformed wire/continuation/history regressions, negative-ownership preservation and collection-bound tests. Existing behavior assertions remain intact. A TypeScript-compiler unused-code audit also covers every JavaScript fixture and fork script: removed two unused imports and two unused helper arguments, and marked an intentionally unused callback slot. The audit checks unused-symbol diagnostics only; it does not misrepresent controlled JavaScript stubs as fully typed SDK implementations.

## Commit history

| Commit    | Purpose                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `241b07d` | Delivery, authority, adapter, queue/recovery, module extraction, tests, packaging and initial CI        |
| `b853a21` | Repository-wide source/test formatting, kept separate from behavior changes                             |
| `69b561b` | Explicit unsafe CLI opt-out, effective-settings diagnostics and parsed-flag smoke coverage              |
| `f3c3e49` | Deferred-prompt fixture synchronization, deterministic regression and current pinned CI actions         |
| `cde5590` | Complete fork record, strict runtime boundaries, source/fixture hygiene and seven new regression checks |

Git history is the exact patch record. This ledger explains decisions and coverage; it does not replace the diffs.
