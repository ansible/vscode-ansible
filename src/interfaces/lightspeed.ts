import { AuthenticationSession } from "vscode";

export interface LightspeedAuthSession extends AuthenticationSession {
  rhUserHasSeat: boolean;
}
