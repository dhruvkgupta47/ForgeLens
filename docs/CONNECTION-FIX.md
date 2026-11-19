# Connection fix, 17 November 2026

Live checks confirmed that http://localhost:8790/api/v1/models responds, while http://127.0.0.1:8790 refuses the connection. TrueForge is running now; the earlier native SQLite launch failure is historical, not the current blocker.

Set ForgeLens Base URL to http://localhost:8790. Replace the literal FQN in Model with a configured name such as google-gemini/gemini-3-5-flash. Clear Fallback Model for the first test. These names were read from the live TrueForge model list; provider credentials and quota have not been verified by an inference call.

Install forgelens-0.1.1.vsix, then run Developer: Reload Window. Version 0.1.1 refreshes the configured URL between runs, defaults to localhost, rejects placeholder model names, validates names against TrueForge, and includes the target URL in connection errors. Thirteen automated tests passed.

Open the calculator folder, run ForgeLens: Open Agent and repeat the explanation-only request before proposing an edit.


## Version 0.1.2 connector fix
Connector PUT must target /api/v1/settings/mcp-servers (collection), with manifest.name in the body. This was verified against the running 0.185.1 server's /api/v1/openapi.json. Live connector registration now reaches the correct route; TrueForge then reports Outbound URL blocked for host 127.0.0.1. Restart the existing server in the same terminal with OUTBOUND_URL_ALLOWED_HOSTS set to the JSON array ["127.0.0.1"]. Preserve its existing SQLITE_PATH and other environment variables so configured keys/models remain available. Do not disable the outbound guard globally.

After restart, scripts/check-trueforge.cjs can validate registration, tool discovery and session-spec acceptance without inference or editing source. It creates temporary resources and cleans them up. Full model-driven behavior remains unverified.


## Version 0.1.3 stateless transport fix
The MCP bridge intentionally uses stateless Streamable HTTP. The SDK optionally probes GET /mcp for a standalone SSE stream; this must respond 405 Method Not Allowed, not Express's default 404. Authenticated GET and DELETE now explicitly return 405 with Allow: POST. Unauthorized and browser-origin requests remain rejected. POST continues to support normal MCP operations and streamed responses. This fixes the reported Failed to open SSE stream: Not Found error without adding unnecessary stateful sessions.


## Version 0.1.4 deferred tool approval
Live session evidence showed that TrueForge deferred tool discovery wraps propose_edit inside its built-in call_tool function, with mcp_server, tool_name and input. ForgeLens previously recognized only direct propose_edit calls and automatically denied the wrapper. Approval now resolves direct and deferred calls, and checks the deferred target against the attached editor MCP server before opening review. A regression test exercises the actual event processor through pending review, unchanged file before consent, accept, approval reply and undo. A second test rejects wrappers targeting another MCP server. No provider or allowlist changes are required for this fix.


## Version 0.1.5 review panel lifecycle
Opening a native diff hides the agent webview. Without retainContextWhenHidden, VS Code destroys the hidden document and recreates its initial HTML on return, losing the visible pending proposal even while the extension still waits for review. The panel now retains its context. A ready-message handshake also replays authoritative status, context, bounded transcript/tool evidence and pending proposals if the document is recreated. A regression test recreates the message sink, confirms pending review and unchanged source, restores twice without duplicate transcript, then accepts and undoes the edit. Run state is still process-local; a full Developer: Reload Window cancels the old run and requires a fresh request.


## Version 0.1.6 undo snapshot fix
Undo previously compared the editor's actual contents against the model's unnormalized replacement string. VS Code can normalize inserted LF newlines to CRLF and run format-on-save participants, so this produced a false stale-file error after a successful edit. Acceptance now snapshots the actual document after apply and again after save. Subsequent hunk checks and undo use that snapshot. Save failures leave the accepted edit recorded and report the save failure rather than marking an already-applied hunk pending. Regression tests cover LF model text applied to a CRLF document, format-on-save, exact restoration, and refusal to overwrite a genuine later user edit. Undo history is process-local; install/reload loses older undo entries, so rehearse with a fresh edit after updating.


## Version 0.1.7 connector identity and multi-window isolation
Live metadata showed seven different forgelens-PID connectors all targeting port 8792. Bearer tokens are per-instance, so a stale endpoint or cached connector can produce a 401 against another instance's bridge. Each extension instance now listens on a fresh OS-allocated loopback port and registers a random per-instance connector name with its own bearer token. Agent definitions and deferred approval checks use that same connector identity. The legacy bridgePort setting is ignored and marked deprecated; the TrueForge server URL is unchanged. Tests start two simultaneous bridges, confirm unique ports/names/tokens, reject a cross-instance credential, and verify authenticated tool calls reach the intended workspace. Existing old connectors can remain until manually cleaned up; no running connector was deleted.


## Version 0.1.8 inline scope and truncated-file protection
A model proposed only a prefix of helpers.py as complete file content, deleting 582 unrelated lines after approval. Inline mode now captures immutable file contents and selection offsets, requires selectionOnly:true in propose_edit, and constructs the new document by replacing only the selected range. Other files and stale snapshots are rejected. The agent receives an explicit denial reason and can retry a corrected tool call. Agent mode rejects replacements that reduce files over 100 lines to less than half their original line count; intentional bulk deletions are currently unsupported. Proposed text is normalized to the original file EOL so line-ending differences do not turn an entire file into a changed hunk. Surrounding functions and comments cannot be deleted by an inline replacement. The user's corrupted file was backed up and repaired separately, preserving the accepted function change; it must not be presented as a clean agent demo.
