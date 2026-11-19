# Reliability review — 0.1.11

Update 0.1.12 (2026-11-18): Task C tests exposed a race where hunk status changed to accepted before its asynchronous application/save finished. Status is now committed after the edit and save settle; review cannot resume early. 44 tests pass, including fallback cancellation before approval, cancellation during streaming, and stopping automatic fallback after accepted edits. See the adjacent outputs/task-c-verification directory for prepared live rehearsal and model-only preflight evidence; live editor Task C remains pending.

Reviewed the editor, MCP bridge, TrueForge client, stream lifecycle, proposals, context paging, and retry handling on 2026-11-17.

## Fixed

- Existing-file edits can use a unique oldText/newText match instead of regenerating a whole file. Ambiguous and missing matches fail before review; surrounding text and CRLF line endings are preserved. Inline selection restrictions remain enforced.
- The model receives actual accepted/rejected hunk counts. A proposal tool call without completed human review fails.
- A save-time formatter change blocks later accepts based on an obsolete file snapshot. It cannot silently be overwritten by the next hunk.
- Cancelled reviews cannot revive under a new run. Tool handlers are bound to their originating run, and each new run rotates the bridge credentials and port. Run startup reserves its active state before asynchronous setup.
- Stream reconnects retain the last real cursor and review history. Duplicate approval events do not open another review. Empty or repeatedly disconnected streams fail visibly instead of appearing complete.
- Invalid file ranges and EOF are reported accurately. Malformed tool arguments are rejected rather than crashing approval processing.
- HTTP 204 responses no longer cause JSON parsing errors. Ordinary API requests retain a timeout even when given a cancellation signal.
- Sensitive-path exclusions are case-insensitive, including on Windows. The TrueForge sessions button remains usable after a run ends.

## Verification

41 automated tests pass, including an authenticated MCP round trip, direct and deferred approvals, exact-match edits, mixed accept/reject decisions, formatter conflicts, cancellation, same-session minute-limit continuation, fragmented SSE, and stream reconnect boundaries.

The live TrueForge server accepted temporary connector registration. It could not connect back to the bridge started inside the Codex execution environment (HTTP 502, ETIMEDOUT to loopback). The temporary connector was removed. That live discovery check did not pass; local integration tests do not replace the VS Code rehearsal. No live model-driven Task B run was performed by this review.

## Remaining risks and next rehearsal

- Google quota and overload errors remain external. Minute-limit waiting does not provide additional daily quota or server capacity.
- A model can still generate incorrect code or reach the 40-step limit. A completed stream is not evidence that the requested behavior passes tests.
- Commands require approval but are not sandboxed. They may modify files. Shell descendants can outlive cancellation on some platforms; cancellation does not roll back approved command side effects.
- An accepted hunk saves the file, including any pre-existing unsaved edits. Review a clean, disposable repository for the demo.
- Tool outputs are bounded. Very long individual lines may require a different inspection approach; increasing the context budget is not a guarantee of completion.
- Run the original Task B prompt after installing/reloading 0.1.11. Review implementation, tests and documentation. Verify CLI tests, help discovery, valid JSON, all four masking patterns, and unchanged application configuration.

The Flask Task B checkout was not modified during this review. Task A repair, Task B/C live verification, recording, and submission remain separate outstanding work.
