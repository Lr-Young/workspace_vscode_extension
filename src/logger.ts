import * as path from 'path';
import * as fs from 'fs';
import { AIMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatPromptValue } from '@langchain/core/prompt_values';

function formatDateTime(): string {
  const now = new Date();
  
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `[${year}-${month}-${day} ${hours}:${minutes}:${seconds}] `;
}

function fileFormatDateTime(): string {
    const now = new Date();
    
    // 格式化为 YYYY-MM-DD_HH-MM-SS
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  }

async function ensureFileExists(filePath: string, initialContent: string = ''): Promise<void> {
    try {
        await fs.promises.access(filePath);
    } catch (error) {
        const dir = path.dirname(filePath);
        await fs.promises.mkdir(dir, { recursive: true });
        
        await fs.promises.writeFile(filePath, initialContent);
    }
}

export class LLMLogger {

    private static _instance: LLMLogger;
    private static _initialized: boolean = false;

	private logFilePath: string;
    private rawLLMFilePath: string;

	private constructor(workspacePath: string) {
        const time = fileFormatDateTime();
		this.logFilePath = path.join(workspacePath, `.workspace_benchmark/llm_${time}.log`);
        this.rawLLMFilePath = path.join(workspacePath, `.workspace_benchmark/raw_llm_logs/llm_${time}.log`);
		ensureFileExists(this.logFilePath);
        ensureFileExists(this.rawLLMFilePath);
	}

    public static getInstance(workspacePath: string): LLMLogger {
        if (!LLMLogger._initialized) {
            LLMLogger._instance = new LLMLogger(workspacePath);
            LLMLogger._initialized = true;
        }
        return LLMLogger._instance;
    }

	log(content: ChatPromptValue | AIMessage): void {
		const time = formatDateTime();
		try {
            if (content instanceof ChatPromptValue) {
                fs.promises.appendFile(this.rawLLMFilePath, `${time}Context Agent Input\n${JSON.stringify(content, null, 4)}\n`);
                fs.promises.appendFile(this.logFilePath, `${time}Context Agent Input\n${content}\n`);
            } else if (content instanceof AIMessage) {
                fs.promises.appendFile(this.rawLLMFilePath, `${time}Context Agent Output\n${JSON.stringify(content, null, 4)}\n`);
                fs.promises.appendFile(this.logFilePath, `${time}Context Agent Output\n${(content as AIMessage).content}\n`);
            } else {
                console.log(`LLMLogger log warning: content is not type of ChatPromptTemplate | AIMessage\ntype: ${(content as Object).constructor.name}\n${content}`);
            }
		} catch (error) {
			console.log(`LLMLogger log failed: ${error}`);
		}
	}
}
