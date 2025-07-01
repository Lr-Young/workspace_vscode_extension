import * as vscode from 'vscode';
import * as fg from 'fast-glob';
import * as path from 'path';
import { fork } from 'child_process';

import { shuffle } from '../utils';
import { Placeholder, PlaceholderInstance, QuestionContext, QuestionInstance, QuestionTemplate } from './typeDefinitions';
import { parseFiles } from './languageAnalyser/parser';
import { LLMLogger, sleep } from '../utils';
import { postMessage } from './benchmarkWebviewPanel';
import { ContextAgent } from './llm';

const excludePattern = [
    '**/node_modules/**',
    '**/.*/**',
];

const questionTemplates: QuestionTemplate[] = [
	`Can directory ${Placeholder.Folder} be removed?`,
	`Can file ${Placeholder.File} be remove?`,
	`What is the meaning of directory ${Placeholder.Folder}?`,
	`What is the meaning of file ${Placeholder.File}?`,
	`What is the meaning of class ${Placeholder.Class}?`,
	`What is the meaning of function ${Placeholder.Function}?`,
	`What is the role of file ${Placeholder.File}?`,
	`What is the role of class ${Placeholder.Class}?`,
	`What is the role of directory ${Placeholder.Folder}?`,
	`What is the role of variable ${Placeholder.Variable}?`,
	`What is the implementation logic of class ${Placeholder.Class}`,
	`What is the implementation logic of function ${Placeholder.Function}`,
	`What is the usage of class ${Placeholder.Class}`,
	`What is the usage of function ${Placeholder.Function}`,
].map(str => {
	return new QuestionTemplate(str);
});

let workspacePath: string = '';
let repoName: string = '';
export let logger: LLMLogger;

function instantiate(questionNum: number, placeHolderInstances: PlaceholderInstance): QuestionInstance[] {
    
	const questions: QuestionInstance[] = [];

	const selectors: {
		[key: string]: {
			index: number,
			instances: string[],
		}
	} = {};

	let total: number = 0;
	Object.entries(placeHolderInstances).forEach(([key, value]) => {
		total += value.length;
		selectors[key] = {
			index: 0,
			instances: shuffle([...placeHolderInstances[key]]),
		};
	});

	if (total === 0) {
		console.log("Error! place holder instance count is 0");
		return questions;
	}

	let templateIndex = 0;

	for (let i = 0; i < questionNum; i++) {
		const template = questionTemplates[templateIndex];
		const selector = selectors[template.placeholder];
        let instance: string;
        if (template.placeholder === Placeholder.File || template.placeholder === Placeholder.Folder) {
            instance = selector.instances[selector.index];
        } else {
            instance = selector.instances[selector.index].split('#')[2];
        }
        questions.push({
            question: template.instantiate(instance),
            template: template.template,
            placeholder: template.placeholder,
            placeholderInstance: `${selector.instances[selector.index]}`,
        });
		templateIndex = (templateIndex + 1) % questionTemplates.length;
		selector.index = (selector.index + 1) % selector.instances.length;
	}

	return questions;
}

async function getPlaceholderInstances(): Promise<PlaceholderInstance> {

    let instances: PlaceholderInstance = {};

    Object.values(Placeholder).forEach(value => {
        instances[value] = [];
    });

    instances['WorkspacePath'] = [workspacePath];

    const relativePath = (filePath: string) => {
        return path.relative(workspacePath, filePath);
    };

    const files = await fg.glob('**', {
            cwd: workspacePath,
            absolute: true,
            onlyFiles: true,
            ignore: excludePattern, // 忽略node_modules
            dot: true // 包含点文件
    });

    const directories = await fg.glob('**/', {
            cwd: workspacePath,
            absolute: true,
            onlyDirectories: true,
            ignore: excludePattern,
            dot: true
    });

    files.forEach(filePath => {
        instances[Placeholder.File].push(relativePath(filePath));
    });

    directories.forEach(dirPath => {
        instances[Placeholder.Folder].push(relativePath(dirPath));
    });

    Object.entries(((await parseFiles(files)))).forEach(([key, value]) => {
        value.forEach(element => {
            instances[key].push(element);
        });
    });

    return instances;
}

export async function handleLink(type: string, value: string) {
    switch (type) {
        case 'Folder':
            await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(value));
            return;
        case 'File':
            const document = await vscode.workspace.openTextDocument(value);
            await vscode.window.showTextDocument(document, {preview: false});
            return;
        case 'Position': {
            const values = value.split('#');
            const filePath = values[0];
            const line = parseInt(values[1]);
            const doc = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(doc, {preview: false});
            const position = new vscode.Position(line, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            return; 
        }
        case 'Range': {
            const values = value.split('#');
            const filePath = values[0];
            const startLine: number = parseInt(values[1]);
            const endLine: number = parseInt(values[2]);
            const doc = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(doc);
            const startPos = new vscode.Position(startLine, 0);
            const endPos = new vscode.Position(endLine, 
                doc.lineAt(endLine).text.length);
            editor.selection = new vscode.Selection(startPos, endPos);
            editor.revealRange(new vscode.Range(startPos, endPos));
        }
            
    }
}

async function labelRelevantContext(questions: QuestionInstance[]): Promise<void> {

    const agent: ContextAgent = new ContextAgent();

    const files = await fg.glob('**', {
            cwd: workspacePath,
            absolute: true,
            onlyFiles: true,
            ignore: excludePattern, // 忽略node_modules
            dot: true // 包含点文件
    });

    for (const instance of questions) {
        postMessage({
            command: 'benchmark context',
            type: 'question',
            question: instance.question,
        });
        for (const file of files) {
            postMessage({
                command: 'benchmark context',
                type: 'analyse file',
                file: path.relative(workspacePath, file),
            });
            const relativePath: string = path.join(repoName, path.relative(workspacePath, file));
            const context: QuestionContext = await agent.invoke(instance.question, file, relativePath, repoName);
            if (context.references.length > 0) {
                postMessage({
                    command: 'benchmark context',
                    type: 'references',
                    references: context.references,
                    reason: context.reason,
                    workspacePath: workspacePath,
                });
            }
        }
    }
}

export async function constructBenchmark() {

    if (vscode.workspace.workspaceFolders === undefined || vscode.workspace.workspaceFolders.length !== 1) {
        vscode.window.showErrorMessage("请在工作区打开一个目录");
        postMessage({
            command: 'benchmark fail',
            type: 'workspace folder not one',
            error: '请保证工作区只有一个打开的目录'
        });
        return;
    }

    workspacePath = `${vscode.workspace.workspaceFolders[0].uri.fsPath}${path.sep}`;
    repoName = vscode.workspace.workspaceFolders[0].name;

    logger = new LLMLogger(workspacePath);

    postMessage({command: 'benchmark begin'});

    const instances = await getPlaceholderInstances();
    postMessage({
        command: 'benchmark instances',
        instances: instances,
    });

    const questions = instantiate(100, instances);
    postMessage({
        command: 'benchmark questions',
        questions: questions,
        workspacePath: workspacePath,
    });

    await labelRelevantContext(questions);
    postMessage({
        command: 'benchmark context',
        type: 'done',
    });


    postMessage({
        command: 'benchmark done',
    });
    
}
