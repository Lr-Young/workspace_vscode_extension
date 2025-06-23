

import { PlaceHolderInstance } from './languageAnalyser/parser';

export enum PlaceHolder {
	Folder = `[folder]`,
	File = `[file]`,
	Function = `[function]`,
	Variable = `[variable]`,
	Class = `[class]`,
}

class QuestionTemplate {

	readonly regex: RegExp = /\[[^\]]*\]/g;

	template: string;

	placeHolder: string;

	constructor(template: string) {
		this.template = template;
		const matches: RegExpExecArray[] = [...template.matchAll(this.regex)];
		const hodler = template.match(this.regex)?.[0];
		if (hodler === undefined) {
			console.log("Error! Question Template definition should have one placeholder");
			this.placeHolder = "[]";
			return;
		}
		this.placeHolder = hodler;
	}

	public instantiate(instance: string): string {
		return this.template.replace(this.placeHolder, instance);
	}
}

const questionTemplates: QuestionTemplate[] = [
	`Can directory ${PlaceHolder.Folder} be removed?`,
	`Can file ${PlaceHolder.File} be remove?`,
	`What is the meaning of directory ${PlaceHolder.Folder}?`,
	`What is the meaning of file ${PlaceHolder.File}?`,
	`What is the meaning of class ${PlaceHolder.Class}?`,
	`What is the meaning of function ${PlaceHolder.Function}?`,
	`What is the role of file ${PlaceHolder.File}?`,
	`What is the role of class ${PlaceHolder.Class}?`,
	`What is the role of directory ${PlaceHolder.Folder}?`,
	`What is the role of variable ${PlaceHolder.Variable}?`,
	`What is the implementation logic of class ${PlaceHolder.Class}`,
	`What is the implementation logic of function ${PlaceHolder.Function}`,
	`What is the usage of class ${PlaceHolder.Class}`,
	`What is the usage of function ${PlaceHolder.Function}`,
].map(str => {
	return new QuestionTemplate(str);
});

// Fisher-Yates algorithm
function generateRandomPermutation(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  
  return arr;
}

// 使用示例
const permutation = generateRandomPermutation(10);
console.log(permutation);

export function instantiate(questionNum: number, placeHolderInstances: PlaceHolderInstance): string[] {
	const questions: string[] = [];

	const selectors: {
		[key: string]: {
			index: number,
			indices: number[],
			instances: string[],
		}
	} = {};

	let total: number = 0;
	Object.entries(placeHolderInstances).forEach(([key, value]) => {
		total += value.size;
		selectors[key] = {
			index: 0,
			indices: generateRandomPermutation(value.size),
			instances: [...placeHolderInstances[key]],
		};
	});

	if (total === 0) {
		console.log("Error! place holder instance count is 0");
		return questions;
	}

	let templateIndex = 0;

	for (let i = 0; i < questionNum; i++) {
		const template = questionTemplates[templateIndex];
		const selector = selectors[template.placeHolder];
		questions.push(template.instantiate(
			selector.instances[selector.indices[selector.index]]
		));
		templateIndex = (templateIndex + 1) % questionTemplates.length;
		selector.index = (selector.index + 1) % selector.indices.length;
	}

	return questions;
}