
import { FileChunk, Placeholder, PlaceholderInstance } from '../typeDefinitions';
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
}

export function location(node: Parser.SyntaxNode, filePath: string): string {
	return `${workspacePath}#${path.relative(workspacePath, filePath)}#${node.startPosition.row}#${node.startPosition.column}#${node.endPosition.row}#${node.endPosition.column}#${node.text}`;
}

export async function parseFiles(files: string[]): Promise<PlaceholderInstance> {
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
