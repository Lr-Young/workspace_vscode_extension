import { Disposable, Uri, Webview, WebviewPanel, window, ViewColumn } from "vscode";
import { getWebviewContent } from "../gui/benchmark";
import { constructBenchmark, generateAnswerAndPoints, instantiateQuestions, labelRelevantContext } from "../benchmark/main";
import { handleLink } from './main';

import { testLLM } from './llm';

let webview: Webview;

export function postMessage(message: any) {
	webview.postMessage(message);
}

export class BenchmarkWebviewPanel {

	public static INSTANCE: BenchmarkWebviewPanel | undefined;

	private readonly _webviewPanel: WebviewPanel;

	private _disposable: Disposable[] = [];

	constructor(panel: WebviewPanel, extionsionUri: Uri) {
		this._webviewPanel = panel;

		this._webviewPanel.onDidDispose(() => { this.dispose(); }, null, this._disposable);

		this._webviewPanel.webview.html = getWebviewContent(this._webviewPanel.webview, extionsionUri);

		webview = this._webviewPanel.webview;

		this._webviewPanel.webview.onDidReceiveMessage(
			async message => {
				switch (message.command) {
					case 'benchmarkConstruct':
						constructBenchmark();
						return;
					case 'instantiate questions':
						instantiateQuestions(message.questionNum);
						return;
					case 'label references':
						labelRelevantContext(message.questions);
						return;
					case 'generate answer and points':
						generateAnswerAndPoints(message.data);
						return;
					case 'link':
						handleLink(message.type, message.value);
						return;
					case 'testButton':
						const msg = await testLLM();
						window.showInformationMessage(msg as string);
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
