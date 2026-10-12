/**
 * dsh-mcp-tavily - bundle entry point.
 *
 * This plugin is configuration-only: cordis.patch.yml inserts one MCP client row
 * that registers Tavily's hosted remote MCP server under the "tavily" namespace.
 * There is no runtime behaviour to apply here, so `apply` is intentionally a
 * no-op. It exists so the package is a well-formed dsh plugin module.
 */
export function apply(ctx) {
  void ctx;
}