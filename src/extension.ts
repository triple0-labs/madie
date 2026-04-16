import * as vscode from "vscode";
import { MadieEditorProvider } from "./MadieEditorProvider";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(MadieEditorProvider.register(context));
}

export function deactivate() {}
