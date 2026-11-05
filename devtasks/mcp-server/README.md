# kanvy-mcp

Portable **Model Context Protocol** server for [Kanvy](https://github.com/manny333/DevTasks): lets any MCP-compatible agent list projects, inspect tasks, search, create tasks and comment.

Built on the open MCP standard, so the same server works with Claude Code, Cursor, VS Code, Codex, Gemini CLI, Goose and any other MCP client. See [client setup](#client-setup).

## Features

- **6 tools**: `list_projects`, `get_project`, `list_tasks`, `search`, `create_task`, `add_comment`.
- **Resources**: `kanvy://projects` and `kanvy://projects/{slug}` (markdown summaries).
- **Prompt**: `project_status_report` for a consistent status report.
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

| Tool | Args | Writes |
|---|---|---|
| `list_projects` | — | no |
| `get_project` | `slug` | no |
| `list_tasks` | `sectionId`, `status?`, `archived?`, `limit?` | no |
| `search` | `query`, `limit?` | no |
| `create_task` | `sectionId`, `title`, `description?`, `status?`, `startDate?`, `dueDate?` | yes |
| `add_comment` | `taskId`, `content` | yes |

Every tool returns compact markdown/text with ids so the agent can chain calls. Errors come back as `isError: true` with a readable message.

### Resources

- `kanvy://projects` — overview of accessible projects.
- `kanvy://projects/{slug}` — sections, task counts and tags of one project.

### Prompts

- `project_status_report` with `projectSlug` — asks the agent to build a report using `get_project` and `list_tasks`.

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
