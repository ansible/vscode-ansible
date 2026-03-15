import * as cp from "child_process";
import * as rpc from "vscode-jsonrpc/node.js";
import { quote } from "shell-quote";

const lspProcess = cp.spawn(
  quote(["npm", "exec", "--", "ansible-language-server", "--stdio"]),
  {
    shell: true, // keep it
    env: process.env,
  },
);

const exit = async (languageServer: rpc.MessageConnection) => {
  const ret = new Promise((resolve) => {
    languageServer.onClose(() => {
      languageServer.dispose();
      resolve(null);
    });
  });

  const notification = new rpc.NotificationType<string>("exit");
  languageServer.sendNotification(notification);

  return ret;
};

// Use stdin and stdout for communication:
const connection = rpc.createMessageConnection(
  new rpc.StreamMessageReader(lspProcess.stdout),
  new rpc.StreamMessageWriter(lspProcess.stdin),
);

const notification = new rpc.NotificationType<string>(
  "update/ansible-metadata",
);

connection.listen();
connection.sendNotification(notification);

exit(connection);
console.log("Apparently ALS initialized successfully.");
