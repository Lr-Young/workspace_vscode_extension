
import { CodeEntity, FileChunk, Graph, Placeholder, PlaceholderInstance } from '../typeDefinitions';
import { PythonCodeParser } from './pythonParser';
import * as path from 'path';

import Parser = require('tree-sitter');

import { postMessage } from '../benchmarkWebviewPanel';
import { sleep } from '../../utils';
import { workspacePath } from '../main';

const extToParser: Record<string, CodeParser> = {};

export enum Language {
	JavaScript = 'JavaScript',
	TypeScript = 'TypeScript',
	Python = 'Python',
	Java = 'Java',
	CSharp = 'C#',
	Cpp = 'C++',
	Go = 'Go',
	C = 'C',
	Rust = 'Rust',
}

export interface CodeChunk extends FileChunk {
	readonly type: 'class' | 'interface' | 'function' | 'variable' | 'enum' | 'struct' | 'method';
	readonly name: string;
	readonly language: Language;
	readonly code: string;
}

export interface CodeParser {
	readonly language: Language;
	readonly extensions: string[];
	readonly parser: Parser;
	parse(filePath: string): Promise<CodeChunk[]>;
	parsePlaceHolderInstances(filePath: string): Promise<PlaceholderInstance>;
	buildGraph(files: string[]): Graph;
}

export function location(node: Parser.SyntaxNode, filePath: string): string {
	return `${workspacePath}#${path.relative(workspacePath, filePath)}#${node.startPosition.row}#${node.startPosition.column}#${node.endPosition.row}#${node.endPosition.column}#${node.text}`;
}

export function dotsToPath(dotString: string, baseDir?: string): string {
	const parts = dotString.split('.');

	// 处理开头的点（相对路径）
	let relativeLevel = -1;
	while (parts[0] === '') {
		relativeLevel++;
		parts.shift();
	}

	if (relativeLevel === -1) {
		relativeLevel = 0;
	}

	// 构建相对路径部分
	const relativePrefix = '../'.repeat(relativeLevel);

	// 组合路径
	let fullPath = path.join(relativePrefix, ...parts);

	// 如果有基础目录，则解析为绝对路径
	if (baseDir) {
		fullPath = path.resolve(baseDir, fullPath);
	}

	return fullPath;
}

export async function parsePlaceholderInstance(files: string[]): Promise<PlaceholderInstance> {
	const instances: PlaceholderInstance = {};

	Object.values(Placeholder).forEach(value => {
		instances[value] = [];
	});

	let count = 0;

	for (const filePath of files) {
		const ext = path.extname(filePath);
		count += 1;
		switch (ext) {
			case '.py': {
				if (extToParser[ext] === undefined) {
					extToParser[ext] = new PythonCodeParser();
				}
				const placeHolders = await extToParser['.py'].parsePlaceHolderInstances(filePath);
				postMessage({
					command: 'instantiate questions processs',
					percent: (count / files.length * 100).toFixed(2),
				});
				Object.entries(placeHolders).forEach(([key, value]) => {
					value.forEach(element => {
						instances[key].push(element);
					});
				});
				break;
			}
			default: {
				postMessage({
					command: 'instantiate questions processs',
					percent: count / files.length * 100,
				});
			}
		}
	}

	return instances;
}

export function buildGraphs(files: string[]): Record<string, Graph> {

	const extToFiles: Record<string, string[]> = {};
	const graphs: Record<string, Graph> = {};

	for (const filePath of files) {
		const ext = path.extname(filePath);

		switch (ext) {
			case '.py': {
				if (!(ext in extToFiles)) {
					extToFiles[ext] = [];
				}
				extToFiles[ext].push(filePath);
			}
		}
	}

	Object.entries(extToFiles).forEach(([ext, fileList]) => {
		switch (ext) {
			case '.py': {
				if (extToParser[ext] === undefined) {
					extToParser[ext] = new PythonCodeParser();
				}
				graphs[ext] = extToParser[ext].buildGraph(fileList);
			}
		}
	});

	
	return graphs;
}
