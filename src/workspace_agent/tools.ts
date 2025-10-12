import * as vscode from 'vscode';

import { addLineNumber, toUnixPath } from '../utils';

import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

import { getMessagesTokenCount } from './tokenizer';

import { maxModelTokens, readFileModel, parseMessageContent } from './models';

import { evaluation, evaluationData } from './evaluation';

import { unreadableFileTypes } from '../benchmark/typeDefinitions';

import * as fs from 'fs';
import * as path from 'path';

export function getWorkspaceFolderCount(): number {
    if (vscode.workspace.workspaceFolders === undefined) {
        return 0;
    }
    return vscode.workspace.workspaceFolders.length;
}

export function getWorkspacePath(index: number=0): string {
    if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage(`No Workspace Folder Opened`);
        return '';
    }

    if (index >= vscode.workspace.workspaceFolders.length) {
        vscode.window.showErrorMessage(`No Workspace Folder Opened at index ${index}`);
        return '';
    }

    return `${vscode.workspace.workspaceFolders[index].uri.fsPath}${path.sep}`;
}

function combineAbsolutePath(relativePath: string, workspaceIndex: number = 0): string {
    let workspacePath = getWorkspacePath(workspaceIndex);

    while (true) {
        if (fs.existsSync(path.join(workspacePath, relativePath))) {
            return path.join(workspacePath, relativePath);
        }
        if (workspacePath === path.dirname(workspacePath)) {
            break;
        }
        workspacePath = path.dirname(workspacePath);
    }

    return '';

}

export const skipDirectories = [
    '.workspace_benchmark',
    '.workspace_agent',
    'node_modules',
    '.git',
];

// Tool Call: grep
function walkDir(dir: string, fileList: string[] = []): string[] {
    if (skipDirectories.includes(path.basename(dir))) {
        return [];
    }
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            walkDir(filePath, fileList);
        } else {
            fileList.push(filePath);
        }
    }
    return fileList;
}

export interface GrepArgs {
    pattern: string;
    path?: string;
    regex?: boolean;
    ignore_case?: boolean;
}

interface GrepResult {
    path: string;
    line_number: number;
    match_line: string;
    context_before: string[];
    context_after: string[];
    touch_file_end: boolean;
}

function grepResultToString(params: GrepResult, index: number): string {
    return `
# Grep Result ${index}:
## file path: ${params.path}
## matched line: ${params.match_line}
## context of matched line (10 lines before and after matched line):
${addLineNumber(params.context_before.join('\n'), params.line_number - params.context_before.length - 1)}
${params.line_number}(matched line): ${params.match_line}
${addLineNumber(params.context_after.join('\n'), params.line_number)}
${params.touch_file_end ? 'End of File' : '...'}
    `.trim();
}

/**
 * Search files for a pattern (text or regex) and include ±context lines.
 */
export async function grep(args: GrepArgs, workspaceIndex: number = 0, questionIndex: number = 0): Promise<string> {
    const {
        pattern,
        path: path_ = '.',
        regex = false,
        ignore_case = false,
    } = args;

    const context_lines = 10;

    const searchPath = combineAbsolutePath(path_, workspaceIndex);

    const workspacePath = getWorkspacePath(workspaceIndex);

    if (searchPath === '') {
        return `Path ${path_} not existed`;
    }

    const allFiles = fs.statSync(searchPath).isDirectory()
        ? walkDir(searchPath)
        : [searchPath];

    const results: GrepResult[] = [];
    const flags = ignore_case ? "i" : "";
    const searchRegex = regex
        ? new RegExp(pattern, flags)
        : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);

    for (const file of allFiles) {
        const content = fs.readFileSync(file, "utf-8");
        const lines = content.split("\n");

        const ext = path.extname(file);

        if (unreadableFileTypes.includes(ext) && ext !== '') {
            continue;
        }

        for (let i = 0; i < lines.length; i++) {
            if (searchRegex.test(lines[i])) {
                const startContext = Math.max(0, i - context_lines);
                const endContext = Math.min(lines.length - 1, i + context_lines);

                results.push({
                    path: toUnixPath(path.relative(workspacePath, file)),
                    line_number: i + 1,
                    match_line: lines[i].trim(),
                    context_before: lines.slice(startContext, i).map(l => l.trim()),
                    context_after: lines.slice(i + 1, endContext + 1).map(l => l.trim()),
                    touch_file_end: i + context_lines === lines.length,
                });
            }
        }
    }

    if (results.length === 0) {
        return `No content found`;
    }

    return `
${results.map((result, index) => {
    if (evaluation) {
        evaluationData[workspaceIndex].data[questionIndex]['candidateContexts'].push({
            path: result.path,
            startLine: result.line_number - result.context_before.length,
            endLine: result.line_number + result.context_after.length,
        });
    }
    return grepResultToString(result, index);
}).join('\n\n')}
    `.trim();
}

// Tool Call: read_file
export interface ReadFileArgs {
    path: string;
}

interface RelevantSnippet {
    start_line: number;
    end_line: number;
}

/**
 * 合并重叠或相邻的代码区间。
 * @param snippets 待合并的RelevantSnippet对象数组
 * @returns 合并后的RelevantSnippet对象数组
 */
function mergeRelevantSnippets(snippets: RelevantSnippet[]): RelevantSnippet[] {
    // 处理空数组或单元素数组的边界情况
    if (snippets.length <= 1) {
        return [...snippets]; // 返回原数组的浅拷贝
    }

    // 1. 按起始行排序（作为基础的升序排序）
    const sortedSnippets = [...snippets].sort((a, b) => a.start_line - b.start_line);

    // 2. 初始化合并结果数组，并放入第一个区间
    const merged: RelevantSnippet[] = [sortedSnippets[0]];

    // 3. 遍历排序后的区间进行合并
    for (let i = 1; i < sortedSnippets.length; i++) {
        const currentSnippet = sortedSnippets[i];
        // 获取已合并区间中的最后一个区间
        const lastMergedSnippet = merged[merged.length - 1];

        // 检查当前区间是否与最后一个合并区间重叠或相邻
        // 条件：当前区间的起始行 <= (最后一个合并区间的结束行 + 1)
        // 加1是为了合并相邻但不重叠的区间（如[1,5]和[6,10]）
        if (currentSnippet.start_line <= lastMergedSnippet.end_line + 1) {
            // 合并区间：更新最后一个合并区间的结束行为两者中的较大值
            lastMergedSnippet.end_line = Math.max(lastMergedSnippet.end_line, currentSnippet.end_line);
        } else {
            // 当前区间与最后一个合并区间无交集，直接加入合并结果
            merged.push(currentSnippet);
        }
    }

    return merged;
}

/**
 * Reads a file and uses an LLM to extract only relevant snippets.
 */

export async function read(
    args: ReadFileArgs,
    question: string,
    historyMessages: BaseMessage[],
    workspaceIndex: number = 0,
    questionIndex: number = 0
): Promise<string> {
    let { path } = args;

    const searchPath = combineAbsolutePath(path, workspaceIndex);
    
    if (searchPath === '' || !fs.existsSync(searchPath)) {
        return `Path ${path} not existed`;
    }

    const content = fs.readFileSync(searchPath, "utf-8");

    const results: RelevantSnippet[] = mergeRelevantSnippets(await readFileRelevantParts(content, 1, question, historyMessages));

    const readContent = (snippet: RelevantSnippet): string => {
        return content.split('\n').slice(snippet.start_line - 1, snippet.end_line).join('\n');
    };

    if (results.length === 0) {
        return `No Relevant content found in file: ${path}`;
    }
    
    return `
## Relevant File Snippets

${results.map(result => {
    if (evaluation) {
        evaluationData[workspaceIndex].data[questionIndex]['candidateContexts'].push({
            path: path,
            startLine: result.start_line,
            endLine: result.end_line,
        });
    }
    return addLineNumber(readContent(result), result.start_line - 1);
}).join('\n...\n')}
    `.trim();

}

async function callReadFileModel(messages: BaseMessage[]): Promise<RelevantSnippet[]> {

    const response = await readFileModel.invoke(messages);

    const output = parseMessageContent(response.content);

    // 1. 查找第一个 '[' 的位置
    const startIndex = output.indexOf('[');
    // 2. 查找最后一个 ']' 的位置
    const endIndex = output.lastIndexOf(']');

    // 3. 检查符号是否存在且位置合理
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
        // 如果任一符号没找到，或顺序不对，返回 null 表示未找到有效子串
        return [];
    }

    // 4. 提取子字符串（从'['之后一位开始，到']'之前）
    // substring 的第二个参数是结束索引（不包含该索引的字符）
    try {
        const parsed: RelevantSnippet[] = JSON.parse(output.substring(startIndex, endIndex + 1));
        return parsed;
    } catch (e) {
        return [];
    }
};

async function readFileRelevantParts(
    content: string,
    startLine: number,
    question: string,
    historyMessages: BaseMessage[]
): Promise<RelevantSnippet[]> {

    // Prompt for the LLM: ask it to identify relevant line ranges and content
    const prompt = `
You are a code analysis expert. A developer has asked a question. Previous tool call reasoning and outputs have been made. 
You are given a file's content where each line is preceded by its line number. Your goal is to read the content of this file and extract only the relevant parts needed to answer the question.
Return only the most relevant parts of the file that are necessary to answer the question.
** Only**  output a JSON array, ** Do Not**  output anything else. Each element must include:
- start_line: integer (1-based)
- end_line: integer

** Strictly** output the JSON format:
[
  { "start_line": <start_line>, "end_line": <end_line> },
  { "start_line": <start_line>, "end_line": <end_line> },
  { "start_line": <start_line>, "end_line": <end_line> },
  ...
]

## Developer's question:
${question}

## File Path: ${path}

## Previous tool calls and LLM reasoning:
${historyMessages.map(message => {
    return JSON.stringify({
        'role': message.getType(),
        'content': parseMessageContent(message.content),
    }, null, 4);
}).join('\n\n')}

## File Content:
${addLineNumber(content, startLine - 1)}
`.trim();

    const messages : BaseMessage[] = [
        new SystemMessage('You are a code snippet extraction expert.'),
        new HumanMessage(prompt),
    ];

    let results: RelevantSnippet[] = [];

    if (await getMessagesTokenCount(messages) > maxModelTokens) {
        const lines: string[] = content.split('\n');
        if (lines.length < 100) {
            results = await readFileRelevantParts(content, startLine, question, historyMessages.slice(0, -1));
        } else {
            const spliceIndex = Math.trunc(lines.length / 2);
            results.push(...await readFileRelevantParts(lines.slice(0, spliceIndex).join('\n'), startLine, question, historyMessages));
            results.push(...await readFileRelevantParts(lines.slice(spliceIndex).join('\n'), startLine + spliceIndex, question, historyMessages));
        }

        return mergeRelevantSnippets(results);
    }

    results = await callReadFileModel(messages);

    return mergeRelevantSnippets(results);
}

// 类型守卫：检查对象是否为 GrepConfig
export function isGrepConfig(obj: any): obj is {
    tool: string,
    args: GrepArgs
} {
  return obj && 
         obj.tool.toLowerCase() === 'grep' && 
         typeof obj.args.pattern === 'string';
}

// 类型守卫：检查对象是否为 ReadFileConfig
export function isReadFileConfig(obj: any): obj is {
    tool: string,
    args: ReadFileArgs
} {
    return obj && 
        ['read_file', 'read file', 'readfile'].includes(obj.tool.toLowerCase()) &&
        typeof obj.args.path === 'string';
}

/*
Thinking: I found that class Foo is defined in \`src/models/foo.py\`. I now want to inspect its implementation details.
Intention: Read the relevant parts of src/models/foo.py where class Foo is implemented.
{"tool": "read_file", "args": {"path": "src/models/foo.py"}}
*/

export function parseToolCall(content: string): {
	thinking: boolean,
	intention: boolean,
	json: boolean,
	jsonObject: { tool: string } & ( GrepArgs | ReadFileArgs ) | {}
} {
	const ret = {
		thinking: false,
		intention: false,
		json: false,
		jsonObject: {}
	};

	const list = content
		.split('\n')
		.filter(e => {
			return e.trim() !== '';
		});
	
	if (list.length !== 3) {
		return ret;
	}

	if (list[0].toLowerCase().includes('thinking:')) {
		ret.thinking = true;
	}

	if (list[1].toLowerCase().includes('intention:')) {
		ret.intention = true;
	}

	try {
		const jsonObject = JSON.parse(list[2]);
		if (isGrepConfig(jsonObject) || isReadFileConfig(jsonObject)) {
            ret.json = true;
            ret.jsonObject = jsonObject;
            return ret;
        } else {
            return ret;
        }
	} catch (e) {
		return ret;
	}
}
