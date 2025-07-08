import { AIMessageChunk } from "@langchain/core/messages";
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatDeepSeek } from '@langchain/deepseek';
import { BaseOutputParser, FormatInstructionsOptions } from '@langchain/core/output_parsers';
import { Callbacks } from "@langchain/core/callbacks/manager";
import { Runnable, RunnableLambda } from "@langchain/core/runnables";

import { readFileSync } from 'fs';
import * as path from 'path';

import { FileChunk, getFileLanguage, QuestionContext } from './typeDefinitions';
import { postMessage } from './benchmarkWebviewPanel';
import { getGenerateAnswerPrompt, getExtractRelevantFileSnippetPrompt, getGeneratePointsPrompt } from './prompt';
import { logger } from './main';
import { sleep } from "../utils";

type ParseOutput = {success: boolean, ranges: {start: number, end: number}[], reason: string};

class QuestionContextOutputParser extends BaseOutputParser {

    lc_namespace: string[] = ['workspace_benchmark'];

    async parse(text: string, callbacks?: Callbacks): Promise<ParseOutput> {
        const context: ParseOutput = {
            success: true,
            ranges: [] as {start: number, end: number}[],
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
            const answer:{start: number, end: number}[] = JSON.parse(splits[splits.length - 1].trim());
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
            .pipe(RunnableLambda.from(async (output: any) => {
                logger.log(output);
                return output;
            }))
            .pipe(this.outputParser);
    }

    async invoke(question: string, filePath: string, relativePath: string, repoName: string): Promise<QuestionContext> {
        const context: QuestionContext = {
            question: question,
            references: [],
            reason: '',
        };

        const content: string = readFileSync(filePath, 'utf8');

        const output: ParseOutput = await this.chain.invoke({
            input: getExtractRelevantFileSnippetPrompt(question, relativePath, content, repoName),
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
                relativePath: relativePath,
                startLine: range.start,
                endLine: range.end,
            });
        });
        
        context.reason = output.reason;

        return context;
    }

    async mockInvoke(question: string, filePath: string, relativePath: string, repoName: string): Promise<QuestionContext> {
        
        await sleep(200);

        const context: QuestionContext = {
            question: question,
            references: [],
            reason: '',
        };

        const content: string = readFileSync(filePath, 'utf8');

        const totalLines: number = content.split('\n').length;

        if (totalLines <= 2) {
            context.reason = 'File lines are no more than 2';
            return context;
        }

        const halfLine: number = Math.floor(totalLines / 2);

        context.references.push({
            relativePath: relativePath,
            startLine: 1,
            endLine: halfLine,
        });

        context.references.push({
            relativePath: relativePath,
            startLine: halfLine,
            endLine: halfLine,
        });

        context.references.push({
            relativePath: relativePath,
            startLine: halfLine,
            endLine: totalLines,
        });

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
            relativePath: string,
            content: string,
            language: string,
        }[] = [];

        for (const reference of references) {
            const content: string = readFileSync(path.join(workspacePath, reference.relativePath), 'utf8');
            promptReferences.push({
                relativePath: path.join(repoName, reference.relativePath),
                content: content,
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
