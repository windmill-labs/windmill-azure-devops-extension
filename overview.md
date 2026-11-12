# Windmill CLI for Azure Pipelines

[Windmill](https://www.windmill.dev) is an open-source workflow engine and developer platform to build endpoints, workflows, UIs and AI agents. Its command-line interface, `wmill`, lets you interact with Windmill instances from a terminal, including syncing a folder of scripts, flows and apps between a Git repository and a Windmill workspace.

This extension adds two Azure Pipelines tasks that install and run the real `wmill` CLI, so a pipeline can deploy the contents of a repository to a Windmill workspace on every push.

Documentation: [Windmill CLI](https://www.windmill.dev/docs/advanced/cli) · [wmill sync](https://www.windmill.dev/docs/advanced/cli/sync)

## Quick start

1. In Windmill, create an API token for the account the pipeline will act as.
2. In Azure Pipelines, add it to the pipeline as a secret variable named `WMILL_TOKEN`.
3. Commit a `wmill.yaml` at the repository root (created by `wmill init`) that scopes what is synced.
4. Add the two tasks to `azure-pipelines.yml`:

```yaml
trigger:
  branches:
    include: [main]

pool:
  vmImage: ubuntu-latest   # or windows-latest

steps:
  - checkout: self

  - task: UseNode@1        # Microsoft's Node.js tool installer
    inputs:
      version: 22.x

  - task: InstallWindmillCLI@0
    inputs:
      version: latest      # or pin, e.g. 1.682.0, to match your instance

  - task: RunWindmillCLI@0
    inputs:
      baseUrl: https://app.windmill.dev     # or your self-hosted URL
      workspace: my-workspace
      token: $(WMILL_TOKEN)                 # secret variable, never the literal token
      command: sync push
      arguments: --yes --skip-variables --skip-secrets --skip-resources
      workingDirectory: $(System.DefaultWorkingDirectory)
```

With these inputs the second task runs:

```
wmill sync push --yes --skip-variables --skip-secrets --skip-resources --workspace my-workspace --token *** --base-url https://app.windmill.dev
```

This is the same command as the GitHub Actions and GitLab CI examples in Windmill's [Git sync documentation](https://www.windmill.dev/docs/advanced/git_sync).

## Tasks

### Install Windmill CLI (`InstallWindmillCLI@0`)

Installs the `windmill-cli` npm package into a folder under the agent's temporary directory and adds `wmill` to the `PATH` of the steps that follow. The agent needs Node.js and npm; Windmill's [installation page](https://www.windmill.dev/docs/advanced/cli/installation) states that the Node version must be greater than v20. To choose the Node.js version, run Microsoft's `UseNode@1` task first, as in the example.

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `version` | yes | `latest` | npm version or dist-tag of `windmill-cli`. Pin a version that matches your Windmill instance. |

### Run Windmill CLI command (`RunWindmillCLI@0`)

Runs `wmill <command> <arguments> --workspace <workspace> --token <token> --base-url <baseUrl>` in the working directory. `wmill` must already be on the `PATH` (use the install task first).

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `baseUrl` | yes | `https://app.windmill.dev` | Base URL of your Windmill instance (`--base-url`). |
| `workspace` | yes | | Workspace ID (`--workspace`). |
| `token` | yes | | Windmill API token (`--token`). Reference a secret variable. |
| `command` | yes | `sync push` | The `wmill` subcommand, without `wmill`, e.g. `sync push` or `sync pull`. |
| `arguments` | no | `--yes --skip-variables --skip-secrets --skip-resources` | Extra arguments placed before the connection flags. |
| `workingDirectory` | no | `$(System.DefaultWorkingDirectory)` | Folder with `wmill.yaml` and the synced files. |

## Before you run `sync push`

- Syncing overrides everything in scope. From the [sync documentation](https://www.windmill.dev/docs/advanced/cli/sync): it will "remove those that are in the target and not in the source, and it will create new items that are in source but not in target." Scope it with `includes` and `excludes` in [`wmill.yaml`](https://www.windmill.dev/docs/advanced/cli/wmill-yaml-reference), and try it on a test workspace first.
- `sync push` needs `--yes` in a pipeline, because nothing can answer the confirmation prompt.
- If Windmill's Git sync also commits to this repository, read the [Git sync documentation](https://www.windmill.dev/docs/advanced/git_sync): its CI examples skip the push for commits whose message starts with `[WM]`, to avoid overwriting a deploy that immediately follows them.

## Security

- The run task registers the token as a secret, so the agent masks it in the logs from that point on.
- Both tasks declare restricted logging-command mode: logging commands printed by `npm` or `wmill` cannot publish artifacts or set arbitrary variables. The install task may change only `PATH`; the run task may set no variables at all.
- The install task accepts only version strings made of letters, digits and `. _ - + ~ ^`.

## Support

Learn more about Windmill at [www.windmill.dev](https://www.windmill.dev).
