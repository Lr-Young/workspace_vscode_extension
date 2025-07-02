import { Webview, Uri } from "vscode";
import { getNonce } from "../utils";
import { badgeDemo } from "./demos/badge";
import { buttonDemo } from "./demos/button";
import { checkboxDemo } from "./demos/checkbox";
import { dataGridDemo } from "./demos/data-grid";
import { dividerDemo } from "./demos/divider";
import { dropdownDemo } from "./demos/dropdown";
import { linkDemo } from "./demos/link";
import { panelsDemo } from "./demos/panels";
import { progressRingDemo } from "./demos/progress-ring";
import { radioGroupDemo } from "./demos/radio-group";
import { tagDemo } from "./demos/tag";
import { textAreaDemo } from "./demos/text-area";
import { textFieldDemo } from "./demos/text-field";

import { htmlComponents } from "./components";

function getUri(webview: Webview, extensionUri: Uri, ...pathList: string[]) {
  return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}

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
    <title>Workspace Benchmark</title>
</head>

<body>

    <h1>Workspace Benchmark Dataset</h1>
    <vscode-divider role="separator"></vscode-divider>

	<div id="test"></div>
    <vscode-button appearance="primary" id="test-constructing">Test Button</vscode-button>
	<vscode-divider role="separator"></vscode-divider>

    <section class="grid-one-column">
        <section class="component-example">
            <vscode-button appearance="primary" id="button-benchmark-constructing">Begin Constructing Benchmark</vscode-button>
        </section>
    </section>
    <vscode-divider role="separator"></vscode-divider>

	<div class="hidden" id="placeholder-section">
		<section class="grid-one-column">
			<section class="component-container">
                <vscode-checkbox readonly id="placeholder-instantiation-checkbox">Placeholder Instantiation</vscode-checkbox>
                <vscode-progress-ring class="hidden" id="placeholder-instantiation-progress-ring"></vscode-progress-ring>

                <vscode-checkbox readonly id="question-instantiation-checkbox">Question Instantiation</vscode-checkbox>
                <vscode-progress-ring class="hidden" id="question-instantiation-progress-ring"></vscode-progress-ring>

                <vscode-checkbox readonly id="label-reference-checkbox">Label Relevant Context References</vscode-checkbox>
                <vscode-progress-ring class="hidden" id="label-reference-progress-ring"></vscode-progress-ring>
                
                <vscode-data-grid id="placeholder-instances-grid" grid-template-columns="1fr 1fr"></vscode-data-grid>

                <vscode-data-grid class="hidden" id="question-instances-grid" grid-template-columns="1fr 1fr 1fr"></vscode-data-grid>

                <vscode-data-grid class="hidden" id="question-references-grid" grid-template-columns="1fr 1fr 2fr"></vscode-data-grid>

			</section>
		</section>
		<vscode-divider role="separator"></vscode-divider>
	</div>

    <section class="grid-one-column">
        ${htmlComponents.datasetStatistics}
    </section>
    <vscode-divider role="separator"></vscode-divider>

    <section class="grid-two-column">
        ${htmlComponents.datasetQuestionType}
        ${htmlComponents.datasetQuestionType}
    </section>
    <vscode-divider role="separator"></vscode-divider>

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
	`.trim();
}
