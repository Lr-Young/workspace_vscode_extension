import * as vscode from 'vscode';

function getWebviewContent(webview: vscode.Webview) {
    const toolkitUri = getUri(webview, this._context.extensionUri, [
      'node_modules',
      '@vscode',
      'webview-ui-toolkit',
      'dist',
      'toolkit.js',
    ]);

    const stylesUri = getUri(webview, this._context.extensionUri, ['assets', 'styles.css']);
    const scriptUri = getUri(webview, this._context.extensionUri, ['assets', 'main.js']);

    return `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link href="${stylesUri}" rel="stylesheet">
          <script type="module" src="${toolkitUri}"></script>
          <title>AI Chat</title>
        </head>
        <body>
          <div id="chat-container">
            <div id="message-list"></div>
            <div class="input-area">
              <vscode-text-area id="user-input" placeholder="Type your message..."></vscode-text-area>
              <vscode-button id="send-button">Send</vscode-button>
            </div>
          </div>
          <script src="${scriptUri}"></script>
        </body>
      </html>
    `;
  }
}