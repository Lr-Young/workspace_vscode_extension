import * as vscode from 'vscode';
import { getWorkspaceAgentHtml } from '../gui/workspaceAgentHtml';

import { invoke } from './stateGraph';

import { evaluation, evaluate } from './evaluation';

let webview: vscode.Webview;

export function postMessage(message: any) {
    if (evaluation) {
        return;
    }
    webview.postMessage(message);
}

export class WorkspaceAgentWebviewProvider implements vscode.WebviewViewProvider {

    constructor(private readonly context: vscode.ExtensionContext) { }

    resolveWebviewView(webviewView: vscode.WebviewView): void {

        webview = webviewView.webview;

        webviewView.webview.html = getWorkspaceAgentHtml(webviewView.webview, this.context.extensionUri);

        webviewView.webview.options = {
            enableScripts: true,
        };

        // 接收来自 Webview 的消息
        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'query': {
                    // testModel(message.query);
                    invoke(message.query);
                    break;
                }
                case 'warn': {
                    console.log(`warn: ${message.content}`);
                    vscode.window.showWarningMessage(message.content);
                    break;
                }
                case 'evaluation': {
                    await evaluate();
                    postMessage({
                        command: 'evaluation done',
                    });
                    break;
                }
            }
        });
    }

}