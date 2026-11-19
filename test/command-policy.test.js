const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateCommand}=require('../src/command-policy');

test('observed heredoc writes and shell wrappers cannot reach command approval',()=>{
  for(const command of ['cat <<EOF > tests/test_config_cli.py\ncode\nEOF', '/bin/sh -c \'cat <<EOF > test.py\ncode\nEOF\'', 'cmd /c echo code > test.py', 'powershell -Command Set-Content test.py code', 'python -c "open(\'test.py\',\'w\').write(\'code\')"', 'node -e "writeFileSync(path, data)"']) {
    assert.throws(()=>validateCommand(command),/Use propose_edit/);
  }
});
test('ordinary verification and discovery commands remain available',()=>{
  for(const command of ['.venv\\Scripts\\python.exe -m pytest tests/test_cli.py -q', 'git diff --stat', 'dir tests', 'findstr /n config tests\\test_cli.py']) assert.doesNotThrow(()=>validateCommand(command));
});
