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

        context.reason = splits[0].split('[Analysis]')[0];

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

        this.chain = this.prompt.pipe(this.model).pipe(this.outputParser);
        this.chain = this.prompt
            .pipe(RunnableLambda.from(async (input: any) => {
                logger.log(`Context Agent Input\n${JSON.stringify(input, null, 4)}`);
                return input;
            }))
            .pipe(this.model)
            .pipe(RunnableLambda.from(async (output: any) => {
                logger.log(`Context Agent Output\n${JSON.stringify(output, null, 4)}`);
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
                filePath: filePath,
                startLine: range.start,
                endLine: range.end,
            });
        });
        
        context.reason = output.reason;

        return context;
    }

    async mockInvoke(question: string, filePath: string, relativePath: string, repoName: string): Promise<QuestionContext> {
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

        context.references.push({
            filePath: filePath,
            startLine: 0,
            endLine: totalLines / 2,
        });

        context.references.push({
            filePath: filePath,
            startLine: totalLines / 2,
            endLine: totalLines / 2,
        });

        context.references.push({
            filePath: filePath,
            startLine: totalLines / 2,
            endLine: totalLines - 1,
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

        this.chain = this.prompt.pipe(this.model).pipe(this.outputParser);
        this.chain = this.prompt
            .pipe(RunnableLambda.from(async (input: any) => {
                logger.log(`Answer Agent Input\n${JSON.stringify(input, null, 4)}`);
                return input;
            }))
            .pipe(this.model)
            .pipe(RunnableLambda.from(async (output: any) => {
                logger.log(`Answer Agent Output\n${JSON.stringify(output, null, 4)}`);
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
            const content: string = readFileSync(reference.filePath, 'utf8');
            promptReferences.push({
                relativePath: path.join(repoName, path.relative(workspacePath, reference.filePath)),
                content: content,
                language: getFileLanguage(reference.filePath),
            });
        }


        const output: string = await this.chain.invoke({
            input: getGenerateAnswerPrompt(question, repoName, promptReferences),
        });

        return output;
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

        this.chain = this.prompt.pipe(this.model).pipe(this.outputParser);
        this.chain = this.prompt
            .pipe(RunnableLambda.from(async (input: any) => {
                logger.log(`Points Agent Input\n${JSON.stringify(input, null, 4)}`);
                return input;
            }))
            .pipe(this.model)
            .pipe(RunnableLambda.from(async (output: any) => {
                logger.log(`Points Agent Output\n${JSON.stringify(output, null, 4)}`);
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
