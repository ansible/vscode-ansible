#!/usr/bin/env bash
set -euo pipefail
creator_resources_path="$(python -c "from pathlib import Path; import ansible_creator; print(Path(ansible_creator.__file__).parent)")/resources"
mkdir -p resources/contentCreator/createDevcontainer
mkdir -p resources/contentCreator/createDevfile
ln -fs "$creator_resources_path/common/devfile/devfile.yaml.j2" "resources/contentCreator/createDevfile/devfile-template.txt"
ln -fs "$creator_resources_path/common/devcontainer/.devcontainer" "resources/contentCreator/createDevcontainer/"
