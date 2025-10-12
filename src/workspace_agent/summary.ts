import * as path from 'path';
import * as fs from 'fs';

import * as yaml from 'js-yaml';

import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

import { summaryModel, parseMessageContent, maxModelTokens } from './models';

import { fileSummaryPrompt, fileSummarySystemPrompt, dircetorySummaryPrompt, directorySummarySystemPrompt, repositorySummaryPrompt, repositorySummarySystemPrompt } from './prompts';

import { getWorkspacePath, skipDirectories } from './tools';
import { getMessagesTokenCount } from './tokenizer';

import { unreadableFileTypes } from '../benchmark/typeDefinitions';

export const summaryFilePath: string = './.workspace_agent/summary.yaml';

const MOCK: boolean = false;

interface FileSummary {
    summary: string,
    entities: string,
}

export async function generateSummary(index: number = 0): Promise<string> {
    const workspacePath: string = getWorkspacePath(index);

    const summary = await recursiveGenerate(workspacePath, workspacePath);

    const jsonObject = {
        'repository_name': path.basename(workspacePath),
        'reposiotry_summary': summary.summary,
        'contents': summary.contents,
    };

    const filePath = path.join(workspacePath, summaryFilePath);

    if (!fs.existsSync(filePath)) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    fs.writeFileSync(filePath, yaml.dump(jsonObject));

    return yaml.dump(jsonObject);

}

async function recursiveGenerate(workspacePath: string, dir: string): Promise<{ path: string, summary: string, contents: Object[] }> {

    if (skipDirectories.includes(path.basename(dir))) {
        return {
            path: '',
            summary: '',
            contents: []
        };
    }

    const files = fs.readdirSync(dir);

    const fileContents: {
        path: string,
        summary: string,
        entities: string,
    }[] = [];

    const direcotryContents: {
        path: string,
        summary: string,
        contents: Object[],
    }[] = [];

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            const direcotryContent = await recursiveGenerate(workspacePath, filePath);
            if (direcotryContent.path !== '') {
                direcotryContents.push(direcotryContent);
            }
        } else {
            const ext = path.extname(file).toLocaleLowerCase();
            if (unreadableFileTypes.includes(ext) && ext !== '') {
                continue;
            }
            const fileContent = await generateFileSummary(workspacePath, filePath);
            fileContents.push({
                path: path.relative(workspacePath, filePath),
                summary: fileContent.summary,
                entities: fileContent.entities,
            });
        }
    }

    const summary: string = path.relative(workspacePath, dir) !== path.relative(dir, workspacePath) ? 
    await generateDirectorySummary(
        workspacePath,
        dir,
        fileContents.length === 0 ? '' : yaml.dump(fileContents),
        direcotryContents.length === 0 ? '' : yaml.dump(direcotryContents),
    ) : await generateRepositorySummary(
        path.basename(workspacePath),
        fileContents.length === 0 ? '' : yaml.dump(fileContents),
        direcotryContents.length === 0 ? '' : yaml.dump(direcotryContents),
    );

    return {
        path: path.relative(workspacePath, dir) + path.sep,
        summary: summary,
        contents: [...fileContents, ...direcotryContents],
    };

}

async function generateFileSummary(workspacePath: string, filePath: string): Promise<FileSummary> {

    if (MOCK) {
        return {
            summary: 'mock file summary',
            entities: 'mock file entities',
        };
    }

    let content: string = fs.readFileSync(filePath, { encoding: 'utf-8' });
    let prompt: string = fileSummaryPrompt(path.relative(workspacePath, filePath), content);

    const messages: BaseMessage[] = [
        new SystemMessage(fileSummarySystemPrompt),
        new HumanMessage(prompt),
    ];

    let tokenCount: number = await getMessagesTokenCount(messages);

    while (tokenCount > maxModelTokens) {
        content = content.split('\n').slice(0, Math.trunc(content.split('\n').length * 0.9)).join('\n');
        prompt = fileSummaryPrompt(path.relative(workspacePath, filePath), content);
        messages[1] = new HumanMessage(prompt);
        tokenCount = await getMessagesTokenCount(messages);
    }

    const response: string = parseMessageContent((await summaryModel.invoke(messages)).content);

    const startIndex = response.indexOf('{');
    const endIndex = response.lastIndexOf('}');

    const result: FileSummary = {
        summary: response.replace(/\s*\n\s*/g, " "),
        entities: '',
    };

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
        return result;
    }

    try {
        const parsed = JSON.parse(response.substring(startIndex, endIndex + 1));
        if (Object.keys(parsed).includes('summary')) {
            result.summary = parsed['summary'];
        } else if (Object.keys(parsed).includes('Summary')) {
            result.summary = parsed['Summary'];
        }
        
        if (Object.keys(parsed).includes('entities')) {
            result.entities = parsed['entities'];
        } else if (Object.keys(parsed).includes('Entities')) {
            result.entities = parsed['Entities'];
        } else if (Object.keys(parsed).includes('entity')) {
            result.entities = parsed['entity'];
        } else if (Object.keys(parsed).includes('Entity')) {
            result.entities = parsed['Entity'];
        }
        result.summary = result.summary.replace(/\s*\n\s*/g, " ");
        result.entities = result.entities.replace(/\s*\n\s*/g, " ");
        return result;
    } catch (e) {
        return result;
    }
}

async function generateDirectorySummary(workspacePath: string, directoryPath: string, fileContents: string, subdirectoryContents: string): Promise<string> {

    if (MOCK) {
        return 'mock directory summary';
    }

    const prompt: string = dircetorySummaryPrompt(
        path.relative(workspacePath, directoryPath), 
        fileContents,
        subdirectoryContents
    );

    const messages: BaseMessage[] = [
        new SystemMessage(directorySummarySystemPrompt),
        new HumanMessage(prompt),
    ];

    return parseMessageContent((await summaryModel.invoke(messages)).content).replace(/\s*\n\s*/g, " ");;

}

async function generateRepositorySummary(repoName: string, fileContents: string, subdirectoryContents: string): Promise<string> {

    const prompt: string = repositorySummaryPrompt(
        repoName,
        fileContents,
        subdirectoryContents
    );

    const messages: BaseMessage[] = [
        new SystemMessage(repositorySummarySystemPrompt),
        new HumanMessage(prompt),
    ];

    if (MOCK) {
        return 'mock repository summary';
    }

    return parseMessageContent((await summaryModel.invoke(messages)).content).replace(/\s*\n\s*/g, " ");;

}
