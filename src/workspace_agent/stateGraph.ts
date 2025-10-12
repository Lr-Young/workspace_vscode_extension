import * as fs from 'fs';
import * as path from 'path';

import { systemPrompt, stopPrompt } from './prompts';

import { BaseMessage, AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import { Annotation, StateGraph, START, END, Command } from '@langchain/langgraph';

import { postMessage } from './workspaceAgentWebviewProvider';

import { getTokenCount } from './tokenizer';

import { agentModel, maxModelTokens, parseMessageContent, evaluationModel } from './models';

import { grep, read, isGrepConfig, GrepArgs, ReadFileArgs, parseToolCall, isReadFileConfig, getWorkspacePath, getWorkspaceFolderCount } from './tools';

import { generateSummary, summaryFilePath } from './summary';

import { concurrencyRun } from '../utils';

import { evaluation, evaluationData } from './evaluation';

const model = evaluation ? evaluationModel : agentModel;

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
			if (left.length === 0) {
				return Array.isArray(right) ? right : [right];
			}
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
	workspaceIndex: Annotation<number>,
	questionIndex: Annotation<number>,
});

const callModel = async (state: typeof StateAnnotation.State) => {
	const messages: BaseMessage[] = [
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

	if ((!parseOutput.thinking && !parseOutput.intention && !parseOutput.json) || 
		(!parseOutput.json)) {
		postMessage({
			command: 'Agent',
			type: 'done',
		});

		if (evaluation) {
			evaluationData[state.workspaceIndex].data[state.questionIndex]['candidateAnswer'] = content;
			evaluationData[state.workspaceIndex].data[state.questionIndex]['isSet'] = true;
		}

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
		result = await grep(params.args, state.workspaceIndex, state.questionIndex);
	} else if (isReadFileConfig(params)) {
		result = await read(params.args, state.question, state.messages, state.workspaceIndex, state.questionIndex);
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

const generateRepositorySummary = async (state: typeof StateAnnotation.State) => {

	const filePath = path.join(getWorkspacePath(), summaryFilePath);

	const summary = fs.existsSync(filePath) ? fs.readFileSync(filePath, { encoding: 'utf-8' }) : await generateSummary();

	const msg = new HumanMessage(`
Below is the hierarchical summary of the repository structure, including each directory' summary and contents and each file's summary and entities defined.
This summary is **for reference only** — it helps you decide where to retrieve relative information, but cannot be used as factual evidence.
You must still call tools to retrieve actual repository content, and base your final answer only on verified tool outputs, not on this summary.
${summary}`.trim());
	
	return {
		messages: [
			msg,
		],
		tokenCounts: [
			await getTokenCount(msg),
		],
	};
};

const agent = new StateGraph(StateAnnotation)
	.addNode('callModel', callModel, {
		ends: ['callTool', 'callModel', END],
	})
	.addNode('callTool', callTool)
	.addNode('generateRepositorySummary', generateRepositorySummary)
	.addEdge(START, 'generateRepositorySummary')
	.addEdge('callTool', 'callModel')
	.addEdge('generateRepositorySummary', 'callModel')
	.compile()
	.withConfig({
		recursionLimit: 200
	});

export async function invoke(query: string, workspaceIndex: number = 0, questionIndex: number = 0): Promise<void> {
	postMessage({
		command: 'Agent',
		type: 'start',
	});
	const sysMsg = new SystemMessage(systemPrompt);
	const msg = new HumanMessage(query);
	const tokens1 = await getTokenCount(sysMsg);
	const tokens2 = await getTokenCount(msg);
	await agent.invoke({
		question: query,
		messages: [
			sysMsg,
			msg,
		],
		tokenCounts: [
			tokens1,
			tokens1 + tokens2,
		],
		maxRetries: 5,
		workspaceIndex: workspaceIndex,
		questionIndex: questionIndex,
	});
}

