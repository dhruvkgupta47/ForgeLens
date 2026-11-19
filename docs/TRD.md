# Technical requirements and design

## Components
- src/extension.js: commands, webview messaging, VS Code document edits, tool implementation, run lifecycle and approval handling.
- src/client.js: local TrueForge HTTP client. No model-provider network calls.
- src/bridge.js: authenticated stateless Streamable HTTP MCP endpoint on an OS-allocated 127.0.0.1 port.
- src/core.js: line diff hunks, original-offset reconstruction, confined paths, budget selection and incremental SSE parsing.
- src/agent.js: actual inline AgentSpec; all five editor tools loaded upfront; context compaction at 16,000 estimated input tokens.
- src/ui.js: nonce CSP, text-only rendering of model/repository data, accessible controls and native-theme styling.

## Data flow
Extension upserts its MCP manifest in TrueForge settings, creates an inline session, then posts user.message to /api/v1/sessions/{id}/turns with stream:true. TrueForge calls tools and emits model.message.delta, tool responses and tool.approval_required. Source model.message events are indexed so pending tool arguments can be resolved. propose_edit approval opens a proposal; each accept applies a hunk using WorkspaceEdit after comparing the current document to the expected snapshot. Once every hunk is decided the extension sends user.tool_approval and the MCP proposal tool acknowledges review. Rejected hunks are never materialized. Terminal tools have a separate explicit modal approval. Paused streams resume through subscribe with after_event_id.

## State and consistency
Run: idle -> running -> reviewing -> running -> done/error/cancelled. Only one run is accepted. AbortController stops network consumption; backend /cancel stops the actual TrueForge turn. Pending reviews wake and fail when cancellation clears the active run. Accepted changes remain on cancellation. New runs use fresh sessions and proposal IDs. Undo checks the exact after snapshot, restores the before snapshot, then cancels any remaining run to avoid stale proposals. Undo is available both through editor edit history and the explicit command.

Existing-file proposals may use a unique exact oldText/newText replacement; the editor constructs the full result from the current document and preserves surrounding text. Every resulting hunk still needs review. MCP returns actual accepted/rejected counts. Formatter changes after one hunk block further accepts based on the old snapshot, preventing the next hunk from overwriting formatting. Tools and pending reviews are bound to the originating run. Each run rotates its bridge credentials and port.

## Retrieval
Enumerate up to 4,000 permitted source/doc/config files, excluding generated/dependency folders. Score query terms, path matches, @file exact paths and @symbol text matches; extract up to 100 lines around the strongest line. Rank and pack whole snippets into the configured budget. Agent can request bounded additional search/read results. The UI records ranges, reasons and estimates. This is lexical retrieval; @symbol is not AST resolution. The context budget bounds assembly output, not cumulative tool history; TrueForge compaction handles history separately.

## Security boundaries
Loopback binding and ephemeral bearer credential protect MCP; browser Origin requests rejected. Realpath validation rejects traversal, drives, external symlinks, .git, .env* and key files. Webview renders untrusted values with textContent, never innerHTML. Commands are explicitly approved and are not sandboxed. Timeout is 60 seconds and output bounded. Shell descendants may outlive cancellation on some platforms: production hardening needs process-tree isolation. Secrets with arbitrary names can still be read; do not open private/employer repositories for this event.

## Resilience
Errors in the primary turn trigger a fresh inline session with the configured fallback model via TrueForge. No fallback after user-approved edits, to avoid duplicate mutations. Full task restarts rather than mid-turn migration. If both models fail, user sees a bounded error. Unexpected stream closures have a three-reconnect cap. No built-in provider key, model or fallback is assumed. Model capabilities remain provider dependent.

Before fallback, explicit per-minute 429 errors receive up to two cancellable waits and continuation turns in the same session. Daily quota errors and provider overload are not handled by this retry mechanism. Stream reconnects preserve the actual cursor and approval state; an empty response without turn creation is an error rather than success.

## Contracts and versioning
Verified against https://trueforge.dev/openapi.json and https://trueforge.dev/api/use-agent.md on 2026-11-16. Snapshot schemas are in schemas/trueforge-contract.json. TrueForge wire keys are snake_case. Pin the rehearsed TrueForge version in your final README before recording. No private SDK or invented REST paths.
