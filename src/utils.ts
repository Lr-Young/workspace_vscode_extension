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

export function pathToDots(path: string): string {
	return path
		.replace(/^[\/\\]+/, '')    // 移除开头的分隔符
		.replace(/[\/\\]+$/, '')    // 移除结尾的分隔符
		.replace(/[\/\\]+/g, '.');  // 替换中间的分隔符
}

export async function concurrencyRun<T>(
	tasks: (() => Promise<T>)[],
	concurrency: number
): Promise<T[]> {
	const results: T[] = [];
	const executing = new Set<Promise<void>>();

	for (const task of tasks) {
		const p = task().then(result => {
			results.push(result);
		});

		executing.add(p);

		p.finally(() => {
			executing.delete(p);
		});

		if (executing.size >= concurrency) {
			await Promise.race(executing);
		}
	}

	await Promise.all(executing);
	return results;
}
