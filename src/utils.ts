import * as vscode from 'vscode';
import * as path from 'path';

async function asyncReadFileContent(fileUri: vscode.Uri): Promise<string> {
    try {        
        // 读取文件内容（返回 Uint8Array）
        const fileData = await vscode.workspace.fs.readFile(fileUri);
        
        // 转换为字符串
        return new TextDecoder().decode(fileData);
    } catch (error) {
        vscode.window.showErrorMessage(`In asyncReadFileContent, 读取文件失败: ${error}`);
        return '';
    }
}
