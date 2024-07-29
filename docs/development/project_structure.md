# Chapter 1: Understanding project structure

The project is divided into two main parts:

1. The vscode-ansible extension (client)
2. The ansible-language-server (server)

Each part has its own package.json files, tests, and tsconfigs. This modularity
helps in code navigation and development.

!!! tip

    Before working on the code, ask yourself, *"Does this affect the server or the client?"* This can help you find the right part of the code to work on.

Here is the structure of the project:

```text
.
├── node_modules
│   └── ...
├── package.json
├── src
│   ├── ...
│   └── extension.ts
├── test
│   └── ...
└── packages
    └── ansible-language-server
        ├── node_modules
        │   └── ...
        ├── package.json
        ├── src
        │   ├── ...
        │   └── server.ts
        └── test
```

The `extension.ts` file is the entry point for the extension, and the
`server.ts` file is the entry point for the server.
