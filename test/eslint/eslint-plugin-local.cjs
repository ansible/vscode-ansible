"use strict";
/**
 * ESLint rule to detect unsafe child_process spawn/spawnSync calls
 * that use a single string argument instead of separate command and args array.
 *
 * This prevents shell injection vulnerabilities and ensures proper argument handling.
 */

const rule = {
  create(context) {
    /**
     * Check if a call expression is spawn or spawnSync
     */
    function isSpawnCall(node) {
      if (node.type !== "CallExpression" || !("callee" in node)) {
        return false;
      }
      const callee = node.callee;
      // Check for: spawnSync(...) or spawn(...) as identifier
      if (callee.type === "Identifier") {
        return callee.name === "spawnSync" || callee.name === "spawn";
      }
      // Check for: child_process.spawnSync(...) or cp.spawnSync(...)
      if (
        callee.type === "MemberExpression" &&
        "property" in callee &&
        callee.property &&
        callee.property.type === "Identifier"
      ) {
        const methodName = callee.property.name;
        return methodName === "spawnSync" || methodName === "spawn";
      }
      return false;
    }
    /**
     * Check if the call is unsafe (command string instead of command + args array)
     */
    function isUnsafeCall(node) {
      const args = node.arguments;
      if (!args || args.length === 0) {
        return false;
      }
      const firstArg = args[0];
      if (!firstArg) {
        return false;
      }
      // If there's a second argument that's an array, it's safe (proper usage)
      if (args.length > 1 && args[1].type === "ArrayExpression") {
        return false;
      }
      // Check if second argument is an options object with shell: true
      // This is unsafe because it goes through shell interpretation
      if (
        args.length > 1 &&
        args[1].type === "ObjectExpression" &&
        "properties" in args[1]
      ) {
        const properties = args[1].properties;
        for (const prop of properties) {
          if (
            prop.type === "Property" &&
            "key" in prop &&
            prop.key.type === "Identifier" &&
            prop.key.name === "shell" &&
            "value" in prop &&
            prop.value.type === "Literal" &&
            prop.value.value === true
          ) {
            // shell: true is unsafe - flag it
            return true;
          }
        }
      }
      // Check if first argument is a string literal with spaces
      if (firstArg.type === "Literal" && typeof firstArg.value === "string") {
        const value = firstArg.value.trim();
        // Flag if it contains spaces (command + args) but allow single commands
        return value.includes(" ") && value.length > 0;
      }
      // Check if it's a template literal
      if (firstArg.type === "TemplateLiteral") {
        const quasis = firstArg.quasis || [];
        for (const quasi of quasis) {
          const raw = ("value" in quasi && quasi.value?.raw) || "";
          // If template literal contains spaces, flag it
          if (raw.includes(" ")) {
            return true;
          }
        }
      }
      // Check if first argument is a variable and second is options (not array)
      // This is potentially unsafe - we can't know the variable's value statically,
      // but if it's not followed by an array, it's likely a command string
      if (
        firstArg.type === "Identifier" &&
        args.length > 1 &&
        args[1].type === "ObjectExpression"
      ) {
        // Variable with options object (not array) - likely unsafe
        return true;
      }
      return false;
    }
    return {
      CallExpression(node) {
        if (!isSpawnCall(node)) {
          return;
        }
        // Check if it's an unsafe call
        if (isUnsafeCall(node)) {
          const methodName =
            node.callee.type === "Identifier"
              ? node.callee.name
              : node.callee.type === "MemberExpression" &&
                  "property" in node.callee &&
                  node.callee.property &&
                  node.callee.property.type === "Identifier"
                ? node.callee.property.name
                : "spawn";
          context.report({
            messageId:
              methodName === "spawnSync" ? "unsafeSpawnSync" : "unsafeSpawn",
            node,
          });
        }
      },
    };
  },
  meta: {
    docs: {
      category: "Security",
      description:
        "disallow child_process.spawn/spawnSync with single string argument containing spaces",
      recommended: true,
    },
    fixable: undefined,
    messages: {
      unsafeSpawn:
        "Use spawn(command, args[]) instead of spawn(commandString). Split the command string into command and args array to prevent shell injection.",
      unsafeSpawnSync:
        "Use spawnSync(command, args[]) instead of spawnSync(commandString). Split the command string into command and args array to prevent shell injection.",
    },
    schema: [],
    type: "problem",
  },
};
module.exports = {
  rules: {
    "no-unsafe-spawn": rule,
  },
};
