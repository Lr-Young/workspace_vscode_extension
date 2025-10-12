import { ChatDeepSeek } from '@langchain/deepseek';

import { CustomCallbackHandler } from './callbacks';

import { MessageContent, MessageContentText } from '@langchain/core/messages';

export const maxModelTokens = 130000;

export const agentModel = new ChatDeepSeek({
    model: 'deepseek-chat',
    temperature: 0,
    streaming: true,
    callbacks: [new CustomCallbackHandler()],
});

export const readFileModel = new ChatDeepSeek({
    model: 'deepseek-chat',
    temperature: 0,
    streaming: true,
});

export const summaryModel = new ChatDeepSeek({
    model: 'deepseek-chat',
    temperature: 0,
    streaming: true,
});

export const evaluationModel = new ChatDeepSeek({
    model: 'deepseek-chat',
    temperature: 0,
    streaming: true,
});

export async function testModel(query: string): Promise<void> {
    await agentModel.invoke(query);
}

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