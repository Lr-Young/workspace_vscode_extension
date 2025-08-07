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

/**
 * 在指定时间段内执行回调函数
 * @param callback 要执行的回调函数
 * @param startHour 开始小时 (0-23)
 * @param startMinute 开始分钟 (0-59)
 * @param endHour 结束小时 (0-23)
 * @param endMinute 结束分钟 (0-59)
 */
export async function executeInTimeRange(
    callback: () => void | Promise<void>,
    startHour: number = 0,
    startMinute: number = 40,
    endHour: number = 8,
    endMinute: number = 0,
	logCallback?: (msg: string) => void
): Promise<void> {
    // 验证参数有效性
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) {
        throw new Error('小时参数必须在0-23之间');
    }
    if (startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59) {
        throw new Error('分钟参数必须在0-59之间');
    }

    // 转换为分钟数便于比较
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;

    // 检查当前是否在目标时间段内
    const isInTimeRange = (): boolean => {
        const now = new Date();
        // 获取北京时间 (UTC+8)
        const beijingOffset = 8 * 60 * 60 * 1000;
        const beijingTime = new Date(now.getTime() + beijingOffset);
        
        const currentHour = beijingTime.getUTCHours();
        const currentMinute = beijingTime.getUTCMinutes();
        const currentTotalMinutes = currentHour * 60 + currentMinute;

        // 处理跨天的时间段 (如 22:00-02:00)
        if (startTotalMinutes > endTotalMinutes) {
            return currentTotalMinutes >= startTotalMinutes || currentTotalMinutes < endTotalMinutes;
        } else {
            return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;
        }
    };

    // 计算到下一个目标时间点的毫秒数
    const getTimeUntilNextStart = (): number => {
        const now = new Date();
        const beijingOffset = 8 * 60 * 60 * 1000;
        const beijingTime = new Date(now.getTime() + beijingOffset);
        
        let nextStart = new Date(beijingTime);
        nextStart.setUTCHours(Math.floor(startTotalMinutes / 60));
        nextStart.setUTCMinutes(startTotalMinutes % 60);
        nextStart.setUTCSeconds(0);
        nextStart.setUTCMilliseconds(0);
        
        // 如果今天的目标时间已经过去，设置为明天的目标时间
        if (nextStart.getTime() <= beijingTime.getTime()) {
            nextStart.setUTCDate(nextStart.getUTCDate() + 1);
        }
        
        // 转换回本地时间计算差值
        return nextStart.getTime() - beijingTime.getTime();
    };

	const log = (msg: string) => {
		if (logCallback) {
			logCallback(msg);
		}
		console.log(msg);
	};

    // 等待直到进入目标时间段
    while (!isInTimeRange()) {
        const waitTime = getTimeUntilNextStart();
        log(`当前不在目标时间段内，等待 ${Math.round(waitTime / 1000 / 60)} 分钟 ${Math.round((waitTime / 1000) % 60)} 秒...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // 执行回调函数
    log(`已进入目标时间段：${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')} - ${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}，执行回调函数...`);
    await callback();
}
