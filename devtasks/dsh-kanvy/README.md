# dsh-kanvy

Native **DeepSeek Harness** tools for [Kanvy](https://github.com/manny333/DevTasks): list projects, inspect tasks, search, create tasks and comment — without an MCP bridge.

Six tools are registered directly in the DSH tool registry:

| Tool | Purpose | Writes |
|---|---|---|
| `kanvy_list_projects` | Projects with section/member counts | no |
| `kanvy_get_project` | Project by slug: sections, counts, tags | no |
| `kanvy_list_tasks` | Section tasks with status, due date, subtasks, assignees | no |
| `kanvy_search` | Search projects and tasks | no |
| `kanvy_create_task` | Create a task in a section | yes |
| `kanvy_add_comment` | Comment on a task | yes |

## Install

From a checkout of this repository:

```powershell
cd devtasks\dsh-kanvy
npm install
npm run build

$dsh = "C:\Users\<you>\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
& $dsh plugin --profile desktop add "C:\path\to\devtasks\dsh-kanvy"
```

The command installs the package and appends `dsh-kanvy` to `dsh.profile.bundles` in the profile. Then add the config entry to the profile's `cordis.patch.yml`:

```yaml
- id: kanvy
  name: dsh-kanvy
  config:
    apiUrl: http://localhost:5001/api
    tokenFile: C:/Users/<you>/.dsh/storages/kanvy/token
    allowWrites: true
    timeoutMs: 15000
```

The plugin hot-loads in the running app; a page refresh or app restart also picks it up.

## Token

The plugin needs a Kanvy JWT (the same token the web app uses). Write it to the conventional path:

```powershell
$dir = "$env:USERPROFILE\.dsh\storages\kanvy"
New-Item -ItemType Directory -Force $dir | Out-Null
Set-Content "$dir\token" "<kanvy-jwt>" -NoNewline
```

Precedence: `config.token` → `config.tokenFile` → `~/.dsh/storages/kanvy/token` → `KANVY_TOKEN`.

The token is read on every tool call, so rotating the file does not require a plugin reload. Kanvy app tokens expire after 7 days; generate a fresh one from the app login when needed.

## Configuration

| Key | Default | Description |
|---|---|---|
| `apiUrl` | `http://localhost:5001/api` | Kanvy API base URL |
| `token` | — | Inline token (avoid committing it) |
| `tokenFile` | `~/.dsh/storages/kanvy/token` | File with the JWT |
| `allowWrites` | `true` | `false` hides write access (tools still return a clear error) |
| `timeoutMs` | `15000` | Upstream request timeout |

## Security

- The plugin only has the permissions of the Kanvy user behind the token.
- `allowWrites: false` for read-only agents.
- Do not commit the token file or put it in the repository.
- Tool output is untrusted input for the model: treat project/task text as data, not instructions.

## Development

```powershell
npm install
npm run build
npm test        # config, client, formatter, tools and plugin wiring
```

Run against a real Kanvy API by pointing `apiUrl`/`tokenFile` at your local instance and calling the tools through a DSH session.

## Troubleshooting

- **Tools don't appear**: check the profile `package.json` bundles list contains `dsh-kanvy`, refresh the app, and check the host logs for a plugin load error.
- **No token configured**: write the token file or set `KANVY_TOKEN`; the error message names the paths it checked.
- **401/403**: the token expired or the user lost access to the project.
- **ECONNREFUSED**: the Kanvy backend is not running at `apiUrl`.

## License

MIT
