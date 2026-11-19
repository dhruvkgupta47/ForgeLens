# Round 1 write-up source (complete only after live verification)

## 1. Team
TODO: members, college/employer and GitHub handles. Never submit placeholder identity.

## 2. Starting point
From scratch. No upstream editor fork or inherited agent loop. Dependency versions in package-lock.json; MIT project licence.

## 3. Architecture on TrueForge
VS Code is a TrueForge HTTP client. Tools are served by a local authenticated MCP endpoint. TrueForge controls model/tool iterations and approval pauses. Per-hunk UI decisions precede approval acknowledgements. Deferred tool loading reduces eager schema context; assemble_context is preloaded. Compaction bounds long-running history. Session evidence: TODO actual session ID and screenshot.

## 4. How context is selected
Lexical path/text matching with exact @file and text-based @symbol boosts. Up to 100 lines per candidate; score-ordered packing into a default 8,000 estimated-token budget. UI shows ranges and reasons. No embeddings/AST index; no guarantee that total session context stays within retrieval budget.

## 5. Model setup
TODO actual models, providers/endpoints, locations, run cost and measured failures. Users configure models in TrueForge and choose FQNs in VS Code settings. Optional fallback creates a fresh TrueForge session after primary failure before edits are accepted.

## 6. Scorecard
| Criterion | Video timestamp | Observed claim |
|---|---|---|
| A1 Inline edit | TODO | Per-hunk accept/reject |
| A2 Agent mode | TODO | Three files discovered without filenames |
| A3 Streaming/cancel | TODO | Tokens stream; cancellation preserves workspace |
| B1 Context | TODO | Budget and selection reasons visible |
| B2 Safety | TODO | Review then undo |
| B3 Resilience | TODO | Automatic configured-model fallback |
| B4 Integration | TODO | MCP approvals and deferred tools in session |
| C1 Video | TODO | A/B/C complete and verified |
| C2 Write-up | This document | Decisions, evidence and limitations |

## 7. Tools used
OpenAI Codex with Caveman and Ponytail instructions; npm, VS Code APIs, TrueForge, MCP SDK, diff, express, zod and esbuild. Update with every tool actually used.

## 8. Known limitations and what you would do with another month
Lexical retrieval; one workspace folder; process-local undo/proposal storage; commands run with user permissions; limited reconnect recovery; ephemeral connector cleanup is manual. Next: process-tree isolation, symbol-aware retrieval, durable recovery, robust reconnect bounds and a wider model/repository test matrix.

Export to a 1–3 page PDF after replacing TODOs and verifying evidence. This source is not a finished submission PDF.
