
export enum Placeholder {
	Folder = `[folder]`,
	File = `[file]`,
	Function = `[function]`,
	Variable = `[variable]`,
	Class = `[class]`,
}

export type PlaceholderInstance = Record<string, string[]>;

export type QuestionInstance = {
	workspacePath: string,
	instances: Array<{
		question: string,
		template: string,
		placeholder: string,
		placeholderInstance: string,
	}>,
};

export function toString(data: PlaceholderInstance): string {
	const indent = '    ';
	let ret = `{\n${indent}`;
	Object.entries(data).forEach(([key, value]) => {
		if (key === Placeholder.File || key === Placeholder.Folder) {
			ret += `${key}: [${[...value].join(`\n${indent}${' '.repeat(key.length)}`)}]\n${indent}`;
		} else {
			ret += `${key}: [${[...value].join(', ')}]\n${indent}`;
		}
	});
	ret += `}\n`;
	return ret;
}

export class QuestionTemplate {

	readonly regex: RegExp = /\[[^\]]*\]/g;

	template: string;

	placeholder: string;

	constructor(template: string) {
		this.template = template;
		const matches: RegExpExecArray[] = [...template.matchAll(this.regex)];
		const hodler = template.match(this.regex)?.[0];
		if (hodler === undefined) {
			console.log("Error! Question Template definition should have one placeholder");
			this.placeholder = "[]";
			return;
		}
		this.placeholder = hodler;
	}

	public instantiate(instance: string): string {
		return this.template.replace(this.placeholder, instance);
	}
}

export interface FileChunk {
	readonly filePath: string;
	readonly startLine: number;
	readonly endLine: number;
}

export interface Instance {
	readonly repo: string;
	readonly question: string;
	readonly referrence: FileChunk[];
	readonly answer: string;
	readonly points: string;
}
