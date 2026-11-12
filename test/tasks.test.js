'use strict';
// Runs the real task scripts with INPUT_* variables (how the agent invokes them)
// against FAKE npm / wmill executables placed first on PATH. No network, no real
// Windmill instance, nothing is installed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const win = process.platform === 'win32';

function fakeBin(dir, name) {
  // Records argv (one per line) and cwd into <name>.log, exits with FAKE_EXIT or 0.
  const log = path.join(dir, `${name}.log`);
  if (win) {
    fs.writeFileSync(path.join(dir, `${name}.cmd`),
      `@echo off\r\n(for %%a in (%*) do echo %%a)>"${log}"\r\ncd>>"${log}"\r\nexit /b %FAKE_EXIT%\r\n`);
  } else {
    const f = path.join(dir, name);
    fs.writeFileSync(f, `#!/bin/sh\nfor a in "$@"; do echo "$a"; done > "${log}"\npwd >> "${log}"\nexit \${FAKE_EXIT:-0}\n`);
    fs.chmodSync(f, 0o755);
  }
  return log;
}

function runTask(task, inputs, extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-ado-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-work-'));
  const logs = { wmill: fakeBin(dir, 'wmill'), npm: fakeBin(dir, 'npm') };
  const env = {
    ...process.env,
    PATH: dir + path.delimiter + process.env.PATH,
    AGENT_TEMPDIRECTORY: dir,
    FAKE_EXIT: '0',
    ...extraEnv,
  };
  for (const [k, v] of Object.entries(inputs)) env[`INPUT_${k.toUpperCase()}`] = v.replace('$WORK', work);
  const r = spawnSync(process.execPath, [path.join(root, 'tasks', task, 'index.js')], { env, encoding: 'utf8' });
  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean) : null);
  return { r, work, dir, wmill: read(logs.wmill), npm: read(logs.npm) };
}

const base = {
  baseUrl: 'https://windmill.example.test',
  workspace: 'demo',
  token: 'FAKE-TOKEN-NOT-REAL',
  command: 'sync push',
  arguments: '--yes --skip-variables --skip-secrets --skip-resources',
  workingDirectory: '$WORK',
};

test('RunWindmillCLI default: documented sync push command line', () => {
  const t = runTask('RunWindmillCLI', base);
  assert.equal(t.r.status, 0, t.r.stdout + t.r.stderr);
  assert.deepEqual(t.wmill.slice(0, -1), [
    'sync', 'push', '--yes', '--skip-variables', '--skip-secrets', '--skip-resources',
    '--workspace', 'demo', '--token', 'FAKE-TOKEN-NOT-REAL', '--base-url', 'https://windmill.example.test',
  ]);
  assert.equal(fs.realpathSync(t.wmill.at(-1)), fs.realpathSync(t.work), 'runs in workingDirectory');
});

test('RunWindmillCLI masks the token in the log', () => {
  const t = runTask('RunWindmillCLI', base);
  const out = t.r.stdout;
  const secretAt = out.indexOf('##vso[task.setsecret]FAKE-TOKEN-NOT-REAL');
  assert.notEqual(secretAt, -1, 'setsecret must be issued with the exact token value');
  const echoAt = out.indexOf('[command]');
  assert.notEqual(echoAt, -1, 'the agent echoes the command line');
  assert.ok(secretAt < echoAt, 'token must be registered as a secret before the command line is echoed');
});

test('RunWindmillCLI other command (sync pull) with no extra args', () => {
  const t = runTask('RunWindmillCLI', { ...base, command: 'sync pull', arguments: '' });
  assert.equal(t.r.status, 0);
  assert.deepEqual(t.wmill.slice(0, 2), ['sync', 'pull']);
  assert.ok(!t.wmill.includes('--yes'));
});

test('RunWindmillCLI fails when wmill exits non-zero', () => {
  const t = runTask('RunWindmillCLI', base, { FAKE_EXIT: '3' });
  assert.match(t.r.stdout, /task\.complete result=Failed/);
  assert.match(t.r.stdout, /code 3/);
});

test('RunWindmillCLI fails when a required input is missing', () => {
  const { workspace, ...rest } = base;
  const t = runTask('RunWindmillCLI', rest);
  assert.match(t.r.stdout, /Input required: workspace/);
  assert.equal(t.wmill, null, 'wmill must not run');
});

test('RunWindmillCLI fails when wmill is not on PATH', () => {
  const t = runTask('RunWindmillCLI', base, { PATH: path.dirname(process.execPath) });
  assert.match(t.r.stdout, /task\.complete result=Failed/);
});

test('InstallWindmillCLI runs npm install into a private prefix and prepends PATH', () => {
  const t = runTask('InstallWindmillCLI', { version: '1.2.3' });
  assert.equal(t.r.status, 0, t.r.stdout + t.r.stderr);
  assert.equal(t.npm[0], 'install');
  assert.ok(t.npm.includes('windmill-cli@1.2.3'));
  assert.ok(t.npm.includes('--prefix'));
  assert.match(t.r.stdout, /##vso\[task\.prependpath\][^\n]*node_modules[\\/]\.bin/);
});

test('InstallWindmillCLI rejects a version containing shell metacharacters', () => {
  const t = runTask('InstallWindmillCLI', { version: '1.0.0; rm -rf /' });
  assert.match(t.r.stdout, /Invalid windmill-cli version/);
  assert.equal(t.npm, null, 'npm must not run');
});

test('InstallWindmillCLI fails when npm fails', () => {
  const t = runTask('InstallWindmillCLI', { version: 'latest' }, { FAKE_EXIT: '1' });
  assert.match(t.r.stdout, /task\.complete result=Failed/);
});

// Restricted mode. Both task.json files set "commands": { "mode": "restricted" }.
// The agent then drops (with a warning only, the step does not fail) every
// ##vso[task.*] command whose class lacks [CommandRestriction(AllowedInRestrictedMode = true)].
// Allowed set, from Microsoft's task guide
// (https://learn.microsoft.com/en-us/azure/devops/extend/develop/add-build-task, "Security restrictions")
// and the agent source (src/Agent.Worker/TaskCommandExtension.cs in microsoft/azure-pipelines-agent),
// including the alias "issue" of "logissue" that the task library emits:
const RESTRICTED_ALLOWED = new Set([
  'logdetail', 'logissue', 'issue', 'complete', 'setprogress',
  'setsecret', 'setvariable', 'debug', 'settaskvariable', 'prependpath',
]);
// setvariable and prependpath are further filtered by settableVariables.allowed
// (case-insensitive glob; prependpath is checked as the variable PATH):
// src/Agent.Worker/TaskRestrictionsExtension.cs, TaskCommandExtension.cs TaskPrepandPathCommand.
function vsoCommands(stdout) {
  return [...stdout.matchAll(/##vso\[task\.(\w+)([^\]]*)\]/g)].map((m) => ({ cmd: m[1], props: m[2] }));
}
function assertRestrictedSafe(task, stdout) {
  const def = JSON.parse(fs.readFileSync(path.join(root, 'tasks', task, 'task.json'), 'utf8'));
  assert.equal(def.restrictions.commands.mode, 'restricted');
  const allowedVars = def.restrictions.settableVariables.allowed.map((v) => v.toLowerCase());
  const cmds = vsoCommands(stdout);
  assert.ok(cmds.length > 0, 'task emitted logging commands');
  for (const { cmd, props } of cmds) {
    assert.ok(RESTRICTED_ALLOWED.has(cmd), `##vso[task.${cmd}] is dropped in restricted mode`);
    if (cmd === 'prependpath') assert.ok(allowedVars.includes('path'), 'prependpath needs PATH in settableVariables');
    if (cmd === 'setvariable') {
      const name = /variable=([^;]+)/.exec(props)[1].toLowerCase();
      assert.ok(allowedVars.includes(name), `setvariable ${name} is not in settableVariables`);
    }
  }
}

test('RunWindmillCLI: setsecret and every other command it emits survive restricted mode', () => {
  const ok = runTask('RunWindmillCLI', base);
  assert.match(ok.r.stdout, /##vso\[task\.setsecret\]FAKE-TOKEN-NOT-REAL/);
  assertRestrictedSafe('RunWindmillCLI', ok.r.stdout);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, 'tasks', 'RunWindmillCLI', 'task.json'), 'utf8')).restrictions.settableVariables.allowed,
    [], 'RunWindmillCLI may set no variables');
  assertRestrictedSafe('RunWindmillCLI', runTask('RunWindmillCLI', base, { FAKE_EXIT: '3' }).r.stdout);
});

test('InstallWindmillCLI: prependpath survives restricted mode with PATH as the only settable variable', () => {
  const t = runTask('InstallWindmillCLI', { version: '1.2.3' });
  assert.equal(t.r.status, 0, t.r.stdout + t.r.stderr);
  assert.match(t.r.stdout, /##vso\[task\.prependpath\]/);
  assertRestrictedSafe('InstallWindmillCLI', t.r.stdout);
  assertRestrictedSafe('InstallWindmillCLI', runTask('InstallWindmillCLI', { version: 'latest' }, { FAKE_EXIT: '1' }).r.stdout);
});

test('restricted-mode check rejects a command the agent would drop', () => {
  // Guards the guard: artifact upload and an unlisted variable must be flagged.
  assert.throws(() => assertRestrictedSafe('RunWindmillCLI', '##vso[task.uploadfile]/tmp/x\n'), /dropped in restricted mode/);
  assert.throws(() => assertRestrictedSafe('RunWindmillCLI', '##vso[task.setvariable variable=Evil;]1\n'), /not in settableVariables/);
});
