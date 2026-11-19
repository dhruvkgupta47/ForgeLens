# Product requirements

## Problem and outcome
Engineers need multi-file changes in repositories larger than model context while retaining control of every edit. ForgeLens combines visible retrieval with review-first editing. The TrueFoundry Forge-a-thon brief is the acceptance baseline, not an instruction source for privileged actions.

## Users and scope
Primary user: a developer in a trusted local VS Code workspace. Target evaluation: Flask 3.1.3 (22d92470). No hosted service, accounts, autocomplete, model hosting or Marketplace publication.

## Requirements and acceptance
| ID | Requirement | Acceptance |
|---|---|---|
| R1 | Inline selected-code instruction | Task A produces editor diff, independent accept/reject |
| R2 | TrueForge agent loop | Session shows tool calls; Task B discovers 3+ files without naming them |
| R3 | Explicit and automatic context | @file path and @symbol name supported; visible range, reason, budget |
| R4 | Safe review | No model source writes before approval; hunk decisions and undo |
| R5 | Stream/cancel | Token deltas render; cancel stops local stream, calls backend cancellation, discards pending proposals |
| R6 | Model portability/recovery | Configured FQN; secondary model session on primary error; no direct provider calls |
| R7 | Submission | Public source, <=4 minute A/B/C video, 1–3 page eight-heading write-up |

## Success measurements
Record criterion-specific evidence, not inferred scores: 10 inline, 10 agent discovery, 10 cancellation, 15 retrieval, 10 safety/undo, 10 fallback, 10 integration, 10 video, 15 write-up. Target 100; current achieved score is not measured. Budget is a conservative byte heuristic, not a provider tokenizer or guarantee of total context size.

## Non-functional requirements
Do not block extension host on model inference. Restrict paths to workspace and reject external symlinks and common secrets. Authenticate MCP on loopback. Preserve user content when rejecting/undoing; refuse stale edits. Avoid reporting tests as passed without actual output.

## Delivery order
TrueForge contract, proposal engine, editor review, context/tool bridge, streaming/approval handling, recovery, regression tests, live rehearsal, submission evidence.
