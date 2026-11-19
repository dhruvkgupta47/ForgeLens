# ForgeLens

A review-first VS Code coding agent. TrueForge runs the agent loop; the extension exposes editor tools through an authenticated localhost MCP server.

## Quick start

1. Install Node.js 22.14+ and VS Code.
2. Run `npm ci` then `npm run build` in this directory.
3. Start the inspected runtime, `npx @truefoundry/trueforge@0.185.1 --port 8794`, in a separate terminal. On PowerShell, first set `$env:OUTBOUND_URL_ALLOWED_HOSTS = '["127.0.0.1"]'` so TrueForge can reach the local editor bridge. Open http://localhost:8794 and configure a model in Settings. API keys belong there, never in this repository.
4. Open this directory in VS Code and press F5 (Run ForgeLens). In the Extension Development Host, open the target repository folder and trust it.
5. Set `forgelens.baseUrl` to `http://localhost:8794` and `forgelens.model` to the configured TrueForge model FQN (provider/model). Optionally set `forgelens.fallbackModel` to a second configured model.
6. Run **ForgeLens: Open Agent**. Submit a request. For inline editing, select code and press Ctrl+Alt+I (Cmd+Alt+I on macOS).
7. Inspect selected context, click Open diff, and accept/reject each hunk. Accept saves that hunk to the file. Run **ForgeLens: Undo Last Applied Hunk** to restore it.
8. Approve a terminal command only after reading it. Commands run with your user permissions and can modify files; source edits must use the proposal tool.

`npm test` runs safety/protocol tests. `npm run package` creates an installable VSIX. Alternatively install the VSIX through VS Code Extensions > Install from VSIX.

## Starting point and attribution

From scratch. No upstream agent loop or editor fork. Runtime dependencies retain their own licences; npm lockfile records exact dependency versions. TrueForge and MCP are dependencies/interfaces, not copied agent loops. AI coding assistance: OpenAI Codex, with Caveman and Ponytail instruction skills. Replace publisher/team metadata before public submission.

## Configuration

See config/settings.example.json. The extension registers a unique per-run MCP connector in local TrueForge, with an ephemeral bearer token. The connector remains in TrueForge settings after exit; remove unused forgelens-* entries there. Only one workspace folder is supported per extension host.

See docs/PRD.md, docs/TRD.md, docs/DEMO.md, docs/WRITEUP.md, docs/STATUS.md and schemas/ for requirements, contracts, judging evidence and limitations.

## Honest status

This is an implementation requiring live VS Code + configured-model rehearsal. Passing automated tests does not establish competition readiness. Do not claim Tasks A/B/C or a scoring anchor until you have recorded the real behavior. There is no model key embedded or account created.

For model setup and this machine's runtime prerequisite, read docs/MODEL-SETUP.md. scripts/start-trueforge.ps1 pins the inspected runtime version and keeps SQLite in the project.

Version 0.1.7 uses automatically allocated MCP ports to isolate VS Code windows; the legacy bridgePort setting is ignored.

Version 0.1.8 makes inline edits selection-only and blocks severe large-file truncation. For the pinned Flask demo, use pytest==9.0.2 from its lockfile; pytest 9.2.0 breaks the supplied test fixture.

Version 0.1.11 adds exact-match edits for existing files, accurate accepted/rejected counts, run-scoped tools, safe stream continuation, and formatter conflict detection. See docs/RELIABILITY-REVIEW.md for checks and remaining limitations.

Version 0.1.14 retains mode-specific inline schemas, suppresses identical reviewed proposals, discards pending controls on cancellation, coordinates in-flight saves, and reports killed commands as failures. See docs/REVIEW-0.1.14.md for the 50-test result and remaining live verification requirements.

Version 0.1.16 refuses multiline shell scripts, redirection, inline interpreter code and common direct-write commands before showing command approval. The agent must use propose_edit for source changes. This conservative guard is not a sandbox: approved test programs can still write files. 53 automated tests pass; provider 503 availability and full Task B model reliability remain external/live limitations.
