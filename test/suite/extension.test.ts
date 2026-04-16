import * as assert from "assert";
import * as vscode from "vscode";

suite("Madie Extension", () => {
  test("Extension should activate", async () => {
    const ext = vscode.extensions.getExtension("madie-dev.madie");
    assert.ok(ext);
    await ext.activate();
    assert.ok(ext.isActive);
  });
});
