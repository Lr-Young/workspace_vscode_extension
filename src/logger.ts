import * as path from 'path';
import * as fs from 'fs';

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
