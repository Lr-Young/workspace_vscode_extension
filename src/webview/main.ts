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
	const newContent = `${cell.innerHTML}<br>${content}`;
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

async function loadDataFromGrid(id: string): Promise<Record<string, string>[]> {
	const data: Record<string, string>[] = [];

	const grid = document.getElementById(id) as DataGrid;

	const headerRow = grid.querySelectorAll('vscode-data-grid-row[row-type="header"]');

	const rows = grid.querySelectorAll('vscode-data-grid-row[row-type="default"]');

	if (headerRow.length !== 1) {
		console.error(`Error when loading data from grid: no header row found`);
		return data;
	}

	if (rows.length === 0) {
		console.error(`Error when loading data from grid: no data rows found`);
		return data;
	}

	const titles: string[] = Array.from(headerRow[0].children).map(cell => {
		return cell.textContent!.trim();
	});

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const cells = row.querySelectorAll('vscode-data-grid-cell');
		const rowData: Record<string, string> = {};
		for (let j = 0; j < cells.length; j++) {
			rowData[titles[j]] = cells[j].innerHTML;
		}
		data.push(rowData);
	}

	return data;
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

	(document.getElementById("button-instantiate-questions") as Button).onclick = (event) => {
		(document.getElementById("button-instantiate-questions") as Button).disabled = true;
		(document.getElementById("button-instantiate-questions") as Button).title = 'In Process...';
		const questionNum: number = parseInt((document.getElementById('instantiate-questions-number') as HTMLInputElement).value.trim() || '10');
		vscode.postMessage({
			command: "instantiate questions",
			questionNum: questionNum,
		});
	};

	(document.getElementById("button-label-reference") as Button).onclick = async (event) => {
		(document.getElementById("button-label-reference") as Button).disabled = true;
		(document.getElementById("button-label-reference") as Button).title = 'In Process...';
		const data: Record<string, string>[] = await loadDataFromGrid('question-instances-grid');
		const questions: string[] = data.map(element => {
			return element['Question'];
		});
		vscode.postMessage({
			command: "label references",
			questions: questions,
		});
	};

	(document.getElementById('button-generate-answer-points') as Button).onclick = async (event) => {
		(document.getElementById("button-generate-answer-points") as Button).disabled = true;
		(document.getElementById("button-generate-answer-points") as Button).title = 'In Process...';
		const data: Record<string, string>[] = await loadDataFromGrid('question-references-grid');
		vscode.postMessage({
			command: "generate answer and points",
			data: data,
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
			case 'instantiate questions begin': {
				(document.getElementById('placeholder-instantiation-checkbox') as HTMLElement).textContent = 'Placeholder Instantiating...';
				(document.getElementById('placeholder-instantiation-progress-wrapper') as HTMLElement).style.display = 'block';
				break;
			}
			case 'instantiate questions processs': {
				(document.getElementById('placeholder-instantiation-progress-bar') as HTMLElement).style.width = message.percent + '%';
				(document.getElementById('placeholder-instantiation-progress-bar') as HTMLElement).textContent = message.percent + '%';
			}
			case 'instantiate questions placeholder instances': {
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

				(document.getElementById('placeholder-instantiation-checkbox') as HTMLElement).textContent = 'Placeholder Instantiation Done, Question Instantiating...';
				(document.getElementById('placeholder-instances-grid') as HTMLElement).style.display = 'block';
				break;
			}
			case 'instantiate questions question instances': {
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

				addLinkEventListener('question-data-link', expectedVscodeLinkCount);

				(document.getElementById('placeholder-instantiation-checkbox') as HTMLElement).textContent = 'Placeholder And Question Instantiation Done';
				(document.getElementById('placeholder-instantiation-checkbox') as HTMLElement).setAttribute('checked', 'true');
				(document.getElementById('question-instances-grid') as HTMLElement).style.display = 'block';
				(document.getElementById('button-label-reference') as Button)!.disabled = false;
				(document.getElementById("button-instantiate-questions") as Button).disabled = false;
				break;
			}
			case 'benchmark references': {
				switch (message.type) {
					case 'init': {
						fillGrid('question-references-grid', message.questions.map(question => {
							return {
								'Question': question,
								'Reference': '',
								'Reason': '',
							};
						}));
						(document.getElementById('question-references-grid') as HTMLElement).style.display = 'block';
						(document.getElementById('reference-progress-wrapper') as HTMLElement).style.display = 'block';
						break;
					}
					case 'question': {
						contextGridRowIndex += 1;
						contextGridRowVscodeLinkCount = 0;
						(document.getElementById('reference-checkbox') as HTMLElement).innerHTML = `Labeling References for question '<strong>${message.question}</strong>'`;
						(document.getElementById('reference-progress-bar') as HTMLElement).style.width = '0%';
						(document.getElementById('reference-progress-bar') as HTMLElement).textContent = '0%';
						break;
					}
					case 'analyse file': {
						(document.getElementById('reference-checkbox') as HTMLElement).innerHTML = `Labeling References for question '<strong>${message.question}</strong>' in file: <vscode-link class="reference-progress-link" data-type="File" data-value="${message.file}">${message.relativePath}</vscode-link>`;
						addLinkEventListener(`reference-progress-link`, 1);
						break;
					}
					case 'references': {
						appendGridCell('question-references-grid', contextGridRowIndex, 1, 
							(message.references as FileChunk[]).map(fileChunk => {
								contextGridRowVscodeLinkCount += 1;
								return `<vscode-link class="question-context-link-${contextGridRowIndex}" data-type="Range" data-value="${fileChunk.filePath}#${fileChunk.startLine}#${fileChunk.endLine}">${message.relativePath}:${fileChunk.startLine}~${fileChunk.endLine}</vscode-link>`;
							}).join('<br>').trim()
						);
						appendGridCell('question-references-grid', contextGridRowIndex, 2, 
							`<vscode-link class="question-context-link-${contextGridRowIndex}" data-type="File" data-value="${(message.references as FileChunk[])[0].filePath}">${message.relativePath}</vscode-link> Reason:<br>${message.reason}`
						);
						contextGridRowVscodeLinkCount += 1;
						addLinkEventListener(`question-context-link-${contextGridRowIndex}`, contextGridRowVscodeLinkCount);
						(document.getElementById('reference-progress-bar') as HTMLElement).style.width = message.percent + '%';
						(document.getElementById('reference-progress-bar') as HTMLElement).textContent = message.percent + '%';
						break;
					}
					case 'done': {
						(document.getElementById('button-generate-answer-points') as Button)!.disabled = false;
						(document.getElementById("button-label-reference") as Button).disabled = false;
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
