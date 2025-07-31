import {
	allComponents,
	provideVSCodeDesignSystem,
	Checkbox,
	DataGrid,
	Button,
} from "@vscode/webview-ui-toolkit";

import * as d3 from "d3" ;

import { dataLoaders } from "../gui/components";
import { FileChunk, D3Link, D3Node, D3Graph, Placeholder, PlaceholderInstance, QuestionInstance } from "../benchmark/typeDefinitions";
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
			case 'benchmark fail': {
				console.log(`benchmark fail, type: ${message.type} error: ${message.error}`);
				break;
			}
			case 'd3 graph': {
				renderD3Graph(message.data, message.workspacePath);
			}
		}
	});
}

function main() {

	init();
}

function getNodeShape(d: D3Node, selection: d3.Selection<SVGElement, D3Node, SVGGElement, unknown>) {
    const group = selection.append('g')
        .attr('class', `node-shape ${d.type}`)
        .attr('transform', `translate(${d.x},${d.y})`);
    
    // 根据类型创建不同形状
    switch(d.type) {
        case 'code entity': // 圆形
            group.append('circle')
                .attr('r', 15)
                .attr('fill', '#1a73e8')
                .attr('stroke', '#0d47a1')
                .attr('stroke-width', 2);
            break;
            
        case 'file': // 矩形
			console.log(`file node: ${d.id}`);
            group.append('rect')
                .attr('width', 30)
                .attr('height', 20)
                .attr('x', -15)
                .attr('y', -10)
                .attr('rx', 5)
                .attr('ry', 5)
                .attr('fill', '#1a73e8')
                .attr('stroke', '#0d47a1')
                .attr('stroke-width', 2);
            break;

        default: // 默认圆形
            group.append('circle')
                .attr('r', 15)
                .attr('fill', '#999')
                .attr('stroke', '#666')
                .attr('stroke-width', 2);
    }
    
    return group;
}

// 主函数
function renderD3Graph(graphData: D3Graph, workspacePath: string) {
    const svg = d3.select<SVGSVGElement, unknown>("svg")
		.style('width', '100%')
		.style('height', '100%')
		.style('min-height', '900px');
    const width = svg.node()!.getBoundingClientRect().width;
    const height = svg.node()!.getBoundingClientRect().height;
    const tooltip = d3.select("#tooltip");

    // 1. 初始化缩放和平移
    const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 10])
        .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
            g.attr("transform", event.transform.toString());
        });

    svg.call(zoom);

    const g = svg.append("g");

    // 2. 创建力导向模拟
    const simulation = d3.forceSimulation<D3Node, D3Link>(graphData.nodes)
        .force("link", d3.forceLink<D3Node, D3Link>(graphData.links)
            .id(d => d.id)
            .distance(100)
        )
        .force("charge", d3.forceManyBody<D3Node>().strength(-1000))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide<D3Node>().radius(30));

    // 4. 绘制连线（取消箭头）
	const link = g.append("g")
		.selectAll("line")
		.data(graphData.links)
		.join("line")
		// 移除以下属性：
		// .attr("marker-end", "url(#arrow)")
		// 添加以下样式属性：
		.attr("stroke", d => {return '#2ca02c';})
		.attr("stroke-width", 2)
		.attr("stroke-opacity", 0.8);

    // 5. 绘制节点

	const nodeGroups = g.append("g")
		.selectAll("g.node-container")
		.data(graphData.nodes)
		.join("g")
		.attr("class", "node-container")
		.call(getDragBehavior(simulation) as any)
		.on("click", (event: MouseEvent, d: D3Node) => {
            if (d.file) {
				if (d.type === 'file') {
					vscode.postMessage({
						command: 'link',
						type: 'File',
						value: `${workspacePath}#${d.file}`,
					});
				} else if (d.type === 'code entity') {
					vscode.postMessage({
						command: 'link',
						type: 'Range',
						value: `${workspacePath}#${d.file}#${d.startLine}#${d.endLine}`,
					});
				}
            }
        })
		.on("mouseover", (event: MouseEvent, d: D3Node) => {
			tooltip.style("display", null)
				.html(`<strong>${d.name}</strong><br>Type: ${d.type}`)
				.style("left", `${event.pageX + 10}px`)
				.style("top", `${event.pageY + 10}px`);
			d3.select(event.currentTarget as SVGGElement)
				.select('.node-shape')
				.select('*')
				.attr('fill', '#4285f4');
		})
		.on("mouseout", () => {
			tooltip.style("display", "none");
			nodeGroups.select('.node-shape')
				.select('*')
				.attr('fill', (d: D3Node) => {
					switch(d.type) {
						case 'code entity': return '#1a73e8';
						case 'file': return '#1a73e8';
						default: return '#999';
					}
				});
		});

	// 为每个节点创建形状
	nodeGroups.each(function(d) {
		getNodeShape(d, d3.select(this) as any);
	});

    // 6. 添加节点标签（白色文字）
	const labels = g.append("g")
		.selectAll("text")
		.data(graphData.nodes)
		.join("text")
		.text(d => d.name)
		.attr("font-size", 12)
		.attr("fill", "white") // 白色文字
		.attr("dx", d => {
			// 根据不同类型调整标签位置
			switch(d.type) {
				case 'code entity': return 20; // 圆形
				case 'file': return 18; // 矩形
				default: return 20;
			}
		})
		.attr("dy", 5)
		.style("text-shadow", "1px 1px 2px rgba(0,0,0,0.5)"); // 添加阴影增强可读性

	function getEdgePoint(node: D3Node, target: D3Node) {
		const dx = target.x! - node.x!;
		const dy = target.y! - node.y!;
		const distance = Math.sqrt(dx * dx + dy * dy);
		
		if (node.type === 'file') {
			// 矩形边缘交点计算
			const ratio = Math.min(
				Math.abs(15 / (dx / distance)),
				Math.abs(10 / (dy / distance))
			);
			return {
				x: node.x! + (dx / distance) * ratio,
				y: node.y! + (dy / distance) * ratio
			};
		} else {
			// 圆形边缘交点
			return {
				x: node.x! + (dx / distance) * 15,
				y: node.y! + (dy / distance) * 15
			};
		}
	}

    // 7. 更新模拟tick事件
	simulation.on("tick", () => {
		link
			.attr("x1", d => getEdgePoint(d.source as D3Node, d.target as D3Node).x)
			.attr("y1", d => getEdgePoint(d.source as D3Node, d.target as D3Node).y)
			.attr("x2", d => getEdgePoint(d.target as D3Node, d.source as D3Node).x)
			.attr("y2", d => getEdgePoint(d.target as D3Node, d.source as D3Node).y);

		// 更新节点组位置
		nodeGroups
			.attr("transform", d => `translate(${d.x},${d.y})`);

		// 更新标签位置
		labels
			.attr("x", d => d.x!)
			.attr("y", d => d.y!);
	});

    // 8. 初始自动缩放适配
    setTimeout(zoomToFit, 100);

    function zoomToFit() {
        const bounds = (svg.node() as SVGSVGElement).getBBox();
        const parent = svg.node()!.parentElement as HTMLElement;
        const fullWidth = parent.clientWidth;
        const fullHeight = parent.clientHeight;
        
        const width = bounds.width;
        const height = bounds.height;
        const midX = bounds.x + width / 2;
        const midY = bounds.y + height / 2;
        
        const scale = 0.9 / Math.max(width / fullWidth, height / fullHeight);
        
        svg.transition()
            .duration(750)
            .call(
                zoom.transform as any, 
                d3.zoomIdentity
                    .translate(fullWidth / 2, fullHeight / 2)
                    .scale(scale)
                    .translate(-midX, -midY)
            );
    }

    // 更新拖拽行为的类型定义
	type NodeSelection = d3.Selection<SVGGElement, D3Node, SVGGElement, unknown>;

	function getDragBehavior(
		simulation: d3.Simulation<D3Node, D3Link>
	): (selection: NodeSelection) => void {
		const dragBehavior = d3.drag<SVGGElement, D3Node, D3Node>()
			.on("start", (event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) => {
				if (!event.active) simulation.alphaTarget(0.3).restart();
				d.fx = d.x;
				d.fy = d.y;
			})
			.on("drag", (event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) => {
				d.fx = event.x;
				d.fy = event.y;
			})
			.on("end", (event: d3.D3DragEvent<SVGGElement, D3Node, D3Node>, d: D3Node) => {
				if (!event.active) simulation.alphaTarget(0);
				d.fx = null;
				d.fy = null;
			});

		return (selection: NodeSelection) => {
			selection.call(dragBehavior as any);
		};
	}

}
