export const defaultAnsibleConfigurations = {
  'ansible.useFullyQualifiedCollectionNames': true,
  'ansibleLint.arguments': '',
  'ansibleLint.enabled': false,
  'ansibleLint.path': 'ansible-lint',
  'ansibleNavigator.path': 'ansible-navigator',
  'executionEnvironment.containerEngine': 'auto',
  'executionEnvironment.enabled': false,

  'executionEnvironment.image':
    'quay.io/ansible/ansible-devtools-demo-ee:v0.1.0',

  'executionEnvironment.pullPolicy': 'missing',
  'python.activationScript': '',
  'python.interpreterPath': 'python3',
  'ansible.path': 'ansible',
};

// defaultAnsibleConfigurations.forEach((config) => {
//   console.log('key - > ', config);
// });

// defaultAnsibleConfigurations.map((a, b) => {
//   console.log(`${a} has -> ${b}`);
// });

// const configKeys = Object.keys(defaultAnsibleConfigurations);
// configKeys.forEach((key) => {
//   console.log(key);
// });

// Object.entries(defaultAnsibleConfigurations).forEach((config) => {
//   console.log(`${config[0]} has the value ${typeof config[1]}`);
// });
