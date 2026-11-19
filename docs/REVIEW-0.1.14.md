# Reliability review — 0.1.14

Date: 2026-11-18. Scope: inline tool contracts, per-hunk decisions, repeated proposals, command results, cancellation, fallback, and compatibility with the current VS Code/TrueForge setup.

## Fixed in this review

| Failure | Result in 0.1.14 |
| --- | --- |
| A timed-out/killed command can have no numeric exit code, which was converted to zero. | Any command error produces a nonzero exit code. Killed/signal/error information is returned to the agent. This avoids mistaking a terminated test for success. |
| An identical rejected proposal could repeatedly reopen the same review. | The run remembers reviewed final file contents. An identical proposal is refused before opening another review, with the prior accept/reject counts in the error. A different correction can still be proposed. |
| Cancel after accepting one hunk left pending controls on the same proposal. | Unaccepted hunks on retained proposals become discarded. They have no accept/reject controls. Accepted changes and their undo records remain. |
| A new run or Undo could race an approved edit still being saved after cancellation. | Both operations wait for user retry until the existing edit settles. Approved in-flight edits are tracked until completion; cancellation does not pretend to roll them back. |

The 0.1.13 inline fix is retained: inline runs expose required path/content/selectionOnly:true, without the general agent's oldText/newText edit format. Full-file agent edits and targeted existing-file edits retain per-hunk review.

## Verification

- Full automated suite: **50 passed, zero failed**. It includes authenticated MCP discovery/calls, schema rejection, stream parsing/reconnects, inline scope, stale snapshots, format-on-save, edit/undo, fallback, cancellation, minute-limit continuation, identical proposal rejection, partial cancellation, in-flight save coordination, and command error reporting.
- The new command-error checks inject timeout/spawn failure results without waiting a real minute.
- Task C's clean repository and original helpers.py were checked again after the review.
- No additional provider inference was requested during this review. A live model-generated inline proposal using 0.1.14 has not yet been observed.

## Remaining failure modes

1. **Provider quotas and overload:** Google can still return 429 or 503. The bounded per-minute retry cannot increase quotas or provide server capacity.
2. **Model correctness and progress:** The model may generate bad code, malformed arguments, or repeatedly different unsuccessful proposals. The 40-step cap remains. Suppressing an identical review does not guarantee the agent stops making requests or completes its task.
3. **Shell commands:** Commands still require explicit approval and run with the user's permissions. They can write files or launch descendants, and some descendants can outlive cancellation. Source changes should use proposal review. The earlier shell-script popup was a real example of why each command must be read.
4. **File saves and formatting:** Accept saves the document, including pre-existing unsaved changes. Formatter conflicts block later accepts from the old snapshot; a fresh proposal may be required.
5. **VS Code state:** A disabled extension, Restricted Mode, a different profile, or a stale extension host can hide commands or keep an older version loaded. Install into the intended VS Code profile and reload the Task C window.
6. **Live demonstration:** The earlier live session established a failed primary, a Gemini fallback session, cancellation, and a clean repository. It did not produce a valid inline proposal. Task C's proposal portion and final recording remain pending.

## Next attempt

Install `forgelens-0.1.14.vsix`, reload the Task C workspace, select the entire original get_debug_flag function, and run the original Edit Selection request. Wait for fallback. Do not accept a hunk; inspect the proposal and cancel. Inspect ForgeLens Output and check the clean baseline afterward. Keep inference keys in TrueForge.
