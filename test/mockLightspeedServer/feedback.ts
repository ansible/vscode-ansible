// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function feedback(req: any, res: any) {
  const body = req.body;
  console.log(JSON.stringify(body, null, 2));

  // If a sentimentFeedback is received and it's feedback starts with
  // "permission_denied__" respond with a 403 error with the specified code.
  if (body?.sentimentFeedback?.feedback.startsWith("permission_denied__")) {
    return res.status(403).send({
      code: body.sentimentFeedback.feedback,
      message: "TEST",
    });
  } else if (body?.sentimentFeedback) {
    return res.send({
      message: "Thanks for your feedback!",
    });
  }
  return res.send({});
}
