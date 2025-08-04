
import { CodeChunk, CodeParser, dotsToPath, Language, location } from './parser';
import { CodeEntity, Graph, graphToString, Placeholder, PlaceholderInstance } from '../typeDefinitions';
import { pathToDots } from '../../utils';
import * as fs from 'fs';
import * as path from 'path';

import { workspacePath } from '../main';

import Parser = require('tree-sitter');
import Python = require('tree-sitter-python');

let DEBUG = false;

function debug(info: string, node: Parser.SyntaxNode): void {
	if (DEBUG) {
		console.log(`${info}: ${node.text.substring(0, 30)}`);
	}
}

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

	gatherNodes(files: string[], graph: Graph): void {

		for (const filePath of files) {
			const ext = path.extname(filePath);
			if (ext !== '.py') {
				continue;
			}
			
			const relativePath = path.relative(workspacePath, filePath);
			const content = fs.readFileSync(filePath, 'utf8');
			const tree = this.parser.parse(content);
			const fqnPrefix = pathToDots(relativePath).split('.').slice(0, -1).join('.');
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

		return;
	}

	gatherEdges(files: string[], graph: Graph): void {

		const importedIdentifiers: Record<string, string> = {};

		const initFileNodes: Record<string, Record<string, string>> = {};

		function addInitFileNode(fileRelativePath: string, identifier: string, fqn: string): void {
			if (!(fileRelativePath in initFileNodes)) {
				initFileNodes[fileRelativePath] = {};
			}
			initFileNodes[fileRelativePath][identifier] = fqn;
		}

		let fileRelativePath: string = '';

		function addEdge(identifier: string) {
			if (identifier in importedIdentifiers) {
				graph.fileImportNodes[fileRelativePath].add(importedIdentifiers[identifier]);
			}
		}

		function handleImportFromStatement(node: Parser.SyntaxNode): void {
			if (node.type !== 'import_from_statement') {
				return;
			}

			debug(`${handleImportFromStatement.name}`, node);

			const moduleNameNode = node.childForFieldName('module_name');
			const nameNodes = node.childrenForFieldName('name');
			if (moduleNameNode === null) {
				return;
			}

			const moduleName: string = moduleNameNode.text;

			let importedFile: string;

			let leadingDotCount = 0;

			while (moduleName.length > leadingDotCount && moduleName[leadingDotCount] === '.') {
				leadingDotCount++;
			}

			if (leadingDotCount === 0) {
				importedFile = path.join(dotsToPath(moduleName), '__init__.py');
				let found = false;
				for (const file of Object.keys(graph.fileNodes)) {
					if (file.includes(importedFile)) {
						importedFile = file;
						found = true;
						break;
					}
				}
				if (!found) {
					importedFile = `${path.dirname(importedFile)}.py`;
					for (const file of Object.keys(graph.fileNodes)) {
						if (file.includes(importedFile)) {
							importedFile = file;
							found = true;
							break;
						}
					}
				}
				if (!found) {
					return;
				}
			} else {
				importedFile = path.relative(workspacePath, `${dotsToPath(moduleName, path.join(workspacePath, path.dirname(fileRelativePath)))}`);
				if (Object.keys(graph.fileNodes).includes(`${importedFile}.py`)) {
					importedFile += '.py';
				} else {
					importedFile = path.join(importedFile, '__init__.py');
				}
			}

			const isInitFile: boolean = path.basename(fileRelativePath) === '__init__.py';
			const importIsInitFile: boolean = path.basename(importedFile) === '__init__.py';
			if (nameNodes.length === 0) {
				graph.fileNodes[importedFile].forEach(fqn => {
					if (isInitFile) {
						addInitFileNode(fileRelativePath, fqn.split('.')[-1], fqn);
					}
					importedIdentifiers[fqn.split('.')[-1]] = fqn;
				});
				if (importIsInitFile) {
					Object.entries(initFileNodes[importedFile]).forEach(([identifier, fqn]) => {
						importedIdentifiers[identifier] = fqn;
					});
				}
			} else {
				const fqnPrefix = pathToDots(importedFile).split('.').slice(0, -1).join('.');
				nameNodes.forEach(nameNode => {
					if (nameNode.type === 'dotted_name') {
						const identifier = nameNode.text.split('.')[0];
						if (importIsInitFile && identifier in initFileNodes[importedFile]) {
							importedIdentifiers[identifier] = initFileNodes[importedFile][nameNode.text];
							if (isInitFile) {
								addInitFileNode(fileRelativePath, identifier, initFileNodes[importedFile][nameNode.text]);
							}
						} else {
							if (isInitFile) {
								addInitFileNode(fileRelativePath, identifier, `${fqnPrefix}.${identifier}`);
							}
							importedIdentifiers[identifier] = `${fqnPrefix}.${identifier}`;
						}
					} else if (nameNode.type === 'aliased_import') {
						const childNameNode = nameNode.childForFieldName('name');
						const childAliasNode = nameNode.childForFieldName('alias');
						if (childNameNode !== null && childAliasNode !== null) {
							const identifier = childNameNode.text.split('.')[0];
							const aliasIdentifier = childAliasNode.text;
							if (importIsInitFile && identifier in initFileNodes[importedFile]) {
								importedIdentifiers[aliasIdentifier] = initFileNodes[importedFile][childNameNode.text];
								if (isInitFile) {
									addInitFileNode(fileRelativePath, aliasIdentifier, initFileNodes[importedFile][childNameNode.text]);
								}
							} else {
								if (isInitFile) {
									addInitFileNode(fileRelativePath, aliasIdentifier, `${fqnPrefix}.${identifier}`);
								}
								importedIdentifiers[aliasIdentifier] = `${fqnPrefix}.${identifier}`;
							}
						}
					}
				});
			}
		}

		function handleValue(node: Parser.SyntaxNode): void {
			debug(`handleValue`, node);
			switch (node.type) {
				case 'identifier': {
					addEdge(node.text);
					break;
				}
				case 'string': {
					handleString(node);
					break;
				}
				case 'list': {
					handleList(node);
					break;
				}
				case 'list_comprehension': {
					handleListComprehension(node);
					break;
				}
				case 'dictionary': {
					handleDictionary(node);
					break;
				}
				case 'tuple': {
					handleTuple(node);
					break;
				}
				case 'set': {
					handleSet(node);
					break;
				}
				case 'call': {
					handleCall(node);
					break;
				}
				case 'binary_operator': {
					handleBinaryOperator(node);
					break;
				}
				case 'assignment': {
					handleAssignment(node);
					break;
				}
				case 'boolean_operator': {
					handleBooleanOperator(node);
					break;
				}
				case 'comparison_operator': {
					handleComparisonOperator(node);
					break;
				}
				case 'attribute': {
					handleAttribute(node);
					break;
				}
				case 'subscript': {
					handleSubscript(node);
					break;
				}
				case 'as_pattern': {
					handleAsPattern(node);
					break;
				}
				case 'conditional_expression': {
					handleConditionalExpression(node);
					break;
				}
				case 'await': {
					handleAwait(node);
					break;
				}
			}
		}

		function handleStatement(node: Parser.SyntaxNode): void {
			debug(`handleStatement`, node);
			switch (node.type) {
				case 'expression_statement': {
					handleExpressionStatement(node);
					break;
				}
				case 'function_definition': {
					handleFunctionDefinition(node);
					break;
				}
				case 'class_definition': {
					handleClassDefinition(node);
					break;
				}
				case 'decorated_definition': {
					handleDecoratedDefinition(node);
					break;
				}
				case 'if_statement': {
					handleIfStatement(node);
					break;
				}
				case 'while_statement': {
					handleWhileStatement(node);
					break;
				}
				case 'for_statement': {
					handleForStatement(node);
					break;
				}
				case 'try_statement': {
					handleTryStatement(node);
					break;
				}
				case 'raise_statement': {
					handleRaiseStatement(node);
					break;
				}
				case 'delete_statement': {
					handleDeleteStatement(node);
					break;
				}
				case 'with_statement': {
					handleWithStatement(node);
					break;
				}
				case 'return_statement': {
					handleReturnStatement(node);
					break;
				}
				case 'import_from_statement': {
					handleImportFromStatement(node);
					break;
				}
				case 'assert_statement': {
					handleAssertStatement(node);
					break;
				}
			}
		}

		function handleIfStatement(node: Parser.SyntaxNode): void {
			if (node.type !== 'if_statement') {
				return;
			}
			debug(`handleIfStatement`, node);
			const conditionNode = node.childForFieldName('condition');
			if (conditionNode !== null) {
				handleValue(conditionNode);
			}
			for (let i = 1; i < node.namedChildCount; i++) {
				const childNode = node.namedChildren[i];
				switch (childNode.type) {
					case 'block': {
						handleBlock(childNode);
						break;
					}
					case 'elif_clause': {
						const elifConditionNode = childNode.childForFieldName('condition');
						if (elifConditionNode !== null) {
							handleValue(elifConditionNode);
						}
						const consequenceNode = childNode.childForFieldName('consequence');
						if (consequenceNode !== null) {
							handleBlock(consequenceNode);
						}
						break;
					}
					case 'else_clause': {
						const bodyNode = childNode.childForFieldName('body');
						if (bodyNode !== null) {
							handleBlock(bodyNode);
						}
					}
				}
			}
		}

		function handleWhileStatement(node: Parser.SyntaxNode): void {
			if (node.type !== 'while_statement') {
				return;
			}
			debug(`handleWhileStatement`, node);
			const conditionNode = node.childForFieldName('condition');
			const bodyNode = node.childForFieldName('body');
			if (conditionNode !== null) {
				handleValue(conditionNode);
			}
			if (bodyNode !== null) {
				handleBlock(bodyNode);
			}
		}

		function handleForStatement(node: Parser.SyntaxNode): void {
			if (node.type !== 'for_statement') {
				return;
			}
			debug(`handleForStatement`, node);
			const leftNode = node.childForFieldName('left');
			const rightNode = node.childForFieldName('right');
			const bodyNode = node.childForFieldName('body');

			if (leftNode !== null) {
				handleValue(leftNode);
			}

			if (rightNode !== null) {
				handleValue(rightNode);
			}

			if (bodyNode !== null) {
				handleBlock(bodyNode);
			}

		}

		function handleTryStatement(node: Parser.SyntaxNode): void {
			if (node.type !== 'try_statement') {
				return;
			}
			debug(`handleTryStatement`, node);
			const bodyNode = node.childForFieldName('body');
			if (bodyNode !== null) {
				handleBlock(bodyNode);
			}
			for (let i = 1; i < node.namedChildCount; i++) {
				const childNode = node.namedChildren[i];
				switch (childNode.type) {
					case 'except_clause': {
						for (let j = 0; j < childNode.namedChildCount; j++) {
							const exceptChildNode = childNode.namedChildren[j];
							switch (exceptChildNode.type) {
								case 'identifier': {
									handleValue(exceptChildNode);
									break;
								}
								case 'block': {
									handleBlock(exceptChildNode);
									break;
								}
								case 'as_pattern': {
									handleAsPattern(exceptChildNode);
									break;
								}
							}
						}
						break;
					}
					case 'finnaly_clause': {
						handleBlock(childNode.namedChildren[0]);
						break;
					}
				}
			}
		}

		function handleRaiseStatement(node: Parser.SyntaxNode): void {
			if (node.type !== 'raise_statement') {
				return;
			}
			debug(`handleRaiseStatement`, node);
			if (node.namedChildCount === 0) {
				return;
			}
			handleValue(node.namedChildren[0]);
		}

		function handleAssertStatement(node: Parser.SyntaxNode): void {
			if (node.type !== 'assert_statement') {
				return;
			}
			debug(`handleAssertStatement`, node);
			for (let i = 0; i < node.namedChildCount; i++) {
				const childNode = node.namedChildren[i];
				handleValue(childNode);
			}
		}

		function handleDeleteStatement(node: Parser.SyntaxNode): void {
			if (node.type !== 'delete_statement') {
				return;
			}
			debug(`handleDeleteStatement`, node);
			handleValue(node.namedChildren[0]);
		}

		function handleWithStatement(node: Parser.SyntaxNode): void {
			if (node.type !== 'with_statement') {
				return;
			}
			debug(`handleWithStatement`, node);
			const valueNode = node.namedChildren[0].namedChildren[0].childForFieldName('value');
			if (valueNode !== null) {
				handleValue(valueNode);
			}
			const bodyNode = node.childForFieldName('body');
			if (bodyNode !== null) {
				handleBlock(bodyNode);
			}
		}

		function handleReturnStatement(node: Parser.SyntaxNode): void {
			if (node.type !== 'return_statement') {
				return;
			}
			debug(`handleReturnStatement`, node);
			if (node.namedChildCount === 0) {
				return;
			}
			const valueNode = node.namedChildren[0];
			handleValue(valueNode);
		}

		function handleAsPattern(node: Parser.SyntaxNode): void {
			if (node.type !== 'as_pattern') {
				return;
			}
			debug(`handleAsPattern`, node);
			handleValue(node.namedChildren[0]);
		}

		function handleClassDefinition(node: Parser.SyntaxNode): void {
			if (node.type !== 'class_definition') {
				return;
			}
			debug(`handleClassDefinition`, node);
			const superclassesNode = node.childForFieldName('superclasses');
			if (superclassesNode !== null) {
				for (let i = 0; i < superclassesNode.namedChildCount; i++) {
					const superclassNode = superclassesNode.namedChildren[i];
					handleValue(superclassNode);
				}
			}
			const blockNode = node.childForFieldName('body');
			if (blockNode !== null) {
				handleBlock(blockNode);
			}
		}

		function handleDecoratedDefinition(node: Parser.SyntaxNode): void {
			if (node.type !== 'decorated_definition') {
				return;
			}
			debug(`handleDecoratedDefinition`, node);
			if (node.namedChildCount === 0) {
				return;
			}
			const decoratorNode = node.namedChildren[0];
			const definitionNode = node.childForFieldName('definition');
			if (decoratorNode !== null && decoratorNode.namedChildCount > 0) {
				const childNode = decoratorNode.namedChildren[0];
				if (childNode !== null) {
					handleValue(childNode);
				}
			}
			if (definitionNode !== null) {
				if (definitionNode.type === 'function_definition') {
					handleFunctionDefinition(definitionNode);
				} else if (definitionNode.type === 'class_definition') {
					handleClassDefinition(definitionNode);
				}
			}
		}

		function handleConditionalExpression(node: Parser.SyntaxNode): void {
			if (node.type !== 'conditional_expression') {
				return;
			}
			debug(`handleConditionalExpression`, node);
			node.namedChildren.forEach(child => {
				handleValue(child);
			});
		}

		function handleType(node: Parser.SyntaxNode): void {
			if (node.type !== 'type') {
				return;
			}
			debug(`handleType`, node);
			if (node.namedChildCount === 0) {
				return;
			}
			if (node.namedChildCount === 0) {
				return;
			}
			const childNode = node.namedChildren[0];
			switch (childNode.type) {
				case 'union_type': {
					handleUnionType(childNode);
					break;
				}
				case 'generic_type': {
					handleGenericType(childNode);
					break;
				}
				default: {
					handleValue(childNode);
				}
			}
		}

		function handleUnionType(node: Parser.SyntaxNode): void {
			if (node.type !== 'union_type') {
				return;
			}
			debug(`handleUnionType`, node);
			node.namedChildren.forEach(child => {
				handleType(child);
			});
		}

		function handleGenericType(node: Parser.SyntaxNode): void {
			if (node.type !== 'generic_type') {
				return;
			}
			debug(`handleGenericType`, node);
			node.namedChildren.forEach(child => {
				if (child.type === 'type_parameter') {
					child.namedChildren.forEach(cc => {
						if (cc.type === 'type') {
							handleType(cc);
						}
					});
				}
			});
		}

		function handleSubscript(node: Parser.SyntaxNode): void {
			if (node.type !== 'subscript') {
				return;
			}
			debug(`handleSubscript`, node);
			const valueNode = node.childForFieldName('value');
			if (valueNode !== null) {
				handleValue(valueNode);
			}
			const subscriptNode = node.childForFieldName('subscript');
			if (subscriptNode !== null) {
				handleValue(subscriptNode);
			}
		}

		function handleAttribute(node: Parser.SyntaxNode): void {
			if (node.type !== 'attribute') {
				return;
			}
			debug(`handleAttribute`, node);
			const objectNode = node.childForFieldName('object');
			if (objectNode !== null) {
				handleValue(objectNode);
			}
		}

		function handleBinaryOperator(node: Parser.SyntaxNode): void {
			if (node.type !== 'binary_operator') {
				return;
			}
			debug(`handleBinaryOperator`, node);
			const leftNode = node.childForFieldName('left');
			const rightNode = node.childForFieldName('right');
			if (leftNode !== null) {
				handleValue(leftNode);
			}
			if (rightNode !== null) {
				handleValue(rightNode);
			}
		}

		function handleAssignment(node: Parser.SyntaxNode): void {
			if (node.type !== 'assignment') {
				return;
			}
			debug(`handleAssignment`, node);
			const leftNode = node.childForFieldName('left');
			const typeNode = node.childForFieldName('type');
			const rightNode = node.childForFieldName('right');
			if (leftNode !== null) {
				handleValue(leftNode);
			}
			if (typeNode !== null) {
				handleType(typeNode);
			}
			if (rightNode !== null) {
				handleValue(rightNode);
			}
		}

		function handleBooleanOperator(node: Parser.SyntaxNode): void {
			if (node.type !== 'boolean_operator') {
				return;
			}
			debug(`handleBooleanOperator`, node);
			const leftNode = node.childForFieldName('left');
			const rightNode = node.childForFieldName('right');
			if (leftNode !== null) {
				handleValue(leftNode);
			}
			if (rightNode !== null) {
				handleValue(rightNode);
			}
		}

		function handleComparisonOperator(node: Parser.SyntaxNode): void {
			if (node.type !== 'comparison_operator') {
				return;
			}
			debug(`handleComparisonOperator`, node);
			for (let i = 0; i < node.namedChildCount; i++) {
				const elementNode = node.namedChildren[i];
				if (elementNode !== null) {
					handleValue(elementNode);
				}
			}
		}

		function handleYield(node: Parser.SyntaxNode): void {
			if (node.type !== 'yield') {
				return;
			}
			debug(`handleYield`, node);
			if (node.namedChildCount === 0) {
				return;
			}
			const valueNode = node.namedChildren[0];
			handleValue(valueNode);
		} 

		function handleAwait(node: Parser.SyntaxNode): void {
			if (node.type !== 'await') {
				return;
			}
			debug(`handleAwait`, node);
			if (node.namedChildCount === 0) {
				return;
			}
			const valueNode = node.namedChildren[0];
			handleValue(valueNode);
		} 

		function handleExpressionStatement(node: Parser.SyntaxNode): void {
			if (node.type !== 'expression_statement') {
				return;
			}
			debug(`handleExpressionStatement`, node);
			const childNode = node.namedChildren[0];
			if (childNode !== null) {
				if (childNode.type === 'assignment') {
					handleAssignment(childNode);
				} else if (childNode.type === 'string') {
					handleString(childNode);
				} else if (childNode.type === 'yield') {
					handleYield(childNode);
				} else if (childNode.type === 'await') {
					handleAwait(childNode);
				}
			}
		}

		function handleBlock(node: Parser.SyntaxNode): void {
			if (node.type !== 'block') {
				return;
			}
			debug(`handleBlock`, node);
			for (let i = 0; i < node.namedChildCount; i++) {
				const childNode = node.namedChildren[i];
				handleStatement(childNode);
			}
		}

		function handleModule(node: Parser.SyntaxNode): void {
			if (node.type !== 'module') {
				return;
			}
			debug(`handleModule`, node);
			for (let i = 0; i < node.namedChildCount; i++) {
				const childNode = node.namedChildren[i];
				handleStatement(childNode);
			}
		}

		function handleString(node: Parser.SyntaxNode): void {
			if (node.type !== 'string') {
				return;
			}
			debug(`handleString`, node);
			for (let i = 0; i < node.namedChildCount; i++) {
				const elementNode = node.namedChildren[i];
				if (elementNode !== null && elementNode.type === 'interpolation') {
					const expressionNode = elementNode.childForFieldName('expression');
					if (expressionNode !== null) {
						handleValue(expressionNode);
					}
				}
			}
		}

		function handleList(node: Parser.SyntaxNode): void {
			if (node.type !== 'list') {
				return;
			}
			debug(`handleList`, node);
			for (let i = 0; i < node.namedChildCount; i++) {
				const elementNode = node.namedChildren[i];
				if (elementNode !== null) {
					handleValue(elementNode);
				}
			}
		}

		function handleListComprehension(node: Parser.SyntaxNode): void {
			if (node.type !== 'list_comprehension') {
				return;
			}
			debug(`handleListComprehension`, node);
			const bodyNode = node.childForFieldName('body');
			if (bodyNode !== null) {
				handleValue(bodyNode);
			}
			node.namedChildren.forEach(child => {
				if (child.type === 'for_in_clause') {
					const rightNode = child.childForFieldName('right');
					if (rightNode !== null) {
						handleValue(rightNode);
					}
				}
			});
		}

		function handleDictionary(node: Parser.SyntaxNode): void {
			if (node.type !== 'dictionary') {
				return;
			}
			debug(`handleDictionary`, node);
			for (let i = 0; i < node.namedChildCount; i++) {
				const pairNode = node.namedChildren[i];
				if (pairNode !== null && pairNode.type === 'pair') {
					const keyNode = pairNode.childForFieldName('key');
					if (keyNode !== null) {
						handleValue(keyNode);
					}
					const valueNode = pairNode.childForFieldName('value');
					if (valueNode !== null) {
						handleValue(valueNode);
					}
				}
			}
		}

		function handleTuple(node: Parser.SyntaxNode): void {
			if (node.type !== 'tuple') {
				return;
			}
			debug(`handleTuple`, node);
			for (let i = 0; i < node.namedChildCount; i++) {
				const elementNode = node.namedChildren[i];
				if (elementNode !== null) {
					handleValue(elementNode);
				}
			}
		}

		function handleSet(node: Parser.SyntaxNode): void {
			if (node.type !== 'set') {
				return;
			}
			debug(`handleSet`, node);
			for (let i = 0; i < node.namedChildCount; i++) {
				const elementNode = node.namedChildren[i];
				if (elementNode !== null) {
					handleValue(elementNode);
				}
			}
		}

		function handleCall(node: Parser.SyntaxNode): void {
			if (node.type !== 'call') {
				return;
			}
			debug(`handleCall`, node);
			const functionNode = node.childForFieldName('function');
			if (functionNode !== null) {
				handleValue(functionNode);
			}
			const argumentsNode = node.childForFieldName('arguments');
			if (argumentsNode !== null) {
				for (let i = 0; i < argumentsNode.namedChildCount; i++) {
					const argumentNode = argumentsNode.namedChild(i);
					if (argumentNode === null) {
						continue;
					}
					if (argumentNode.type === 'keyword_argument') {
						const valueNode = argumentNode.childForFieldName('value');
						if (valueNode !== null) {
							handleValue(valueNode);
						}
					} else {
						handleValue(argumentNode);
					}
				}
			}
		}

		function handleFunctionDefinition(node: Parser.SyntaxNode): void {
			if (node.type !== 'function_definition') {
				return;
			}
			debug(`handleFunctionDefinition`, node);
			const parametersNode = node.childForFieldName('parameters');
			if (parametersNode !== null) {
				for (let i = 0; i < parametersNode.namedChildCount; i++) {
					const parameterNode = parametersNode.namedChildren[i];
					if (parameterNode.type === 'typed_parameter') {
						const typeNode = parameterNode.childForFieldName('type');
						if (typeNode !== null) {
							handleType(typeNode);
						}
					} else if (parameterNode.type === 'typed_default_parameter') {
						const typeNode = parameterNode.childForFieldName('type');
						const valueNode = parameterNode.childForFieldName('value');
						if (typeNode !== null) {
							handleType(typeNode);
						}
						if (valueNode !== null) {
							handleValue(valueNode);
						}
					} else if (parameterNode.type === 'default_parameter') {
						const valueNode = parameterNode.childForFieldName('value');
						if (valueNode !== null) {
							handleValue(valueNode);
						}
					}
				}
			}
			const returnNode = node.childForFieldName('return_type');
			if (returnNode !== null) {
				handleType(returnNode);
			}
			const blockNode = node.childForFieldName('body');
			if (blockNode !== null) {
				handleBlock(blockNode);
			}
		}

		for (const filePath of files) {

			fileRelativePath = path.relative(workspacePath, filePath);

			if (!(fileRelativePath in graph.fileImportNodes)) {
				graph.fileImportNodes[fileRelativePath] = new Set();
			}

			if (path.basename(filePath) !== '__init__.py') {
				continue;
			}

			if (DEBUG) {
				console.log(`Processing __init__.py: ${filePath}`);
			}

			Object.keys(importedIdentifiers).forEach(key => {
				delete importedIdentifiers[key];
			});
			
			const content = fs.readFileSync(filePath, 'utf8');
			const tree = this.parser.parse(content);
			
			handleModule(tree.rootNode);

		}

		for (const filePath of files) {
			if (path.basename(filePath) === '__init__.py') {
				continue;
			}

			if (DEBUG) {
				console.log(`Processing file: ${filePath}`);
			}

			Object.keys(importedIdentifiers).forEach(key => {
				delete importedIdentifiers[key];
			});
			
			fileRelativePath = path.relative(workspacePath, filePath);
			const content = fs.readFileSync(filePath, 'utf8');
			const tree = this.parser.parse(content);
			
			handleModule(tree.rootNode);
			
		}
	}

	buildGraph(files: string[]): Graph {
		const graph: Graph = {
			fileNodes: {},
			nodes: {},
			fileImportNodes: {},
		};

		const graphFilePath = path.join(workspacePath, '.workspace_benchmark/graph.json');

		fs.writeFileSync(graphFilePath, '');

		this.gatherNodes(files, graph);

		this.gatherEdges(files, graph);

		fs.appendFileSync(graphFilePath, graphToString(graph));

		return graph;
	}
}