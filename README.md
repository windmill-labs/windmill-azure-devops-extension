# Windmill CLI for Azure Pipelines (Azure DevOps extension)

Source of the Visual Studio Marketplace extension `windmill-labs.windmill-cli`: two Azure Pipelines tasks, `InstallWindmillCLI@0` and `RunWindmillCLI@0`, that install and run the real [Windmill](https://www.windmill.dev) CLI (`wmill`).

User documentation (the Marketplace page) is [overview.md](overview.md).

## Layout

| Path | What |
| --- | --- |
| `vss-extension.json` | Extension manifest. `public` is `false`; the public build sets it with `--override`. |
| `overview.md` | Marketplace page (`content.details`). |
| `tasks/InstallWindmillCLI`, `tasks/RunWindmillCLI` | The tasks (`task.json` + `index.js`, Node 20 handler, restricted logging-command mode). |
| `images/extension-icon.png` | 128x128 icon, built by `npm run icon` from `images/windmill-logo-primary.svg` (the official primary logo from the Windmill brand guidelines, unmodified). |
| `test/tasks.test.js` | Runs the real task scripts against fake `npm`/`wmill` executables. |
| `examples/smoke-test-pipeline.yml` | Read-only pipeline to test a private build on hosted Linux and Windows agents. |

## Develop

```
npm install            # dev tools: tfx-cli, @resvg/resvg-js
npm test               # 12 tests, no network
npm run package        # private build:  windmill-labs.windmill-cli-<version>.vsix
npm run package:public # public build (sets the Public gallery flag)
```

For every release bump the version in `vss-extension.json` and in both `task.json` files: Microsoft's task guide says "Both the task version and extension version must be updated for changes to take effect in Azure DevOps."

## License

Apache License 2.0, see [LICENSE](LICENSE).
