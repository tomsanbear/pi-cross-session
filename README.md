# pi-cross-session — maintained fork

Same-machine messaging between independent [Pi](https://github.com/earendil-works/pi) sessions. Discover a session by name and Git worktree, send it a message, and check its receipt without sending again. No daemon, database, cloud service, or additional runtime dependencies.

This is [tomsanbear's fork](https://github.com/tomsanbear/pi-cross-session) of [gcoder1991/pi-cross-session](https://github.com/gcoder1991/pi-cross-session), based on v2.4.0. The upstream npm package does **not** contain these changes. This fork is Git-installable and marked private to prevent accidental npm publication.

## Install

Requires Node **22.19+**. Tested with Pi **0.84.4 and 1.5.2** on macOS and Linux; native Windows remains unverified.

```sh
pi install git:github.com/tomsanbear/pi-cross-session
```

Or try the checked-out extension without installing:

```sh
pi -e ./extensions/cross-session.ts
```

Do not load the upstream package and this fork together: both register the same tools and commands. Installing an extension gives it the permissions of the Pi process; inspect the source first.

## Send a message

Name each independent session with `/name backend`, `/name frontend`, etc. Then ask Pi:

> Tell the backend session that the order API moved to /v2.

Pi uses `list_pi` to find the exact session and `send_pi_message` to send plain text. Type `@` in the TUI to select an explicit `@name [ref]` target. Names may collide; runtime IDs and name/ref pairs disambiguate them.

| Entry point | Purpose |
| --- | --- |
| `/peers`, `/list-pi`, `list_pi` | List live sessions, busy/idle state, cwd, Git worktree/branch/HEAD and addressing metadata |
| `send_pi_message` | Send to a name, session ID, runtime ID, or `name [ref]`; optional receiver-issued `goalId` |
| `get_pi_message_status` | Query the exact receiver runtime and message ID returned by a send; never resend |
| `peer_goal` | Start, bind, inspect, complete or cancel one locally authorized collaboration goal |
| `/cross-session-status` | Local queue, receipt and remaining-budget diagnostics |
| `/cross-session-resume` | Explicitly reopen reception after cancellation; never replay dropped messages |
| `/cross-session-budget <1–4096>` | Set remaining unscoped message allowance while idle; does not reopen reception or restore goals |

A message to an idle receiver can start a model turn. A message to a busy receiver stays in this extension's memory queue, **not** Pi's steering queue. After a confirmed successful settlement, the receiver submits one queued message at a time. Preflight/unknown busy states refuse admission rather than guessing.

### Receipts are not completion acknowledgements

- **`queued`**: accepted into volatile memory. Fork receivers include `expiresAt` in the send receipt. Cancellation, expiry, shutdown or a crash can still discard it.
- **`submitted`**: Pi's synchronous `sendMessage` returned. This is not proof of model execution, a reply, or task completion.
- **`accepted`**: an explicitly enabled trusted in-process RPC listener claimed the message. Not a storage acknowledgement.
- **`unknown`**: the receiver has no retained receipt for this sender/message pair. Not proof of non-delivery.

After a lost receipt or timeout, use `get_pi_message_status` with the **exact `target.instanceId` and `messageId`** from the send result/error. Queries are sender-qualified, do not trigger a turn and do not spend the communication budget. A restarted sender or receiver cannot recover old receipts. Do not automatically retry an uncertain send.

Outgoing tool cancellation now reaches discovery and socket exchange. Cancellation observed before message exchange reports `cancelled_before_send` / `not_sent`. Once exchange is underway, cancellation conservatively reports `receipt_unknown`; it cannot retract remote work.

## Configuration and recovery

| CLI flag | Default | Behavior |
| --- | --- | --- |
| `--cross-session-inbound=accept\|refuse` | `accept` | Invalid values refuse inbound messages |
| `--cross-session-guard=true\|false` | **`true`** | Gate known delegation/configuration tools in unscoped peer turns. Explicit `false` restores upstream's permissive behavior; not recommended |
| `--cross-session-queue-ttl-seconds=600` | **600** | Busy queue retention, integer **30–3600 seconds**; invalid configuration disables registration |
| `--cross-session-auto-resume` | `false` | Reopen reception only after the next clean genuine local-user turn |
| `--cross-session-rpc` | `false` | Enable trusted Host EventBus send/info/received contracts |

An observed abort or unsafe terminal settlement closes reception, drops pending messages and revokes the collaboration goal. The footer shows **peers paused**. `/cross-session-resume` reopens the inbox after settlement. With auto-resume enabled, a successful genuine user turn also reopens it; peer messages, extension notifications and failed turns cannot. Neither path replays messages, renews goals or replenishes budget.

Unscoped sends and inbound admissions share an initial **256-unit allowance per runtime**. Settling or resuming does not refill it. The footer warns when low; the local user can explicitly set a new allowance with `/cross-session-budget`. This command does not reset deduplication, rate limits or the separate trusted-RPC request cap. Receiver-confirmed goal-scoped messages are exempt from the lifetime allowance, but rejected or uncertain attempts still cost budget.

## Goal-scoped collaboration

The receiving Host must have a locally user-authorized objective before a peer can drive delegated work:

```text
Host:   peer_goal { action: "start", objective: "Repair the age metric and verify it" }
        → goalId
Host:   peer_goal { action: "bind", goalId, peerIds: ["<worker runtime ID from list_pi>"] }
Worker: send_pi_message { target: "<Host runtime ID>", goalId, message: "Continue verification" }
Host:   peer_goal { action: "complete", goalId }
```

The Host sends its runtime ID and returned goal ID to the worker in an ordinary coordination message. Binding is recipient-local, not mutual. A goal ID alone grants nothing: the receiver verifies the authenticated sender's exact session and runtime membership.

Only a genuine local user turn can start a goal. Peers cannot bind collaborators, widen the immutable objective, schedule work, change permissions/configuration or revive cancelled work. One goal is active at a time. Normal assistant completion does not end it; explicitly complete or cancel it before unrelated work. Reload, session replacement, shutdown, cancellation and unsafe settlement revoke it.

### pi-subagents support

A bound peer can:

- call `subagents_enable`;
- launch a **direct** `subagent` with an explicit `agent` and `task`, including async execution;
- `resume`, `steer`, `interrupt`, `stop`, `command.cancel` or `command.yield` an **exact goal-owned run**;
- use read-only status/list/guide actions without gaining mutation authority.

The adapter recognizes public top-level parameters and `options` aliases, rejects conflicting identities, and records returned `runId`/`asyncId` handles before later notifications can acquire unrestricted authority. Resumes returning a new ID keep the same owner. Late results, including error receipts containing launched handles, retain revoked ownership. `subagent-notify` messages with `details.runs` remain goal-scoped across reload.

Existing handles can be bound by the local Host using `peer_goal bind` with `subagentRunIds`. Mesh uses `runIds`; the upstream Direct `Agent` tool uses `agentIds`. Namespaces are separate.

**Limits:** peer-scoped raw/named workflows and agent-management/scheduling actions remain blocked. A workflow can internally control unrelated runs without another observable tool call, so this adapter does not pretend to enforce its scope. Start such workflows from a genuine user turn instead. Launch options have an explicit allowlist in `lib/subagents.ts`; unknown options fail closed.

Managed pi-subagents children do not register independent peer inboxes. The extension captures the documented `PI_SUBAGENT_CHILD=1` marker per instance at factory time; Mesh children retain their runtime-identity query exclusion. Workers use their native supervisor/intercom facilities; this extension connects independent parent sessions, not a second child orchestration system.

Goal membership is not a semantic verifier or Bash sandbox. The model must still keep task content within the authorized objective, and the host permission system remains responsible for destructive/security confirmations.

## Transport and security

- Registration: `0600` JSON under Pi's agent directory (`peers/<instanceId>.json`), refreshed every 30 seconds and removed on orderly shutdown. Contains a bearer token; public tool listings omit it.
- POSIX transport: `0600` Unix socket in a `0700` per-UID, agent-directory-namespaced runtime directory. Owner checks and symlink rejection protect against other OS users and accidental path substitution.
- Windows transport: named pipe with the upstream v2.2.0 naming scheme. Token secrecy depends on registration-directory ACLs; this extension does not set or validate those ACLs.
- Protocol: authenticated JSONL hello, then one message or status request and its correlated receipt. Queue and goal capabilities are negotiated; no unsafe compatibility fallback.
- Bounds: 1 MiB per raw frame; 64 incoming connections; 50 queued messages; per-sender burst 30/refill 0.5 per second; sender/scope-qualified 30-second same-text suppression; 512 recent receipt/dedup entries; five-second exchange deadline including socket vetting. Message timestamps must still be fresh within 30 seconds at admission; queue retention is a separate setting.
- Same-account processes that can read registration tokens can impersonate peers. This is an explicit OS-user trust boundary, not a same-user sandbox.
- No endpoint is exported through shared `process.env`. Managed child detection is routing/lifecycle policy, not an authentication boundary.

The RPC bridge remains opt-in transport/admission only. Reserved bridge envelopes are never submitted to a model without a synchronous trusted Host handler claiming them. Existing Mesh continuation permits remain process-local and revocable. Historical upstream schemas and design notes are in [HANDOFF.md](HANDOFF.md); this README and the implementation describe fork behavior where they differ.

## Development

```sh
npm ci --ignore-scripts
./test/run-clean.sh run typecheck
./test/run-clean.sh test
./test/run-clean.sh run smoke
./test/run-clean.sh run format:check
```

The runner discovers Node/npm instead of hardcoding an author's installation. `CROSS_TEST_NODE=/absolute/path/to/node` selects another Node. Tests run under a private HOME/agent directory with model/network access blocked; do not bypass the wrapper for SDK tests. Fixtures resolve the SDK's actual pi-ai dependency rather than assuming a nested npm layout.

CI covers Node 22.19/24 and Pi 0.84.4/1.5.2 on Linux/macOS. Tests distinguish controlled extension-context fixtures, real SDK/local-provider IPC tests and actual separate OS processes. The pi-subagents adapter tests use inert tools matching its public contract: they do **not** launch real workers or prove every future plugin version compatible.

Source responsibilities:

- `lib/protocol.ts`: wire types, byte-bounded framing, validation and delivery errors.
- `lib/subagents.ts`: public pi-subagents argument/receipt adapter and scope policy.
- `lib/peer-goal.ts`: ephemeral grants and journal-backed task ownership/revocation.
- `lib/mesh-continuation.ts`: upstream trusted Mesh continuation permits.
- `extensions/cross-session.ts`: discovery, sockets, admission, SDK lifecycle and UI integration.

Formatting uses Prettier (development-only); no runtime dependency was added. Native Windows verification, durable offline delivery and automatic message retry are not provided.

## License

[MIT](LICENSE). Original author: gcoder1991.
