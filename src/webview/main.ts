import {
	allComponents,
	provideVSCodeDesignSystem,
	Checkbox,
	DataGrid,
	Button,
} from "@vscode/webview-ui-toolkit";

import { dataLoaders } from "../gui/components";
import { Placeholder, PlaceholderInstance, QuestionInstance } from "../benchmark/typeDefinitions";

const vscode = acquireVsCodeApi();

// In order to use all the Webview UI Toolkit web components they
// must be registered with the browser (i.e. webview) using the
// syntax below.
provideVSCodeDesignSystem().register(allComponents);

// Just like a regular webpage we need to wait for the webview
// DOM to load before we can reference any of the HTML elements
// or toolkit components
window.addEventListener("load", main);

window.confirm("This is a confirmation dialog. Do you want to proceed?") &&
	console.log("User confirmed the action.");


function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function validateGridData(data: Record<string, string>[]): boolean {
	if (data.length === 0) {
		console.error("grid data should be non-empty");
		return false;
	}

	const referenceKeys = Object.keys(data[0]).sort();

	for (let i = 1; i < data.length; i++) {
		const currentKeys = Object.keys(data[i]).sort();

		if (currentKeys.length !== referenceKeys.length) {
			console.error(`grid data elements should have the same keys`);
			return false;
		}

		for (let j = 0; j < referenceKeys.length; j++) {
			if (referenceKeys[j] !== currentKeys[j]) {
				console.error(`grid data elements should have the same keys`);
				return false;
			}
		}
	}

	return true;
}

async function fillGrid(id: string, data: Record<string, string>[]): Promise<void> {

	if (!validateGridData(data)) {
		return;
	}

	const grid = document.getElementById(id) as DataGrid;

	grid.rowsData = data;

	let headerRow: NodeListOf<Element>;

	let rows: NodeListOf<Element>;

	do {
		await sleep(100);
		console.log('slept for 0.1s');
		headerRow = grid?.querySelectorAll('vscode-data-grid-row[row-type="header"]');
		rows = grid?.querySelectorAll('vscode-data-grid-row[row-type="default"]');
	} while (headerRow.length !== 1 || rows.length !== data.length);

	const titles: string[] = Array.from(headerRow[0].children).map(cell => {
		return cell.textContent!.trim();
	});

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const cells = row.querySelectorAll('vscode-data-grid-cell');
		for (let j = 0; j < cells.length; j++) {
			const cell = cells[j];
			cell.replaceChildren();
			cell.insertAdjacentHTML('beforeend', data[i][titles[j]]);
		}
	}

	grid.style.display = 'block';
}

function loadData(): void {
	for (const [id, dataLoader] of Object.entries(dataLoaders)) {
		const element = document.getElementById(id);
		if (element) {
			dataLoader(id);
		} else {
			console.warn(`No element found with id: ${id}`);
		}
	}
}

function test(content: string): void {
	const now = new Date();
	const child = document.createElement('p');
	child.textContent = `[${now.toLocaleString()}] ${content}`;
	child.classList.add('test-p');
	(document.getElementById('test') as HTMLElement).append(child);
}

function init() {

	loadData();

	// benchmark constructing button
	(document.getElementById("button-benchmark-constructing") as Button).onclick = (event) => {
		vscode.postMessage({
			command: "benchmarkConstruct",
		});
	};

	const addLinkEventListener = async (clazz: string) => {
		do {
			await sleep(200);
		} while (document.querySelectorAll(`vscode-link.${clazz}`).length === 0);
		document.querySelectorAll(`vscode-link.${clazz}`).forEach(link => {
			console.log(`		${link}`);
			link.addEventListener('click', () => {
				vscode.postMessage({
					command: 'link',
					type: (link as HTMLElement).dataset.type,
					value: (link as HTMLElement).dataset.value,
				});
			});
		});
	};

	window.addEventListener('message', async event => {
		const message = event.data;
		switch (message.command) {
			case 'benchmark begin':
				(document.getElementById('placeholder-section') as HTMLElement).style.display = 'block';
				break;
			case 'benchmark instances':
				const instances: PlaceholderInstance = message.instances;
				const rowsData: Record<string, string>[] = [];

				Object.entries(Placeholder).forEach(([_, placeholder]) => {
					let content: string = '';
					[...instances[placeholder]].forEach(element => {
						if (placeholder === Placeholder.File) {
							content += `<vscode-link class="placeholder-data-link" data-type="File" data-value="${instances['WorkspacePath']}${element}">${element}</vscode-link>, `;
						} else if (placeholder === Placeholder.Folder) {
							content += `<vscode-link class="placeholder-data-link" data-type="Folder" data-value="${instances['WorkspacePath']}${element}">${element}</vscode-link>, `;
						} else {
							content += `<vscode-link class="placeholder-data-link" data-type="Position" data-value="${element}">${element.split('#')[2]}</vscode-link>, `;
						}
					});
					rowsData.push({
						'Placeholder': placeholder,
						'Instances': content,
					});
				});

				await fillGrid('placeholder-instances-grid', rowsData);

				// const placeholderGrid = document.getElementById('placeholder-instances-grid') as DataGrid;

				// console.log(placeholderGrid.rowsData);

				// console.log(placeholderGrid.rowsData as Record<string, string>[]);

				// placeholderGrid.rowsData = rowsData;

				// await sleep(2000);

				// const rows = placeholderGrid?.querySelectorAll('vscode-data-grid-row[row-type="default"]');

				// if (rows) {
				// 	rows.forEach(row => {
				// 		const cells = row.querySelectorAll('vscode-data-grid-cell');
				// 		if (cells.length >= 2) {
				// 			const key = cells[0].innerHTML.trim();
				// 			const contentCell = cells[1];

				// 			let content: string = '';

				// 			[...instances[key]].forEach(element => {
				// 				if (key === Placeholder.File) {
				// 					content += `<vscode-link class="data-link" data-type="File" data-value="${instances['WorkspacePath']}${element}">${element}</vscode-link>, `;
				// 				} else if (key === Placeholder.Folder) {
				// 					content += `<vscode-link class="data-link" data-type="Folder" data-value="${instances['WorkspacePath']}${element}">${element}</vscode-link>, `;
				// 				} else {
				// 					content += `<vscode-link class="data-link" data-type="Position" data-value="${element}">${element.split('#')[2]}</vscode-link>, `;
				// 				}
				// 			});

				// 			contentCell.replaceChildren();
				// 			contentCell.insertAdjacentHTML('beforeend', content);
				// 		}
				// 	});
				// 	// addLinkEventListener();
				// }

				addLinkEventListener('placeholder-data-link');
				(document.getElementById('benchmark-progress-ring') as HTMLElement).style.display = 'none';
				(document.getElementById('placeholder-instantiate-header') as HTMLElement).textContent = 'Placeholder Instantiation Done';
				break;
			case 'benchmark questions':
				const questions: QuestionInstance = message.questions;
				fillGrid('question-instances-grid', questions.instances.map(element => {
					let instance: string;
					if (element.placeholder === Placeholder.File) {
						instance = `${element.placeholder}: <vscode-link class="question-data-link" data-type="File" data-value="${questions.workspacePath}${element.placeholderInstance}">${element.placeholderInstance}</vscode-link>`;
					} else if (element.placeholder === Placeholder.Folder) {
						instance = `${element.placeholder}: <vscode-link class="question-data-link" data-type="Folder" data-value="${questions.workspacePath}${element.placeholderInstance}">${element.placeholderInstance}</vscode-link>`;
					} else {
						instance = `${element.placeholder}: <vscode-link class="question-data-link" data-type="Position" data-value="${element.placeholderInstance}">${element.placeholderInstance.split('#')[2]}</vscode-link>`;
					}
					return {
						'Question': element.question,
						'Template': element.template,
						'Placeholder Instance': instance,
					};
				}));
				addLinkEventListener('question-data-link');
				break;
			case 'benchmark done':

				break;
		}
	});
}

function main() {

	init();

	// Set checkbox indeterminate state
	const checkbox = document.getElementById("basic-checkbox") as Checkbox;
	checkbox.indeterminate = true;

	// Define default data grid
	const defaultDataGrid = document.getElementById("default-grid") as DataGrid;
	defaultDataGrid.rowsData = [
		{
			column1: "Cell Data",
			column2: "Cell Data",
			column3: "Cell Data",
			column4: "Cell Data",
		},
		{
			column1: "Cell Data",
			column2: "Cell Data",
			column3: "Cell Data",
			column4: "Cell Data",
		},
		{
			column1: "Cell Data",
			column2: "Cell Data",
			column3: "Cell Data",
			column4: "Cell Data",
		},
	];

	// Define data grid with custom titles
	const basicDataGridList = document.querySelectorAll(".basic-grid") as NodeListOf<DataGrid>;
	for (const basicDataGrid of basicDataGridList) {
		basicDataGrid.rowsData = [
			{
				columnKey1: "Cell Data",
				columnKey2: "Cell Data",
				columnKey3: "Cell Data",
				columnKey4: "Cell Data",
			},
			{
				columnKey1: "Cell Data",
				columnKey2: "Cell Data",
				columnKey3: "Cell Data",
				columnKey4: "Cell Data",
			},
			{
				columnKey1: "Cell Data",
				columnKey2: "Cell Data",
				columnKey3: "Cell Data",
				columnKey4: "Cell Data",
			},
		];
		basicDataGrid.columnDefinitions = [
			{ columnDataKey: "columnKey1", title: "A Custom Header Title" },
			{ columnDataKey: "columnKey2", title: "Custom Title" },
			{ columnDataKey: "columnKey3", title: "Title Is Custom" },
			{ columnDataKey: "columnKey4", title: "Another Custom Title" },
		];
	}
}
