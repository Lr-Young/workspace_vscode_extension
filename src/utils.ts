import * as path from 'path';
import * as fs from 'fs';

/**
 * A helper function that returns a unique alphanumeric identifier called a nonce.
 *
 * @remarks This function is primarily used to help enforce content security
 * policies for resources/scripts being executed in a webview context.
 *
 * @returns A nonce
 */
export function getNonce() {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

// Fisher-Yates algorithm
export function shuffle<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]]; // ES6 解构赋值交换元素
	}
	return array;
}

export async function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

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
	private filePath: string;

	constructor(workspacePath: string) {
		this.filePath = path.join(workspacePath, '.workspace_benchmark/llm.log');
		ensureFileExists(this.filePath);
	}

	log(content: string): void {
		const time = formatDateTime();
		try {
			fs.promises.appendFile(this.filePath, `${time}${content}\n`);
		} catch (error) {
			console.log(`LLMLogger log failed: ${error}`);
		}
	}
}
