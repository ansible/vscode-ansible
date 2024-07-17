import { v4 as uuidv4 } from "uuid";
import { logger } from "./server";
import { options, permissionDeniedCanApplyForTrial } from "./server";

export function explanations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
) {
  const playbook = req.body.content;
  const explanationId = req.body.explanationId
    ? req.body.explanationId
    : uuidv4();
  const format = "markdown";
  logger.info(`content: ${playbook}`);

  if (options.oneClick) {
    return res.status(403).json(permissionDeniedCanApplyForTrial());
  }

  // Special case to replicate the feature being unavailable
  if (playbook !== undefined && playbook.includes("Feature not available")) {
    logger.info("Returning 404. Feature is not available");
    return res.status(404).send({
      code: "feature_not_available",
      message: "The feature is not available",
    });
  }

  // cSpell: disable
  const content = `
## Playbook Overview and Structure

This playbook creates an Azure Virtual Network (VNET) with the name "VNET_1"
and another VNET named "VNET_2", and then establish a peering connection
between them. The playbook consists of three tasks under the tasks key.

### Creating VNET named VNET_1

The first task is for creating a VNET named "VNET_1".
This uses the azure.azcollection.azure_rm_virtualnetwork module
with the following parameters:

- resource_group: The name of the resource group where this VNET will be created, which is defined as a variable in the playbook named "resource_group", whose value is set to "MY_RESOURCE_GROUP".
- name: The name given to the VNET being created, which is set to "VNET_1" in this task.
- address_prefixes: A list of CIDR blocks that define the address space for the VNET. In this case, it is set to 10.10.0.60/16.

### Creating VNET named VNET_2

The second task is for creating another VNET named "VNET_2"
using the same azure.azcollection.azure_rm_virtualnetwork module with
the following parameters:

- resource_group: Set to "MY_RESOURCE_GROUP".
- name: Set to "VNET_2".
- address_prefixes: Set to 10.10.0.80/16.


### Creating virtual network peering (VNET_1 and VNET_2)

The third task creates a peering connection between "VNET_1" and "VNET_2".
This uses the azure.azcollection.azure_rm_virtualnetworkpeering module with
the following parameters:

- resource_group: Set to "MY_RESOURCE_GROUP".
- name: Set to "VNET_1_2", which will be the name of the peering connection.
- virtual_network: A hash containing properties for the source VNET, with a name set to "VNET_2".
- remote_virtual_network: A hash containing properties for the remote VNET, with a name set to "VNET_1".
- allow_virtual_network_access: Set to true to allow communication from either VNET to the other.
- allow_forwarded_traffic: Set to true to allow forwarded traffic between the two VNETs.
- use_remote_gateways: Set to true for using remote gateways.
`;
  // cSpell: enable

  return res.send({
    content,
    format,
    explanationId,
  });
}
