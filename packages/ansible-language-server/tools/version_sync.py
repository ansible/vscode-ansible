# utility to sync ansible-language-server version with vscode-ansible devel
# pylint: disable=unused-import
import json


def sync_als_version_in_vscode_ansible_devel():
    with open("package.json") as als_fp:
        package_json_als = json.load(als_fp)
    version_als = package_json_als["version"]

    with open("../vscode-ansible/package.json") as fp:
        package_json_vscode_ansible = json.load(fp)

    package_json_vscode_ansible["dependencies"][
        "@ansible/ansible-language-server"
    ] = version_als
    with open("../vscode-ansible/package.json", "w") as fp:
        json.dump(package_json_vscode_ansible, fp, indent=4)


if __name__ == "__main__":
    sync_als_version_in_vscode_ansible_devel()
