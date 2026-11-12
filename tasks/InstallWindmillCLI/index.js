'use strict';
const path = require('path');
const tl = require('azure-pipelines-task-lib/task');

// npm version / dist-tag: letters, digits and . _ - + ~ ^ only, so nothing can
// be smuggled into the npm command line.
const VERSION_RE = /^[A-Za-z0-9._+~^-]+$/;

function packageSpec(version) {
  const v = (version || 'latest').trim();
  if (!VERSION_RE.test(v)) {
    throw new Error(`Invalid windmill-cli version "${v}"`);
  }
  return `windmill-cli@${v}`;
}

async function run() {
  try {
    const spec = packageSpec(tl.getInput('version', true));
    const temp = tl.getVariable('Agent.TempDirectory') || process.env.RUNNER_TEMP || require('os').tmpdir();
    const prefix = path.join(temp, 'windmill-cli');
    tl.mkdirP(prefix);

    const npm = tl.which('npm', true);
    const rc = await tl.tool(npm)
      .arg(['install', '--no-audit', '--no-fund', '--prefix', prefix, spec])
      .exec();
    if (rc !== 0) {
      tl.setResult(tl.TaskResult.Failed, `npm install ${spec} exited with code ${rc}`);
      return;
    }
    // npm puts the wmill / wmill.cmd shims in <prefix>/node_modules/.bin on both OSes.
    tl.prependPath(path.join(prefix, 'node_modules', '.bin'));
    tl.setResult(tl.TaskResult.Succeeded, `Installed ${spec}`);
  } catch (err) {
    tl.setResult(tl.TaskResult.Failed, err.message);
  }
}

module.exports = { packageSpec };
if (require.main === module) run();
