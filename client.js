/**
 * dsh-mcp-tavily - client half: the API-key card.
 *
 * dsh renders a plugin's configuration area in the Plugins panel through the
 * `plugins.bundle.config` slot (keyed by the bundle's package name) and a single
 * row's area through `plugins.row.config` (keyed by "<package>#<row id>"). A
 * client module has to register those slots itself - exporting a Config schema
 * alone does not render a form.
 *
 * This file must register a factory with `window.__ModuleLoader__` under the
 * bare package name: dsh's browser half is a lazy-CJS module table, and a bare
 * top-level `return module.exports` outside that wrapper is a syntax error that
 * shows up as "web boot: 1 entry did not activate / import failed".
 *
 * Keep the `window.__ModuleLoader__.load({ id, factory })` wrapper intact: the
 * factory body below is the whole card, and this file is hand-maintained.
 */
window.__ModuleLoader__.load({
  id: "dsh-mcp-tavily",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const h = react.createElement;

    // First of two diagnostic lines: proves the browser half was fetched and evaluated.
    console.info("[dsh-mcp-tavily] client module evaluated");

    /** Credential reference the host half reads (see index.js). */
    const KEY_REF = "TAVILY_API_KEY";
    /** The bundle's own configuration area on its page (key = package name). */
    const SLOT_BUNDLE_CONFIG = "plugins.bundle.config";
    /** One row's configuration area (key = "<package name>#<row id>"). */
    const SLOT_ROW_CONFIG = "plugins.row.config";
    /** Row id this bundle's cordis.patch.yml inserts. */
    const ROW_ID = "web-search-tavily";
    /** Must equal this bundle's package name. */
    const BUNDLE_KEY = "dsh-mcp-tavily";
    /** Locale namespace for the few strings this card owns. */
    const LOCALE_NS = "dsh-mcp-tavily";

    const CSS = `
    .dshTavilyCard{display:flex;flex-direction:column;gap:8px;padding:12px 0}
    .dshTavilyStatus{font-size:12px;opacity:.75}
    .dshTavilyDot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;background:#b26a00;vertical-align:middle}
    .dshTavilyDotOn{background:#2ea043}
    .dshTavilyRow{display:flex;gap:8px;align-items:center}
    .dshTavilyInput{flex:1;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font:inherit}
    .dshTavilyBtn{padding:5px 10px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;font:inherit;cursor:pointer}
    .dshTavilyBtn:disabled{opacity:.5;cursor:default}
    .dshTavilyPrimary{border-color:transparent;background:rgba(46,160,67,.18)}
    .dshTavilyHint,.dshTavilyMsg{margin:0;font-size:12px;opacity:.7}
    .dshTavilyErr{color:#d1242f;opacity:1}
    `;

    function injectCss() {
      const tagId = LOCALE_NS + "/card.css";
      if (typeof document === "undefined") return;
      if (document.querySelector('style[data-plugin-css="' + tagId + '"]') !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = LOCALE_NS;
      tag.dataset.pluginCss = tagId;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    /** `remote.credentials` writes resolve `{ ok, error }` instead of throwing. */
    function written(result) {
      return result && typeof result === "object" ? result.ok !== false : true;
    }

    /**
     * Read what the credentials store reports about one reference.
     *
     * Two envelopes sit between the caller and the answer:
     *   1. a remote-call result, `{ ok: true, value }` or `{ ok: false, error }`;
     *   2. a map keyed by reference, `{ TAVILY_API_KEY: { configured, source?, writable } }`.
     * `describe` is value-free, so `source === "env"` is how the card can tell
     * that the launch environment supplies the key - which is also the case in
     * which `set` rejects, because a read-only source would shadow the stored
     * value.
     */
    function readState(response, ref) {
      const empty = { configured: false, source: undefined, writable: true };
      if (!response) return empty;
      const payload = typeof response === "object" && "ok" in response ? response.value : response;
      if (!payload || (typeof response === "object" && response.ok === false)) return empty;

      const row = Array.isArray(payload)
        ? payload.find((item) => (item?.ref ?? item?.reference ?? item?.name ?? item?.id) === ref)
        : (payload[ref] ?? payload.refs?.[ref] ?? payload.entries?.[ref] ?? payload.values?.[ref]);
      if (row === undefined || row === null) return empty;
      if (typeof row === "boolean") return { configured: row, source: undefined, writable: !row };
      return {
        configured: Boolean(row.configured ?? row.present ?? row.set ?? row.hasValue ?? row.exists ?? row.value),
        source: typeof row.source === "string" ? row.source : undefined,
        writable: row.writable === undefined ? true : Boolean(row.writable),
      };
    }

    /**
     * Service names this client plugin consumes - NOT package names.
     *
     * Package names belong in package.json's `dsh.client.inject`, which merely lists
     * what must be loaded first. Listing packages here instead makes cordis look for
     * services that do not exist by those names, which fails the client module load
     * and takes the whole web UI down with it.
     */
    const inject = ["slots", "locale", "remote", "remote.credentials"];

    function apply(ctx) {
      const credentials = ctx.remote.credentials;

      /** Cards mounted right now, so a credential change can refresh them. */
      const listeners = new Set();

      // Everything below is wrapped: a bug in the card must never be able to take
      // the web UI down (that is exactly how a bad client module bricks the app).
      try {
      ctx.effect(() => injectCss(), "dsh-mcp-tavily css");
      ctx.effect(() => {
        const unsubscribe = ctx.remote.$on?.("credentials/reference-updated", () => {
          for (const listener of listeners) {
            try {
              listener();
            } catch {
              // one broken card must not stop the others
            }
          }
        });
        return typeof unsubscribe === "function" ? unsubscribe : undefined;
      }, "dsh-mcp-tavily credentials events");
      ctx.effect(() => ctx.locale.register(LOCALE_NS, {
        en: {
          configured: "Tavily API key configured",
          keyless: "No key on the credentials plane - falls back to the launch environment's TAVILY_API_KEY, then to Tavily's free keyless mode",
          placeholderKeep: "Leave blank to keep the current key",
          placeholderEmpty: "tvly-... (optional; blank = keyless)",
          show: "Show",
          hide: "Hide",
          save: "Save",
          saving: "Saving...",
          clear: "Clear key",
          saved: "Saved. Takes effect immediately - no restart needed.",
          cleared: "Key removed. Searches fall back to keyless.",
          failed: "Save failed",
          fromEnv: "Supplied by the launch environment's TAVILY_API_KEY (read-only here)",
          envReadOnly: "The launch environment already supplies TAVILY_API_KEY, so the credentials store refuses to shadow it. Remove that environment variable first if you want this card to own the key.",
          hint: "Stored on the credentials plane, not in the settings file.",
        },
        zh: {
          configured: "已配置 Tavily API Key",
          keyless: "凭证平面未存 Key —— 回落到启动环境的 TAVILY_API_KEY，都没有时走 Tavily 免费 keyless 模式",
          placeholderKeep: "留空则保留当前 Key",
          placeholderEmpty: "tvly-...（可留空，留空即 keyless）",
          show: "显示",
          hide: "隐藏",
          save: "保存",
          saving: "保存中...",
          clear: "清除 Key",
          saved: "已保存，立即生效（无需重启）",
          cleared: "已清除，搜索回落到 keyless",
          failed: "保存失败",
          fromEnv: "由启动环境变量 TAVILY_API_KEY 提供（此处只读）",
          envReadOnly: "启动环境已提供 TAVILY_API_KEY，凭证库拒绝存储会被它盖掉的值。要让这张卡片接管，请先删除该环境变量再保存。",
          hint: "存在凭证平面，不写入设置文件。",
        },
      }), "dsh-mcp-tavily locale");

      function TavilyKeyCard(props) {
        const [value, setValue] = react.useState("");
        const [show, setShow] = react.useState(false);
        const [configured, setConfigured] = react.useState(false);
        const [source, setSource] = react.useState(undefined);
        const [writable, setWritable] = react.useState(true);
        const [busy, setBusy] = react.useState(false);
        const [message, setMessage] = react.useState("");
        const [failed, setFailed] = react.useState(false);

        /**
         * The slot machinery hands the card a translator for the locale namespace
         * declared in the slot definition; fall back to English when it is absent.
         */
        const t = (key, fallback) => {
          try {
            const translated = props?.t?.(key);
            return typeof translated === "string" && translated.length > 0 ? translated : fallback;
          } catch {
            return fallback;
          }
        };

        /**
         * Turn a failed credential write into copy that names the real cause.
         * credentials-local refuses to store a name the launching environment
         * already supplies, and that refusal is the one failure a user can fix.
         */
        const failureText = (failure) => {
          const text = failure?.error ? String(failure.error) : failure ? String(failure) : "";
          if (/read-?only|launching environment|shadow/i.test(text)) {
            return t("envReadOnly", "The launch environment already supplies TAVILY_API_KEY, so the credentials store refuses to shadow it. Remove that environment variable first if you want this card to own the key.");
          }
          return text || t("failed", "Save failed");
        };

        const refresh = react.useCallback(async () => {
          try {
            let response;
            try {
              response = await credentials.describe([KEY_REF]);
            } catch {
              // Some builds accept one reference at a time.
              response = await credentials.describe(KEY_REF);
            }
            const info = readState(response, KEY_REF);
            setConfigured(info.configured);
            setSource(info.source);
            setWritable(info.writable);
          } catch {
            // A describe failure must not break the card; Save/Clear still work.
          }
        }, []);

        react.useEffect(() => { refresh(); }, [refresh]);

        // Keep the card honest when the credential changes elsewhere.
        react.useEffect(() => {
          listeners.add(refresh);
          return () => { listeners.delete(refresh); };
        }, [refresh]);

        async function save() {
          const trimmed = value.trim();
          if (trimmed.length === 0) return;
          setBusy(true);
          setFailed(false);
          try {
            const result = await credentials.set(KEY_REF, trimmed);
            if (!written(result)) {
              setFailed(true);
              setMessage(failureText(result));
            } else {
              setValue("");
              setConfigured(true);
              setMessage(t("saved", "Saved. Takes effect immediately - no restart needed."));
            }
          } catch (error) {
            setFailed(true);
            setMessage(failureText(error));
          } finally {
            setBusy(false);
          }
        }

        async function clear() {
          setBusy(true);
          setFailed(false);
          try {
            const result = await credentials.unset(KEY_REF);
            if (!written(result)) {
              setFailed(true);
              setMessage(failureText(result));
            } else {
              setConfigured(false);
              setValue("");
              setMessage(t("cleared", "Key removed. Searches fall back to keyless."));
            }
          } catch (error) {
            setFailed(true);
            setMessage(failureText(error));
          } finally {
            setBusy(false);
          }
        }

        const status = configured
          ? (source === "env"
              ? t("fromEnv", "Supplied by the launch environment's TAVILY_API_KEY (read-only here)")
              : t("configured", "Tavily API key configured"))
          : t("keyless", "No key on the credentials plane - falls back to the launch environment's TAVILY_API_KEY, then to Tavily's free keyless mode");

        // The Plugins page asks every config slot for a one-liner under the title.
        if (props?.view === "summary") return h("span", null, status);

        return h("div", { className: "dshTavilyCard" }, [
          h("div", { key: "status", className: "dshTavilyStatus" }, [
            h("span", { key: "dot", className: configured ? "dshTavilyDot dshTavilyDotOn" : "dshTavilyDot", "aria-hidden": true }),
            h("span", { key: "text" }, status),
          ]),
          h("div", { key: "row", className: "dshTavilyRow" }, [
            h("input", {
              key: "input",
              className: "dshTavilyInput",
              type: show ? "text" : "password",
              value,
              autoComplete: "off",
              spellCheck: false,
              placeholder: configured ? t("placeholderKeep", "Leave blank to keep the current key") : t("placeholderEmpty", "tvly-..."),
              onChange: (event) => setValue(event.target.value),
              onKeyDown: (event) => { if (event.key === "Enter") save(); },
            }),
            h("button", { key: "show", type: "button", className: "dshTavilyBtn", onClick: () => setShow(!show) }, show ? t("hide", "Hide") : t("show", "Show")),
          ]),
          h("div", { key: "actions", className: "dshTavilyRow" }, [
            h("button", { key: "save", type: "button", className: "dshTavilyBtn dshTavilyPrimary", disabled: busy || !writable || value.trim().length === 0, onClick: save }, busy ? t("saving", "Saving...") : t("save", "Save")),
            h("button", { key: "clear", type: "button", className: "dshTavilyBtn", disabled: busy || !writable || !configured, onClick: clear }, t("clear", "Clear key")),
          ]),
          message ? h("p", { key: "msg", className: failed ? "dshTavilyMsg dshTavilyErr" : "dshTavilyMsg" }, message) : null,
          source === "env"
            ? h("p", { key: "envhint", className: "dshTavilyHint" }, t("envReadOnly", "The launch environment already supplies TAVILY_API_KEY, so the credentials store refuses to shadow it. Remove that environment variable first if you want this card to own the key."))
            : null,
          h("p", { key: "hint", className: "dshTavilyHint" }, t("hint", "Stored on the credentials plane, not in the settings file.")),
        ]);
      }

      const definition = (name, key) => ({
        name,
        key,
        locale: LOCALE_NS,
        inject: () => ({ hooks: {} }),
      });

      // Second diagnostic line: the slot exists and the ledger therefore knows this
      // key. The Plugins page builds its configuration ledger straight from the
      // `options.key` of these registrations, so a silent no-show means either this
      // line never printed (slot never appeared) or the key does not match what the
      // page looks up.
      const registerCard = (slot, key) => {
        ctx.slots.inject(slot, () => {
          const dispose = ctx.slots.register(definition(slot, key), TavilyKeyCard);
          console.info("[dsh-mcp-tavily] card registered into", slot, "with key", key);
          return dispose;
        });
      };

      // The bundle's own configuration area on its page in the Plugins panel.
      registerCard(SLOT_BUNDLE_CONFIG, BUNDLE_KEY);
      // The same form as one row's configuration, which also gives that row a
      // Configure control; the key is "<package name>#<row id>".
      registerCard(SLOT_ROW_CONFIG, BUNDLE_KEY + "#" + ROW_ID);
      } catch (error) {
        // Leave the plugin inert rather than breaking the client boot.
        console.error("[dsh-mcp-tavily] settings card failed to register", error);
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
