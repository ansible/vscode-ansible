import { v4 as uuidv4 } from "uuid";
import { logger } from "./server";

export function summaries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
) {
  const summaryId = req.body.summaryId ? req.body.summaryId : uuidv4();
  const format = "plaintext";
  logger.info(req.body.content);
  const content = `Name: "Create an azure network..."
Description: "Create an azure network peering between VNET named VNET_1 and VNET named VNET_2"
This playbook will perform the following tass by this order:

  1. Create VNET named VNET_1
  2. Create VNET named VNET_2
  3. Create virtual network peering
`;

  return res.send({
    content,
    format,
    summaryId,
  });
}
