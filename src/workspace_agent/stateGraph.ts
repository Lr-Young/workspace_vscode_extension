import { system_prompt } from './prompts';

import { BaseMessage, AIMessage, SystemMessage, HumanMessage, MessageContent, MessageContentText } from '@langchain/core/messages';
import { Annotation, StateGraph, START, END, Command } from '@langchain/langgraph';

import { ChatDeepSeek } from '@langchain/deepseek';

import { addLineNumber, extractAllJSONObjects } from '../utils';

import * as path from 'path';
import * as fs from 'fs';

const model = new ChatDeepSeek({
	model: 'deepseek-chat',
	temperature: 0,
});

function parseMessageContent(response: MessageContent): string {
	if (typeof response === 'string') {
		// 如果 content 直接是字符串
		return response;
	} else {
		// 如果 content 是 MessageContentComplex[] 数组，提取所有 'text' 类型的内容并拼接
		return response
			.filter(block => block.type === 'text' && 'text' in block)
			.map(block => (block as MessageContentText).text)
			.join('');
	}
}

// Tool Call: grep
function walkDir(dir: string, fileList: string[] = []): string[] {
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

interface GrepArgs {
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
}

function grepResultToString(params: GrepResult): string {
	return `
file path: ${params.path}
${addLineNumber(params.context_before.join('\n'), params.line_number - params.context_before.length)}
${params.line_number}(matched line): ${params.match_line}
${addLineNumber(params.context_after.join('\n'), params.line_number - params.context_after.length)}
	`.trim();
}

/**
 * Search files for a pattern (text or regex) and include ±context lines.
 */
async function grep(args: GrepArgs): Promise<string> {
	const {
		pattern,
		path: searchPath = ".",
		regex = false,
		ignore_case = false,
	} = args;

	const context_lines = 10;

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

		for (let i = 0; i < lines.length; i++) {
			if (searchRegex.test(lines[i])) {
				const startContext = Math.max(0, i - context_lines);
				const endContext = Math.min(lines.length - 1, i + context_lines);

				results.push({
					path: file,
					line_number: i + 1,
					match_line: lines[i].trim(),
					context_before: lines.slice(startContext, i).map(l => l.trim()),
					context_after: lines.slice(i + 1, endContext + 1).map(l => l.trim()),
				});
			}
		}
	}

	if (results.length === 0) {
		return `No content found`;
	}

	return `
${results.map(result => {
	return grepResultToString(result);
}).join('\n\n')}
	`.trim();
}

// Tool Call: read_file
interface ReadFileArgs {
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
async function readFileRelevantParts(
	args: ReadFileArgs,
	question: string,
	messages: BaseMessage[]
): Promise<string> {
	const { path } = args;

	if (!fs.existsSync(path)) {
		return `File not found: ${path}`;
	}

	const content = fs.readFileSync(path, "utf-8");

	// Prompt for the LLM: ask it to identify relevant line ranges and content
	const prompt = `
You are a code analysis expert. A developer has asked a question. Previous tool call reasoning and outputs have been made. 
Your goal is to read the full content of this file and extract only the relevant parts needed to answer the question.
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
${messages.map(message => {
	return JSON.stringify({
		'role': message.getType(),
		'content': parseMessageContent(message.content),
	});
}).join('\n')}

## File Content:
${addLineNumber(content, 1)}
`;

	const prompts: BaseMessage[] = [
		new SystemMessage('You are a code snippet extraction expert.'),
		new HumanMessage(prompt),
	];

	async function call(): Promise<RelevantSnippet[]> {

		const response = await model.invoke(prompts);

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

	let max_retries = 5;

	let results: RelevantSnippet[] = [];

	while (max_retries > 0) {
		results = await call();
		if (results.length === 0) {
			max_retries--;
		} else {
			break;
		}
	}

	results = mergeRelevantSnippets(results);

	const readContent = (snippet: RelevantSnippet): string => {
		return content.split('\n').slice(snippet.start_line - 1, snippet.end_line - 1).join('\n');
	};

	if (results.length === 0) {
		return `No Relevant content found in file: ${path}`;
	}
	
	return `
## Relevant File Snippets

${results.map(result => {
	return addLineNumber(readContent(result), result.start_line);
}).join('\n...\n')}
	`.trim();

}

// 类型守卫：检查对象是否为 GrepConfig
function isGrepConfig(obj: any): obj is {
	tool: string
} & GrepArgs {
  return obj && 
         obj.tool.toLowerCase() === 'grep' && 
         typeof obj.pattern === 'string';
}

// 类型守卫：检查对象是否为 ReadFileConfig
function isReadFileConfig(obj: any): obj is {
	tool: string
} & ReadFileArgs {
  return obj && 
         obj.tool.toLowerCase in ['read_file', 'read file', 'readfile'] && 
         typeof obj.path === 'string';
}

const StateAnnotation = Annotation.Root({
	question: Annotation<string>,
	messages: Annotation<BaseMessage[]>({
		reducer: (left: BaseMessage[], right: BaseMessage | BaseMessage[]) => {
			if (Array.isArray(right)) {
				return left.concat(right);
			}
			return left.concat([right]);
		},
		default: () => [],
	}),
	toolCallParams: Annotation<GrepArgs & {tool: string} | ReadFileArgs & {tool: string}>,
});

const callModel = async (state: typeof StateAnnotation.State) => {
	const messages: BaseMessage[] = [
		new SystemMessage(system_prompt),
	];

	messages.concat(state.messages);

	const response = await model.invoke(messages);

	const content: string = parseMessageContent(response.content);

	const jsonObject = extractAllJSONObjects(content);

	if (jsonObject.length === 1) {
		const params = jsonObject[0];
		if (isGrepConfig(params) || isReadFileConfig(params)) {
			return new Command({
				update: {
					toolCallParams: params
				},
				goto: 'toolCall',
			});
		}
	}

	return new Command({
		update: {
			messages: [new AIMessage(content)]
		},
		goto: END
	});
};

const toolCall = async (state: typeof StateAnnotation.State) => {
	const params = state.toolCallParams;
	if (isGrepConfig(params)) {
		const result = await grep(params);
		return {
			messages: [new HumanMessage(result)],
		};
	} else {
		const result = await readFileRelevantParts(params, state.question, state.messages);
		return {
			messages: [new HumanMessage(result)],
		}
	}
};
