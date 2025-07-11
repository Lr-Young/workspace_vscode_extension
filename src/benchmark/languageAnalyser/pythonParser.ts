
import { CodeChunk, CodeParser, Language, location } from './parser';
import { Placeholder, PlaceholderInstance } from '../typeDefinitions';
import * as fs from 'fs';
import * as path from 'path';

import Parser = require('tree-sitter');
import Python = require('tree-sitter-python');

export class PythonCodeParser implements CodeParser {

	static INSTANCE: PythonCodeParser;

	readonly language: Language = Language.Python;
	readonly extensions: string[] = ['.py'];
	readonly parser: Parser;

	constructor() {
		this.parser = new Parser();
		this.parser.setLanguage(Python as unknown as Parser.Language);
	}

	async parse(filePath: string): Promise<CodeChunk[]> {
		// todo
		return [
			{
				relativePath: '/example/path',
				startLine: 10,
				endLine: 30,
				type: 'class',
				name: 'class',
				language: Language.Python,
				code: ''
			}
		];
	}

	async parsePlaceHolderInstances(filePath: string): Promise<PlaceholderInstance> {

		let instances: PlaceholderInstance = {};

		instances['WorkspacePath'];
		instances[Placeholder.Function] = [];
		instances[Placeholder.Variable] = [];
		instances[Placeholder.Class] = [];

		const content: string = fs.readFileSync(filePath, 'utf8');

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
					instances[Placeholder.Function].push(location(nameNode, filePath));
				}
				continue;
			}

			if (node.type === 'class_definition') {
				const nameNode = node.childForFieldName('name');
				if (nameNode) {
					instances[Placeholder.Class].push(location(nameNode, filePath));
				}
				continue;
			}

			if (node.type === 'expression_statement') {
				const childNode = node.firstNamedChild;
				if (childNode?.type === 'assignment') {
					const leftSide = childNode.firstNamedChild;
					if (leftSide?.type === 'identifier') {
						instances[Placeholder.Variable].push(location(leftSide, filePath));
					}
				} else if (childNode?.type === 'identifier') {
					instances[Placeholder.Variable].push(location(childNode, filePath));
				}
				continue;
			}
		}

		return instances;
	}
}