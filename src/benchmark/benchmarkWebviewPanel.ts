import { Disposable, Uri, WebviewPanel, window, ViewColumn } from "vscode";
import { getWebviewContent } from "../gui/benchmark";
import { constructBenchmark } from "../benchmark/main";
import { handleLink } from './main';

export class BenchmarkWebviewPanel {

	public static INSTANCE: BenchmarkWebviewPanel | undefined;

	private readonly _webviewPanel: WebviewPanel;

	private _disposable: Disposable[] = [];

	constructor(panel: WebviewPanel, extionsionUri: Uri) {
		this._webviewPanel = panel;

		this._webviewPanel.onDidDispose(() => { this.dispose(); }, null, this._disposable);

		this._webviewPanel.webview.html = getWebviewContent(this._webviewPanel.webview, extionsionUri);

		this._webviewPanel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'benchmarkConstruct':
						constructBenchmark(this._webviewPanel.webview);
						return;
					case 'link':
						handleLink(message.type, message.value);
						return;
				}
			}
		);
	}

	public static render(extensionUri: Uri): void {
		if (BenchmarkWebviewPanel.INSTANCE) {
			BenchmarkWebviewPanel.INSTANCE._webviewPanel.reveal();
		} else {
			const panel = window.createWebviewPanel(
				"workspace.benchmark",
				"Workspace Benchmark",
				ViewColumn.One,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [Uri.joinPath(extensionUri, "out")]
				}
			);

			BenchmarkWebviewPanel.INSTANCE = new BenchmarkWebviewPanel(panel, extensionUri);
		}
	}

	public dispose(): void {
		BenchmarkWebviewPanel.INSTANCE = undefined;
		this._webviewPanel.dispose();
		this._disposable.forEach((d) => d.dispose());
		this._disposable = [];
	}
}
