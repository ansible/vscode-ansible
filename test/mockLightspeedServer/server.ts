// "Mock" Lightspeed Server
import express, { Application } from "express";
import { completions } from "./completion";
import { contentmatches } from "./contentmatches";
import { feedback } from "./feedback";
import { me } from "./me";
import { openUrl } from "./openUrl";

const API_VERSION = "v0";
const API_ROOT = `/api/${API_VERSION}`;

let url = new URL("http://127.0.0.1:3000");
// Do not try to use envvars on macos -- ref: https://github.com/microsoft/vscode/issues/204005
if (process.platform !== "darwin" && process.env.TEST_LIGHTSPEED_URL) {
  url = new URL(process.env.TEST_LIGHTSPEED_URL);
}

export default class Server {
  constructor(app: Application) {
    this.init(app);
  }

  private init(app: Application): void {
    app.use(express.json());
    app.get("/", (req, res) => res.send("Lightspeed Mock"));

    app.post(`${API_ROOT}/ai/completions`, async (req, res) => {
      await new Promise((r) => setTimeout(r, 500)); // fake 500ms latency
      return completions(req, res);
    });

    app.post(`${API_ROOT}/ai/contentmatches`, async (req, res) => {
      await new Promise((r) => setTimeout(r, 500)); // fake 500ms latency
      return res.send(contentmatches(req));
    });

    app.post(`${API_ROOT}/ai/feedback`, (req, res) => {
      return feedback(req, res);
    });

    app.get(`${API_ROOT}/me`, (req, res) => {
      return res.send(me());
    });

    app.get("/o/authorize", (req: { query: { redirect_uri: string } }, res) => {
      console.log(req.query);
      const redirectUri = decodeURIComponent(req.query.redirect_uri);
      console.log(`opening ${redirectUri} ...`);
      openUrl(`${redirectUri}&code=CODE`);
      return res.send({});
    });

    app.post("/o/token", (req, res) =>
      res.send({
        access_token: "ACCESS_TOKEN",
        refresh_token: "REFRESH_TOKEN",
        expires_in: 3600,
      }),
    );

    app.listen(parseInt(url.port), url.hostname, () => {
      console.log(`Listening on port ${url.port} at ${url.hostname}`);
    });
  }
}

new Server(express());
