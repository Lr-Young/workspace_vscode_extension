import { AIMessageChunk } from "@langchain/core/messages";
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatDeepSeek } from '@langchain/deepseek';
import { BaseOutputParser, FormatInstructionsOptions } from '@langchain/core/output_parsers';
import { Callbacks } from "@langchain/core/callbacks/manager";
import { Runnable, RunnableLambda } from "@langchain/core/runnables";

import { readFileSync } from 'fs';
import * as path from 'path';

import { CodeEntity, FileChunk, mergeFileChunks, getFileLanguage, Graph, QuestionContext } from './typeDefinitions';
import { postMessage } from './benchmarkWebviewPanel';
import { getGenerateAnswerPrompt, getExtractRelevantFileSnippetPrompt, getGeneratePointsPrompt } from './prompt';
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

        return text.at(text.indexOf('Answer:')) as string;
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

        if (text.startsWith('Evaluation Dimensions (Total: 10 points):')) {
            return (text.at('Evaluation Dimensions (Total: 10 points):'.length) as string).trim();
        }

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
            // model: 'deepseek-chat',
            model: 'deepseek-reasoner',
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
            // .pipe(() => MOCK_CONTEXT_ANSWER)
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

        if (path.basename(absoluteFilePath) !== 'trae_agent.py') {
            context.reason = 'File is not a Python file';
            return context;
        }

        const content: string = readFileSync(absoluteFilePath, 'utf8');

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

    model: ChatOpenAI;
    prompt: ChatPromptTemplate;
    outputParser: AnswerOutputParser;
    chain: Runnable;

    constructor() {
        this.model = new ChatDeepSeek({
            model: 'deepseek-reasoner',
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

        this.outputParser = new AnswerOutputParser();

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

    async invoke(question: string, references: FileChunk[], workspacePath: string, repoName: string): Promise<string> {

        const promptReferences: {
            relativePathWithRepoName: string,
            content: string,
            startLine: number,
            language: string,
        }[] = [];

        references = mergeFileChunks(references);

        for (const reference of references) {
            const content: string = readFileSync(path.join(workspacePath, reference.relativePath), 'utf8');
            promptReferences.push({
                relativePathWithRepoName: path.join(repoName, reference.relativePath),
                content: content,
                startLine: reference.startLine,
                language: getFileLanguage(reference.relativePath),
            });
        }

        const output: string = await this.chain.invoke({
            input: getGenerateAnswerPrompt(question, repoName, promptReferences),
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
            model: 'deepseek-reasoner',
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

export async function testLLM(): Promise<string> {
    
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
