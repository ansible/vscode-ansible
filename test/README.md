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

#### Installing Node and Npm

The first thing you'll need to do to execute our automated test suites is to
clone the code repository, but since you're reading this README file, chances
are you've already done that :)

First and foremost, make sure that you have `node` and `npm` installed on your
system. It is recommend to use a Node version manager like
[nvm](https://github.com/nvm-sh/nvm) to install `npm`. Follow their
documentation to run their
[install script](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)
according to your operating system. Come back here when you're done and don't
forget to install `node`.

| :memo: Cheat Sheet |
| :----------------- |
| nvm install node   |

#### Installing Yarn

Once you have `npm` installed you can run the following both to install and
upgrade `Yarn`:

| :memo: Cheat Sheet        |
| :------------------------ |
| npm install --global yarn |

#### Installing Remaining Dependencies

Now that you have `yarn` installed, all we have to do is run the following
commands to ensure that you have all other remaining dependencies installed
locally:

```shell
    yarn install
    yarn clean
    yarn webpack-dev
```

### Running Test Suites

There are a few different test suites to choose from:

#### Unit Tests

Run the following command:

```shell
    yarn unit-tests
```

#### End to End

Run the following command:

```shell
    yarn coverage-all
```

#### UI Tests

Run the following command:

```shell
    yarn coverage-ui-with-mock-lightspeed-server
```
