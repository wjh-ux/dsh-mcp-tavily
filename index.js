/**
 * dsh-mcp-tavily - host half.
 *
 * Registers Tavily as a web-search provider on the `ctx.web` seam so the
 * built-in `web_search` tool can run on Tavily's free monthly credits instead of
 * DeepSeek's own (token-billed) server-side search.
 *
 * The API key is configurable **visually**: this module exports a schemastery
 * `Config` whose `apiKey` field carries `role("secret")`, and dsh projects that
 * schema into this plugin's settings page - the same mechanism the built-in
 * `web-search-deepseek` provider uses for its Endpoint field. Secret-role values
 * live on the credentials plane, not in the profile's settings file.
 *
 * Key resolution order at search time:
 *   1. the `apiKey` field saved from the settings page (credentials plane);
 *   2. the credential reference named by `apiKeyEnv` (default TAVILY_API_KEY):
 *      the credentials service first, then process.env;
 *   3. nothing at all -> Tavily's free, rate-limited "keyless" mode.
 *
 * DESIGN NOTE - why there are no static `@deepseek-ai/*` imports here:
 * a plugin installed with `dsh plugin add link:<dir>` does not necessarily get
 * its dependencies linked, and a static import that fails to resolve takes the
 * whole plugin down with it (the search seam then reports
 * `configured web provider "tavily" is not registered`). Everything optional is
 * therefore loaded through a guarded dynamic import, and the plugin works with
 * nothing but `ctx` plus the global `fetch`.
 */

/** Registry id - must not collide with deepseek-official / exa. */
export const PROVIDER_ID = "tavily";

/** Cordis plugin name, used by loader diagnostics. */
export const name = "web-search-tavily";

/** The web seam this provider registers into. */
export const inject = ["web"];

const TAVILY_HOST = "https://api.tavily.com";
const DEFAULT_KEY_ENV = "TAVILY_API_KEY";
const DEFAULT_TIMEOUT_MS = 30_000;
/** Tavily search_depth tiers: basic | advanced | fast. */
const SEARCH_DEPTHS = ["basic", "advanced", "fast"];
/** Credential refs are constrained to this shape by the credentials domain. */
const CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Settings form schema. Optional: if `@deepseek-ai/schemastery` cannot be
 * resolved (a link: install without linked dependencies), the plugin still loads
 * and simply exposes no settings form.
 *
 * `role("secret")` routes the value to the credentials plane; `.volatile()`
 * keeps it out of the profile's settings file; `role("credential-ref")` marks a
 * reference field.
 */
let schema = null;
try {
  const mod = await import("@deepseek-ai/schemastery");
  schema = mod?.default ?? mod;
} catch {
  schema = null;
}

/** Call an optional chainable helper only when this build offers it. */
function opt(field, helper, ...args) {
  return typeof field?.[helper] === "function" ? field[helper](...args) : field;
}

/**
 * The public schemastery build lacks helpers the harness build has (notably
 * `.volatile()`), so every optional call is guarded - a schema that is merely
 * less decorated still renders a form.
 */
function buildConfig(z) {
  let apiKey = z.string();
  apiKey = opt(apiKey, "role", "secret");
  apiKey = opt(apiKey, "volatile");

  let apiKeyEnv = z.string();
  apiKeyEnv = opt(apiKeyEnv, "role", "credential-ref");
  apiKeyEnv = opt(apiKeyEnv, "default", DEFAULT_KEY_ENV);
  apiKeyEnv = opt(apiKeyEnv, "volatile");

  let maxResults = z.number();
  maxResults = opt(maxResults, "step", 1);
  maxResults = opt(maxResults, "min", 1);
  maxResults = opt(maxResults, "max", 20);
  maxResults = opt(maxResults, "default", 5);

  let searchDepth = z.string();
  searchDepth = opt(searchDepth, "default", "basic");

  let timeoutMs = z.number();
  timeoutMs = opt(timeoutMs, "step", 1);
  timeoutMs = opt(timeoutMs, "min", 1);
  timeoutMs = opt(timeoutMs, "default", DEFAULT_TIMEOUT_MS);

  return z.object({ apiKey, apiKeyEnv, maxResults, searchDepth, timeoutMs });
}

export const Config = schema ? buildConfig(schema) : undefined;

/**
 * WebError is preferred for the seam's error taxonomy, but it lives in a package
 * that may not be linked. Try it once, fall back to a local look-alike: the
 * `code` property is what carries the taxonomy.
 */
let WebErrorImpl = class TavilyWebError extends Error {
  constructor(message, code, options) {
    super(message, options);
    this.name = "WebError";
    this.code = code || "WEB_PROVIDER_ERROR";
  }
};
let webErrorResolved = false;

async function webError(message, code, options) {
  if (!webErrorResolved) {
    webErrorResolved = true;
    try {
      const mod = await import("@deepseek-ai/dsh-web");
      if (typeof mod?.WebError === "function") WebErrorImpl = mod.WebError;
    } catch {
      // keep the local fallback
    }
  }
  return new WebErrorImpl(message, code, options);
}

/** Resolve the API key: config value -> credentials plane -> process env. */
async function resolveKey(ctx, envName, literal) {
  if (typeof literal === "string" && literal.length > 0) return literal;

  const ref = CREDENTIAL_REF.test(envName || "") ? envName : DEFAULT_KEY_ENV;
  try {
    const credentials = ctx.get("credentials");
    if (credentials) {
      const resolved = await credentials.resolve(ref);
      if (resolved?.value && resolved.value.length > 0) return resolved.value;
    }
  } catch {
    // fall through to the environment
  }

  const fromEnv = process.env[ref];
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;

  return undefined;
}

/** Keyed requests use a bearer token; without a key we ask for keyless mode. */
function tavilyHeaders(apiKey) {
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  else headers["x-tavily-access-mode"] = "keyless";
  return headers;
}

function normalizedDepth(depth) {
  return SEARCH_DEPTHS.includes(depth) ? depth : "basic";
}

/** Map Tavily's REST payload onto the web seam's source shape. */
function toSources(body) {
  const rows = Array.isArray(body?.results) ? body.results : [];
  const sources = [];
  for (const row of rows) {
    if (typeof row?.url !== "string" || row.url.length === 0) continue;
    const item = { url: row.url };
    if (typeof row.title === "string" && row.title) item.title = row.title;
    if (typeof row.content === "string" && row.content) item.snippet = row.content.slice(0, 800);
    if (typeof row.published_date === "string" && row.published_date) item.publishedAt = row.published_date;
    sources.push(item);
  }
  return { sources, truncated: false };
}

function deadlineSignal(signal, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return signal;
  const timer = AbortSignal.timeout(timeoutMs);
  if (!signal) return timer;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, timer]);
  const controller = new AbortController();
  signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  timer.addEventListener("abort", () => controller.abort(timer.reason), { once: true });
  return controller.signal;
}

async function tavilyErrorText(res) {
  let message = `Tavily API error (HTTP ${res.status})`;
  try {
    const json = await res.json();
    const detail = typeof json?.error === "string"
      ? json.error
      : json?.error?.message || json?.message || json?.detail;
    if (typeof detail === "string" && detail.length > 0) message = detail;
  } catch {
    // keep the status-line fallback
  }
  return message;
}

/** One Tavily /search call, mapped to the seam's result shape. */
async function searchTavily(query, opts, signal) {
  const requestSignal = deadlineSignal(signal, opts.timeoutMs);
  let res;
  try {
    res = await fetch(`${TAVILY_HOST}/search`, {
      method: "POST",
      redirect: "error",
      headers: tavilyHeaders(opts.apiKey),
      body: JSON.stringify({
        query,
        max_results: opts.maxResults,
        search_depth: normalizedDepth(opts.searchDepth),
        chunks_per_source: 3,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      }),
      ...(requestSignal ? { signal: requestSignal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw await webError(`Tavily search timed out after ${opts.timeoutMs}ms`, "WEB_PROVIDER_ERROR", { cause: error });
    }
    if (signal?.aborted) throw await webError("Tavily search aborted", "WEB_ABORTED", { cause: error });
    throw await webError(`Tavily request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
  }
  if (!res.ok) throw await webError(await tavilyErrorText(res), "WEB_PROVIDER_ERROR");
  try {
    return toSources(await res.json());
  } catch (error) {
    throw await webError(`Tavily returned an unprocessable response: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
  }
}

class TavilySearchProvider {
  id = PROVIDER_ID;

  constructor(getOptions) {
    this.getOptions = getOptions;
  }

  available() {
    return true;
  }

  async search(request, signal) {
    const options = this.getOptions();
    const apiKey = await resolveKey(options.ctx, options.apiKeyEnv, options.apiKey);
    return searchTavily(request.query, {
      apiKey,
      maxResults: request.maxResults ?? options.maxResults,
      searchDepth: options.searchDepth,
      timeoutMs: options.timeoutMs,
    }, signal);
  }
}

export function apply(ctx, config = {}) {
  ctx.web.registerSearchProvider(new TavilySearchProvider(() => ({
    ctx,
    apiKey: config.apiKey,
    apiKeyEnv: config.apiKeyEnv || DEFAULT_KEY_ENV,
    maxResults: config.maxResults || 5,
    searchDepth: config.searchDepth || "basic",
    timeoutMs: config.timeoutMs || DEFAULT_TIMEOUT_MS,
  })));
}
