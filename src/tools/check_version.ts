import { execSync } from 'child_process';
import axios from 'axios';

/**
 * A function to make an API call to open VSX in order to get details about the latest release of redhat.ansible extension
 * @param currentVersion string representing the current version against which information is required
 * @returns version of the latest release
 */
function makeGetRequest() {
  return new Promise(function (resolve, reject) {
    axios
      .get('https://open-vsx.org/api/redhat/ansible')
      .catch(function (error) {
        if (error.response) {
          // Request made and server responded
          console.log(error.response.status);
          resolve(error.response.status);
        } else if (error.request) {
          // The request was made but no response was received
          console.log(error.request);
          reject(error.request);
        } else {
          // Something happened in setting up the request that triggered an Error
          console.log('Error', error.message);
          reject(error.message);
        }
      })
      .then((response) => {
        if (response) {
          const result = response.data.version;
          resolve(result);
        }
      });
  });
}

/**
 * A function that makes a call to the makeGetRequest and checks if the curren version of redhat.ansible is released in Open VSX or not
 * @param currentVersion string representing the current version against which information is required
 * @returns true if current version is released, false otherwise
 */

async function releasedInOpenVSX(currentVersion: string): Promise<boolean> {
  const responseVersion = await makeGetRequest();

  return true ? responseVersion === currentVersion : false;
}

/**
 * A function that makes a call to the makeGetRequest and checks if the curren version of redhat.ansible is released in VSCode Marketplace or not
 * @param currentVersion string representing the current version against which information is required
 * @returns true if current version is released, false otherwise
 */

function releasedInVSCMarketplace(currentVersion: string): boolean {
  // Grab the version of extension from vscode marketplace
  const result = execSync(
    'node ./node_modules/vsce/out/vsce show --json redhat.ansible'
  ).toString();

  const VSCMarketplaceVersion = JSON.parse(result).versions[0].version;

  return true ? VSCMarketplaceVersion === currentVersion : false;
}

/**
 * The main script logic: Simple sanity check
 * Checks if current version of redhat.asnible is already published or not.
 * If published, throws an error stating that the version has already been published.
 */
async function main() {
  // This uses "process.env.npm_package_version" to grab the version of the project from package.json
  // This works only in the case when the script is run using npm run command, else, returns undefined
  const currentExtensionVersion: string | undefined =
    process.env.npm_package_version;

  // TODO: check the version from package-lock.json as well

  if (!currentExtensionVersion) {
    process.exitCode = 1;
    throw new Error('FAILURE.\nCurrent version is undefined.');
  }

  const vscMarketPlace = releasedInVSCMarketplace(currentExtensionVersion);

  const openVSX = await releasedInOpenVSX(currentExtensionVersion);

  if (vscMarketPlace && openVSX) {
    process.exitCode = 1;
    throw new Error(
      'FAILURE.\nCurrent version already published. Run `vsce version <x.y.z>`'
    );
  }
}
main();
