
export enum Language {
    JavaScript = 'JavaScript',
    TypeScript = 'TypeScript',
    Python = 'Python',
    Java = 'Java',
    CSharp = 'C#',
    Cpp = 'C++',
    Go = 'Go',
    C = 'C',
    Rust = 'Rust',
}

export interface CodeChunk {
    type: 'class' | 'interface' | 'function' | 'variable' | 'enum' | 'struct' | 'method';
    name: string;
    filePath: string;
    startLine: number;
    endLine: number;
    language: Language;
    code: string;
}

export interface CodeParser {
    language: Language;
    extensions: string[];
    parse(filePath: string): Promise<CodeChunk[]>;
}