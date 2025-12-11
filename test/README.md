# Ansible VS Code Extension by Red Hat

## Why Test Automation?

Our team prioritizes the importance of a robust test suite. A solid test suite
is the backbone of any software project, ensuring that code releases and commits
can be made with confidence. With thorough testing, we minimize the risk of
introducing regressions, allowing for smoother deployments and more reliable
software. Additionally, a strong test suite enables us to refactor code with
assurance, knowing that our changes won't inadvertently break existing
functionality. Join us in maintaining a high standard of code quality and
reliability by investing in comprehensive testing practices.

## Getting Ready to Run the Test Suites Locally

### Installing Dependencies

Ensure that you have [mise](https://mise.jdx.dev) install and working as we
make use of it to install the entire build chain.

```shell
task install
```

### Running Test Suites

There are a few different test suites to choose from:

#### Unit Tests

Run the following command:

```shell
task unit
```

#### End to End

Run the following command:

```shell
task e2e
```

#### UI Tests

Run the following command:

```shell
task ui
```
