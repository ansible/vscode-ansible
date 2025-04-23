import { v4 as uuidv4 } from "uuid";
import { logger, options, permissionDeniedCanApplyForTrial } from "./server";

export function roleExplanations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any,
) {
  const roleName = req.body.roleName;
  const explanationId = req.body.explanationId
    ? req.body.explanationId
    : uuidv4();
  const format = "markdown";
  logger.info(`role: ${roleName}`);

  if (options.oneClick) {
    return res.status(403).json(permissionDeniedCanApplyForTrial());
  }

  // Special case to replicate the feature being unavailable
  if (roleName && roleName === "role_not_available") {
    logger.info("Returning 404. Feature is not available");
    return res.status(404).send({
      code: "feature_not_available",
      message: "The feature is not available",
    });
  }

  // Special case to replicate explanation being unavailable
  if (roleName !== undefined && roleName === "role_no_explanation") {
    logger.info("Returning empty content. Explanation is not available");
    return res.send({
      content: "",
      format,
      explanationId,
    });
  }

  // cSpell: disable
  const content = `
## Role overview

This is an example role overview.
`;
  // cSpell: enable

  return res.send({
    content,
    format,
    explanationId,
  });
}
