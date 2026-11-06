# kanvy-mcp

Portable **Model Context Protocol** server for [Kanvy](https://github.com/manny333/DevTasks): lets any MCP-compatible agent list projects, inspect tasks, search, create tasks and comment.

Built on the open MCP standard, so the same server works with Claude Code, Cursor, VS Code, Codex, Gemini CLI, Goose and any other MCP client. See [client setup](#client-setup).

## Features

- **29 tools**: project/task reads, task lifecycle, planning, tags, members, dependencies and bulk creation.
- **Resources**: `kanvy://me`, `kanvy://projects`, `kanvy://projects/{slug}`, `kanvy://projects/{slug}/board`, `kanvy://tasks/{taskId}`.
- **Prompts**: `project_status_report`, `daily_standup`, `sprint_planning`, `triage_overdue`, `release_notes`.
- **Transports**: stdio (default) and Streamable HTTP (`/mcp`).
- **Safe by default**: writes can be disabled with `KANVY_ALLOW_WRITES=0`; HTTP is loopback-only unless a bearer token is configured.
- No secrets in logs; every request authenticates against the Kanvy API with the user's token.

## Requirements

- Node.js **20+**
- A running Kanvy API and a JWT for it (the same token the web app uses, valid 7 days).

## Quick start

```bash
cd devtasks/mcp-server
npm install
npm run build
cp .env.example .env      # fill KANVY_TOKEN

# stdio (what MCP clients spawn)
node build/index.js
```

Test the connection from Claude Code:

```bash
claude mcp add --env KANVY_TOKEN=$KANVY_TOKEN --transport stdio kanvy -- node "$(pwd)/build/index.js"
claude mcp list
```

Or use the project-level `.mcp.json` at the repository root.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `KANVY_API_URL` | `http://localhost:5001/api` | Kanvy API base URL |
| `KANVY_TOKEN` | — (required) | JWT for the Kanvy API |
| `KANVY_ALLOW_WRITES` | `1` | `0` disables `create_task` and `add_comment` |
| `KANVY_TIMEOUT_MS` | `15000` | Upstream request timeout |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `MCP_HTTP_HOST` | `127.0.0.1` | HTTP bind host |
| `MCP_HTTP_PORT` | `3333` | HTTP bind port |
| `MCP_HTTP_TOKEN` | — | Required bearer token when binding a non-loopback host |

## Tools

### Read

| Tool | Args |
|---|---|
| `list_projects` | — |
| `get_project` | `slug` |
| `get_task` | `taskId` (full detail) |
| `list_tasks` | `sectionId`, `status?`, `archived?`, `limit?` |
| `list_comments` | `taskId`, `limit?` |
| `list_members` | `projectSlug` |
| `list_tags` | `projectSlug` |
| `list_activity` | `taskId` |
| `list_attachments` | `taskId` (signed URLs) |
| `my_tasks` | `status?`, `limit?` |
| `project_health` | `projectSlug` |
| `agenda` | `projectSlug`, `from`, `to` |
| `search` | `query`, `limit?` |
| `whoami` | — |

### Write (requires `KANVY_ALLOW_WRITES=1`)

| Tool | Args |
|---|---|
| `create_project` | `name`, `description?`, `template?` |
| `create_section` | `projectSlug`, `name`, `description?`, `color?` |
| `create_task` | `sectionId`, `title`, `description?`, `status?`, `startDate?`, `dueDate?` |
| `bulk_create_tasks` | `sectionId`, `tasks[]`, `dryRun?` (max 25) |
| `update_task` | `taskId`, `title?`, `description?`, `startDate?`, `dueDate?` |
| `move_task` | `taskId`, `status`, `position?` |
| `archive_task` | `taskId`, `archived?` |
| `add_comment` | `taskId`, `content` |
| `add_subtask` | `taskId`, `title` |
| `update_subtask` | `taskId`, `subtaskId`, `title?`, `completed?` |
| `assign_task` | `taskId`, `email`, `accessType?` |
| `create_tag` | `projectSlug`, `name`, `color?` |
| `add_tag` | `taskId`, `tagId` |
| `add_member` | `projectSlug`, `email`, `accessType?` |
| `add_dependency` | `taskId`, `dependsOnId` |

Every tool returns compact markdown/text with ids so the agent can chain calls. Errors come back as `isError: true` with a readable message. Destructive or bulk operations should be confirmed by the user; `bulk_create_tasks` supports `dryRun`.

### Resources

- `kanvy://me` — authenticated user.
- `kanvy://projects` — overview of accessible projects.
- `kanvy://projects/{slug}` — sections, task counts and tags of one project.
- `kanvy://projects/{slug}/board` — sections and compact task lines.
- `kanvy://tasks/{taskId}` — full task detail.

### Prompts

- `project_status_report` — project status using `get_project`, `project_health` and `list_tasks`.
- `daily_standup` — my tasks, blockers and next steps.
- `sprint_planning` — backlog review and sprint proposal.
- `triage_overdue` — overdue/blocked work and recovery plan.
- `release_notes` — release notes from completed tasks.

## Client setup

The server is client-agnostic; only the configuration file changes.

### Claude Code

Local scope (just you, this project):

```bash
claude mcp add --env KANVY_TOKEN=$KANVY_TOKEN --transport stdio kanvy -- node /absolute/path/to/devtasks/mcp-server/build/index.js
```

Project scope (team, committed `.mcp.json`):

```json
{
  "mcpServers": {
    "kanvy": {
      "type": "stdio",
      "command": "node",
      "args": ["devtasks/mcp-server/build/index.js"],
      "env": {
        "KANVY_API_URL": "http://localhost:5001/api",
        "KANVY_TOKEN": "${KANVY_TOKEN}",
        "KANVY_ALLOW_WRITES": "1"
      }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in the project):

```json
{
  "mcpServers": {
    "kanvy": {
      "command": "node",
      "args": ["/absolute/path/to/devtasks/mcp-server/build/index.js"],
      "env": { "KANVY_TOKEN": "..." }
    }
  }
}
```

### VS Code (Copilot)

`.vscode/mcp.json` — note the top-level key is `servers`:

```json
{
  "servers": {
    "kanvy": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/devtasks/mcp-server/build/index.js"],
      "env": { "KANVY_TOKEN": "${input:kanvyToken}" }
    }
  },
  "inputs": [
    { "id": "kanvyToken", "type": "promptString", "description": "Kanvy JWT", "password": true }
  ]
}
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.kanvy]
command = "node"
args = ["/absolute/path/to/devtasks/mcp-server/build/index.js"]
env = { KANVY_TOKEN = "..." }
```

### ChatGPT / other HTTP-only hosts

Start the HTTP transport and expose it through a TLS reverse proxy:

```bash
MCP_TRANSPORT=http MCP_HTTP_HOST=0.0.0.0 MCP_HTTP_PORT=3333 \
MCP_HTTP_TOKEN=change-me KANVY_TOKEN=... node build/index.js
```

Endpoint: `https://your-host/mcp` with `Authorization: Bearer <MCP_HTTP_TOKEN>`.
Loopback binding (`127.0.0.1`) does not require `MCP_HTTP_TOKEN`.

> HTTP is optional. Most desktop agents (Claude Code, Cursor, VS Code, Codex) can spawn the stdio process directly.

## Security

- Use a **least-privilege token**; the server only has the permissions of that Kanvy user.
- Set `KANVY_ALLOW_WRITES=0` for read-only integrations.
- Do **not** commit tokens: use `${VAR}` expansion or the client's secret storage.
- Tool output is untrusted input for the model. Treat fetched project/task text as data, not instructions.
- HTTP: keep `MCP_HTTP_TOKEN` secret, bind loopback when possible, and put TLS in front if exposed.
- The server never logs the Kanvy token or request headers.

## Development

```bash
npm run build        # tsc
npm test             # unit tests (config, client, tools)
npm run test:e2e     # real MCP client over stdio + HTTP smoke test
```

Run the MCP Inspector against the built server:

```bash
npx @modelcontextprotocol/inspector --cli node build/index.js --method tools/list
```

Publish (optional):

```bash
npm pack             # inspect the tarball
npm publish --access public
```

## License

MIT
