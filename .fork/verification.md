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

## Verified implementation: 2026-11-11, `f3c3e49`

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

## Strict cleanup and fork record: 2026-11-11

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

CI evidence for this follow-up is pending its push. The older `f3c3e49` run above is historical, not evidence for this code.

## Coverage boundaries

- Native Windows remains unverified. The named-pipe path tests do not establish Windows ACL or runtime behavior.
- pi-subagents integration uses inert tools matching the public argument/receipt/notification contract. It does not launch real worker models or validate every future pi-subagents version.
- Managed-child identity is lifecycle policy, not authentication. Same-account processes able to read tokens remain inside the trust boundary.
- Delivery remains same-machine and memory-only; no durable/offline queue, automatic retry or business-completion acknowledgement is claimed.
- Peer-scoped workflows and unknown management actions remain blocked deliberately. The fork is not a semantic task-scope verifier or arbitrary-tool sandbox.
- JavaScript test fixtures and fork scripts are exercised, formatted and audited for unused code. That audit deliberately checks unused-symbol diagnostics only, not full SDK-interface typing of controlled stubs.
