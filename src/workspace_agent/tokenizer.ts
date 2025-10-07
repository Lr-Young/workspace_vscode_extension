import { AutoTokenizer, PreTrainedTokenizer } from '@huggingface/transformers';

import { BaseMessage } from '@langchain/core/messages';

import * as path from 'path';

let tokenizerInstance: PreTrainedTokenizer | null = null;

const tokenizerPromise = AutoTokenizer.from_pretrained(path.join(__dirname, '.')).then(t => {
    tokenizerInstance = t;
    return t;
});

export async function getTokenCount(message: BaseMessage): Promise<number> {

    const tokenizer = tokenizerInstance ?? await tokenizerPromise;

    return tokenizer.encode(`${message.getType()}: ${message.content}`).length;
    
}

export async function getMessagesTokenCount(messages: BaseMessage[]): Promise<number> {
    let result = 0;

    for (const message of messages) {
        result += await getTokenCount(message);
    }

    return result;

}
