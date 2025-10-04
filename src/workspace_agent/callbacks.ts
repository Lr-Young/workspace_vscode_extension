
import { BaseCallbackHandler, NewTokenIndices, HandleLLMNewTokenCallbackFields } from '@langchain/core/callbacks/base';

import { LLMResult } from '@langchain/core/outputs';

import { Serialized } from 'langchain/load/serializable';

import { postMessage } from './workspaceAgentWebviewProvider';

export class CustomCallbackHandler extends BaseCallbackHandler {
    name = 'CustomCallbackHandler';

    /**
     * Called at the start of an LLM or Chat Model run, with the prompt(s)
     * and the run ID.
     */
    async handleLLMStart (llm: Serialized, prompts: string[], runId: string, parentRunId?: string, extraParams?: Record<string, unknown>, tags?: string[], metadata?: Record<string, unknown>, runName?: string):
    Promise<any> {
        postMessage({
            command: 'LLM',
            type: 'start',
            content: 'TEST: LLM Start',
        });
    }
    /**
     * Called when an LLM/ChatModel in `streaming` mode produces a new token
     */
    async handleLLMNewToken?(token: string, 
    /**
     * idx.prompt is the index of the prompt that produced the token
     *   (if there are multiple prompts)
     * idx.completion is the index of the completion that produced the token
     *   (if multiple completions per prompt are requested)
     */
    idx: NewTokenIndices, runId: string, parentRunId?: string, tags?: string[], fields?: HandleLLMNewTokenCallbackFields):
    Promise<any> {
        postMessage({
            command: 'LLM',
            type: 'token',
            content: token,
        });
    }
    /**
     * Called if an LLM/ChatModel run encounters an error
     */
    async handleLLMError?(err: Error, runId: string, parentRunId?: string, tags?: string[], extraParams?: Record<string, unknown>):
    Promise<any> {
        postMessage({
            command: 'LLM',
            type: 'error',
            content: 'TEST: LLM Error',
        });
    }
    /**
     * Called at the end of an LLM/ChatModel run, with the output and the run ID.
     */
    async handleLLMEnd?(output: LLMResult, runId: string, parentRunId?: string, tags?: string[], extraParams?: Record<string, unknown>):
    Promise<any> {
        postMessage({
            command: 'LLM',
            type: 'end',
            content: 'TEST: LLM End',
        });
    }

}