# dsh-mcp-tavily

**Tavily web search for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`)** — a
patch-only plugin bundle that wires Tavily's hosted **remote MCP server** into the harness. No local
server, no `npx`, no build step, no dependencies.

**给 DeepSeek Harness 的 Tavily 联网搜索** —— 一个 patch-only 插件包，把 Tavily 的**远程 MCP 服务器**
接进 DSH。不需要本地起服务、不需要 `npx`、不需要构建、没有任何依赖。

---

## Why / 为什么

DSH's built-in `web_search` is backed by DeepSeek's own endpoint: every search is a full auxiliary model
turn billed as tokens on your DeepSeek account. This bundle adds Tavily's MCP server as an **additional**
tool family, so the model can use Tavily's free monthly credits (1,000/month) for ordinary lookups and
`crawl` / `map` / `research` for heavier work — while the built-in search stays available as a fallback.

DSH 内置的 `web_search` 走 DeepSeek 自己的端点，每次搜索都是"一次完整的辅助模型请求"，按 token 计费。
本插件把 Tavily 的 MCP 服务器作为**另一组工具**接进来：日常检索走 Tavily 的免费额度（1,000 credits/月），
重活（爬站 / 站点地图 / 深度研究）也能用，内置搜索继续留着兜底。

## Tools added / 新增工具

| Tool | What it does / 作用 |
|---|---|
| `mcp__tavily__tavily_search` | Web search — supports `include_domains`, `exclude_domains`, `time_range`, `search_depth: advanced` |
| `mcp__tavily__tavily_extract` | Extract the readable content of given URLs (markdown / text) |
| `mcp__tavily__tavily_map` | List a site's URL structure |
| `mcp__tavily__tavily_crawl` | Crawl a whole site and extract content |
| `mcp__tavily__tavily_research` | Multi-source research report |

Plus MCP resource reading (`list_mcp_resources` / `read_mcp_resource`) when the server exposes resources.

## Install / 安装

```sh
# from GitHub (recommended)
dsh plugin --profile web add github:wjh-ux/dsh-mcp-tavily

# or from a local checkout
dsh plugin --profile web add link:/absolute/path/to/dsh-mcp-tavily
```

Restart `dsh` once — bundles and their patches are resolved at boot.

重启一次 `dsh`（bundle 和补丁是启动时解析的）。

## Visual configuration / 可视化配置

On dsh 0.1.7+ this plugin's settings form is generated from the schema the package
exports, so the API key can be typed straight into the UI - no environment
variable required:

**Plugins -> `dsh-mcp-tavily`**

| Field | Meaning |
|---|---|
| **API Key** | A Tavily key (`tvly-...`). Kept on the credentials plane as a secret rather than in the settings file. Leave it empty to fall back to the reference below. |
| `apiKeyEnv` | Credential reference consulted when the field above is empty (default `TAVILY_API_KEY`: the credentials service first, then the process environment). |
| `maxResults` | Results per search, 1-20 (default 5). |
| `searchDepth` | `basic` / `advanced` / `fast`. |
| `timeoutMs` | Per-search timeout in ms (default 30000). |

Get a free key at <https://app.tavily.com> (1,000 credits/month, no credit card).
With nothing configured at all, Tavily still answers through its free
rate-limited **keyless** mode.
## Configure the key / 配置 API Key

The key is read from the **`TAVILY_API_KEY` environment variable** at boot; nothing is hardcoded here.

```sh
# Windows
setx TAVILY_API_KEY "tvly-..."        # then fully restart dsh
# macOS / Linux
export TAVILY_API_KEY=tvly-...
```

Get a free key at <https://app.tavily.com> (1,000 credits/month, no credit card).

### No key? Use keyless mode / 没有 key？

Tavily serves a free, rate-limited **keyless** mode. Edit `cordis.patch.yml` and swap the `headers` block:

```yaml
        headers:
          X-Tavily-Access-Mode: keyless
```

Keyless supports `search` and `extract` only (no `crawl` / `map` / `research`).

## Billing / 计费

- Free: **1,000 credits / month**; `basic` search = 1 credit, `advanced` search = 2 credits;
- Beyond the free tier: $0.008 per credit (Tavily pricing, subject to change);
- Usage dashboard: <https://app.tavily.com>.

## Compatibility / 兼容性

- Verified against **dsh 0.2.0-rc.2** on Windows (`@deepseek-ai/dsh-mcp-client` 0.2.0-rc.2).
- Pure configuration: nothing but `package.json` + `cordis.patch.yml`, so it survives harness upgrades
  as long as the MCP client plugin keeps its `serverName` / `transport` / `url` / `headers` config fields.

## Security / 安全

- **No secrets in this repository.** The key lives in your environment, never in the patch.
- The bundle only adds one outbound HTTPS connection to `https://mcp.tavily.com/mcp/`;
  your queries and the model name are the only things sent there (Tavily's own terms apply).
- Nothing runs locally and no install-time script exists.

## Manual install without the CLI / 手工安装

If you prefer not to use `dsh plugin add`, add this to your profile's `cordis.patch.yml` instead
(one entry per MCP server; do **not** add it twice, duplicate `serverName`s are rejected):

```yaml
- insert:
    - id: mcp-tavily
      name: "@deepseek-ai/dsh-mcp-client"
      config:
        serverName: tavily
        transport: streamable-http
        url: https://mcp.tavily.com/mcp/
        headers:
          Authorization: !!js '`Bearer ${process.env.TAVILY_API_KEY}`'
        failOnStartupError: false
```

### No static `@deepseek-ai/*` imports

Everything optional is pulled in through a guarded dynamic import. A static import
that fails to resolve would take the whole plugin - and with it the search seam -
down, which is exactly what a `link:` install triggers when its dependencies are
not linked. `@deepseek-ai/schemastery` is used only to shape the settings form: if
it is missing the provider still works and simply exposes no form.
## Related work / 相关工作

Prior art worth knowing about: **[@pymodel/dsh-tavily](https://www.npmjs.com/package/@pymodel/dsh-tavily)**
(from [`PyModel/dsh-research-plugins`](https://github.com/PyModel/dsh-research-plugins)) covers the same
ground with more machinery — a settings card, the key kept on the credentials plane (never in a settings
file), a toggle between DeepSeek's built-in search and Tavily, and keyless search/extract plus crawl/map
out of the box. It ships through npm, so installing it needs neither git nor a pnpm build-script allowance.

This bundle deliberately sits at the other end of the spectrum: **five files, ~8 KB, zero code, zero
dependencies, no install-time scripts** — small enough to read end to end in a few minutes, which makes it
a usable reference for what a dsh plugin bundle actually is.

Both approaches register the same `mcp__tavily__*` tool family, so pick one: **do not install both**, the
duplicate `serverName: tavily` registration is rejected.

## License / 许可

MIT — see [LICENSE](./LICENSE).

Tavily is a third-party service; this project is not affiliated with Tavily or DeepSeek.
