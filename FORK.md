# Fork maintenance

This is [tomsanbear/pi-cross-session](https://github.com/tomsanbear/pi-cross-session), derived from [gcoder1991/pi-cross-session](https://github.com/gcoder1991/pi-cross-session) at **`f7454db3531e05449eff295d25039655474c9680`** (upstream v2.4.0). That commit is the comparison baseline, not a moving upstream branch.

The fork adds cancellation-safe outgoing tools, sender-side receipt queries, bounded configurable queue retention, explicit recovery controls, safer authorization defaults, and goal-scoped direct pi-subagents support. It also maintains cross-version tests, CI, formatting and type-safety cleanup. See [README.md](README.md) for current user-facing behavior.

## Read only the detail needed

- **Changing behavior or reconciling upstream:** [.fork/changes.md](.fork/changes.md) records every functional, structural, tooling and documentation difference, with rationale and history.
- **Auditing completeness or resolving file conflicts:** [.fork/files.md](.fork/files.md) maps every changed path to its purpose, including formatting-only changes.
- **Verifying a change or checking a compatibility claim:** [.fork/verification.md](.fork/verification.md) records commands, dated evidence, failures and coverage limits.

## Maintenance contract

Every fork change must update this record in the same changeset: implementation, defaults, tests, dependencies, CI, formatting, documentation and upstream integrations all count. Update the relevant detail page rather than appending duplicate summaries here. Record intended behavior, why it differs from upstream, affected files, verification and any remaining limitation. Keep pending work distinct from completed work.

Run `./test/run-clean.sh run fork:check` to enforce changed-path coverage and local-link validity. The check includes both old and new paths for renames; semantic accuracy still requires reviewing the diff.

Before handoff, compare `git diff --name-status f7454db3531e05449eff295d25039655474c9680 HEAD` with the file inventory; also include staged, unstaged and new files in the current changeset. Deleted or renamed files need entries too. Update historical evidence with new results without presenting old CI runs as validation of new code. Keep this baseline unless an explicit upstream-integration entry explains its replacement.

The source and tests determine actual behavior; investigate discrepancies rather than using this record to override the code. [HANDOFF.md](HANDOFF.md) and the upstream HTML reports are historical evidence, not current fork policy. This record does not authorize installation, publication, broader permissions or changes outside this repository.
