import { EOL } from 'os';
import { promises as fs } from 'fs';
import { createReadStream, createWriteStream } from 'node:fs';
import csv from 'fast-csv';
// 假设你有一个超大的CSV文件路径
const inputFilePath = './demo1.csv';
const outputFilePath = './output_data.csv';
const tableHeadReg = /([\u3002|\uff1f|\uff01|\uff0c|\u3001|\uff1b|\uff1a|\u201c|\u201d|\u2018|\u2019|\uff08|\uff09|\u300a|\u300b|\u3008|\u3009|\u3010|\u3011|\u300e|\u300f|\u300c|\u300d|\ufe43|\ufe44|\u3014|\u3015|\u2026|\u2014|\uff5e|\ufe4f|\uffe5]+)|([\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*`·+,\-.\/:;<=>?@\[\]^{|}~]+)/g

// 定义新的表头
// const newHeader = ['newColumn1', 'newColumn2', 'newColumn3', ...];

// 创建可读流和可写流
const readStream = createReadStream(inputFilePath, { encoding: 'utf8' });
const writeStream = createWriteStream(outputFilePath, { encoding: 'utf8' });

let firstRow = 0
const csvWriter = csv.format({ headers: true })
    .transform(row => {
        firstRow += 1
        if (firstRow === 1) {
            return row.map((e, i, a) => {
                // return (typeof (e) === 'string') ? e.replaceAll(tableHeadReg, '') : e
                if (typeof (e) === 'string') {
                    let step0 = e.replaceAll(' ', '');
                    let step1 = step0.replaceAll(tableHeadReg, '')
                    let step2 = /^(\d)/.test(step1) ? `修正${step1}` : step1
                    let step3 = step2.length > 15 ? step2.slice(0, 15) : step2
                    let str = (e.trim().length === 0) ? `空字段${i + 1}` : step3
                    return str
                } else {
                    return `非字符串列${i}`
                }
            })
        } else {
            return row
        }
    });

csvWriter.pipe(writeStream)
csv.parseStream(readStream)
    .on('error', error => console.error(error))
    .on('data', (row) => {
        // console.log(`ROW=${JSON.stringify(row)}`)
        // console.log(row)
        csvWriter.write(row)
    })
    .on('end', rowCount => {
        console.log(`Parsed ${rowCount} rows`)
        csvWriter.end()
    });

// 处理未捕获的读取流错误
readStream.on('error', (err) => {
    console.error('Error reading file:', err);
    writeStream.end();
});

// 当写入流关闭时（即所有数据都已被写入）
writeStream.on('finish', () => {
    writeStream.end();
    console.log('Output file written successfully!');
});