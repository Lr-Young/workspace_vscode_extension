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
let answerGridRowIndex: number = -1;
let auto: boolean = false;

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

async function addLinkEventListener(selector: string, expectedCount: number) {
	do {
		await sleep(200);
	} while (document.querySelectorAll(`${selector}`).length !== expectedCount);
	document.querySelectorAll(`${selector}`).forEach(link => {
		link.addEventListener('click', () => {
			vscode.postMessage({
				command: 'link',
				type: (link as HTMLElement).dataset.type,
				value: (link as HTMLElement).dataset.value,
			});
		});
	});
};

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
	let newContent: string;
	if (cell.innerHTML.trim().length > 0) {
		newContent = `${cell.innerHTML}<br>${content}`;
	} else {
		newContent = `${content}`;
	}
	cell.replaceChildren();
	cell.insertAdjacentHTML('beforeend', newContent);
	return;
}

async function fillGrid(id: string, data: Record<string, string[]> | Record<string, string>[], show?: boolean): Promise<void> {

	if (!Array.isArray(data)) {
		const tmpData: Record<string, string>[] = [];
		const keys = Object.keys(data);
		if (keys.length === 0) {
			console.error('grid data should not be empty');
			return;
		}
		const rowsCount = data[keys[0]].length;
		for (let i = 0; i < keys.length; i++) {
			if (data[keys[i]].length !== rowsCount) {
				console.error('grid data columns should have same row count');
				return;
			}
		}
		for (let i = 0; i < rowsCount; i++) {
			tmpData.push({});
			for (const key of keys) {
				tmpData[i][key] = data[key][i];
			}
		}
		data = tmpData;
	}

	data = data as Record<string, string>[];

	if (!validateGridData(data)) {
		return;
	}

	const grid = document.getElementById(id) as DataGrid;

	grid.rowsData = data;

	let headerRow: NodeListOf<Element>;

	let rows: NodeListOf<Element>;

	do {
		await sleep(100);
		headerRow = grid?.querySelectorAll('vscode-data-grid-row[row-type="header"]');
		rows = grid?.querySelectorAll('vscode-data-grid-row[row-type="default"]');
	} while (headerRow.length !== 1 || rows.length !== data.length);

	const titles: string[] = Array.from(headerRow[0].children).map(cell => {
		return cell.innerHTML!.trim();
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

	if (show) {
		grid.style.display = 'block';
	}

}

async function loadDataFromGrid(id: string): Promise<Record<string, string[]>> {
	const data: Record<string, string[]> = {};

	const grid = document.getElementById(id) as DataGrid;

	const headerRow = grid.querySelectorAll('vscode-data-grid-row[row-type="header"]');

	const rows = grid.querySelectorAll('vscode-data-grid-row[row-type="default"]');

	if (headerRow.length === 0 || rows.length === 0) {
		return data;
	}

	const titles: string[] = Array.from(headerRow[0].children).map(cell => {
		const title: string = cell.innerHTML!.trim();
		data[title] = [];
		return title;
	});

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const cells = row.querySelectorAll('vscode-data-grid-cell');
		const rowData: Record<string, string> = {};
		for (let j = 0; j < cells.length; j++) {
			data[titles[j]].push(cells[j].innerHTML);
		}
	}

	return data;
}

function modifyVscodeLinkDataValue(data: Record<string, string[]>, titles: string[], workspacePath?: string): {
	success: boolean,
	vscodeLinkCount: number,
} {
	const parser = new DOMParser();
	const output = {
		success: true,
		vscodeLinkCount: 0,
	};
	titles.forEach(title => {
		data[title].forEach((value: string, index: number) => {
			const wrapperedInput = `<div id="tmp-wrapper">${value}</div>`;
			try {
				const doc = parser.parseFromString(wrapperedInput, 'text/html');
				const element = doc.getElementById('tmp-wrapper');
				if (!element) {
					throw Error('cannot get element by id "tmp-wrapper"');
				}
				for (const node of element.childNodes) {
					if (node.nodeType !== Node.ELEMENT_NODE) {
						continue;
					}
					const vscodeLinkNode = (node as HTMLElement);
					if (vscodeLinkNode.tagName.toLowerCase() === 'vscode-link' && vscodeLinkNode.dataset.value) {
						output.vscodeLinkCount++;
						if (workspacePath) {
							vscodeLinkNode.dataset.value = `${workspacePath}#${vscodeLinkNode.dataset.value}`;
						} else {
							vscodeLinkNode.dataset.value = vscodeLinkNode.dataset.value.split('#').slice(1).join('#');
						}
					}
				}
				data[title][index] = element.innerHTML;
			} catch(error) {
				console.log(`modifyVscodeLinkDataValue failed: ${error}`);
				output.success = false;
			}
		});
	});
	return output;
}

async function gridDataToJson(): Promise<Record<string, Record<string, string[]>>> {
	const data: Record<string, Record<string, string[]>> = {};

	const gridIds = [
		'placeholder-instances-grid',
		'question-instances-grid',
		'question-references-grid',
		'answer-point-grid',
	];

	for (const id of gridIds) {
		const gridData: Record<string, string[]> = await loadDataFromGrid(id);
		if (Object.keys(gridData).length === 0) {
			continue;
		}
		switch (id) {
			case 'placeholder-instances-grid': {
				modifyVscodeLinkDataValue(gridData, ['Instances']);
				break;
			}
			case 'question-instances-grid': {
				modifyVscodeLinkDataValue(gridData, ['Placeholder Instance']);
				break;
			}
			case 'question-references-grid': {
				modifyVscodeLinkDataValue(gridData, ['Reference', 'Reason']);
				break;
			}
			case 'answer-point-grid': {
				modifyVscodeLinkDataValue(gridData, ['Reference']);
				break;
			}
		}
		data[id] = gridData;
	}

	return data;
}

async function jsonToGridData(data: Record<string, Record<string, string[]>>, workspacePath: string): Promise<void> {
	const gridIds = [
		'placeholder-instances-grid',
		'question-instances-grid',
		'question-references-grid',
		'answer-point-grid',
	];

	for (const id of gridIds) {
		if (!Object.keys(data).includes(id)) {
			continue;
		}
		switch (id) {
			case 'placeholder-instances-grid': {
				const vscodeLinkCount = modifyVscodeLinkDataValue(data[id], ['Instances'], workspacePath).vscodeLinkCount;
				addLinkEventListener(`#${id} vscode-link`, vscodeLinkCount);
				break;
			}
			case 'question-instances-grid': {
				const vscodeLinkCount = modifyVscodeLinkDataValue(data[id], ['Placeholder Instance'], workspacePath).vscodeLinkCount;
				addLinkEventListener(`#${id} vscode-link`, vscodeLinkCount);
				break;
			}
			case 'question-references-grid': {
				const vscodeLinkCount = modifyVscodeLinkDataValue(data[id], ['Reference', 'Reason'], workspacePath).vscodeLinkCount;
				addLinkEventListener(`#${id} vscode-link`, vscodeLinkCount);
				break;
			}
			case 'answer-point-grid': {
				const vscodeLinkCount = modifyVscodeLinkDataValue(data[id], ['Reference'], workspacePath).vscodeLinkCount;
				addLinkEventListener(`#${id} vscode-link`, vscodeLinkCount);
				break;
			}
		}
	}

	for (const id of gridIds) {
		if (!Object.keys(data).includes(id)) {
			continue;
		}
		fillGrid(id, data[id], true);
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
	child.innerHTML = `[${now.toLocaleString()}] ${content}`;
	child.classList.add('test-p');
	(document.getElementById('test') as HTMLElement).append(child);
}

function init() {

	// loadData();

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
		console.log('button-label-reference in clicked');
		(document.getElementById("button-label-reference") as Button).disabled = true;
		(document.getElementById("button-label-reference") as Button).title = 'In Process...';
		const data: Record<string, string[]> = await loadDataFromGrid('question-instances-grid');
		vscode.postMessage({
			command: "label references",
			questions: data['Question'],
		});
	};

	(document.getElementById('button-generate-answer-points') as Button).onclick = async (event) => {
		(document.getElementById("button-generate-answer-points") as Button).disabled = true;
		(document.getElementById("button-generate-answer-points") as Button).title = 'In Process...';
		const data: Record<string, string[]> = await loadDataFromGrid('question-references-grid');
		vscode.postMessage({
			command: "generate answer and points",
			data: data,
		});
	};

	(document.getElementById('button-load-file') as Button).onclick = async (event) => {
		(document.getElementById("button-load-file") as Button).disabled = true;
		(document.getElementById("button-load-file") as Button).title = 'In Process...';
		vscode.postMessage({
			command: "load file",
		});
	};

	(document.getElementById('button-save-file') as Button).onclick = async (event) => {
		(document.getElementById("button-save-file") as Button).disabled = true;
		(document.getElementById("button-save-file") as Button).title = 'In Process...';
		const data = await gridDataToJson();
		vscode.postMessage({
			command: "save file",
			data: data,
		});
	};

	(document.getElementById('button-save-default-file') as Button).onclick = async (event) => {
		(document.getElementById("button-save-default-file") as Button).disabled = true;
		(document.getElementById("button-save-default-file") as Button).title = 'In Process...';
		const data = await gridDataToJson();
		vscode.postMessage({
			command: "save default file",
			data: data,
		});
	};

	(document.getElementById('button-auto') as Button).onclick = async (event) => {
		(document.getElementById("button-auto") as Button).disabled = true;
		(document.getElementById("button-auto") as Button).title = 'In Process...';
		vscode.postMessage({
			command: "auto",
		});
	};

	// (document.getElementById("test-constructing") as Button).onclick = (event) => {
	// 	vscode.postMessage({
	// 		command: "testButton",
	// 	});
	// };

	window.addEventListener('message', async event => {
		const message = event.data;
		switch (message.command) {
			case 'auto': {
				auto = true;
				(document.getElementById('button-instantiate-questions') as Button).click();
				break;
			}
			case 'instantiate questions begin': {
				(document.getElementById('placeholder-instantiation-checkbox') as HTMLElement).innerHTML = 'Placeholder Instantiating...';
				(document.getElementById('placeholder-instantiation-progress-wrapper') as HTMLElement).style.display = 'block';
				(document.getElementById("button-load-file") as Button).disabled = true;
				(document.getElementById("button-save-file") as Button).disabled = true;
				break;
			}
			case 'instantiate questions processs': {
				(document.getElementById('placeholder-instantiation-progress-bar') as HTMLElement).style.width = message.percent + '%';
				(document.getElementById('placeholder-instantiation-progress-bar') as HTMLElement).innerHTML = message.percent + '%';
				break;
			}
			case 'instantiate questions placeholder instances': {
				const instances: PlaceholderInstance = message.instances;
				const rowsData: Record<string, string>[] = [];

				let expectedVscodeLinkCount = 0;

				Object.entries(Placeholder).forEach(([_, placeholder]) => {
					let content: string = '';
					[...(instances[placeholder])].forEach(element => {
						if (placeholder === Placeholder.File) {
							content += `<vscode-link class="placeholder-data-link" data-type="File" data-value="${instances['WorkspacePath']}#${element}">${element}</vscode-link>, `;
						} else if (placeholder === Placeholder.Folder) {
							content += `<vscode-link class="placeholder-data-link" data-type="Folder" data-value="${instances['WorkspacePath']}#${element}">${element}</vscode-link>, `;
						} else {
							content += `<vscode-link class="placeholder-data-link" data-type="Position" data-value="${element}">${element.split('#')[6]}</vscode-link>, `;
						}
						expectedVscodeLinkCount += 1;
					});
					rowsData.push({
						'Placeholder': placeholder,
						'Instances': content,
					});
				});

				await fillGrid('placeholder-instances-grid', rowsData);

				addLinkEventListener('vscode-link.placeholder-data-link', expectedVscodeLinkCount);

				(document.getElementById('placeholder-instantiation-checkbox') as HTMLElement).innerHTML = 'Placeholder Instantiation Done, Question Instantiating...';
				(document.getElementById('placeholder-instances-grid') as HTMLElement).style.display = 'block';
				break;
			}
			case 'instantiate questions question instances': {
				const questions: QuestionInstance[] = message.questions;
				const workspacePath = message.workspacePath;

				let expectedVscodeLinkCount = 0;

				await fillGrid('question-instances-grid', questions.map(element => {
					let instance: string;
					if (element.placeholder === Placeholder.File) {
						instance = `${element.placeholder}: <vscode-link class="question-data-link" data-type="File" data-value="${workspacePath}#${element.placeholderInstance}">${element.placeholderInstance}</vscode-link>`;
					} else if (element.placeholder === Placeholder.Folder) {
						instance = `${element.placeholder}: <vscode-link class="question-data-link" data-type="Folder" data-value="${workspacePath}#${element.placeholderInstance}">${element.placeholderInstance}</vscode-link>`;
					} else {
						instance = `${element.placeholder}: <vscode-link class="question-data-link" data-type="Position" data-value="${element.placeholderInstance}">${element.placeholderInstance.split('#')[6]}</vscode-link>`;
					}
					expectedVscodeLinkCount += 1;
					return {
						'Question': element.question,
						'Template': element.template,
						'Placeholder Instance': instance,
					};
				}));

				addLinkEventListener('vscode-link.question-data-link', expectedVscodeLinkCount);

				(document.getElementById('placeholder-instantiation-checkbox') as HTMLElement).innerHTML = 'Placeholder And Question Instantiation Done';
				(document.getElementById('placeholder-instantiation-checkbox') as HTMLElement).setAttribute('checked', 'true');
				(document.getElementById('question-instances-grid') as HTMLElement).style.display = 'block';
				(document.getElementById('button-label-reference') as Button)!.disabled = false;
				(document.getElementById("button-instantiate-questions") as Button).disabled = false;
				(document.getElementById("button-load-file") as Button).disabled = false;
				(document.getElementById("button-save-file") as Button).disabled = false;
				if (auto) {
					await sleep(5000);
					(document.getElementById('button-label-reference') as Button).click();
				}
				break;
			}
			case 'benchmark references': {
				switch (message.type) {
					case 'init': {
						(document.getElementById("button-load-file") as Button).disabled = true;
						(document.getElementById("button-save-file") as Button).disabled = true;
						await fillGrid('question-references-grid', message.questions.map(question => {
							return {
								'Question': question,
								'Reference': '',
								'Reason': '',
							};
						}));
						await fillGrid('answer-point-grid', message.questions.map(question => {
							return {
								'Question': question,
								'Reference': '',
								'Answer': '',
								'Evaluation': '',
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
						(document.getElementById('reference-progress-bar') as HTMLElement).innerHTML = '0%';
						break;
					}
					case 'analyse file': {
						(document.getElementById('reference-checkbox') as HTMLElement).innerHTML = `Labeling References for question '<strong>${message.question}</strong>' in file: <vscode-link class="reference-progress-link" data-type="File" data-value="${message.workspacePath}#${message.relativePath}">${message.relativePath}</vscode-link>`;
						addLinkEventListener(`vscode-link.reference-progress-link`, 1);
						(document.getElementById('reference-progress-bar') as HTMLElement).style.width = message.percent + '%';
						(document.getElementById('reference-progress-bar') as HTMLElement).innerHTML = message.percent + '%';
						break;
					}
					case 'references': {
						const references = (message.references as FileChunk[]).map(fileChunk => {
							contextGridRowVscodeLinkCount += 2;
							return `<vscode-link class="question-context-link-${contextGridRowIndex}" data-type="Range" data-value="${message.workspacePath}#${fileChunk.relativePath}#${fileChunk.startLine}#${fileChunk.endLine}">${fileChunk.relativePath}:${fileChunk.startLine}~${fileChunk.endLine}</vscode-link>`;
						}).join('<br>').trim();

						const relatviePath: string = (message.references as FileChunk[])[0].relativePath;

						await appendGridCell('question-references-grid', contextGridRowIndex, 1, references);
						await appendGridCell('answer-point-grid', contextGridRowIndex, 1, references);
						await appendGridCell('question-references-grid', contextGridRowIndex, 2, 
							`<vscode-link class="question-context-link-${contextGridRowIndex}" data-type="File" data-value="${message.workspacePath}#${relatviePath}">${relatviePath}</vscode-link> Reason:<br>${message.reason}`
						);
						contextGridRowVscodeLinkCount += 1;
						addLinkEventListener(`vscode-link.question-context-link-${contextGridRowIndex}`, contextGridRowVscodeLinkCount);
						break;
					}
					case 'done': {
						(document.getElementById('button-generate-answer-points') as Button)!.disabled = false;
						(document.getElementById("button-label-reference") as Button).disabled = false;
						(document.getElementById('reference-checkbox') as HTMLElement).innerHTML = `Labeling References Done`;
						(document.getElementById('reference-checkbox') as HTMLElement).setAttribute('checked', 'true');
						(document.getElementById("button-load-file") as Button).disabled = false;
						(document.getElementById("button-save-file") as Button).disabled = false;
						if (auto) {
							await sleep(5000);
							(document.getElementById('button-generate-answer-points') as Button).click();
						}
						break;
					}
				}
				break;
			}
			case 'benchmark answer': {
				switch (message.type) {
					case 'init': {
						(document.getElementById('answer-point-grid') as HTMLElement).style.display = 'block';
						(document.getElementById('answer-point-progress-wrapper') as HTMLElement).style.display = 'block';
						(document.getElementById('answer-point-progress-bar') as HTMLElement).style.width = '0%';
						(document.getElementById('answer-point-progress-bar') as HTMLElement).innerHTML = '0%';
						(document.getElementById("button-load-file") as Button).disabled = true;
						(document.getElementById("button-save-file") as Button).disabled = true;
						break;
					}
					case 'question': {
						answerGridRowIndex += 1;
						(document.getElementById('answer-point-checkbox') as HTMLElement).innerHTML = `Generating Answer and Evaluation for question '<strong>${message.question}</strong>'`;
						break;
					}
					case 'answer': {
						await appendGridCell('answer-point-grid', answerGridRowIndex, 2, message.answer);
						await appendGridCell('answer-point-grid', answerGridRowIndex, 3, message.points);
						(document.getElementById('answer-point-progress-bar') as HTMLElement).style.width = `${message.percent}%`;
						(document.getElementById('answer-point-progress-bar') as HTMLElement).innerHTML = `${message.percent}%`;
						break;
					}
					case 'done': {
						(document.getElementById('answer-point-checkbox') as HTMLElement).innerHTML = `Generating Answer and Evaluation Done`;
						(document.getElementById('answer-point-checkbox') as HTMLElement).setAttribute('checked', 'true');
						(document.getElementById("button-generate-answer-points") as Button).disabled = false;
						(document.getElementById("button-load-file") as Button).disabled = false;
						(document.getElementById("button-save-file") as Button).disabled = false;
						if (auto) {
							await sleep(5000);
							(document.getElementById('button-save-default-file') as Button).click();
						}
						break;
					}
				}
				break;
			}
			case 'benchmark done': {
				(document.getElementById('label-reference-checkbox') as HTMLElement).innerHTML = 'Labeling Relevant Context References Done';
				(document.getElementById('label-reference-checkbox') as HTMLElement).setAttribute('checked', 'true');
				(document.getElementById('label-reference-progress-ring') as HTMLElement).style.display = 'none';
				break;
			}
			case 'load file': {
				switch (message.type) {
					case 'success': {
						console.log(`load file success data:${Object.keys(message.data)}  workspacePath: ${message.workspacePath}`);
						await jsonToGridData(message.data, message.workspacePath);
						(document.getElementById("button-load-file") as Button).disabled = false;
						break;
					}
					case 'fail': {
						(document.getElementById("button-load-file") as Button).disabled = false;
						console.log(`load file fail, error: ${message.error}`);
						break;
					}
				}
				break;
			}
			case 'save file': {
				(document.getElementById("button-save-file") as Button).disabled = false;
				break;
			}
			case 'save default file': {
				(document.getElementById("button-save-default-file") as Button).disabled = false;
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

}
