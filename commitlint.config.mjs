export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'scope-enum': [
            2,
            'always',
            ['core', 'ls', 'mcp', 'extension', 'views', 'panels', 'ci', 'docs', 'deps'],
        ],
    },
};
