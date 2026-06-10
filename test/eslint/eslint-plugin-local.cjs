// @ts-check
'use strict';
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

/** @typedef {import('estree').CallExpression} CallExpression */
/** @typedef {import('estree').Node} EstreeNode */

const rule = {
    /**
     * Create the rule listener.
     * @param context - The ESLint rule context
     * @returns An object mapping AST node types to visitor functions
     */
    create(context) {
        /**
         * Extract the function name from a call expression's callee.
         * @param node - The call expression AST node
         * @returns The method or function name, or null if unresolvable
         */
        function getMethodName(node) {
            const callee = node.callee;
            if (callee.type === 'Identifier') {
                return callee.name;
            }
            if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
                return callee.property.name;
            }
            return null;
        }

        /**
         * Check whether a node is a call to spawn or spawnSync.
         * @param node - The AST node to inspect
         * @returns True when the node is a spawn/spawnSync call expression
         */
        function isSpawnCall(node) {
            if (node.type !== 'CallExpression') return false;
            const name = getMethodName(node);
            return name === 'spawn' || name === 'spawnSync';
        }

        /**
         * Determine whether an options argument contains `shell: true`.
         * @param optionsNode - The AST node for the options object
         * @returns True when the object has a `shell: true` property
         */
        function hasShellTrue(optionsNode) {
            if (optionsNode?.type !== 'ObjectExpression') return false;
            return optionsNode.properties.some(
                (prop) =>
                    prop.type === 'Property' &&
                    prop.key.type === 'Identifier' &&
                    prop.key.name === 'shell' &&
                    prop.value.type === 'Literal' &&
                    prop.value.value === true,
            );
        }

        /**
         * Check whether a spawn call violates DEP0190 (args + shell: true).
         * @param node - The call expression AST node
         * @returns True when the call has 3+ args and shell: true in options
         */
        function isViolation(node) {
            const args = node.arguments;
            return args.length >= 3 && hasShellTrue(args[2]);
        }

        return {
            /**
             * Visit CallExpression nodes and report DEP0190 violations.
             * @param node - The call expression AST node
             */
            CallExpression(node) {
                if (!isSpawnCall(node)) return;
                if (isViolation(node)) {
                    const name = getMethodName(node);
                    context.report({
                        messageId: name === 'spawnSync' ? 'shellArgsSpawnSync' : 'shellArgsSpawn',
                        node,
                    });
                }
            },
        };
    },
    meta: {
        docs: {
            category: 'Security',
            description:
                'disallow child_process.spawn/spawnSync with shell: true combined with a separate args array (Node.js DEP0190)',
            recommended: true,
        },
        fixable: undefined,
        messages: {
            shellArgsSpawn:
                'Node DEP0190: When spawn is called with shell: true, do not pass a separate args array. Build the full shell command with quote([cmd, ...args]) from shell-quote instead.',
            shellArgsSpawnSync:
                'Node DEP0190: When spawnSync is called with shell: true, do not pass a separate args array. Build the full shell command with quote([cmd, ...args]) from shell-quote instead.',
        },
        schema: [],
        type: 'problem',
    },
};
module.exports = {
    rules: {
        'node-DEP0190': rule,
    },
};
