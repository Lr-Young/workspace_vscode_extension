import { Webview, Uri } from "vscode";
import { getNonce } from "../utils";

function getUri(webview: Webview, extensionUri: Uri, ...pathList: string[]) {
  return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}

export function getWorkspaceAgentHtml(webview: Webview, extensionUri: Uri) {
    const scriptUri = getUri(webview, extensionUri, "out", "workspaceAgentScript.js");
    const styleUri = getUri(webview, extensionUri, "out", "workspaceAgentStyle.css");
    const codiconUri = getUri(webview, extensionUri, "out", "codicon.css");
    const nonce = getNonce();

    return /*html*/ `
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link rel="stylesheet" href="${styleUri}">
    <link rel="stylesheet" href="${codiconUri}">
    <title>Workspace Agent</title>
</head>

<body>

    <header>
        <h1>🤖 Workspace Agent </h1>
        <button id="auto-evaluation-button">🧪 自动评估</button>
    </header>

    <main id="chat-container">
        <!-- 消息会动态插入这里 -->
    </main>

    <footer>
        <div class="input-box">
        <input type="text" id="user-input" placeholder="请输入你的问题..." />
        <button id="send-button">发送</button>
        </div>
    </footer>

    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>

</html>

    `.trim();
}
