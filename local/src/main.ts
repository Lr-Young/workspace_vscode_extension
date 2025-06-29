import { fork, ChildProcess } from 'child_process';
import path from 'path';

import Parser = require('tree-sitter');
import Python = require('tree-sitter-python');

const parser = new Parser();
parser.setLanguage(Python as unknown as Parser.Language);


// 创建子进程
const child: ChildProcess = fork(path.join(__dirname, 'child.js'));

// 监听子进程消息
child.on('message', (message: { type: string; data: any }) => {
  console.log(`主进程收到消息: ${JSON.stringify(message)}`);
  
  if (message.type === 'request') {
    // 回复子进程
    child.send({
      type: 'response',
      data: '这是主进程的回复'
    });
  }
});

// 向子进程发送消息
child.send({ 
  type: 'greeting', 
  data: '你好，子进程！' 
});

// 错误处理
child.on('error', (err) => {
  console.error('子进程错误:', err);
});

// 子进程退出
child.on('exit', (code) => {
  console.log(`子进程退出，代码 ${code}`);
});