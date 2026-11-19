// A conservative guard for common review bypasses, not a command sandbox.
function validateCommand(command) {
  if (typeof command !== 'string' || !command.trim()) throw Error('Command is empty');
  if (/[\r\n<>]/.test(command) ||
      /(?:^|[\s;&|])(?:[^\s]*[\\/])?(?:sh|bash|cmd|powershell|pwsh)(?:\.exe)?\s+(?:-[a-z]*c\b|\/c\b|-(?:command|encodedcommand)\b)/i.test(command) ||
      /(?:^|\s)(?:-c|-e|--eval|-encodedcommand)\s/i.test(command) ||
      /\b(?:Set-Content|Add-Content|Out-File|WriteAllText|WriteAllBytes|write_text|write_bytes)\b/i.test(command)) {
    throw Error('Command refused: shell redirection, multiline scripts, inline code and file-writing commands must not bypass review. Use propose_edit for file changes, then run a separate test command such as .venv\\Scripts\\python.exe -m pytest tests/test_cli.py -q.');
  }
}
module.exports = {validateCommand};
