# Changelog

## 3.0.0-fork.1

**Open sessions stay reachable.** Cancelling a turn or encountering an error no longer closes the inbox, drops queued correspondence or requires a local user prompt to reopen it. Admitted messages have no queue expiry and drain in order once the session settles.

Removed plugin-level goal authorization, sensitive-tool gates, Mesh continuation permits, managed-child exclusions and lifetime messaging/RPC quotas. Every message still identifies its sender and states that it is not user approval. The host's own permissions are unchanged; sender qualification is model guidance, not a sandbox.

### Upgrade

- Update and `/reload` **all participating sessions**. The new `live-inbox-v1` capability intentionally refuses older cancel/drop semantics before transmission.
- Remove launch flags `--cross-session-guard`, `--cross-session-unsafe-peer-tools`, `--cross-session-auto-resume` and `--cross-session-queue-ttl-seconds`. They no longer exist.
- `peer_goal`, `goalId`, `/cross-session-resume` and `/cross-session-budget` are removed. Use plain `send_pi_message` calls. Mesh adapters that require the removed Cross continuation permits need their own authorization path.
- Queued messages may start a new model turn after Esc ends the current turn. Stop receiving by closing the session or explicitly setting `--cross-session-inbound=refuse`.
- Queues remain memory-only: reload, session replacement, shutdown or crashes can lose pending messages. Already submitted SDK work is not retractable.

Authentication, private IPC, message/frame validation, rate limits, a 50-message pending bound, deduplication and bounded diagnostics remain. RPC now limits simultaneous requests and retained recent IDs rather than total lifetime calls. Registration refresh errors retain the live inbox and appear in diagnostics.

The complete history, rationale and verification are maintained in [FORK.md](FORK.md) and `.fork/`.
