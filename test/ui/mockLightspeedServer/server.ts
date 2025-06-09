// "Mock" Lightspeed Server
import express, { Application } from "express";
import { completions } from "./completion";
import { contentmatches } from "./contentmatches";
import { explanations } from "./explanations";
import { feedback, getFeedbacks } from "./feedback";
import { playbookGeneration } from "./playbookGeneration";
import { roleGeneration } from "./roleGeneration";
import { roleExplanations } from "./roleExplanations";
import { me } from "./me";
import { openUrl } from "./openUrl";
import * as winston from "winston";
import morgan from "morgan";
import yargs from "yargs";
import { meMarkdown } from "./meMarkdown";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let options: any = readOptions(process.argv.splice(2));

function readOptions(args: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opt: any = yargs(args)
    .option("ui-test", { type: "boolean", default: false })
    .option("one-click", { type: "boolean", default: false })
    .option("me-uppercase", { type: "boolean", default: false })
    .help().argv;
  return opt;
}

const API_VERSION = "v0";
const API_VERSION_V1 = "v1";
const API_ROOT = `/api/${API_VERSION}`;
const API_ROOT_V1 = `/api/${API_VERSION_V1}`;

export const logger = winston.createLogger({
  level: "debug",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: `out/log/${process.env.TEST_ID ?? ""}-mock-server.log`,
    }),
  ],
});
const morganLogger = morgan(
  ":method :url :status :res[content-length] - :response-time ms",
  {
    stream: {
      write: (message: string) => logger.http(message.trim()),
    },
  },
);

const url = new URL(
  `http://localhost:${process.env.TEST_LIGHTSPEED_PORT ?? "3000"}`,
);

export function permissionDeniedCanApplyForTrial(): {
  code: string;
  message: string;
} {
  return {
    code: "permission_denied__can_apply_for_trial",
    message: "Access denied but user can apply for a trial period.",
  };
}

export default class Server {
  constructor(app: Application) {
    this.init(app);
  }

  private init(app: Application): void {
    app.use(morganLogger);
    app.use(express.json());
    app.get("/", (req, res) => {
      res.status(200).send("Lightspeed Mock");
    });
    app.get("/trial", (req, res) => {
      res.status(200).send("One Click Trial");
    });

    app.post(`${API_ROOT}/ai/completions`, async (req, res) => {
      await new Promise((r) => setTimeout(r, 1000)); // fake 1s latency
      return completions(req, res);
    });

    app.post(`${API_ROOT}/ai/contentmatches`, async (req, res) => {
      await new Promise((r) => setTimeout(r, 1000)); // fake 1s latency
      res.send(contentmatches(req));
    });

    app.post(`${API_ROOT}/ai/generations`, async (req, res) => {
      await new Promise((r) => setTimeout(r, 1000)); // fake 1s latency
      return playbookGeneration(req, res);
    });

    app.post(`${API_ROOT_V1}/ai/generations/role/`, async (req, res) => {
      await new Promise((r) => setTimeout(r, 1000)); // fake 1s latency
      return roleGeneration(req, res);
    });

    app.post(`${API_ROOT}/ai/explanations`, async (req, res) => {
      await new Promise((r) => setTimeout(r, 500)); // fake 500ms latency
      return explanations(req, res);
    });

    app.post(`${API_ROOT_V1}/ai/explanations/role`, async (req, res) => {
      await new Promise((r) => setTimeout(r, 500)); // fake 500ms latency
      return roleExplanations(req, res);
    });

    app.post(`${API_ROOT}/ai/feedback`, (req, res) => {
      feedback(req, res);
    });

    app.get(`${API_ROOT}/me`, (req, res) => {
      res.send(me());
    });

    app.get(`${API_ROOT}/me/summary`, (req, res) => {
      res.send(meMarkdown());
    });

    app.get("/o/authorize", (req: { query: { redirect_uri: string } }, res) => {
      logger.info(req.query);
      const redirectUri = decodeURIComponent(req.query.redirect_uri);
      setTimeout(() => console.log("Howdy!"), 3000);
      openUrl(`${redirectUri}&code=CODE`);
      res.send({});
    });

    app.post("/o/token", (req, res) => {
      res.send({
        access_token: "ACCESS_TOKEN",
        refresh_token: "REFRESH_TOKEN",
        expires_in: 3600,
      });
    });

    app.get("/__debug__/feedbacks", (req, res) => {
      res.send({
        feedbacks: getFeedbacks(),
      });
    });

    app.post("/__debug__/options", (req, res) => {
      options = readOptions(req.body);
      logger.info(
        `New options are: uiTest=${options.uiTest} oneClick=${options.oneClick} meUppercase=${options.meUppercase}`,
      );
      res.status(200).send();
    });

    app.get("/__debug__/kill", () => {
      logger.end();
      process.exit(0);
    });

    app.listen(parseInt(url.port), url.hostname, () => {
      logger.info(`Listening on port ${url.port} at ${url.hostname}`);
    });
  }
}

function shutdown(code: number) {
  logger.info(`emergency shutdown (${code}!`);
  logger.end();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

new Server(express());
