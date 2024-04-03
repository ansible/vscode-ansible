import { v4 as uuidv4 } from "uuid";

export function generations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any
) {
  const generationId = req.body.generationId ? req.body.generationId : uuidv4();
  const format = "yaml";
  console.log(req.body.content);
  // cSpell: disable
  const content = `---
  # Create an azure network...
  #   Description: "Create an azure network peering between VNET named VNET_1 and VNET named VNET_2"
  #   This playbook will perform the following tass by this order:
  #
  #     1. Create VNET named VNET_1
  #     2. Create VNET named VNET_2
  #     3. Create virtual network peering
  - name: Create an azure network...
    hosts: all
    vars:
      resource_group: MY_RESOURCE_GROUP
    tasks:
      - name: Create VNET named VNET_1
        azure.azcollection.azure_rm_virtualnetwork:
          resource_group: "{{ resource_group }}"
          name: VNET_1
          address_prefixes: 10.10.0.60/16

      - name: Create VNET named VNET_2
        azure.azcollection.azure_rm_virtualnetwork:
          resource_group: "{{ resource_group }}"
          name: VNET_2
          address_prefixes: 10.10.0.80/16

      - name: Create virtual network peering
        azure.azcollection.azure_rm_virtualnetworkpeering:
          resource_group: "{{ resource_group }}"
          name: VNET_1_2
          virtual_network:
            name: VNET_2
          remote_virtual_network:
            name: VNET_1
          allow_virtual_network_access: true
          allow_forwarded_traffic: true
          use_remote_gateways: true
`;
  // cSpell: enable

  return res.send({
    content,
    format,
    generationId,
  });
}
