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
    const d3Src = getUri(webview, extensionUri, "out", "d3.v7.min.js");
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
    <!--
    <script nonce="${nonce}" src="${d3Src}"></script>
    <style>
        body { margin: 0; overflow: hidden; }
        svg { width: 100%; height: 100vh; }
        .node { stroke: #fff; stroke-width: 1.5px; }
        .node.class { fill: #66c2a5; }
        .node.utility { fill: #fc8d62; }
        .link { stroke: #999; stroke-opacity: 0.6; }
        .link.inheritance { stroke-dasharray: 5,5; }
        #tooltip {
            position: absolute;
            padding: 8px;
            background: rgba(0,0,0,0.8);
            color: white;
            border-radius: 4px;
            pointer-events: none;
            font-family: sans-serif;
            font-size: 12px;
        }
    </style>
    -->
</head>

<body>

    <div class="navbar">
        <vscode-button appearance="primary" id="button-load-file">Load from File</vscode-button>

        <vscode-button appearance="primary" id="button-save-file">Save to File</vscode-button>

        <vscode-button appearance="primary" id="button-save-default-file">Save</vscode-button>

        <vscode-button appearance="primary" id="button-auto">Auto</vscode-button>

        <vscode-button appearance="primary" id="button-modify-references">Modify References</vscode-button>

        <vscode-button appearance="primary" id="button-timed-auto">Timed Auto</vscode-button>

        <vscode-button appearance="primary" id="button-export-json">Export Json</vscode-button>

        <vscode-button appearance="primary" id="button-export-excel">Export Excel</vscode-button>

        <vscode-button appearance="primary" id="button-test-llm">Test LLM</vscode-button>

        <vscode-button appearance="primary" id="button-fetch-file-types">Fetch All File Types</vscode-button>

        <br></br>

        <div class="time-picker">
            <label for="hours">Begin Time : Hour</label>
            <select id="time-picker-hours-begin">
                <!-- 0-23小时选项 -->
            </select>

            <span>:</span>
            
            <label for="minutes">Minute</label>
            <select id="time-picker-minutes-begin">
                <!-- 0-59分钟选项 -->
            </select>
            
        </div>

        <div class="time-picker">
            <label for="hours">End Time   : Hour</label>
            <select id="time-picker-hours-end">
                <!-- 0-23小时选项 -->
            </select>

            <span>:</span>
            
            <label for="minutes">Minute</label>
            <select id="time-picker-minutes-end">
                <!-- 0-59分钟选项 -->
            </select>
            
        </div>

        <div id="chosen-time" class="hidden">

        </div>

    </div>

<div class="main-content">

    <h1>Workspace Benchmark Dataset</h1>
    <div id="current-workspace-path">Current Workspace Path:</div>
    <vscode-divider role="separator"></vscode-divider>

    <!--
    <svg></svg>
    <div id="tooltip" style="display: none;"></div>
    -->

    <section class="component-container">

        <h2>Step 1: Placeholder and Question Instantiation</h2>

        <div class="horizontal progress">
            <vscode-checkbox readonly id="placeholder-instantiation-checkbox">Placeholder And Question Instantiation</vscode-checkbox>
            <div class="progress-container hidden" id="placeholder-instantiation-progress-wrapper">
                <div class="progress-bar" id="placeholder-instantiation-progress-bar">0%</div>
            </div>
        </div>

        <div class="horizontal">
            <p>Number of Questions to Instantiate</p>
            <vscode-text-field type="number" min="1" value="20" id="instantiate-questions-number"></vscode-text-field>
            <vscode-button appearance="primary" id="button-instantiate-questions">Instantiate Questions</vscode-button>
        </div>

        <vscode-data-grid class="hidden" id="placeholder-instances-grid" grid-template-columns="1fr 10fr"></vscode-data-grid>

        <vscode-data-grid class="hidden" id="question-instances-grid" grid-template-columns="1fr 1fr 1fr"></vscode-data-grid>

    </section>

    <vscode-divider role="separator"></vscode-divider>

    <section class="component-container">
        <h2>Step 2: Label Question Context Instantiation</h2>

        <vscode-checkbox readonly id="reference-checkbox">Label Question References</vscode-checkbox>

        <vscode-button title="Please Finish Step 1" appearance="primary" id="button-label-reference">Label References</vscode-button>

        <vscode-divider role="separator"></vscode-divider>

        <vscode-button appearance="primary" id="button-timed-label">Timed Label References</vscode-button>
        
        <vscode-data-grid class="hidden" id="question-references-grid" grid-template-columns="1fr 1fr 2fr"></vscode-data-grid>

    </section>

    <vscode-divider role="separator"></vscode-divider>

    <section class="component-container">
        <h2>Step 3: Generate Answer And Points</h2>

        <vscode-checkbox readonly id="answer-point-checkbox">Generate Answer And Points</vscode-checkbox>

        <vscode-button title="Please Finish Step 2" appearance="primary" id="button-generate-answer-points">genreate Answer and Points</vscode-button>
        
        <vscode-data-grid class="hidden" id="answer-point-grid" grid-template-columns="1fr 2fr 2fr 2fr"></vscode-data-grid>

    </section>

    <vscode-divider role="separator"></vscode-divider>

    <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
</div>
</body>

</html>

	`.trim();
}

/*

<div id="test"></div>
    <vscode-button appearance="primary" id="test-constructing">Test Button</vscode-button>
	<vscode-divider role="separator"></vscode-divider>

<div class="hidden" id="placeholder-section">
		<section class="grid-one-column">
			<section class="component-container">
                <vscode-checkbox readonly id="question-instantiation-checkbox">Question Instantiation</vscode-checkbox>
                <vscode-progress-ring class="hidden" id="question-instantiation-progress-ring"></vscode-progress-ring>

                <vscode-checkbox readonly id="label-reference-checkbox">Label Relevant Context References</vscode-checkbox>
                <vscode-progress-ring class="hidden" id="label-reference-progress-ring"></vscode-progress-ring>

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
*/
