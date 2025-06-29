console.log('在子进程中：子进程启动');

const fs = require('fs');
const path = require('path');

// 定义要写入的文件内容
const content = '这是要写入文件的内容';

// 构建新文件路径（在当前目录下创建 newFile.txt）
const filePath = path.join(__dirname, 'newFile.txt');

// 同步写入
try {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`文件已成功写入到: ${filePath}`);
} catch (err) {
  console.error('写入文件时出错:', err);
}


process.on('message', (message: { type: string; data: any }) => {
  console.log(`子进程收到消息: ${JSON.stringify(message)}`);
  
  if (message.type === 'greeting') {
    // 回复主进程
    process.send!({
      type: 'request',
      data: '子进程需要一些数据'
    });
  }
  
  if (message.type === 'response') {
    console.log('子进程收到响应:', message.data);
  }
});

// 模拟工作
setInterval(() => {
  process.send!({
    type: 'heartbeat',
    data: { timestamp: Date.now(), memoryUsage: process.memoryUsage() }
  });
}, 3000);