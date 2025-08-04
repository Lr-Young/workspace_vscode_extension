import { escapePathForJsonKey } from './typeDefinitions';

function addLineNumber(content: string, startLine: number=0): string {
	const lines = content.split('\n');
	const numberedLines = lines.map((line, index) => {
		return `${startLine + index + 1}: ${line}`;
	});
	return numberedLines.join('\n');
}

export function getExtractRelevantFileSnippetPrompt(
	question: string,
	relativePathWithRepoName: string,
	fileContent: string,
	repoName: string,
	dependentCode: {
		relativePathWithRepoName: string,
		fileContent: string,
		startLine: number, 
	}[],
): string {
	return `
You are an experienced code comprehension expert.   
Your job is to find **all** contiguous spans of code or text in the main file or its directly imported dependent code files(may not exist) that are necessary to answer a code comprehension question about the code base named \`${repoName}\`. 

—— INPUT ——
Code Comprehension Question:
<question>
${question}
</question>

File Path:
<file-path>
${escapePathForJsonKey(relativePathWithRepoName)}
</file-path>

File Content (with line numbers):
<file-content>
${addLineNumber(fileContent)}
</file-content>

Dependent File Content (with line numbers):
${ dependentCode.length === 0 ? 'No dependent file' :
dependentCode.map(d => {
	return `
File: <file-path>${escapePathForJsonKey(d.relativePathWithRepoName)}</file-path>
<file-content>
${addLineNumber(d.fileContent, d.startLine)}
</file-content>
`.trim();
}).join('\n')}

—— INSTRUCTIONS ——
1. Read the **Question** carefully and identify its key targets (e.g., function names, variable names, module names, etc.).  
2. Scan the **File Content** and all provided **Dependent File Content** snippets to locate every contiguous block of lines that contain information relevant to answering the question.  
   - **Include** definitions, calls, comments, documentation, configuration, or any code necessary for context.  
   - **Exclude** any unrelated code.  
   - **Assume** that each dependent file snippet contains all relevant lines needed (they may be truncated to relevant portions).  
   - **Do not** search beyond the provided snippets (only consider the main file and its direct imports as given).  
3. For each relevant block, record the **smallest** start and end line numbers in the **specific file** that capture the full context.  
4. If no relevant information is found in any of the provided files, return an empty list.  
5. Output your chain-of-thought reasoning first, then return the answer **exactly** as a JSON array of objects, each with \`filename\`, \`start\`, and \`end\` fields.

—— OUTPUT FORMAT ——
[Analysis]
<Your reasoning about identifying relevant code spans across files.>

[Answer]
[
  { "filename": "<file-name>", "start": <line>, "end": <line> },
  ...
]

### Example
[Analysis]  
In \`main.py\`, I see that \`funcA\` is imported on lines 1-2 and called on lines 5-6. In \`a.py\`, \`funcA\` is defined on lines 1-2. In \`dir/b.py\`, \`funcB\` is defined on lines 4-5. The question is about functions \`funcA\` and \`funcB\`, so I include their definitions and calls.  
[Answer]
[
  { "filename": "main.py", "start": 1, "end": 6 },
  { "filename": "a.py",    "start": 1, "end": 2 },
  { "filename": "dir/b.py","start": 4, "end": 5 }
]

`.trim();
}

export function getGenerateAnswerPrompt(
	question: string,
	repoName: string,
	references: {
		relativePathWithRepoName: string,
		content: string,
		startLine: number,
		language: string,
	}[],
) {
	return `
You are an experienced code comprehension expert. You are working with a codebase named ${repoName}. You are required to answer a codebase comprehension question based on the provided relevant context from the codebase.

You are given:
- A codebase comprehension question that requires understanding specific parts of the codebase.
- A list of code snippets that are relevant to answering the question.

—— INPUT ——
Codebase Comprehension Question:
<question>
${question}
</question>

Relevant Code Snippets From The Codebase:
${references.map(reference => {
	return `
**File Path**: ${reference.relativePathWithRepoName}
\`\`\`${reference.language}
${addLineNumber(reference.content, reference.startLine)}
\`\`\`
`.trim();
}).join('\n')}


—— TASK ——
1. Based on the information from the above relevant code snippets, write a clear and detailed answer to the codebase comprehension question. Avoid hallucination.
2. You must synthesize the information across all the above relevant code snippets, analyzing how they relate to one another. Avoid treating each snippet in isolation.
3. Your response should be well-structured and logically organized. If you need to explain code logic, use clear and accessible language while ensuring technical accuracy.

—— RESPONSE FORMAT ——
Answer:
<your answer here>
`.trim();
}

export function getGeneratePointsPrompt(
	question: string,
	answer: string,
) {

	return `
You are an experienced coder and technical documentation specialist.
Your job is to transform a codebase comprehension question' answer into standardized evaluation frameworks containing quantifiable scoring dimensions for automated assessment of other LLM's answer on the codebase comprehension question.

You are given:
- A codebase comprehension question.
- Standard Answer to the codebase comprehension question.

—— INPUT ——
Codebase comprehension question:
<question>
${question}
</question>
Standard answer to the codebase comprehension question:
<answer>
${answer}
</answer>

—— OUTPUT REQUIREMENTS ——
1. **Independence**: Each dimension must represent atomic technical elements
2. **Readability**: Each dimension description must be a Complete Setence, not Noun Phrase
3. **Priority**: Ordered by descending technical criticality
4. **Quantification**: Total score is strictly 10 points
5. **Verifiability**: Each dimension must map to specific standard answer content

—— Output Format ——
Evaluation Dimensions (Total: 10 points):
1. [Technical element 1 description] (x1 points): [Exact canonical answer excerpt]
2. [Technical element 2 description] (x2 points): [Exact canonical answer excerpt]
3. [Technical element 3 description] (x3 points): [Exact canonical answer excerpt](if exist)
4. [Technical element 4 description] (x4 points): [Exact canonical answer excerpt](if exist)
...
`.trim();
}
