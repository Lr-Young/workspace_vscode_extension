import * as fs from 'fs';
import * as path from 'path';

import { getWorkspacePath, getWorkspaceFolderCount } from './tools';

import { invoke } from './stateGraph';

import { concurrencyRun } from '../utils';

export let evaluation: boolean = false;

const benchmarkPath: string = './.workspace_agent/';

export interface Context {
	path: string,
	startLine: number,  // 1 based line number
	endLine: number,
};

/**
 * 合并相同 path 的 Context 数组
 * - 不同 path 的不合并
 * - 相同 path 中，如果两个片段行号有重叠或相邻（如 10-12 和 13-15），则合并为 10-15
 */
export function mergeContexts(contexts: Context[]): Context[] {
	// 1. 按 path 分组
	const groups: Record<string, Context[]> = {};
	for (const ctx of contexts) {
		if (!groups[ctx.path]) {
			groups[ctx.path] = [];
		}
		groups[ctx.path].push(ctx);
	}

	// 2. 对每个 path 下的片段按 startLine 排序并合并
	const merged: Context[] = [];
	for (const path of Object.keys(groups)) {
		const sorted = groups[path].sort((a, b) => a.startLine - b.startLine);

		const mergedForPath: Context[] = [];
		let current = { ...sorted[0] };

		for (let i = 1; i < sorted.length; i++) {
			const next = sorted[i];
			if (next.startLine <= current.endLine + 1) {
				// 有重叠或相邻
				current.endLine = Math.max(current.endLine, next.endLine);
			} else {
				// 无重叠，推入结果
				mergedForPath.push(current);
				current = { ...next };
			}
		}
		mergedForPath.push(current);

		merged.push(...mergedForPath);
	}

	return merged;
}

export interface EvaluationData {
	question: string,
	candidateContexts: Context[],
	candidateAnswer: string,
	isSet: boolean
}

export class Evaluator {

	benchmarkPath: string;

	data: EvaluationData[];
	
	constructor(benchmarkPath: string) {
		this.benchmarkPath = benchmarkPath;
		this.data = [];
		try {
			const object = JSON.parse(fs.readFileSync(benchmarkPath, { encoding: 'utf-8' }));
			const keys: string[] = Object.keys(object);
			if (!keys.includes('Question')) {
				throw Error(`No "Question" key found in json object: ${Object.keys(object).join(', ')}`);
			}
			if (!Array.isArray(object['Question'])) {
				throw Error(`"Question" key in json object is not array: ${object['Question']}`);
			}
			for (let i = 0; i < object['Question'].length; i++) {
				if (keys.includes('isSet') && object['isSet'][i] === true) {
					this.data.push({
						question: object['Question'][i],
						candidateContexts: [],
						candidateAnswer: '',
						isSet: true,
					});
				} else {
					this.data.push({
						question: object['Question'][i],
						candidateContexts: [],
						candidateAnswer: '',
						isSet: false,
					});
				}
			}
		} catch (e) {
			console.log(`init evaluator error for benchmark: ${benchmarkPath}\n${e}`);
		}
	}
	
	saveToFile() {
		let object: Record<string, any>;

		try {
			object = JSON.parse(fs.readFileSync(this.benchmarkPath, { encoding: 'utf-8' }));
		} catch (e) {
			object = {};
			object['Question'] = new Array(this.data.length);
			this.data.forEach(d => {
				object['Question'].push(d.question);
			});
		}

		if (!Object.keys(object).includes('isSet')) {
			object['isSet'] = new Array(object['Question'].length).fill(false);
		}
		if (!Object.keys(object).includes('CandidateContext')) {
			object['CandidateContext'] = new Array(object['Question'].length);
		}
		if (!Object.keys(object).includes('CandidateAnswer')) {
			object['CandidateAnswer'] = new Array(object['Question'].length);
		}
		for (let i = 0; i < this.data.length; i++) {
			if (this.data[i]['isSet'] && !object['isSet'][i]) {
				object['CandidateContext'][i] = mergeContexts(this.data[i]['candidateContexts']);
				object['CandidateAnswer'][i] = this.data[i]['candidateAnswer'];
				object['isSet'][i] = true;
			}
		}
		fs.writeFileSync(this.benchmarkPath, JSON.stringify(object, null, 4));
	}
}

export let evaluationData: Evaluator[] = [];

function initEvaluation(workspaceCount: number) {

	evaluationData = [];

	for (let i = 0; i < workspaceCount; i++) {
		const workspacePath = getWorkspacePath(i);
		const repoName = path.basename(workspacePath);
		const benchmarkSuffix = repoName.toLowerCase().replaceAll('-', '_');
		
		evaluationData.push(new Evaluator(path.join(workspacePath, benchmarkPath, `benchmark_${benchmarkSuffix}.json`)));
	}
}

export async function evaluate() {
	evaluation = true;

	const workspaceCount = getWorkspaceFolderCount();

	// const workspaceCount = 2;

	initEvaluation(workspaceCount);

	const tasks = [];

	for (let i = 0; i < workspaceCount; i++) {
		tasks.push(async () => {
			for (let j = 0; j < evaluationData[i].data.length; j++) {
				if (evaluationData[i].data[j]['isSet']) {
					continue;
				}
				try {
					console.log(`state graph begins for workspace ${i} ${path.basename(getWorkspacePath(i))} with question ${j}: ${evaluationData[i].data[j]['question']}`);
					await invoke(evaluationData[i].data[j]['question'], i, j);
					evaluationData[i].saveToFile();
				} catch (e) {
					evaluationData[i].data[j]['isSet'] = false;
					console.log(`Error invoke for workspace ${i} ${path.basename(getWorkspacePath(i))} with question ${j}: ${evaluationData[i].data[j]['question']}: ${e}`);
				}
			}
		});
	}

	try {
		await concurrencyRun(tasks, workspaceCount);
	} catch (e) {
		console.log(`Error happened in concurrencyRun\n${e}`);
	}

	evaluation = false;
	
}
