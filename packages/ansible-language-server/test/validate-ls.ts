import * as cp from "child_process";
import * as rpc from "vscode-jsonrpc/node";

const lspProcess = cp.spawn("npx", ["ansible-language-server", "--stdio"]);

export type LanguageServer = rpc.MessageConnection;

export const exit = async (languageServer: rpc.MessageConnection) => {
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
