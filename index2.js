const fs = require('fs');
const Papa = require('papaparse');

// 假设你有一个超大的CSV文件路径
const inputFilePath = './data.csv';
const outputFilePath = './output_data.csv';

// 定义新的表头
const newHeader = ['newColumn1', 'newColumn2', 'newColumn3', ...];

// 创建可读流
const readStream = fs.createReadStream(inputFilePath);

// 创建一个可写流
const writeStream = fs.createWriteStream(outputFilePath);

// 使用PapaParse的解析器处理流
Papa.parse(readStream, {
    header: true, // 表明输入文件有表头
    delimiter: ',', // CSV的分隔符，根据实际情况调整
    worker: true, // 使用Web Worker进行异步解析以处理大文件
    step: (results, parser) => {
        // 在每次解析一行时触发
        if (results.meta.row === 0) {
            // 对于第一行（即表头），替换为新的表头并写入输出文件
            const newLine = newHeader.join(',') + '\n';
            writeStream.write(newLine);
        } else {
            // 对于其他行，按照原格式写入输出文件
            writeStream.write(results.data.join(',') + '\n');

            // 在这里进行表头的修改
            // 例如：row.data.newHeader = 'New Value';

            // 将处理后的行写入输出流
            // writeStream.write(Papa.unparse([row.data]) + '\r\n');
        }
    },
    complete: () => {
        // 解析完成后关闭写入流
        writeStream.end();
        console.log('CSV processing completed.');
    },
    error: (error) => {
        console.error('Error occurred:', error);
    },
});

// 处理未捕获的错误
readStream.on('error', (err) => {
    console.error('Error reading file:', err);
    writeStream.end();
});