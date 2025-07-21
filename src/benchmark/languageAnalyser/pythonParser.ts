
import { CodeChunk, CodeParser, Language, location } from './parser';
import { CodeEntity, Graph, Placeholder, PlaceholderInstance } from '../typeDefinitions';
import * as fs from 'fs';
import * as path from 'path';

import { workspacePath } from '../main';

import Parser = require('tree-sitter');
import Python = require('tree-sitter-python');

export class PythonCodeParser implements CodeParser {

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
			let node = tree.rootNode.namedChild(i);

			if (node === null) {
				continue;
			}

			if (node.type === 'comment' || node.type === 'string') {
				continue;
			}

			if (node.type === 'decorated_definition') {
				node = node.childForFieldName('definition');
				if (node === null) {
					continue;
				}
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

	async buildGraph(files: string[]): Promise<Graph> {
		const graph: Graph = {
			fileNodes: {},
			nodes: {}
		};

		for (const filePath of files) {
			const ext = path.extname(filePath);
			if (ext !== '.py') {
				continue;
			}
			
			const relativePath = path.relative(workspacePath, filePath);
			const content = fs.readFileSync(filePath, 'utf8');
			const tree = this.parser.parse(content);
			const fqnPrefix = `${relativePath}`.replace(path.sep, '.').split('.').slice(0, -1).join('.');
			graph.fileNodes[relativePath] = [];

			for (let i = 0; i < tree.rootNode.namedChildCount; i++) {
				const node = tree.rootNode.namedChild(i);

				if (node === null) {
					continue;
				}

				if (node.type === 'comment' || node.type === 'string') {
					continue;
				}

				let name: string = '';
				let type: 'function' | 'class' | 'variable' | 'other' = 'other';

				if (node.type === 'decorated_definition') {
					const definition_node = node.childForFieldName('definition');
					if (definition_node === null) {
						continue;
					}
					if (definition_node.type === 'function_definition') {
						const nameNode = definition_node.childForFieldName('name');
						if (nameNode === null) {
							continue;
						}
						name = nameNode.text;
						type = 'function';
					} else if (definition_node.type === 'class_definition') {
						const nameNode = definition_node.childForFieldName('name');
						if (nameNode === null) {
							continue;
						}
						name = nameNode.text;
						type = 'class';
					} else {
						continue;
					}
				}

				if (node.type === 'function_definition') {
					const nameNode = node.childForFieldName('name');
					if (nameNode === null) {
						continue;
					}
					name = nameNode.text;
					type = 'function';
				}

				if (node.type === 'class_definition') {
					const nameNode = node.childForFieldName('name');
					if (nameNode === null) {
						continue;
					}
					name = nameNode.text;
					type = 'class';
				}

				if (node.type === 'expression_statement') {
					const childNode = node.firstNamedChild;
					if (childNode?.type === 'assignment') {
						const leftSide = childNode.firstNamedChild;
						if (leftSide?.type === 'identifier') {
							name = leftSide.text;
							type = 'variable';
						}
					} else if (childNode?.type === 'identifier') {
						name = childNode.text;
						type = 'variable';
					} else {
						continue;
					}
				}

				if (node.type === 'global_statement') {
					const nameNode = node.firstNamedChild;
					if (nameNode?.type === 'identifier') {
						name = nameNode.text;
						type = 'variable';
					} else {
						continue;
					}
				}

				if (name === '') {
					continue;
				}

				const fqn: string = `${fqnPrefix}.${name}`;
				const codeEntity: CodeEntity = {
					fqn: fqn,
					type: type,
					content: {
						relativePath: relativePath,
						startLine: node.startPosition.row + 1,
						endLine: node.endPosition.row + 1,
					},
					use: [],
					usedBy: []
				};
				graph.nodes[fqn] = codeEntity;
				graph.fileNodes[relativePath].push(fqn);
			}
		}

		return graph;
	}
}