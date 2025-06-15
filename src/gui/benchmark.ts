import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn } from "vscode";
import { getUri, getNonce } from "../utils";

/**
 * Defines and returns the HTML that should be rendered within the webview panel.
 *
 * @remarks This is also the place where *references* to CSS and JavaScript files
 * are created and inserted into the webview HTML.
 *
 * @param webview A reference to the extension webview
 * @param extensionUri The URI of the directory containing the extension
 * @returns A template string literal containing the HTML that should be
 * rendered within the webview panel
 */
export function getWebviewContent(webview: Webview, extensionUri: Uri) {
	const webviewUri = getUri(webview, extensionUri, "out", "webview.js");
	const styleUri = getUri(webview, extensionUri, "out", "style.css");
	const codiconUri = getUri(webview, extensionUri, "out", "codicon.css");
	const nonce = getNonce();

	// Note: Since the below HTML is defined within a JavaScript template literal, all of
	// the HTML for each component demo can be defined elsewhere and then imported/inserted
	// into the below code. This can help with code readability and organization.
	//
	// Tip: Install the es6-string-html VS Code extension to enable code highlighting below
	return /*html*/ `
		<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<link rel="stylesheet" href="${styleUri}">
				<link rel="stylesheet" href="${codiconUri}">
				<title>Component Gallery</title>
			</head>
			<body>
				<h1>Webview UI Toolkit Component Gallery</h1>
				<section class="component-row">
					${badgeDemo}
					${buttonDemo}
					${checkboxDemo}
				</section>
				<section id="data-grid-row">
					${dataGridDemo}
				</section>
				<section class="component-row">
					${dividerDemo}
					${dropdownDemo}
					${linkDemo}
				</section>
				<section id="panels-row">
					${panelsDemo}
				</section>
				<section class="component-row">
					${progressRingDemo}
					${radioGroupDemo}
					${tagDemo}
				</section>
				<section class="component-row">
					${textAreaDemo}
					${textFieldDemo}
				</section>
				<script type="module" nonce="${nonce}" src="${webviewUri}"></script>
			</body>
		</html>
	`;
}
