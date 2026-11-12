'use strict';
const tl = require('azure-pipelines-task-lib/task');

function splitCommand(command) {
  const parts = (command || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new Error('The wmill command must not be empty');
  return parts;
}

// Flags that carry the connection details (documented global options:
// --workspace, --token, --base-url).
function connectionArgs({ workspace, token, baseUrl }) {
  return ['--workspace', workspace, '--token', token, '--base-url', baseUrl];
}

async function run() {
  try {
    const token = tl.getInput('token', true);
    tl.setSecret(token); // mask in logs
    const command = splitCommand(tl.getInput('command', true));
    const extra = tl.getInput('arguments', false) || '';
    const conn = connectionArgs({
      workspace: tl.getInput('workspace', true),
      token,
      baseUrl: tl.getInput('baseUrl', true),
    });
    const cwd = tl.getPathInput('workingDirectory', false, true) || process.cwd();
    const wmill = tl.which('wmill', true);
    const rc = await tl.tool(wmill).arg(command).line(extra).arg(conn).exec({ cwd });
    if (rc !== 0) {
      tl.setResult(tl.TaskResult.Failed, `wmill exited with code ${rc}`);
      return;
    }
    tl.setResult(tl.TaskResult.Succeeded, 'wmill finished');
  } catch (err) {
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

module.exports = { connectionArgs, splitCommand };
if (require.main === module) run();
