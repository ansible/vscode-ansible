"use strict";
/**
 * ESLint rule corresponding to Node.js DEP0190.
 *
 * When spawn/spawnSync is called with `shell: true`, do NOT pass a separate
 * args array. Instead build the full shell command string up front and pass
 * it as the sole command argument, using `quote()` from the shell-quote
 * package to compose it safely without shell-injection risk.
 *
 * Bad:  spawn('ls', ['-la', dir], { shell: true })   // array literal
 * Bad:  spawn('ls', args,         { shell: true })   // identifier
 * Bad:  spawn('ls', getArgs(),    { shell: true })   // call expression
 * Good: spawn(quote(['ls', '-la', dir]), { shell: true })
 */

const rule = {
  create(context) {
    function getMethodName(node) {
      const callee = node.callee;
      if (callee.type === "Identifier") {
        return callee.name;
      }
      if (
        callee.type === "MemberExpression" &&
        callee.property?.type === "Identifier"
      ) {
        return callee.property.name;
      }
      return null;
    }

    function isSpawnCall(node) {
      if (node.type !== "CallExpression") return false;
      const name = getMethodName(node);
      return name === "spawn" || name === "spawnSync";
    }

    function hasShellTrue(optionsNode) {
      if (!optionsNode || optionsNode.type !== "ObjectExpression") return false;
      return optionsNode.properties.some(
        (prop) =>
          prop.type === "Property" &&
          prop.key?.type === "Identifier" &&
          prop.key.name === "shell" &&
          prop.value?.type === "Literal" &&
          prop.value.value === true,
      );
    }

    function isViolation(node) {
      const args = node.arguments;
      // spawn(cmd, args, { shell: true }) — any second argument (array literal,
      // identifier, call expression, …) combined with shell: true in options
      return args.length >= 3 && hasShellTrue(args[2]);
    }

    return {
      CallExpression(node) {
        if (!isSpawnCall(node)) return;
        if (isViolation(node)) {
          const name = getMethodName(node);
          context.report({
            messageId:
              name === "spawnSync" ? "shellArgsSpawnSync" : "shellArgsSpawn",
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
        "disallow child_process.spawn/spawnSync with shell: true combined with a separate args array (Node.js DEP0190)",
      recommended: true,
    },
    fixable: undefined,
    messages: {
      shellArgsSpawn:
        "Node DEP0190: When spawn is called with shell: true, do not pass a separate args array. Build the full shell command with quote([cmd, ...args]) from shell-quote instead.",
      shellArgsSpawnSync:
        "Node DEP0190: When spawnSync is called with shell: true, do not pass a separate args array. Build the full shell command with quote([cmd, ...args]) from shell-quote instead.",
    },
    schema: [],
    type: "problem",
  },
};
module.exports = {
  rules: {
    "node-DEP0190": rule,
  },
};
