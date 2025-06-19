// import * as vscode from 'vscode';
// import * as path from 'path';
import { workspaceFolderCount } from '../utils';

interface FileChunk {
    readonly filePath: string;
    readonly startLine: number;
    readonly endLine: number;
}

interface Instance {
    readonly repo: string;
    readonly question: string;
    readonly referrence: FileChunk[];
    readonly answer: string;
    readonly points: string;
}

const excludePattern = "";

/**
 * 获取工作区所有文件的内容和相对路径
 */

export async function getAllFilesContent() {
    console.log("getAllFilesContent called");
}
// export async function getAllFilesContent1() {

//     if (vscode.workspace.workspaceFolders === undefined) {
//         vscode.window.showErrorMessage("请在工作区打开一个目录");
//         return;
//     }

//     if (workspaceFolderCount() !== 1) {
//         vscode.window.showErrorMessage("请在工作区打开一个目录");
//     }

//     let fileCount: number = 0;
//     let fileContent: string;
//     let contentLen: number = 0;

//     const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;

//     const files = await vscode.workspace.findFiles('**/*');

//     for (const fileUri of files) {
//         try {
//             const relativePath = path.relative(workspacePath, fileUri.fsPath);

//             fileCount += 1;

//             fileContent = await vscode.workspace.fs.readFile(fileUri)
//                 .then(content => Buffer.from(content).toString('utf-8'));

//             contentLen += fileContent.length;
//         } catch(error) {
//             vscode.window.showErrorMessage(`读取文件失败：${fileUri.fsPath}, \n${error}`);
//         }
//     }

//     console.log(`文件总数为：${fileCount}`);
//     console.log(`文件内容长度：${contentLen}`);

//     vscode.window.showInformationMessage(`文件总数为：${fileCount}\n文件内容长度：${contentLen}`);

// }