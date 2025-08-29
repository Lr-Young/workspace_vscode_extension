import { AIMessageChunk } from "@langchain/core/messages";
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatDeepSeek } from '@langchain/deepseek';
import { BaseOutputParser, FormatInstructionsOptions } from '@langchain/core/output_parsers';
import { Callbacks } from "@langchain/core/callbacks/manager";
import { Runnable, RunnableLambda } from "@langchain/core/runnables";

import { ChatAlibabaTongyi } from '@langchain/community/chat_models/alibaba_tongyi';

import { OpenAI } from "openai";

import { readFileSync } from 'fs';
import * as path from 'path';

import { CodeEntity, FileChunk, mergeFileChunks, getFileLanguage, Graph, QuestionContext } from './typeDefinitions';
import { postMessage } from './benchmarkWebviewPanel';
import { addLineNumber, getGenerateAnswerPrompt, getExtractRelevantFileSnippetPrompt, getGeneratePointsPrompt } from './prompt';
import { logger, workspacePath } from './main';
import { sleep } from "../utils";

type ParseOutput = {success: boolean, ranges: {filename: string, start: number, end: number}[], reason: string};

const MOCK_CONTEXT_ANSWER: string = `
[Analysis]
The question asks about the implementation logic of the class \`_BashSession\`. Looking at the main file \`bash_tool.py\`, the class \`_BashSession\` is defined from lines 19-117. This includes:
- The class definition and docstring (lines 19-20)
- Class attributes (lines 22-28)
- The constructor \`__init__\` (lines 30-33)
- The \`start\` method (lines 35-49)
- The \`stop\` method (lines 51-59)
- The main \`run\` method (lines 61-117)

The class uses some types from \`base.py\`:
- \`ToolError\` is used in error handling (lines 12-17 in base.py)
- \`ToolExecResult\` is used as the return type (lines 19-24 in base.py)

These are the only relevant code spans needed to understand the implementation of \`_BashSession\`. The other parts of the files (like \`BashTool\` class or other base classes) are not directly relevant to understanding \`_BashSession\`'s implementation.

[Answer]
[
  { "filename": "trae-agent\\\\trae_agent\\\\tools\\\\bash_tool.py", "start": 19, "end": 117 },
  { "filename": "trae-agent\\\\trae_agent\\\\tools\\\\base.py", "start": 12, "end": 17 },
  { "filename": "trae-agent\\\\trae_agent\\\\tools\\\\base.py", "start": 19, "end": 24 }
]
`.trim();

const MOCK_CONTEXT_ANSWER2: string = `
[Analysis]
The question is about the role of the directory \`src\` in the codebase \`xai-sdk-python\`. Looking at the provided file path and content, the main file is located at \`xai-sdk-python\\src\\xai_sdk\\__init__.py\`. This file is inside the \`src\` directory, which suggests that \`src\` is the root directory for the source code of the \`xai_sdk\` package. The \`__init__.py\` file imports modules \`aio\` and \`sync\` (line 1), imports \`__version__\` from \`__about__\` (line 2), and imports \`AsyncClient\` and \`Client\` from submodules (lines 3-4). It also defines \`__all__\` (line 6). Since the question is about the directory \`src\`, and the provided file is within it, the entire content of this file is relevant as it represents the top-level package initialization for \`xai_sdk\`, which is housed under \`src\`. There are no dependent files provided, so no additional spans are needed.

[Answer]
[
  { "filename": "xai-sdk-python\\\\src\\\\xai_sdk\\\\__init__.py", "start": 6, "end": 6 },
  { "filename": "xai-sdk-python\\\\src\\\\xai_sdk\\\\__init__.py", "start": 1, "end": 7 },
  { "filename": "xai-sdk-python\\\\src\\\\xai_sdk\\\\__init__.py", "start": 1, "end": 1 },
  { "filename": "xai-sdk-python\\\\src\\\\xai_sdk\\\\__init__.py", "start": 3, "end": 3 },
  { "filename": "xai-sdk-python\\\\src\\\\xai_sdk\\\\__init__.py", "start": 4, "end": 6 }
]
`.trim();

class QuestionContextOutputParser extends BaseOutputParser {

    lc_namespace: string[] = ['workspace_benchmark'];

    async parse(text: string, callbacks?: Callbacks): Promise<ParseOutput> {
        const context: ParseOutput = {
            success: true,
            ranges: [] as {filename: string, start: number, end: number}[],
            reason: '',
        };

        const splits = text.split('[Answer]');

        if (splits.length !== 2) {
            context.success = false;
            context.reason = `Context Agent output format wrong! \nRaw output:\n${text}`;
            return context;
        }

        context.reason = splits[0].split('[Analysis]')[1];

        try {
            const answer: {filename: string, start: number, end: number}[] = JSON.parse(splits[splits.length - 1].trim());
            answer.forEach(range => {
                context.ranges.push(range);
            });
        } catch (error) {
            context.success = false;
            context.reason = `Context Agent output JSON format wrong! \nRaw output:\n${text}`;
        }
        
        return context;
    }

    getFormatInstructions(options?: FormatInstructionsOptions): string {
        return JSON.stringify({
            ranges: 'relevant context line ranges',
            reason: 'reason why the references are relevant'
        });
    }
}

class AnswerOutputParser extends BaseOutputParser {

    lc_namespace: string[] = ['workspace_benchmark'];

    async parse(text: string, callbacks?: Callbacks): Promise<string> {

        const splits = text.split('Answer:');

        if (splits.length === 1) {
            return text;
        }

        return splits[1].trim() as string;
    }

    getFormatInstructions(options?: FormatInstructionsOptions): string {
        return JSON.stringify({
            answer: 'answer',
        });
    }
}

class PointsOutputParser extends BaseOutputParser {

    lc_namespace: string[] = ['workspace_benchmark'];

    async parse(text: string, callbacks?: Callbacks): Promise<string> {

        // if (text.startsWith('Evaluation Dimensions (Total: 10 points):')) {
        //     return (text.at('Evaluation Dimensions (Total: 10 points):'.length) as string).trim();
        // }

        return text;
    }

    getFormatInstructions(options?: FormatInstructionsOptions): string {
        return JSON.stringify({
            points: 'points',
        });
    }
}

export class ContextAgent {

    model: ChatOpenAI;
    prompt: ChatPromptTemplate;
    outputParser: QuestionContextOutputParser;
    chain: Runnable;

    constructor() {
        this.model = new ChatDeepSeek({
            model: 'deepseek-chat',
            temperature: 0,
        });

        this.prompt = ChatPromptTemplate.fromMessages([
            [
                'system',
                'You are an experienced codebase comprehension specialist.',
            ],
            [
                'human',
                '{input}',
            ]
        ]);

        this.outputParser = new QuestionContextOutputParser();

        this.chain = this.prompt
            .pipe(RunnableLambda.from(async (input: any) => {
                logger.log(input);
                return input;
            }))
            .pipe(this.model)
            // .pipe(() => MOCK_CONTEXT_ANSWER2)
            .pipe(RunnableLambda.from(async (output: any) => {
                logger.log(output);
                return output;
            }))
            .pipe(this.outputParser);
    }

    async invoke(question: string, absoluteFilePath: string, repoName: string, graph: Graph): Promise<QuestionContext> {
        const context: QuestionContext = {
            question: question,
            references: [],
            reason: '',
        };

        let content: string = readFileSync(absoluteFilePath, 'utf8');

        if (content.split('\n').length > 3000) {
            content = content.split('\n').slice(0, 3000).join('\n') + '\nThis file is too long, so the rest of lines are ignored...';
        }

        const relativePathWithRepoName: string = path.join(repoName, path.relative(workspacePath, absoluteFilePath));

        const dependentCode: {
            relativePathWithRepoName: string,
            fileContent: string,
            startLine: number, 
        }[] = [];

        if (path.relative(workspacePath, absoluteFilePath) in graph.fileImportNodes) {
            graph.fileImportNodes[path.relative(workspacePath, absoluteFilePath)].forEach(fqn => {
                const codeEntity: CodeEntity = graph.nodes[fqn];
                const fileContent: string = readFileSync(path.join(workspacePath, codeEntity.content.relativePath), 'utf8')
                    .split('\n')
                    .slice(codeEntity.content.startLine - 1, codeEntity.content.endLine)
                    .join('\n');
                dependentCode.push({
                    relativePathWithRepoName: path.join(repoName, codeEntity.content.relativePath),
                    fileContent: fileContent,
                    startLine: codeEntity.content.startLine - 1,
                });
            });
        }

        const output: ParseOutput = await this.chain.invoke({
            input: getExtractRelevantFileSnippetPrompt(question, relativePathWithRepoName, content, repoName, dependentCode),
        });

        // const output: ParseOutput = {success: true, ranges: [], reason: "Mock reason for labeling"};

        if (!output.success) {
            postMessage({
                command: 'benchmark fail',
                type: 'context agent invoke',
                error: output.reason,
            });
            return context;
        }

        output.ranges.forEach(range => {
            context.references.push({
                relativePath: path.relative(repoName, range.filename),
                startLine: range.start,
                endLine: range.end,
            });
        });

        context.reason = output.reason;

        return context;
    }

    async mockInvoke(question: string, absoluteFilePath: string, repoName: string, graph: Graph): Promise<QuestionContext> {
        
        // generate a random timeout to simulate the delay of LLM invocation

        const randomTimeout: number = Math.floor(Math.random() * 40) + 10; // between 10ms and 50ms

        await sleep(randomTimeout);

        const context: QuestionContext = {
            question: question,
            references: [],
            reason: '',
        };

        const content: string = readFileSync(absoluteFilePath, 'utf8');

        const totalLines: number = content.split('\n').length;

        if (totalLines <= 2) {
            context.reason = 'File lines are no more than 2';
            return context;
        }

        const halfLine: number = Math.floor(totalLines / 2);

        const relativePath: string = path.relative(workspacePath, absoluteFilePath);

        if (totalLines <= 20) {
            context.references.push({
                relativePath: relativePath,
                startLine: 1,
                endLine: totalLines,
            });
        } else {
            context.references.push({
                relativePath: relativePath,
                startLine: 1,
                endLine: halfLine,
            });

            context.references.push({
                relativePath: relativePath,
                startLine: halfLine + 2,
                endLine: halfLine + 2,
            });

            context.references.push({
                relativePath: relativePath,
                startLine: halfLine + 6,
                endLine: totalLines,
            });
        }

        context.reason = 'Mock Reason';

        return context;
    }
}

export class AnswerAgent {

    model;
    prompt: ChatPromptTemplate;
    outputParser: AnswerOutputParser;
    chain: Runnable;

    constructor() {

        this.model = new ChatAlibabaTongyi({
            model: 'qwen-plus-2025-07-28',
            temperature: 0,
            maxTokens: 1000000,
        });

        this.prompt = ChatPromptTemplate.fromMessages([
            [
                'system',
                'You are an experienced codebase comprehension specialist.',
            ],
            [
                'human',
                '{input}',
            ]
        ]);

        this.outputParser = new AnswerOutputParser();

        this.chain = this.prompt
            .pipe(RunnableLambda.from(async (input: any) => {
                logger.log(input);
                return input;
            }))
            .pipe(RunnableLambda.from(async (input: any) => {
                const systemMessage: string = input.messages[0]['content'];
                const userMessage: string = input.messages[1]['content'];
                const openai = new OpenAI(
                    {
                        apiKey: process.env.DASHSCOPE_API_KEY,
                        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
                    }
                );
                const completion = await openai.chat.completions.create({
                    model: "qwen-plus-2025-07-28",  //此处以qwen-plus为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
                    messages: [
                        { role: "system", content: systemMessage },
                        { role: "user", content: userMessage }
                    ],
                    max_completion_tokens: 1000000,
                });

                return completion;
            }))
            // .pipe(this.model)
            .pipe(RunnableLambda.from(async (output: OpenAI.Chat.Completions.ChatCompletion) => {
                logger.log(output);
                return output.choices[0].message.content;
            }))
            .pipe(this.outputParser);
    }

    async invoke(question: string, references: FileChunk[], workspacePath: string, repoName: string): Promise<string> {

        const promptReferences: Record<string, {
            content: string,
            language: string,
        }> = {};

        references = mergeFileChunks(references);

        for (const reference of references) {
            const content: string = readFileSync(path.join(workspacePath, reference.relativePath), 'utf8');
            if (!(reference.relativePath in promptReferences)) {
                promptReferences[reference.relativePath] = {
                    content: addLineNumber(content.split('\n').slice(reference.startLine - 1, reference.endLine).join('\n'), reference.startLine - 1) + '\n...\n',
                    language: getFileLanguage(reference.relativePath),
                };
            } else {
                promptReferences[reference.relativePath].content += addLineNumber(content.split('\n').slice(reference.startLine - 1, reference.endLine).join('\n'), reference.startLine - 1) + '\n...\n';
            }
        }

        const output: string = await this.chain.invoke({
            input: getGenerateAnswerPrompt(question, repoName, Object.entries(promptReferences).map(([key, value]) => {
                return {
                    relativePathWithRepoName: key,
                    content: value.content,
                    language: value.language,
                };
            })),
        });

        return output;
    }

    async mockInvoke(question: string, references: FileChunk[], workspacePath: string, repoName: string): Promise<string> {
        await sleep(1000);
        return "Mock Answer";
    }

}

export class PointsAgent {

    model: ChatOpenAI;
    prompt: ChatPromptTemplate;
    outputParser: PointsOutputParser;
    chain: Runnable;

    constructor() {
        this.model = new ChatDeepSeek({
            model: 'deepseek-chat',
            temperature: 0,
        });

        this.prompt = ChatPromptTemplate.fromMessages([
            [
                'system',
                'You are an experienced codebase comprehension specialist.',
            ],
            [
                'human',
                '{input}',
            ]
        ]);

        this.outputParser = new PointsOutputParser();

        this.chain = this.prompt
            .pipe(RunnableLambda.from(async (input: any) => {
                logger.log(input);
                return input;
            }))
            .pipe(this.model)
            .pipe(RunnableLambda.from(async (output: any) => {
                logger.log(output);
                return output;
            }))
            .pipe(this.outputParser);
    }

    async invoke(question: string, answer: string): Promise<string> {

        const output: string = await this.chain.invoke({
            input: getGeneratePointsPrompt(question, answer),
        });

        return output;
    }

    async mockInvoke(question: string, answer: string): Promise<string> {
        await sleep(1000);
        return "Mock Points";
    }

}

export async function testDeepseek(): Promise<string> {

    const model = new ChatDeepSeek({
        model: 'deepseek-chat',
        temperature: 0,
    });

    const prompt = ChatPromptTemplate.fromMessages([
        [
            'system',
            'You are an experienced codebase comprehension specialist.',
        ],
        [
            'human',
            '{input}',
        ]
    ]);

    const chain = prompt.pipe(model);
    const msg: AIMessageChunk = await chain.invoke({
        input: '上善若水，厚德载物',
    });

    console.log(`LLM output: ${msg}`);

    return msg.content as string;
}

async function testTongyi() {

    // const model: ChatAlibabaTongyi = new ChatAlibabaTongyi({
    //     model: 'qwen-plus',
    //     temperature: 0,
    // });

    // const prompt = ChatPromptTemplate.fromMessages([
    //     [
    //         'system',
    //         'You are an experienced codebase comprehension specialist.',
    //     ],
    //     [
    //         'human',
    //         '{input}',
    //     ]
    // ]);

    // const chain = prompt.pipe(model);
    // const msg: AIMessageChunk = await chain.invoke({
    //     input: '你是什么模型？',
    // });

    // console.log(`LLM output: ${msg}`);

    // return msg.content as string;

    const openai = new OpenAI(
        {
            // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey: "sk-xxx",
            apiKey: process.env.DASHSCOPE_API_KEY,
            baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
        }
    );

    const completion = await openai.chat.completions.create({
        model: "qwen-plus-latest",  //此处以qwen-plus为例，可按需更换模型名称。模型列表：https://help.aliyun.com/zh/model-studio/getting-started/models
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: "你是谁？" }
        ],
    });
    console.log(JSON.stringify(completion));

    return JSON.stringify(completion);
}

export async function testLLM(): Promise<string> {
    return await testTongyi();
}
