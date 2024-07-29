# Server code

The diagram below shows how the server code is organized within the project:

![server code](media/server-code-structure.png)

> **📕 Note:** The diagram does not include:
>
> - `server.ts` file - This the entry point is always at the root of `src` folder (Refer to the project structure).
>
> - `test` files - Tests are organized differently and are explained later (Refer to test structure).

## Categorization

The server code is divided into 3 parts and the explanation is mentioned below.

### Providers

The implementation of all the language features for Ansible, such as semantics, auto-completion, validation, hover, and go-to definition, are present in this sub-folder.

### Services

All the language features utilize various Ansible binaries behind the scenes to work. The implementations and runners for various ansible binaries are placed inside this sub-folder.

### Interfaces

Different types and configurations used across the extension for various features are in this sub-folder.
