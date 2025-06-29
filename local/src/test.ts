import Parser = require('tree-sitter');
import Python = require('tree-sitter-python');

async function analyzePythonCode(sourceCode: string) {
    try {
        
     // 初始化解析器
    const parser = new Parser();
    parser.setLanguage(Python as unknown as Parser.Language);

    // 解析代码
    const tree = parser.parse(sourceCode);

    // 返回语法树
        
    // 打印语法树的根节点
    console.log('语法树根节点:', tree.rootNode.toString());
    
    // 遍历函数定义
    console.log('\n函数定义:');
    walkTree(tree.rootNode, (node) => {
      if (node.type === 'function_definition') {
        const functionName = node.childForFieldName('name')?.text || '匿名函数';
        console.log(`- ${functionName} (行 ${node.startPosition.row + 1})`);
      }
    });
    
    // 遍历类定义
    console.log('\n类定义:');
    walkTree(tree.rootNode, (node) => {
      if (node.type === 'class_definition') {
        const className = node.childForFieldName('name')?.text || '匿名类';
        console.log(`- ${className} (行 ${node.startPosition.row + 1})`);
      }
    });
    
    // 返回语法树
    return tree;
  } catch (error) {
    console.error('解析PythonCode出错:', error);
    throw error;
  }
}

// 递归遍历语法树的辅助函数
function walkTree(node: Parser.SyntaxNode, callback: (node: Parser.SyntaxNode) => void) {
  callback(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkTree(child, callback);
    }
  }
}

// 示例用法
async function main() {
  // 示例Python代码
  const exampleCode = `
def greet(name):
    """打招呼的函数"""
    print(f"Hello, {name}!")

class Person:
    def __init__(self, name):
        self.name = name
    
    def say_hello(self):
        greet(self.name)

if __name__ == "__main__":
    person = Person("Alice")
    person.say_hello()
  `;
  
  // 解析示例代码
  console.log('==== 解析示例代码 ====');
  const exampleTree = await analyzePythonCode(exampleCode);
  console.log('示例代码语法树:', exampleTree.rootNode.toString());
}

main().catch(console.error);