
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
You are an experienced code comprehension expert.  
Your job is to find **all** contiguous spans of code or text in following file content that are necessary to answer a code comprehension question about the code base named \`${repoName}\`.  

—— INPUT ——
Code Comprehension Question:
<question>
${question.trim()}”
</question>

File Path:
<file-path>
“${filePath.trim()}”
</file-path>

File Content (with line numbers):
<file-content>
${fileContent.trim()}
</file-content>

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

export function getGenerateAnswerPrompt(
	question: string,
	repoName: string,
	references: {
		relativePath: string,
		content: string,
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
	return `**File Path**: ${reference.relativePath}\n\`\`\`${reference.language}\n${reference.content.trim()}\n\`\`\`\n`;
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
