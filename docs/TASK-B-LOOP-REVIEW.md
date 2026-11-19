# Task B loop diagnosis — 0.1.15

Cancelled session: `01m7ptzq0fnq018nhm3gtrs5v1`, Gemini 3.1 Flash Lite. The fresh Task B repository remains clean.

The history contained 5 context assemblies, 14 reads, 7 searches, 8 proposed edits, and 7 shell commands. Multiple oldText values included literal escaped quotes and line endings after JSON decoding, so they did not match the real Python file. The model then tried cat/grep and Python repr commands to inspect or reconstruct formatting. Some later text matched, but the visible proposal split the existing routes function and was correctly rejected.

Version 0.1.15 changes source presentation: read_file emits metadata as one content block and actual source as a separate plain-text block. assemble_context likewise separates metadata from source snippets. Other structured tool results, including human review counts, remain JSON. Agent instructions say not to double-escape source or use shell repr for re-encoding.

Exact-match validation remains strict. No fuzzy matching or automatic unescaping was added. A model can still generate incorrect edits or loops; this fix removes the observed nested-JSON source representation that contributed to the escaping error.

51 automated tests pass. A new authenticated MCP test verifies preservation of real quotes, CRLF, and literal backslash-n values and then constructs a valid exact-match edit from the returned source. Live Task B completion with 0.1.15 remains unverified.
