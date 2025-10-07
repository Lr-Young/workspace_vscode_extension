import { systemPrompt, stopPrompt } from './prompts';

import { BaseMessage, AIMessage, SystemMessage, HumanMessage, MessageContent, MessageContentText } from '@langchain/core/messages';
import { Annotation, StateGraph, START, END, Command } from '@langchain/langgraph';

import { postMessage } from './workspaceAgentWebviewProvider';

import { getTokenCount } from './tokenizer';

import { model, maxModelTokens } from './models';

import { grep, read, isGrepConfig, GrepArgs, ReadFileArgs, parseToolCall, isReadFileConfig } from './tools';

export function parseMessageContent(response: MessageContent): string {
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
	tokenCounts: Annotation<number[]>({
		reducer: (left: number[], right: number | number[]) => {
			if (Array.isArray(right)) {
				for (const num of right) {
					left.push(left[left.length - 1] + num);
				}
				return left;
			}
			return left.concat([left[left.length - 1] + right]);
		},
		default: () => [],
	}),
	toolCallParams: Annotation<GrepArgs & {tool: string} | ReadFileArgs & {tool: string}>,
	maxRetries: Annotation<number>,
});

const callModel = async (state: typeof StateAnnotation.State) => {
	const messages: BaseMessage[] = [
		new SystemMessage(systemPrompt),
		...state.messages,
	];

	const reserve = 100;

	let index = state.tokenCounts.length - 1;

	if (state.tokenCounts[index] + reserve > maxModelTokens) {
		while (state.tokenCounts[index] > maxModelTokens) {
			messages.pop();
			index--;
		}
		while (state.tokenCounts[index] + reserve > maxModelTokens) {
			messages.pop();
			index--;
		}
		messages.push(new HumanMessage(stopPrompt));
	}

	postMessage({
		command: 'Agent',
		type: 'think start',
	});

	const response = await model.invoke(messages);

	const content: string = parseMessageContent(response.content);

	let parseOutput = parseToolCall(content);

	if (!parseOutput.thinking && !parseOutput.intention && !parseOutput.json) {
		postMessage({
			command: 'Agent',
			type: 'done',
		});

		const msg = new AIMessage(content);

		return new Command({
			update: {
				messages: [ msg ],
				tokenCounts: [ await getTokenCount(msg) ],
			},
			goto: END
		});
	}

	if (parseOutput.thinking && parseOutput.intention) {
		postMessage({
			command: 'Agent',
			type: 'think done',
		});
		const msg = new AIMessage(content);
		return new Command({
			update: {
				toolCallParams: parseOutput.jsonObject,
				messages: [ msg ],
				tokenCounts: [ await getTokenCount(msg) ],
			},
			goto: 'callTool',
		});
	}

	postMessage({
		command: 'Agent',
		type: 'think retry',
	});

	if (state.maxRetries > 0) {
		return new Command({
			update: {
				maxRetries: state.maxRetries - 1
			},
			goto: 'callModel',
		});
	} else {
		const msg = new HumanMessage(stopPrompt);
		return new Command({
			update: {
				messages: [ msg ],
				tokenCounts: [ await getTokenCount(msg) ]
			},
			goto: 'callModel',
		});
	}
};

const callTool = async (state: typeof StateAnnotation.State) => {
	const params = state.toolCallParams;
	let result: string;
	if (isGrepConfig(params)) {
		result = await grep(params.args);
	} else if (isReadFileConfig(params)) {
		result = await read(params.args, state.question, state.messages);
	} else {
		result = 'tool call json format is wrong!';
	}

	postMessage({
		command: 'Agent',
		type: 'tool',
		content: result,
	});

	const msg = new HumanMessage(result);
	return {
		messages: [ msg ],
		tokenCounts: [ await getTokenCount(msg) ],
	};
};

const agent = new StateGraph(StateAnnotation)
	.addNode('callModel', callModel, {
		ends: ['callTool', 'callModel', END],
	})
	.addNode('callTool', callTool)
	.addEdge(START, 'callModel')
	.addEdge('callTool', 'callModel')
	.compile()
	.withConfig({
		recursionLimit: 100
	});

export async function invoke(query: string): Promise<void> {
	postMessage({
		command: 'Agent',
		type: 'start',
	});
	const msg = new HumanMessage(query);
	await agent.invoke({
		question: query,
		messages: [
			msg,
		],
		tokenCounts: [
			await getTokenCount(msg),
		],
		maxRetries: 5,
	});
}
