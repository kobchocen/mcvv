import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const legacyRuleContextMethods = {
  getAncestors(context, currentNode) {
    return context.sourceCode.getAncestors(currentNode ?? context.sourceCode.ast);
  },
  getCwd(context) {
    return context.cwd;
  },
  getDeclaredVariables(context, node) {
    return context.sourceCode.getDeclaredVariables(node);
  },
  getFilename(context) {
    return context.filename;
  },
  getPhysicalFilename(context) {
    return context.physicalFilename;
  },
  getScope(context, currentNode) {
    return context.sourceCode.getScope(currentNode ?? context.sourceCode.ast);
  },
  getSourceCode(context) {
    return context.sourceCode;
  },
  markVariableAsUsed(context, currentNode, name, node = currentNode) {
    return context.sourceCode.markVariableAsUsed(name, node ?? context.sourceCode.ast);
  },
};

const getCurrentNode = (args) => args.find((arg) => arg && typeof arg.type === "string") ?? null;

const wrapRuleListeners = (listeners, setCurrentNode) =>
  Object.fromEntries(
    Object.entries(listeners).map(([listenerName, listener]) => [
      listenerName,
      typeof listener !== "function"
        ? listener
        : (...args) => {
            const nextCurrentNode = getCurrentNode(args);

            if (nextCurrentNode) {
              setCurrentNode(nextCurrentNode);
            }

            return listener(...args);
          },
    ]),
  );

const pluginFixupCache = new WeakMap();

const fixupPluginRules = (plugin) => {
  const cachedPlugin = pluginFixupCache.get(plugin);

  if (cachedPlugin) {
    return cachedPlugin;
  }

  const fixedPlugin = {
    ...plugin,
    rules: Object.fromEntries(
      Object.entries(plugin.rules ?? {}).map(([ruleName, rule]) => [
        ruleName,
        {
          ...rule,
          create(context) {
            let currentNode = null;
            const contextWithLegacyMethods = new Proxy(context, {
              get(target, property, receiver) {
                if (property in legacyRuleContextMethods) {
                  return (...args) =>
                    legacyRuleContextMethods[property](target, currentNode, ...args);
                }

                return Reflect.get(target, property, receiver);
              },
            });

            return wrapRuleListeners(rule.create(contextWithLegacyMethods), (node) => {
              currentNode = node;
            });
          },
        },
      ]),
    ),
  };

  pluginFixupCache.set(plugin, fixedPlugin);

  return fixedPlugin;
};

const fixupConfigRules = (configs) =>
  configs.map((config) => ({
    ...config,
    plugins: Object.fromEntries(
      Object.entries(config.plugins ?? {}).map(([pluginName, plugin]) => [
        pluginName,
        fixupPluginRules(plugin),
      ]),
    ),
  }));

const eslintConfig = defineConfig([
  ...fixupConfigRules(nextVitals),
  ...fixupConfigRules(nextTs),

  // Shadcn/ui generated components intentionally use `any` for complex integrations
  // (recharts, radix, etc.). Do not edit the primitives; relax the rule for this folder.
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
