import { ChatDeepSeek } from '@langchain/deepseek';
import { CustomCallbackHandler } from './callbacks';

export const maxModelTokens = 131072;

export const model = new ChatDeepSeek({
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

export async function testModel(query: string): Promise<void> {
    await model.invoke(query);
}
