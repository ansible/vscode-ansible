import { createConnection } from "vscode-languageserver/node";
import axios from "axios";

import { UserResponse } from "../../interfaces/extensionSettings";

const connection = createConnection();
connection.console.info(
  `LightSpeed backend server running in node ${process.version}`
);

connection.onInitialize(() => {
  return {
    capabilities: {},
  };
});

connection.onRequest("playbook/explanation", async (params) => {
  const accessToken: string = params["accessToken"];
  const content: string = params["content"];

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  const axiosInstance = axios.create({
    baseURL: `http://localhost:8000/api/v0`,
    headers: headers,
  });

  const explanation: string = await axiosInstance
    .post("/ai/explanations/", { content: content })
    .then((response) => {
      return response.data.explanation;
    });

  return explanation;
});

connection.listen();
