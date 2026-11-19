# Rehearsal and recording

Use a disposable clone, never erase another developer's work. Clone pallets/flask and checkout 3.1.3; verify commit prefix 22d92470. Create a venv, install the checkout editable plus its test dependencies. Verify imported flask.__file__ points into this checkout.

## Task A
Open src/flask/helpers.py; select get_debug_flag. Exact prompt:
Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false.
Show proposal and per-hunk buttons. Accept. In a POSIX shell run the PDF verification command; in PowerShell use `$env:FLASK_DEBUG='off'` then `python -c "from flask.helpers import get_debug_flag; print(get_debug_flag())"`. Show False. Demonstrate undo, then return to the intended baseline.

## Task B
No files mentioned. Exact prompt:
Add a new built-in CLI command flask config that prints the loaded application's configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as "***". It must appear in flask --help, be covered by a test, and be documented alongside the other built-in commands.
Show selected context reasons/budget, 3+ discovered files, hunk approval, TrueForge session turns/tools, pytest tests/test_cli.py -q passing, help and masked JSON against a real app. Confirm source import path. Do not hard-code answers or fixture paths into the agent.

## Task C
Start from a separate clean baseline and show git status. Configure TrueForge primary provider with unreachable endpoint or invalid key; set a working second model FQN. Repeat A. Show automatic fallback, responsive editor, proposal not applied, clean git status. Also exercise Cancel during a slow generation. Verify no unapproved workspace edits. Don't hide earlier accepted changes when assessing cancellation.

## Video
A then B then C, max four minutes. Aim 0:00–0:50 A; 0:50–2:40 B; 2:40–3:25 C; 3:25–3:55 cancellation/undo. Do not cut between instruction and diff. Confirm public link opens in an incognito window. No claimed timestamp before recording.

## Regression checklist
Reject all -> unchanged; accept one of two -> only one applied; undo -> snapshot restored; manually change file after preview -> stale edit refused; cancel while review -> no pending writes; fallback -> clean baseline; endpoint unavailable -> readable error; second unrelated repository -> retrieval not Flask-specific; fresh clone -> README works.
