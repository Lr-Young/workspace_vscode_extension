
export enum Placeholder {
	Folder = `[folder]`,
	File = `[file]`,
	Function = `[function]`,
	Variable = `[variable]`,
	Class = `[class]`,
}

export type PlaceholderInstance = Record<string, string[]>;

export type QuestionInstance = {
	question: string,
	template: string,
	placeholder: string,
	placeholderInstance: string,
};

export function PlaceholderInstanceToString(data: PlaceholderInstance): string {
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

export type FileChunk = {
	readonly relativePath: string;
	readonly startLine: number;
	readonly endLine: number;
}

export type Instance = {
	readonly repo: string;
	readonly question: string;
	readonly referrences: FileChunk[];
	readonly answer: string;
	readonly points: string;
}

export type QuestionContext = {
	question: string,
	references: FileChunk[],
	reason: string,
}

export type GridType =
	| 'placeholder-instances-grid'
	| 'question-instances-grid'
	| 'question-references-grid'
	| 'answer-point-grid';

export type GridStructure = {
	'placeholder-instances-grid': {
		requiredKeys: ['Placeholder', 'Instances'];
		valueType: Record<string, string[]>;
	};
	'question-instances-grid': {
		requiredKeys: ['Question', 'Template', 'Placeholder Instance'];
		valueType: Record<string, string[]>;
	};
	'question-references-grid': {
		requiredKeys: ['Question', 'Reference', 'Reason'];
		valueType: Record<string, string[]>;
	};
	'answer-point-grid': {
		requiredKeys: ['Question', 'Reference', 'Answer', 'Evaluation'];
		valueType: Record<string, string[]>;
	};
};

export const GRID_STRUCTURES: GridStructure = {
	'placeholder-instances-grid': {
		requiredKeys: ['Placeholder', 'Instances'],
		valueType: {} as Record<string, string[]>
	},
	'question-instances-grid': {
		requiredKeys: ['Question', 'Template', 'Placeholder Instance'],
		valueType: {} as Record<string, string[]>
	},
	'question-references-grid': {
		requiredKeys: ['Question', 'Reference', 'Reason'],
		valueType: {} as Record<string, string[]>
	},
	'answer-point-grid': {
		requiredKeys: ['Question', 'Reference', 'Answer', 'Evaluation'],
		valueType: {} as Record<string, string[]>
	}
};

export const supportedLanguages: string[] = [
	'js',
	'ts',
	'jsx',
	'tsx',
	'py',
	'java',
	'c',
	'h',
	'cpp',
	'hpp',
];

const extensionToLanguageMap: Record<string, string> = {
	// 常见编程语言
	'js': 'JavaScript',
	'ts': 'TypeScript',
	'jsx': 'JavaScript React',
	'tsx': 'TypeScript React',
	'py': 'Python',
	'java': 'Java',
	'kt': 'Kotlin',
	'go': 'Go',
	'rs': 'Rust',
	'rb': 'Ruby',
	'php': 'PHP',
	'c': 'C',
	'h': 'C Header',
	'cpp': 'C++',
	'hpp': 'C++ Header',
	'cs': 'C#',
	'swift': 'Swift',
	'm': 'Objective-C',
	'mm': 'Objective-C++',

	// 脚本语言
	'sh': 'Shell Script',
	'bash': 'Bash',
	'zsh': 'Zsh',
	'ps1': 'PowerShell',

	// 配置文件
	'json': 'JSON',
	'yaml': 'YAML',
	'yml': 'YAML',
	'toml': 'TOML',
	'xml': 'XML',
	'html': 'HTML',
	'htm': 'HTML',
	'css': 'CSS',
	'scss': 'SCSS',
	'sass': 'SASS',
	'less': 'LESS',

	// 数据库相关
	'sql': 'SQL',
	'ddl': 'SQL',
	'dml': 'SQL',

	// 构建工具
	'gradle': 'Gradle',
	'build': 'Build Script',

	// 文档
	'md': 'Markdown',
	'markdown': 'Markdown',
	'doc': 'text',
	'txt': 'text',

	// 其他
	'dockerfile': 'Dockerfile',
	'gitignore': 'Git Ignore',
	'env': 'Environment Variables'
};

export function getFileLanguage(filePath: string): string {
	const lastDotIndex = filePath.lastIndexOf('.');
	if (lastDotIndex === -1 || lastDotIndex === 0) {
		return '';
	}
	const ext = filePath.slice(lastDotIndex + 1).toLowerCase();
	if (ext in extensionToLanguageMap) {
		return extensionToLanguageMap[ext];
	}
	return '';
}

export type CodeEntity = {
	fqn: string;
	type: 'function' | 'class' | 'variable' | 'other';
	content: FileChunk;
	use: string[];
	usedBy: string[];
}

function escapePathForJsonKey(path: string): string {
  return path.replace(/\\/g, '\\\\');
}

export function codeEntityTotString(codeEntity: CodeEntity, identSize: number=0): string {
	const indent = ' '.repeat(identSize);
	let ret=  `
{
	"fqn": "${codeEntity.fqn}",
	"type": "${codeEntity.type}",
	"content": "${escapePathForJsonKey(codeEntity.content.relativePath)}: ${codeEntity.content.startLine}~${codeEntity.content.endLine}",
	"use": [${codeEntity.use.map(e => {return `"${e}"`;}).join(', ')}],
	"usedBy": [${codeEntity.usedBy.join(', ')}]
}
	`.trim();

	ret = ret.split('\n').map(e => {
		return `${indent}${e}`;
	}).join('\n');

	return ret;
}

export type Graph = {
	fileNodes: Record<string, string[]>;
	nodes: Record<string, CodeEntity>;
	fileImportNodes: Record<string, Set<string>>;
}

export function graphToString(graph: Graph): string {
	let ret= `
{
	"nodes":
	{
${Object.entries(graph.nodes).map(([fqn, codeEntity]) => {
	return `${' '.repeat(8)}"${fqn}":\n${codeEntityTotString(codeEntity, 8)}`;
}).join(',\n')}
	},
	"fileNodes": 
	{
${Object.entries(graph.fileNodes).map(([file, fqns]) => {
	return `${' '.repeat(8)}"${escapePathForJsonKey(file)}": [${fqns.map(e => {return `"${e}"`;}).join(', ')}]`;
}).join(',\n')}
	},
	"fileImportNode":
	{
${Object.entries(graph.fileImportNodes).map(([file, fqns]) => {
	return `${' '.repeat(8)}"${escapePathForJsonKey(file)}": [${[...fqns].map(e => {return `"${e}"`;}).join(', ')}]`;
}).join(',\n')}
	}
}
	`.trim();

	return `${ret}\n`;
}
