# Seek MCP Server

Gives Claude native access to Seek.com.au job listings via two tools:

| Tool | What it does |
|------|-------------|
| `seek_search_jobs` | Search by keyword + location, returns ranked listings with salary/apply links |
| `seek_get_job_details` | Fetch the full job description for a specific listing |

Once connected, you can ask Claude things like:
> "Search Seek for Customer Success Manager roles in Melbourne posted in the last 7 days"
> "Get the full description for Seek job 12345678"

---

## Setup

### 1. Install dependencies

```bash
cd seek-mcp
npm install
npx playwright install chromium
```

### 2. Connect to Claude

Pick one depending on how you're running Claude:

#### Claude Desktop (Mac/Windows)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or  
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "seek": {
      "command": "node",
      "args": ["/absolute/path/to/seek-mcp/server.js"]
    }
  }
}
```

Restart Claude Desktop. The `seek_search_jobs` and `seek_get_job_details` tools will appear.

#### Claude Code CLI (local)

Add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "seek": {
      "command": "node",
      "args": ["/absolute/path/to/seek-mcp/server.js"],
      "type": "stdio"
    }
  }
}
```

Or add it to your global Claude Code settings at `~/.claude/settings.json` to make it available in every project.

Verify it loaded with:
```bash
claude mcp list
```

#### Claude Code on the Web

The web session's network sandbox blocks outbound scraping, so the MCP server must run on your **local machine** and be exposed as an HTTP endpoint — or you can use a self-hosted server with tunnel access.

For local-only use, the CLI approach above is the simplest option.

---

## Usage examples

Once connected, just talk to Claude naturally:

```
Search Seek for Implementation Consultant jobs in Melbourne in the last 14 days
```

```
Get full details for Seek job 82345671
```

```
Find Customer Success Manager roles in Sydney paying above $110k
```

---

## Tool reference

### `seek_search_jobs`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | ✓ | Job title or keywords |
| `location` | string | ✓ | Seek location slug, e.g. `All-Melbourne-VIC`, `All-Sydney-NSW`, `All-Brisbane-QLD` |
| `date_range` | number | | Days back to include: `7`, `14`, `30`, `90`. Default `30` |
| `max_results` | number | | Max listings to return. Default `15` |

**Common location slugs:**
- Melbourne → `All-Melbourne-VIC`
- Sydney → `All-Sydney-NSW`
- Brisbane → `All-Brisbane-QLD`
- Perth → `All-Perth-WA`
- Remote → `remote`

### `seek_get_job_details`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | string | ✓ | Numeric Seek job ID from search results or the listing URL |

---

## Notes

- Seek occasionally updates its page structure; if scraping returns empty results, the selectors in `server.js` may need updating
- The server adds polite delays between page loads to avoid rate-limiting
- Running with `headless: true` — no browser window appears
- Session data is not stored; each call opens a fresh browser context
