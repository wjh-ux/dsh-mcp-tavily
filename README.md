# dsh-mcp-tavily

**Tavily web search for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`)** — a
plugin bundle with two halves: it serves the built-in `web_search` from Tavily's API, and bridges Tavily's
hosted **remote MCP server** for `crawl` / `map` / `research`. The API key is set on a small card in the
Plugins panel. No local server, no `npx`, no build step.

**给 DeepSeek Harness 的 Tavily 联网搜索** —— 两半：让内置 `web_search` 改由 Tavily 供货，并桥接
Tavily 的**远程 MCP 服务器**（爬站 / 站点地图 / 深度研究）。API Key 在插件面板的小卡片里填。
不需要本地起服务、不需要 `npx`、不需要构建。

---

## Why / 为什么

DSH's built-in `web_search` is backed by DeepSeek's own endpoint: every search is a full auxiliary model
turn billed as tokens on your DeepSeek account. This bundle points that seam at Tavily instead, and adds
Tavily's MCP tools on top, so ordinary lookups spend Tavily's free monthly credits (1,000/month) and the
heavier work — `crawl` / `map` / `research` — becomes available at all.

DSH 内置的 `web_search` 走 DeepSeek 自己的端点，每次搜索都是"一次完整的辅助模型请求"，按 token 计费。
本插件把这条 seam 指向 Tavily，并额外接上 Tavily 的 MCP 工具：日常检索花 Tavily 的免费额度
（1,000 credits/月），重活（爬站 / 站点地图 / 深度研究）也才有得用。

## Tools added / 新增工具

| Tool | What it does / 作用 |
|---|---|
| `web_search` | The built-in tool, unchanged for the model — now answered by Tavily. |
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

The key is typed into the UI; no environment variable is required.

**Plugins -> `dsh-mcp-tavily`** — the card sits on the bundle page between its description and its rows.
The same form is also reachable from the row's **Configure** control.

| Control | Meaning |
|---|---|
| **API Key** | A Tavily key (`tvly-...`), written to the credentials plane (`TAVILY_API_KEY`) as a secret — never to a settings file, never into this repository. |
| **Show / Hide** | Reveal the draft before saving. |
| **Save / Clear key** | Store or remove the credential. |

The status line is read from the credentials store, so it says exactly which source is in play:

| Status | Meaning |
|---|---|
| `Tavily API key configured` | Stored on the credentials plane — the card owns it and can replace or clear it. |
| `Supplied by the launch environment's TAVILY_API_KEY (read-only here)` | The key comes from the environment of the process that started `dsh`. The store refuses to shadow it, so **Save is disabled**: delete that environment variable first if you want the card to own the key. |
| `No key on the credentials plane ...` | Neither source has a key; searches use Tavily's free rate-limited keyless mode. |

**When a change takes effect**: the built-in `web_search` re-resolves the key on every request, so a key
saved in the card applies immediately. The MCP tools fix their `Authorization` header when their client is
mounted, so a **newly saved key reaches them on the next restart**.

**生效时机**：内置 `web_search` 每次请求都重新解析 key，所以卡片里保存后**立即生效**；MCP 工具在挂载时
固定请求头，**新 key 需要下次重启**才对它们生效。

## Key resolution order / Key 解析顺序

1. An explicit `apiKey` in the plugin's config, if a settings surface supplies one;
2. the credentials plane, under the `apiKeyEnv` reference (default `TAVILY_API_KEY`);
3. the process environment, same reference;
4. otherwise Tavily's free, rate-limited **keyless** mode.

Both halves use the same function, which is why the card can key the MCP tools too.

## Configure without the card / 不用卡片

```sh
# Windows — then fully restart dsh
setx TAVILY_API_KEY "tvly-..."
# macOS / Linux
export TAVILY_API_KEY=tvly-...
```

Get a free key at <https://app.tavily.com> (1,000 credits/month, no credit card). With nothing configured
at all, both halves still work through Tavily's keyless mode — which supports `search` and `extract` only
(no `crawl` / `map` / `research`), at a lower rate limit.

## Billing / 计费

- Free: **1,000 credits / month**; `basic` search = 1 credit, `advanced` search = 2 credits;
- Beyond the free tier: $0.008 per credit (Tavily pricing, subject to change);
- Usage dashboard: <https://app.tavily.com>.

## Compatibility / 兼容性

- Verified against **dsh 0.2.0-rc.2** on Windows (`@deepseek-ai/dsh-mcp-client` 0.2.0-rc.2).
- The host half depends on the MCP client's `serverName` / `transport` / `url` / `headers` config fields
  and on the `ctx.web` search-provider seam.
- The card needs a dsh whose client supports the `plugins.bundle.config` slot and a package-level
  `dsh.client` manifest. On an older build the host halves still work; only the card is missing.
- `@deepseek-ai/schemastery` is optional: without it the provider still runs and simply exposes no
  schema-derived settings form.

## Security / 安全

- **No secrets in this repository, and none in the patch.** The key lives on the credentials plane
  (`$DSH_HOME/.credentials.yaml`, or the store your dsh mounts) or in your environment.
- The key is never put into the URL, where it would leak into logs and proxies.
- Outbound traffic is one HTTPS connection to `https://mcp.tavily.com/mcp/` plus the `api.tavily.com`
  search endpoint; your queries and this plugin's user agent are the only things sent there (Tavily's own
  terms apply).
- No install-time scripts; nothing is compiled at install time.

## Implementation notes / 实现要点

Four things in this package exist because dsh's own module and service wiring demands them. They are the
reason this bundle is a useful reference rather than just five files of YAML.

1. **The client half must self-register.** `client.js` opens with
   `window.__ModuleLoader__.load({ id: "dsh-mcp-tavily", factory: (require) => { ... } })`. dsh's browser
   side is a lazy-CJS module table; a file that merely exports a factory (or has a top-level
   `return module.exports`) is a syntax error there, and the failure surfaces as
   `web boot: 1 entry did not activate` — with the web UI still loading, which makes it easy to misread.
2. **`exports.inject` takes service names, not package names.** `client.js` declares
   `["slots", "locale", "remote", "remote.credentials"]`. The *packages* that must load first are listed in
   `package.json` under `dsh.client.inject`; putting package names in the module's `inject` makes cordis
   look for services that do not exist.
3. **A `link:`-installed plugin cannot load a harness package with a plain `import()`.** Node resolves from
   this package's own directory, and a linked install has no `@deepseek-ai/dsh-mcp-client` there. The Cordis
   loader can, because it resolves against the harness's own module root — which is exactly how a
   patch-inserted row finds its package by name. So `index.js` uses
   `ctx.loader.internal.import(name, ctx.loader.baseUrl, {})`.
4. **The credentials provider mounts after plugins do.** Resolving the key during `apply` therefore finds no
   service and silently degrades to keyless, which is how a card-saved key can look "ignored". `index.js`
   waits with `ctx.inject(["credentials"], (child) => ...)`, with a bounded fallback so a composition that
   mounts no credential provider still gets its tools.

The card parses credential answers defensively for the same reason: a remote call returns
`{ ok, value }`, and `describe` returns a map keyed by reference — `value.TAVILY_API_KEY` — whose entries
are `{ configured, source?, writable }` and never the secret itself.

## Manual install without the CLI / 手工安装

Add the bundle through your profile's `cordis.patch.yml`; the plugin inserts its own row and mounts its own
MCP client, so **do not add a `@deepseek-ai/dsh-mcp-client` row for `tavily` as well** — a duplicate
`serverName` is rejected:

```yaml
# profile cordis.patch.yml
- id: web
  config:
    searchProvider: tavily
    fetchProvider: http
- insert:
    - id: web-search-tavily
      name: dsh-mcp-tavily
```

The `web` override replaces that entry's whole `config`, so `fetchProvider` has to be restated; without it a
second fetch provider makes web fetching fail as `WEB_PROVIDER_AMBIGUOUS`.

## Related work / 相关工作

- **[@pymodel/dsh-tavily](https://www.npmjs.com/package/@pymodel/dsh-tavily)**
  ([`PyModel/dsh-research-plugins`](https://github.com/PyModel/dsh-research-plugins)) — same ground with more
  machinery: a settings card, the key on the credentials plane, a toggle between DeepSeek's built-in search
  and Tavily, a connection test, and keyless out of the box.
- **[`dsh-plugin-web-search-tavily`](https://github.com/deepseek-ai/deepseek-harness/discussions/2021)** —
  does one thing: swaps the built-in `web_search` backend to Tavily. Useful if that is all you need.

This bundle sits between them: a search provider **and** the MCP tool family, keyed from one card, with no
build step and no bundled runtime dependencies. All three register the same `serverName` or the same seam,
so pick one — do not install two Tavily providers side by side.

## License / 许可

MIT — see [LICENSE](./LICENSE).

Tavily is a third-party service; this project is not affiliated with Tavily or DeepSeek.
