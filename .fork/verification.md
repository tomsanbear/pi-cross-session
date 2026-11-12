# Verification record

Read this when validating a change or assessing compatibility claims. The maintenance contract is in [FORK.md](../FORK.md); scope and file coverage are in [changes.md](changes.md) and [files.md](files.md).

## Commands

Install development dependencies with scripts disabled, then run the checks through the repository's isolation wrapper:

```sh
npm ci --ignore-scripts
./test/run-clean.sh run fork:check
./test/run-clean.sh run format:check
./test/run-clean.sh run typecheck
./test/run-clean.sh test
./test/run-clean.sh run smoke
git diff --check
```

`fork:check` needs Git history containing the baseline named in `FORK.md`; CI checks out full history. It checks changed-path coverage, duplicate/stale inventory entries and local documentation links. It does not prove that prose describes code accurately; review the actual diff as well.

SDK tests use private HOME/agent directories, a deterministic local provider and network-denial preloads. No paid model calls or live user settings are needed. `CROSS_TEST_NODE` can select an explicit supported Node executable.

## Live-inbox policy removal: 2026-11-12, version 3

The operator explicitly selected removal of all collaboration restrictions. Obsolete goal/continuation/authorization suites were deleted with those features; old cancellation/quota assertions were replaced by the selected retention/unrestricted-lifetime behavior. A lower test count is not presented as equivalent feature coverage. Retained transport, authentication, cleanup, strictness and independent host-permission checks still run.

Evidence collected during implementation:

- Three focused checks failed against v2: the goal/gate/resume surface still existed, RPC stopped at its lifetime cap, and busy preflight refused messages. Those checks pass under the live-inbox implementation.
- Real SDK 0.84.4 exposed a scheduling race: it can report idle while `before_agent_start` is still pending. A peer submission then overlapped the original prompt. A scheduling-only run reservation now holds admitted mail until settlement, without refusing mail, checking turn provenance or gating tools. The regression now requires queued admission and exact-once FIFO delivery.
- A delayed-registration shutdown probe reproduced a stale lifecycle callback marking a replacement inbox busy. Ignoring callbacks during teardown and resetting the scheduling reservation on startup corrected it; the probe now requires immediate submission on the replacement runtime.
- Retention tests cover abort, error, length, tool-use and unknown terminal outcomes, a simulated 24-hour queued wait, temporary SDK-state failure, 540 consecutive RPC messages and pending-ID protection across recent-cache eviction.
- Real SDK tests verify queued and fresh messages after cancellation without a local prompt, retry-backoff cancellation, automatic retry success, ordinary notifications, no Cross tool interception and preservation of a separate host permission extension.
- The first complete 0.84.4 run passed 81 tests with one version-specific skip. After adding SDK-state recovery and late-teardown regressions, final local verification passed **83 tests plus one version-specific skip on Pi 0.84.4**, and **84 tests with no skips on Pi 1.5.2** (Node 24.15.0, macOS).
- Both local SDK runs also passed strict typechecking, formatting, the 47-path fork-record check and both real CLI smoke variants. Package dry-run confirms version `3.0.0-fork.1`, packaged changelog/records and absence of the deleted authorization modules; no archive was created.

CI verification for this v3 change is pending its push. Earlier v2 runs below are historical evidence only.

## Historical implementation: 2026-11-11, `f3c3e49`

[Successful four-job CI run](https://github.com/tomsanbear/pi-cross-session/actions/runs/43119917131).

| Host                         | Full suite                             | Other checks                                              |
| ---------------------------- | -------------------------------------- | --------------------------------------------------------- |
| Pi 0.84.4, Node 22.19, Linux | 135 passed; 1 Pi-1.x-only case skipped | Typecheck, formatting, real CLI smoke, clean tracked tree |
| Pi 0.84.4, Node 24, macOS    | 135 passed; 1 Pi-1.x-only case skipped | Same                                                      |
| Pi 1.5.2, Node 24, Linux     | 136 passed; no skips                   | Same                                                      |
| Pi 1.5.2, Node 24, macOS     | 136 passed; no skips                   | Same                                                      |

Local macOS checks against both SDK versions also passed with the same counts. At this revision the record checker and later strict-cleanup tests did not yet exist; this run is not evidence that those later changes passed.

### Failures preserved and corrected

- Initial fork regressions: eight targeted cases failed before the behavior fixes (outgoing cancellation, scoped subagent controls/late ownership, receipt queries, retention, auto-resume and safe guard defaults); all passed after implementation.
- Cross-version fixture portability: the original fixture assumed a nested pi-ai package path. Initial attempts also exposed its import-only exports. Resolution now locates the SDK's actual package through Node's module API, without changing runtime dependencies.
- CLI boolean semantics: source inspection showed supported SDKs treat boolean flags as presence switches. Replaced the misleading `--cross-session-guard=false` CLI guidance with an explicit unsafe flag and real parsed-flag smoke assertions.
- [First CI run](https://github.com/tomsanbear/pi-cross-session/actions/runs/43119062341) and [second CI run](https://github.com/tomsanbear/pi-cross-session/actions/runs/43119423892): newer-SDK positive controls sometimes asserted before deferred genuine-user prompts executed. A deterministic held-`agent_settled` regression reproduced the early return. The shared command helper now waits for request-specific preflight acknowledgement and actual idle completion; original authorization assertions remain intact.

## Historical strict cleanup and fork record: 2026-11-11

Baseline evidence for this follow-up:

- Enabling indexed-access, exact-optional, unused-code and control-flow checks exposed compiler errors in queue removal, peer selection, regex groups and optional goal state.
- Four new focused tests failed against the previous implementation: unsafe source constructs, unchecked nested response identities, array-shaped adaptive continuation options, and malformed journal data causing `.includes` errors.
- Focused strict/Mesh/RPC checks passed after the initial corrections. Additional tests preserve valid revoked ownership when unrelated journal fields are malformed and verify bounded insertion-order eviction.

Local macOS verification with Node 24.15.0:

| Host      | Full suite                             | Other checks                                                                  |
| --------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| Pi 0.84.4 | 142 passed; 1 Pi-1.x-only case skipped | Strict typecheck, formatting, fork-record check, both real CLI smoke variants |
| Pi 1.5.2  | 143 passed; no skips                   | Same                                                                          |

The inventory checker covers all 46 changed paths. A temporary undocumented path was rejected in a negative-control probe, then removed; the clean inventory passed again. Package dry-run verified that `FORK.md`, `AGENTS.md`, all `.fork/` files, formatter configuration and new runtime helpers are included; no archive was created. `git diff --check` passed.

[CI run 43133611040](https://github.com/tomsanbear/pi-cross-session/actions/runs/43133611040) verified implementation commit `cde559066139a299ebe9bcd7ffd58b230b6dcaeb` on 2026-11-12 UTC (2026-11-11 local). All four matrix jobs passed: Linux/Node 22.19/Pi 0.84.4, Linux/Node 24/Pi 1.5.2, macOS/Node 24/Pi 0.84.4 and macOS/Node 24/Pi 1.5.2. The suite counts match the local table above. Each job also passed strict typechecking, formatting, fork-record coverage, both CLI smoke variants and the clean-tree check.

This evidence was added in a documentation-only follow-up; production code and tests are unchanged from the verified implementation commit. The older `f3c3e49` run remains historical evidence for the earlier implementation.

## Coverage boundaries

- Native Windows remains unverified. The named-pipe path tests do not establish Windows ACL or runtime behavior.
- Tool-interception tests use inert tools, not real workers or configuration mutations. They prove that this plugin no longer adds a gate, not that a model will obey sender qualification.
- A session must load the extension to register; native orchestrators still decide which extensions/tools their workers load. There is no special runtime-origin exclusion in v3. Same-account processes able to read tokens remain inside the transport trust boundary.
- Delivery remains same-machine and memory-only; no durable/offline queue, automatic retry or business-completion acknowledgement is claimed.
- Version 3 does not block peer-driven workflows or management tools. Independent host permissions remain in force; sender qualification is model guidance, not a semantic task-scope verifier or sandbox.
- JavaScript test fixtures and fork scripts are exercised, formatted and audited for unused code. That audit deliberately checks unused-symbol diagnostics only, not full SDK-interface typing of controlled stubs.
