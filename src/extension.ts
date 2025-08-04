import * as vscode from 'vscode';
import { BenchmarkWebviewPanel } from './benchmark/benchmarkWebviewPanel';

export function activate(context: vscode.ExtensionContext) {

	console.log(`set env: ${process.env.DEEPSEEK_API_KEY}`);

	if (!process.env.DEEPSEEK_API_KEY) {
		vscode.window.showErrorMessage('DEEPSEEK_API_KEY environment variable is not setPlease set it in your environment variables.');
		return;
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('workspace.helloWorld', () => {
			vscode.window.showInformationMessage('Hello World from workspace!');
		})
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'chat-assistant-view',
			new ChatAssistantViewProvider(context)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('workspace.benchmark', () => {
			BenchmarkWebviewPanel.render(context.extensionUri);
			vscode.window.showInformationMessage('Benchmark Webview Panel is now active!');
		})
	);


}

class ChatAssistantViewProvider implements vscode.WebviewViewProvider {

	constructor(private readonly context: vscode.ExtensionContext) { }

	resolveWebviewView(webviewView: vscode.WebviewView): void {

		vscode.window.showInformationMessage('Chat Assistant View is now active!');

		// 初始化时，在 Webview 中显示加载动画
		webviewView.webview.html = `<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>加载中</title>
    <style>
        body {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            font-family: Arial, sans-serif;
            background-color: #f5f5f5;
        }
        
        .loading-text {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 20px;
            text-transform: uppercase;
            color: #333;
        }
        
        .loader {
            width: 50px;
            height: 50px;
            border: 5px solid #f3f3f3;
            border-top: 5px solid #3498db;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="loading-text">正在加载 WORKSPACE CHAT AGENT</div>
    <div class="loader"></div>
</body>
</html>`;

		webviewView.webview.options = {
			enableScripts: true,
		};

		// webviewView.webview.html = this.getHtml(webviewView.webview);

		// 接收来自 Webview 的消息
		webviewView.webview.onDidReceiveMessage(async message => {
			if (message.command === 'askLLM') {
				const response = await askLLM(message.text);
				webviewView.webview.postMessage({ command: 'reply', text: response });
			}
		});
	}

	private getHtml(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'script.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'style.css'));

		return `<!DOCTYPE html>`;

	}

}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function askLLM(prompt: string): Promise<string> {
	await sleep(1000);
	return "你好，我是LLM";
}

