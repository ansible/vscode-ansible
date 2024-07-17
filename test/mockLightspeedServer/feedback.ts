import { logger } from "./server";
import { Request, Response } from "express";

let feedbacks: object[] = [];

export function feedback(req: Request, res: Response): Response {
  const body = req.body;
  logger.info(JSON.stringify(body, null, 2));
  feedbacks.push(body);

  // If a sentimentFeedback is received and it's feedback starts with
  // "permission_denied__" respond with a 403 error with the specified code.
  if (body?.sentimentFeedback?.feedback.startsWith("permission_denied__")) {
    return res.status(403).send({
      code: body.sentimentFeedback.feedback,
      message: "TEST",
    });
  } else if (body?.sentimentFeedback || body?.generationFeedback) {
    return res.send({
      message: "Thanks for your feedback!",
    });
  }
  return res.send({});
}

export function getFeedbacks() {
  const feedbacksCopy = Array.from(feedbacks);
  feedbacks = [];
  return feedbacksCopy;
}
