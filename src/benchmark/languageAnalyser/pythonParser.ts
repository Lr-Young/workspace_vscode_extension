import * as vscode from 'vscode';

import { CodeChunk, CodeParser, Language, PlaceHolderInstance } from './parser';
import { PlaceHolder } from '../templates';

import * as Parser from 'tree-sitter';
import * as Python from 'tree-sitter-python';

export class PythonCodeParser implements CodeParser {

	static INSTANCE: PythonCodeParser;

	readonly language: Language = Language.Python;
	readonly extensions: string[] = ['.py'];
	readonly parser;

	constructor() {
		this.parser = new Parser();
		this.parser.setLanguage(Python as unknown as Parser.Language);
	}

	async parse(filePath: string): Promise<CodeChunk[]> {
		// todo
		return [
			{
				filePath: '/example/path',
				startLine: 10,
				endLine: 30,
				type: 'class',
				name: 'class',
				language: Language.Python,
				code: ''
			}
		];
	}

	async parsePlaceHolderInstances(filePath: string): Promise<PlaceHolderInstance> {

		let instances: PlaceHolderInstance = {};

		instances[PlaceHolder.Function] = new Set<string>();
		instances[PlaceHolder.Variable] = new Set<string>();
		instances[PlaceHolder.Class] = new Set<string>();

		const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))
			.then(content => Buffer.from(content).toString('utf-8'));

		const tree = this.parser.parse(content);

		for (let i = 0; i < tree.rootNode.namedChildCount; i++) {
			const node = tree.rootNode.namedChild(i);

			if (node === null) {
				continue;
			}
			
			if (node.type === 'comment' || node.type === 'string') {
				continue;
			}

			if (node.type === 'function_definition') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					instances[PlaceHolder.Function].add(nameNode.text);
				}
				continue;
			}

			if (node.type === 'class_definition') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					instances[PlaceHolder.Class].add(nameNode.text);
				}
				continue;
			}

			if (node.type === 'expression_statement') {
				const childNode = node.firstNamedChild;
				if (childNode?.type === 'assignment') {
					const leftSide = childNode.firstNamedChild;
					if (leftSide?.type === 'identifier') {
						instances[PlaceHolder.Variable].add(leftSide.text);
					}
				} else if (childNode?.type === 'identifier') {
					instances[PlaceHolder.Variable].add(childNode.text);
				}
				continue;
			}
		}

		return instances;
	}
}