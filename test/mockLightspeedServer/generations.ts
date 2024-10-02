import { v4 as uuidv4 } from "uuid";
import { logger, options, permissionDeniedCanApplyForTrial } from "./server";

export function generations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
) {
  const text = req.body.text;
  const createOutline = req.body.createOutline;
  const generationId = req.body.generationId ? req.body.generationId : uuidv4();
  const wizardId = req.body.wizardId;
  logger.info(`text: ${text}`);
  logger.info(`outline: ${req.body.outline}`);
  logger.info(`wizardId: ${wizardId}`);

  // If the text or outline contains "status=nnn" (like "status=400"), return the specified
  // status code.
  let index = text.search(/status=\d\d\d/);
  if (index !== -1) {
    const status = parseInt(index.substring(index + 7, index + 10));
    return res.status(status).send();
  }

  if (req.body?.outline) {
    index = req.body?.outline.search(/status=\d\d\d/);
    if (index !== -1) {
      const status = parseInt(
        req.body.outline.substring(index + 7, index + 10),
      );
      return res.status(status).send();
    }
  }

  if (options.oneClick) {
    return res.status(403).json(permissionDeniedCanApplyForTrial());
  }

  // Special case to replicate the feature being unavailable
  if (text === "Feature not available") {
    logger.info("Returning 404. Feature is not available");
    return res.status(404).send({
      code: "feature_not_available",
      message: "The feature is not available",
    });
  }

  // cSpell: disable
  let outline: string | undefined = `1. Create VNET named VNET_1
2. Create VNET named VNET_2
3. Create virtual network peering`;

  const playbook = `---
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

  if (!createOutline) {
    outline = undefined;
  }

  if (createOutline && outline) {
    outline += "\n4. Some extra step.";
  }

  return res.send({
    playbook,
    outline,
    generationId,
  });
}
