import {
	allComponents,
	provideVSCodeDesignSystem,
	Checkbox,
	DataGrid,
	Button,
} from "@vscode/webview-ui-toolkit";

import { dataLoaders } from "../gui/components";
import { FileChunk, Placeholder, PlaceholderInstance, QuestionInstance } from "../benchmark/typeDefinitions";
import { sleep } from '../utils';
import { relative } from "path";

const vscode = acquireVsCodeApi();
let contextGridRowIndex: number = -1;
let contextGridRowVscodeLinkCount: number;

// In order to use all the Webview UI Toolkit web components they
// must be registered with the browser (i.e. webview) using the
// syntax below.
provideVSCodeDesignSystem().register(allComponents);

// Just like a regular webpage we need to wait for the webview
// DOM to load before we can reference any of the HTML elements
// or toolkit components
window.addEventListener("load", main);

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

async function appendGridCell(id: string, rowIndex: number, columnIndex: number, content: string): Promise<void> {
	const grid = document.getElementById(id) as DataGrid;

	const rows = grid.querySelectorAll('vscode-data-grid-row[row-type="default"]');

	if (rowIndex >= rows.length) {
		console.log(`appendGridCell: row index ${rowIndex} out of range [0...${rows.length}]`);
		return;
	}

	const cells = rows[rowIndex].querySelectorAll('vscode-data-grid-cell');
	
	if (columnIndex >= cells.length) {
		console.log(`appendGridCell: column index ${columnIndex} out of range [0...${cells.length}]`);
		return;
	}
	
	const cell = cells[columnIndex];
	const newContent = `${cell.innerHTML}\n${content}`;
	cell.replaceChildren();
	cell.insertAdjacentHTML('beforeend', newContent);
	return;
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

	(document.getElementById("test-constructing") as Button).onclick = (event) => {
		vscode.postMessage({
			command: "testButton",
		});
	};

	const addLinkEventListener = async (clazz: string, expectedCount: number) => {
		do {
			await sleep(200);
		} while (document.querySelectorAll(`vscode-link.${clazz}`).length !== expectedCount);
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
			case 'benchmark begin': {
				(document.getElementById('placeholder-instantiation-checkbox') as HTMLElement).textContent = 'Placeholder Instantiating...';
				(document.getElementById('placeholder-instantiation-progress-ring') as HTMLElement).style.display = 'block';
				(document.getElementById('placeholder-section') as HTMLElement).style.display = 'block';
				break;
			}
			case 'benchmark instances': {
				(document.getElementById('placeholder-instantiation-checkbox') as HTMLElement).textContent = 'Placeholder Instantiation Done';
				(document.getElementById('placeholder-instantiation-checkbox') as HTMLElement).setAttribute('checked', 'true');
				(document.getElementById('placeholder-instantiation-progress-ring') as HTMLElement).style.display = 'none';

				(document.getElementById('question-instantiation-checkbox') as HTMLElement).textContent = 'Question Instantiating...';
				(document.getElementById('question-instantiation-progress-ring') as HTMLElement).style.display = 'block';

				const instances: PlaceholderInstance = message.instances;
				const rowsData: Record<string, string>[] = [];

				let expectedVscodeLinkCount = 0;

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
						expectedVscodeLinkCount += 1;
					});
					rowsData.push({
						'Placeholder': placeholder,
						'Instances': content,
					});
				});

				await fillGrid('placeholder-instances-grid', rowsData);

				addLinkEventListener('placeholder-data-link', expectedVscodeLinkCount);
				(document.getElementById('placeholder-instances-grid') as HTMLElement).style.display = 'block';
				break;
			}
			case 'benchmark questions': {
				(document.getElementById('question-instantiation-checkbox') as HTMLElement).textContent = 'Question Instantiation Done';
				(document.getElementById('question-instantiation-checkbox') as HTMLElement).setAttribute('checked', 'true');
				(document.getElementById('question-instantiation-progress-ring') as HTMLElement).style.display = 'none';

				(document.getElementById('label-reference-checkbox') as HTMLElement).textContent = 'Labeling Relevant Context References...';
				(document.getElementById('label-reference-progress-ring') as HTMLElement).style.display = 'block';

				const questions: QuestionInstance[] = message.questions;
				const workspacePath = message.workspacePath;

				let expectedVscodeLinkCount = 0;

				fillGrid('question-instances-grid', questions.map(element => {
					let instance: string;
					if (element.placeholder === Placeholder.File) {
						instance = `${element.placeholder}: <vscode-link class="question-data-link" data-type="File" data-value="${workspacePath}${element.placeholderInstance}">${element.placeholderInstance}</vscode-link>`;
					} else if (element.placeholder === Placeholder.Folder) {
						instance = `${element.placeholder}: <vscode-link class="question-data-link" data-type="Folder" data-value="${workspacePath}${element.placeholderInstance}">${element.placeholderInstance}</vscode-link>`;
					} else {
						instance = `${element.placeholder}: <vscode-link class="question-data-link" data-type="Position" data-value="${element.placeholderInstance}">${element.placeholderInstance.split('#')[2]}</vscode-link>`;
					}
					expectedVscodeLinkCount += 1;
					return {
						'Question': element.question,
						'Template': element.template,
						'Placeholder Instance': instance,
					};
				}));

				fillGrid('question-references-grid', questions.map(element => {
					return {
						'Questions': element.question,
						'References': '',
						'Reason': '',
					};
				}));

				addLinkEventListener('question-data-link', expectedVscodeLinkCount);
				(document.getElementById('placeholder-instantiation-header') as HTMLElement).textContent = 'Placeholder Instantiation and Question Instantiation Done, Labeling relevant context references... ';
				(document.getElementById('question-instances-grid') as HTMLElement).style.display = 'block';
				(document.getElementById('question-references-grid') as HTMLElement).style.display = 'block';
				break;
			}
			case 'benchmark context': {
				switch (message.type) {
					case 'question': {
						contextGridRowIndex += 1;
						contextGridRowVscodeLinkCount = 0;
						break;
					}
					case 'analyse file': {
						break;
					}
					case 'references': {
						appendGridCell('question-references-grid', contextGridRowIndex, 1, 
							(message.references as FileChunk[]).map(fileChunk => {
								contextGridRowVscodeLinkCount += 1;
								return `<vscode-link class="question-context-link-${contextGridRowIndex}" data-type="Range" data-value="${fileChunk.filePath}#${fileChunk.startLine}#${fileChunk.endLine}">${relative(message.workspacePath, fileChunk.filePath)}:${fileChunk.startLine}~${fileChunk.endLine}</vscode-link>`;
							}).join('\n').trim()
						);
						appendGridCell('question-references-grid', contextGridRowIndex, 2, 
							`${relative(message.workspacePath, message.references[0].filePath)}:\n${message.reason}`
						);
						addLinkEventListener(`question-context-link-${contextGridRowIndex}`, contextGridRowVscodeLinkCount);
						break;
					}
				}
				break;
			}
			case 'benchmark done': {
				(document.getElementById('label-reference-checkbox') as HTMLElement).textContent = 'Labeling Relevant Context References Done';
				(document.getElementById('label-reference-checkbox') as HTMLElement).setAttribute('checked', 'true');
				(document.getElementById('label-reference-progress-ring') as HTMLElement).style.display = 'none';
				break;
			}
			case 'benchmark fail':{
				console.log(`benchmark fail, type: ${message.type} error: ${message.error}`);
				break;
			}
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
