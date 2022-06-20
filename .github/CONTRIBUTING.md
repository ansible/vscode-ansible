# Contributing to Ansible Language Server

In order to contribute, you'll need to:

1. Fork the repository.

2. Create a branch, push your changes there.

3. Send it to us as a PR.

4. Iterate on your PR, incorporating the requested improvements and
   participating in the discussions.

Prerequisites:

1. Have [npm].

2. Use [npm] to run the tests.

3. Before sending a PR, make sure that the linters pass:

```shell-session
$ npm run lint

> @ansible/ansible-language-server@0.4.0 lint
> npm ci && pre-commit run -a
...
```

[npm]: https://npmjs.org
