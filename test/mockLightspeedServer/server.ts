// "Mock" Lightspeed Server
import express, { Application } from "express";
import { completions } from "./completion";
import { me } from "./me";
import { openUrl } from "./openUrl";

const API_VERSION = "v0";
const API_ROOT = `/api/${API_VERSION}`;

const PORT = process.env.MOCK_LIGHTSPEED_SERVER_PORT || "3000";
const HOST = process.env.MOCK_LIGHTSPEED_SERVER_HOST || "127.0.0.1";

export default class Server {
  constructor(app: Application) {
    this.init(app);
  }

  private init(app: Application): void {
    app.use(express.json());
    app.get("/", (req, res) => res.send("Lightspeed Mock"));

    app.post(`${API_ROOT}/ai/completions`, async (req, res) => {
      await new Promise((r) => setTimeout(r, 100)); // fake 100ms latency
      return res.send(completions(req));
    });

    app.post(`${API_ROOT}/ai/feedback`, (req, res) => {
      const body = req.body;
      console.log(JSON.stringify(body, null, 2));
      return res.send({});
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
      })
    );

    app.listen(parseInt(PORT), HOST, () => {
      console.log(`Listening on port ${PORT} at ${HOST}`);
    });
  }
}

new Server(express());
