import * as vscode from 'vscode';
import * as path from 'path';
import * as fg from 'fast-glob';
import { workspaceFolderCount } from '../utils';

export interface FileChunk {
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

    const start = performance.now();

    if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage("请在工作区打开一个目录");
        return;
    }

    if (workspaceFolderCount() !== 1) {
        vscode.window.showErrorMessage("请在工作区只打开一个目录");
    }

    let fileCount: number = 0;
    let fileContent: string;
    let contentLen: number = 0;

    const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;

    const files = await vscode.workspace.findFiles('**/*');

    for (const fileUri of files) {
        try {
            const relativePath = path.relative(workspacePath, fileUri.fsPath);

            fileCount += 1;

            console.log(`正在处理文件: ${relativePath}`);

            fileContent = await vscode.workspace.fs.readFile(fileUri)
                .then(content => Buffer.from(content).toString('utf-8'));

            contentLen += fileContent.length;
        } catch(error) {
            vscode.window.showErrorMessage(`读取文件失败：${fileUri.fsPath}, \n${error}`);
        }
    }

    const end = performance.now();

    console.log(`文件总数为：${fileCount}`);
    console.log(`文件内容长度：${contentLen}`);
    console.log(`文件平均长度: ${contentLen / fileCount}`);

    vscode.window.showInformationMessage(`文件总数为：${fileCount}\n文件内容长度：${contentLen}`);

    console.log(`总耗时: ${end - start} ms`);

    return end - start;

}


export async function getAllFilesContentFast() {

    const start = performance.now();

    if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage("请在工作区打开一个目录");
        return;
    }

    if (workspaceFolderCount() !== 1) {
        vscode.window.showErrorMessage("请在工作区只打开一个目录");
    }

    let fileCount: number = 0;
    let fileContent: string;
    let contentLen: number = 0;

    const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;

    const files = await fg.glob('**/*', {
        absolute: true,
    });

    for (const filePath of files) {
        try {
            fileCount += 1;

            console.log(`正在处理文件: ${filePath}`);

            fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))
                .then(content => Buffer.from(content).toString('utf-8'));

            contentLen += fileContent.length;
        } catch(error) {
            vscode.window.showErrorMessage(`读取文件失败：${filePath}, \n${error}`);
        }
    }

    const end = performance.now();

    console.log(`文件总数为：${fileCount}`);
    console.log(`文件内容长度：${contentLen}`);
    console.log(`文件平均长度: ${contentLen / fileCount}`);

    vscode.window.showInformationMessage(`文件总数为：${fileCount}\n文件内容长度：${contentLen}`);

    console.log(`总耗时: ${end - start} ms`);

    return end - start;
}