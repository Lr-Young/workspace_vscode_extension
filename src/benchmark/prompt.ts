
export function getExtractRelevantFileSnippetPrompt(
	question: string,
	filePath: string,
	fileContent: string,
	repoName: string,
): string {
	const lines = fileContent.split('\n');
	const numberedLines = lines.map((line, index) => {
		return `${index + 1}: ${line}`;
	});
	fileContent = numberedLines.join('\n');
	return `
You are a code comprehension assistant.  
Your job is to find **all** contiguous spans of code or text in a single file that are necessary to answer a given question about the code base named \`${repoName}\`.  

—— INPUT ——
Question:
${question.trim()}”

File path:
“${filePath.trim()}”

File content (with line numbers):
${fileContent.trim()}

—— INSTRUCTIONS ——
1. Read the **Question** carefully; identify its key target(s) (e.g. function, variable, module identifiers etc.).  
2. Think step by step to scan the **File content** and locate every contiguous block of lines that contains information **relevant** to answering the question.  
   - **Include** definitions, calls, comments, documentation, configuration or any code that helps answer the question.  
   - **Exclude** unrelated code that is not helpful to answer the question.  
3. For each relevant block, record the **smallest** start and end line numbers that still capture the full context.  
4. If the file contains **no relevant information**, return an empty list.  
5. Ouput your chain of thought process and explanation first, then return your answer **exactly** as a JSON array of objects, each with \`start\` and \`end\` fields.

—— OUTPUT FORMAT ——
[Analysis]
<Your chain-of-thought goes here.>

[Answer]
<Here goes the JSON array.>

### Example
[Analysis]  
I see that \`functionA\` is declared on lines 12-17 and its comment above on lines 10-11 explains its purpose. I also see that \`functionA\` is called on lines 35 in \`functionB\` definition on line 30-45. There are two other function definitions in this file, but they are not relevant to the question.

[Answer]
[
  { "start": 10, "end": 17 },
  { "start": 30, "end": 45 }
]
`.trim();
}

export function getGenerateAnswerPrompt() {
	return `
You are a code comprehension assistant. You are working with a codebase named <repo>. You are required to answer a codebase comprehension question based on the provided relevant context from the codebase.

You are given:
- A developer question that requires understanding specific parts of the codebase.
- A list of code snippets that are relevant to answering the question.

—— INPUT ——
Developer question:
{{QUESTION}}

Relevant code snippets from the codebase:
- <{{path1}}, {{start1}}, {{end1}}>
- <{{path2}}, {{start2}}, {{end2}}>
...

—— TASK ——
1. Based on the information from the above relevant code snippets, write a clear and detailed answer to the developer's question.Avoid hallucination.
2. You must synthesize the information across all the above relevant code snippets, analyzing how they relate to one another. Avoid treating each snippet in isolation.
3. Your response should be well-structured and logically organized. If you need to explain code logic, use clear and accessible language while ensuring technical accuracy.

—— RESPONSE FORMAT ——
Answer:
<your answer here>
`.trim();
}
