
// 当前nodejs环境已分配的堆内存的大小
const memoryUsage = process.memoryUsage();
console.log('Heap memory usage:');
console.log('Total:', `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
console.log('Used:', `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);

// 当前nodejs环境默认的堆内存大小，默认情况下，Node.js 进程可以使用的最大堆内存大小
const v8 = require('v8');
const heapStatistics = v8.getHeapStatistics();
console.log(`Default heap size:, ${(heapStatistics.heap_size_limit / 1024 / 1024).toFixed(2)} MB`);

// 启动脚本前通过参数，增加Node.js的堆内存限制单位MB
// node --max-old-space-size=8192 your_script.js  



// 在Node.js中，os模块提供了一些与操作系统相关的实用函数和属性。这里的EOL是一个常量，它代表了当前操作系统的行尾符（End Of Line）。
// 在Windows系统上，EOL的值是 \r\n。
// 在Unix/Linux系统以及macOS上，EOL的值是 \n。
// 通过引入这个常量，你可以确保在编写跨平台代码时使用正确的换行符，而无需关心具体运行环境。例如，在写入文件或生成字符串内容时，可以这样使用：
const { EOL } = require('os');
const text = 'Hello' + EOL + 'World';