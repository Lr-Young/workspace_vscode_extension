import * as vscode from 'vscode';
import { BenchmarkWebviewPanel } from './benchmark/benchmarkWebviewPanel';
import { WorkspaceAgentWebviewProvider } from './workspace_agent/workspaceAgentWebviewProvider';


export function activate(context: vscode.ExtensionContext) {

	if (!process.env.DEEPSEEK_API_KEY) {
		vscode.window.showErrorMessage('DEEPSEEK_API_KEY environment variable is not setPlease set it in your environment variables.');
		return;
	}

	if (!process.env.DASHSCOPE_API_KEY) {
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
			'workspace-agent-view',
			new WorkspaceAgentWebviewProvider(context),
			{
				webviewOptions: {
					retainContextWhenHidden: true,
				}
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('workspace.benchmark', () => {
			BenchmarkWebviewPanel.render(context.extensionUri);
			vscode.window.showInformationMessage('Benchmark Webview Panel is now active!');
		})
	);


}