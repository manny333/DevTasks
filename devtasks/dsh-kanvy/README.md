# dsh-kanvy

Native **DeepSeek Harness** tools for [Kanvy](https://github.com/manny333/DevTasks): the same task lifecycle as the MCP server, without an MCP bridge.

**36 tools** are registered directly in the DSH tool registry.

### Read

| Tool | Purpose |
|---|---|
| `kanvy_list_projects` | Projects with section/member counts |
| `kanvy_get_project` | Project by slug: sections, counts, tags |
| `kanvy_list_tasks` | Section tasks with status, due date, subtasks, assignees |
| `kanvy_get_task` | Full task detail: comments, subtasks, dependencies, attachments |
| `kanvy_get_task_context` | Pickup Brief: context, criteria, docs, dependencies, PR, activity |
| `kanvy_list_comments` | Task comments |
| `kanvy_list_members` | Project members and roles |
| `kanvy_list_tags` | Project tags with ids |
| `kanvy_list_activity` | Task activity log |
| `kanvy_list_attachments` | Task attachments and signed URLs |
| `kanvy_my_tasks` | Tasks assigned to the current user |
| `kanvy_project_health` | Completion, overdue, due-soon, unassigned, blocked |
| `kanvy_agenda` | Tasks due in a date range |
| `kanvy_search` | Search projects and tasks |
| `kanvy_whoami` | Authenticated Kanvy user |
| `kanvy_list_documents` | Project Markdown documents |
| `kanvy_get_document` | Full document by id or slug, with pagination |
| `kanvy_search_documents` | Search documents and return excerpts |
| `kanvy_get_project_context` | Project description + pinned documents |
| `kanvy_get_project_passport` | Stack, repo, commands, owners and start-here guide |
| `kanvy_list_pickable_tasks` | Tasks by Definition of Ready, default available to take |

### Write (`allowWrites: true`)

| Tool | Purpose |
|---|---|
| `kanvy_create_project` | Create a project |
| `kanvy_create_section` | Create a section |
| `kanvy_create_task` | Create a task |
| `kanvy_bulk_create_tasks` | Create up to 25 tasks (supports `dryRun`) |
| `kanvy_update_task` | Title, description, start or due date |
| `kanvy_move_task` | Change status/column |
| `kanvy_archive_task` | Archive or unarchive |
| `kanvy_add_comment` | Comment on a task |
| `kanvy_add_subtask` | Add a checklist item |
| `kanvy_update_subtask` | Rename or complete a subtask |
| `kanvy_assign_task` | Assign a user by email |
| `kanvy_create_tag` | Create a project tag |
| `kanvy_add_tag` | Apply a tag to a task |
| `kanvy_add_member` | Add a project member |
| `kanvy_add_dependency` | Add a blocking dependency |

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

The token is read on every tool call, so rotating the file does not require a plugin reload. Web-app tokens expire after 7 days; the backend's `npm run mcp:token -- <email>` command writes a 90-day token to the same file.

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
