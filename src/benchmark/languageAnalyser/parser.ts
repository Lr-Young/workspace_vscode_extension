import * as vscode from 'vscode';
import * as fg from 'fast-glob';
import { relative } from 'path';

import { FileChunk } from '../main';
import { workspaceFolderCount } from '../../utils';
import { PlaceHolder } from '../templates';
import { PythonCodeParser } from './pythonParser';

const Parser = require("tree-sitter");

let extToParser: Record<string, CodeParser> = {};

export type PlaceHolderInstance = Record<string, Set<string>>;

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
	readonly parser: typeof Parser;
	parse(filePath: string): Promise<CodeChunk[]>;
	parsePlaceHolderInstances(filePath: string): Promise<PlaceHolderInstance>;
}

export async function getPlaceHolderInstances(): Promise<PlaceHolderInstance> {

	let instances: PlaceHolderInstance = {};

	Object.values(PlaceHolder).forEach(value => {
		instances[value] = new Set<string>();
	});

	if (vscode.workspace.workspaceFolders === undefined || workspaceFolderCount() !== 1) {
		vscode.window.showErrorMessage("请在工作区打开一个目录");
		return instances;
	}

	const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;

	const relativePath = (path: string) => {
		return relative(workspacePath, path);
	};

	const workspaceFolders = vscode.workspace.workspaceFolders;
		
	const files = await fg('**', {
			cwd: workspacePath,
			absolute: true,
			onlyFiles: true,
			ignore: ['**/node_modules/**'], // 忽略node_modules
			dot: true // 包含点文件
	});

	const directories = await fg('**/', {
			cwd: workspacePath,
			absolute: true,
			onlyDirectories: true,
			ignore: ['**/node_modules/**'],
			dot: true
	});

	await Promise.all(files.map(async (filePath) => {
		console.log(`正在处理文件：${relativePath(filePath)}`);
		instances[PlaceHolder.File].add(relativePath(filePath));
		switch (filePath.split('.')[-1]) {
			case 'py':
				if (extToParser['.py'] === undefined) {
					extToParser['.py'] = new PythonCodeParser();
				}
				const placeHolders = await extToParser['.py'].parsePlaceHolderInstances(filePath);
				Object.entries(placeHolders).forEach(([key, value]) => {
					value.forEach(element => {
						instances[key].add(element);
					});
				});
				break;
		}
	}));

	directories.forEach(dirPath => {
		console.log(`正在处理目录：${relativePath(dirPath)}`);
		instances[PlaceHolder.Folder].add(relativePath(dirPath));
	});

	return instances;
}
