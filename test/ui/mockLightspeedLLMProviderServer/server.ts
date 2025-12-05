import express, { Application } from "express";
import * as winston from "winston";
import morgan from "morgan";

export const logger = winston.createLogger({
  level: "debug",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: `out/log/${process.env.TEST_ID ?? ""}-llm-mock-server.log`,
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
  `http://localhost:${process.env.TEST_LLM_PROVIDER_PORT ?? "3001"}`,
);

const mockContent = `---
- name: Install and configure nginx
  hosts: all
  become: yes
  tasks:
    - name: Install nginx
      ansible.builtin.package:
        name: nginx
        state: present

    - name: Start and enable nginx
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: yes

    - name: Configure nginx
      ansible.builtin.template:
        src: nginx.conf.j2
        dest: /etc/nginx/nginx.conf
      notify: restart nginx

  handlers:
    - name: restart nginx
      ansible.builtin.service:
        name: nginx
        state: restarted`;

const mockResponse = {
  candidates: [
    {
      content: {
        parts: [{ text: mockContent }],
        role: "model",
      },
      finishReason: "STOP",
      index: 0,
    },
  ],
};

export default class LLMProviderServer {
  constructor(app: Application) {
    this.init(app);
  }

  private init(app: Application): void {
    app.use(morganLogger);
    app.use(express.json());

    app.get("/", (req, res) => {
      res.status(200).json({
        name: "LLM Provider Mock Server",
        version: "1.0.0",
      });
    });

    app.post(/\/v1beta\/models\/.*:generateContent/, async (req, res) => {
      logger.info("Incoming request to mock Gemini endpoint:");
      logger.info(JSON.stringify(req.body, null, 2));
      return res.status(200).json(mockResponse);
    });

    app.get("/__debug__/status", (req, res) => {
      res.json({
        status: "running",
        port: url.port,
      });
    });

    app.get("/__debug__/kill", () => {
      logger.end();
      process.exit(0);
    });

    app.listen(parseInt(url.port), url.hostname, () => {
      logger.info(
        `LLM Provider Mock Server listening on port ${url.port} at ${url.hostname}`,
      );
      console.log(`Listening on port ${url.port} at ${url.hostname}`);
    });
  }
}

function shutdown(code: number) {
  logger.info(`Emergency shutdown (${code})!`);
  logger.end();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

new LLMProviderServer(express());
