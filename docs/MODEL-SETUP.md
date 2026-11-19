# Model setup and Windows runtime prerequisite

## Resolve the runtime first

On this machine, TrueForge 0.185.1 downloaded successfully, but Windows Application Control blocked its better-sqlite3 native win32-x64.node module. The error was: "An Application Control policy has blocked this file." WSL is not installed and Docker was not found. This is a system prerequisite, not a model-key error. The optional sandbox is not needed for the competition.

Use an administrator-approved Node/TrueForge environment, or a supported Linux/macOS machine. If your administrator allows WSL, install it through the normal Windows process and run both VS Code's extension host and TrueForge in that WSL workspace. Do not disable security policy or copy unknown native binaries. Running the same blocked native module again will not fix it.

## First model: Google AI Studio

1. Open https://aistudio.google.com/api-keys and create an API key in your own account. Do not paste it in chat or commit it.
2. Check current free-tier availability, supported region and quotas: https://aistudio.google.com/docs/pricing . Free access covers selected models with limits; not every Gemini model is free. Free-tier data handling differs from paid usage. Use only the public Flask repository and your own public fixture code.
3. Start `npx @truefoundry/trueforge@0.185.1` in your approved local environment, then open http://localhost:8790.
4. In TrueForge Settings, configure the Google Gemini provider using your key. Choose a currently available tool-calling model that your account can access. Use the actual model ID from the provider, not a guessed name.
5. Run a short tool-using request in TrueForge first. Copy its configured provider/model FQN into the VS Code setting `forgelens.model`.
6. Run ForgeLens against a small disposable repository before Flask. Ask it to explain a function, then propose a small edit. Inspect MCP tool calls in the TrueForge session.

## Second model for resilience

Configure another accessible model in TrueForge, preferably on a different provider to avoid shared quota failure. Copy its FQN into `forgelens.fallbackModel`. Both model definitions live in TrueForge; ForgeLens never calls either provider directly. Free providers can rate-limit multi-step agent loops. If using a paid model, use a provider-side spending limit and record actual spend.

For Task C, configure the primary provider with an invalid key or unreachable endpoint, preserving a healthy independent fallback. Repeat Task A, show automatic switch and proposed diff, leave it unaccepted and show unchanged git status. Restore the primary setup afterward.

No model account, billing change or secret configuration has been performed for you.
# Per-minute rate limits (ForgeLens 0.1.9)

When TrueForge reports HTTP 429 explicitly identifying a per-minute limit, ForgeLens waits at least 60 seconds (or the reported retry delay plus five seconds, when longer), then creates a continuation turn in the same session. It preserves the review state and asks the agent to inspect current files before further edits. Cancel interrupts the wait. There are at most two automatic continuations per model attempt.

Daily quota errors, unspecified quota errors, and retry delays above two minutes are not automatically retried. This does not increase provider quotas or fix provider overload. Automated retry and cancellation tests pass; live Gemini recovery still requires rehearsal.

# Repeated discovery and iteration limits (ForgeLens 0.1.10)

A live failed Task B session repeatedly called tool-discovery helpers and reread unchanged CLI ranges, and its shell search failed because grep was unavailable on Windows. Version 0.1.10 preloads all five editor schemas instead of deferring four of them. Edit and command approval remain required. Read responses include total line count, next page position, and explicit character truncation metadata. Agent instructions prefer the native search tool, explain paging, and identify the Windows command shell. The iteration cap remains 40. These changes address observed wasted steps; successful Task B completion still needs live rehearsal.

