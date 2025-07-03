import * as vscode from 'vscode';
import * as fg from 'fast-glob';
import * as path from 'path';

import { shuffle } from '../utils';
import { FileChunk, Placeholder, PlaceholderInstance, PlaceholderInstanceToString, QuestionContext, QuestionInstance, QuestionTemplate, supportedLanguages } from './typeDefinitions';
import { parseFiles } from './languageAnalyser/parser';
import { LLMLogger } from '../logger';
import { sleep } from '../utils';
import { postMessage } from './benchmarkWebviewPanel';
import { AnswerAgent, ContextAgent, PointsAgent } from './llm';

const excludePattern = [
    '**/node_modules/**',
    '**/.*/**',
    '**/.*',
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

function checkWorkspaceFolder(): boolean {
    if (vscode.workspace.workspaceFolders === undefined || vscode.workspace.workspaceFolders.length !== 1) {
        vscode.window.showErrorMessage("请在工作区打开一个目录");
        postMessage({
            command: 'benchmark fail',
            type: 'workspace folder not one',
            error: '请保证工作区只有一个打开的目录'
        });
        return false;
    }

    workspacePath = `${vscode.workspace.workspaceFolders[0].uri.fsPath}${path.sep}`;
    repoName = vscode.workspace.workspaceFolders[0].name;

    logger = new LLMLogger(workspacePath);

    return true;
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

async function getPlaceholderInstances(): Promise<PlaceholderInstance> {

    let instances: PlaceholderInstance = {};

    Object.values(Placeholder).forEach(value => {
        instances[value] = [];
    });

    instances['WorkspacePath'] = [workspacePath];

    const relativePath = (filePath: string) => {
        return path.relative(workspacePath, filePath);
    };

    const files = await fg.glob(
        supportedLanguages.map(ext => {
            return `**/*.${ext}`;
        }), 
        {
            cwd: workspacePath,
            absolute: true,
            onlyFiles: true,
            ignore: excludePattern, // 忽略node_modules
            dot: true, // 包含点文件
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

	while (questions.length < questionNum) {
		const template = questionTemplates[templateIndex];
		const selector = selectors[template.placeholder];
        if (selector.instances.length === 0) {
            console.log(`Warning: No instances for Placeholder ${template.placeholder} `);
        } else {
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
        }
		templateIndex = (templateIndex + 1) % questionTemplates.length;
		selector.index = (selector.index + 1) % selector.instances.length;
	}

	return questions;
}

export async function instantiateQuestions(questionNum: number) {

    if (!checkWorkspaceFolder()) {
        return;
    }

    postMessage({command: 'instantiate questions begin'});

    const instances = await getPlaceholderInstances();

    postMessage({
        command: 'instantiate questions placeholder instances',
        instances: instances,
    });

    const questions = instantiate(questionNum, instances);

    postMessage({
        command: 'instantiate questions question instances',
        questions: questions,
        workspacePath: workspacePath,
    });
}

export async function labelRelevantContext(questions: string[]): Promise<void> {

    if (!checkWorkspaceFolder()) {
        return;
    }

    const agent: ContextAgent = new ContextAgent();

    const files = await fg.glob('**', {
            cwd: workspacePath,
            absolute: true,
            onlyFiles: true,
            ignore: excludePattern, // 忽略node_modules
            dot: true // 包含点文件
    });

    postMessage({
        command: 'benchmark references',
        type: 'init',
        questions: questions,
    });

    for (const question of questions) {
        postMessage({
            command: 'benchmark references',
            type: 'question',
            question: question,
        });
        let count: number = 0;
        for (const file of files) {
            count += 1;
            postMessage({
                command: 'benchmark references',
                type: 'analyse file',
                question: question,
                file: file,
                relativePath: path.relative(workspacePath, file),
            });
            const relativePath: string = path.join(repoName, path.relative(workspacePath, file));
            const context: QuestionContext = await agent.mockInvoke(question, file, relativePath, repoName);
            await sleep(2000);
            if (context.references.length > 0) {
                postMessage({
                    command: 'benchmark references',
                    type: 'references',
                    references: context.references,
                    reason: context.reason,
                    relativePath: relativePath,
                    percent: (count / files.length * 100).toFixed(2),
                });
            }
        }
    }
    postMessage({
        command: 'benchmark references',
        type: 'done',
    });
}

export async function generateAnswerAndPoints(data: Record<string, string>[]): Promise<void> {

    if (!checkWorkspaceFolder()) {
        return;
    }

    const pattern = /^<vscode-link[^>]*>([^:]*):(\d+)~(\d+)<\/vscode-link>$/;

    const questions: string[] = [];
    const references: FileChunk[][] = [];

    data.forEach(element => {
        questions.push(element['Question']);
        const reference: FileChunk[] = [];
        element['Reference'].split('<br>').map(link => {
            const match = link.match(pattern);
            if (match) {
                if (match[1].startsWith(repoName)) {
                    reference.push({
                        filePath: path.join(path.dirname(workspacePath), match[1]),
                        startLine: parseInt(match[2]),
                        endLine: parseInt(match[3]),
                    });
                } else {
                    reference.push({
                        filePath: path.join(workspacePath, match[1]),
                        startLine: parseInt(match[2]),
                        endLine: parseInt(match[3]),
                    });
                }
            }
        });
        references.push(reference);
    });

    const answerAgent: AnswerAgent = new AnswerAgent();
    
    const pointsAgent: PointsAgent = new PointsAgent();



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

    const questions = instantiate(10, instances);
    postMessage({
        command: 'benchmark questions',
        questions: questions,
        workspacePath: workspacePath,
    });

    // await labelRelevantContext(questions);
    // postMessage({
    //     command: 'benchmark context',
    //     type: 'done',
    // });


    // postMessage({
    //     command: 'benchmark done',
    // });
    
}
