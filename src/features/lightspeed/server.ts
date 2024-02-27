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
    baseURL: `https://c.ai.ansible.redhat.com/api/v0`,
    headers: headers,
  });
  const userResponse: UserResponse = await axiosInstance
    .get("/me/")
    .then((response) => {
      return response.data;
    });
  const username: string = userResponse.username;

  return `<p>bip bip, I'm a LSP server, and I just received a request for an explanation of:</p><div><pre><code>${content}</code></pre></div>  by user: ${username}`;
});

connection.listen();
