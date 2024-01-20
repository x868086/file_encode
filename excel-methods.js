
import path from 'path';
import { createReadStream, createWriteStream, unlink } from 'node:fs';
import csv from 'fast-csv';
import ExcelJS from 'exceljs';
import { tableHeadReg, commaReg, cleanComma } from './config-regex.js'
import ora from 'ora';

import v8 from 'v8';
const heapStatistics = v8.getHeapStatistics();
const defaultHeapSize = (heapStatistics.heap_size_limit / 1024 / 1024).toFixed(2)

const loading = ora({
    color: 'green',
    text: 'Loading...',
    prefixText: '解析表格',
});


async function fileSaveAsCsv(filename) {
    // let outPath = path.join(process.cwd(), filename + '.utf8.csv')
    let tempFilePath = path.join(process.cwd(), 'temp.utf8.csv')
    const writeStream = createWriteStream(tempFilePath);
    // 创建csv写入流,与ExcelJS的写入流pipe
    const csvStream = csv.format({ headers: true })
    csvStream.pipe(writeStream)
    const options = {
        sharedStrings: 'cache',
        hyperlinks: 'emit',
        worksheets: 'emit',
    };
    const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filename, options);
    workbookReader.read();

    workbookReader.on('worksheet', worksheet => {
        loading.text = 'Loading...'
        loading.start()
        worksheet.on('row', row => {
            loading.suffixText = `  MemoryUsed ${(((process.memoryUsage()).heapTotal) / 1024 / 1024).toFixed(2)} MB   TotalMemory ${defaultHeapSize} MB`
            // 只读取第一个sheet
            if (row.worksheet.id === 1) {
                // 第一轮遍历将单元格公式转换成具体的值
                var cellContent = row.values.map(e => {
                    return (e instanceof Object && e['result']) ? e['result'] : e
                })
                    //第二轮遍历去除逗号,避免转换csv文件中的逗号出错
                    .map(e => {
                        return (typeof (e) === 'string') ? cleanComma(e, commaReg) : e
                    })
                // console.log(row.number)
                // 逐行读取表格，并写入到csvStream中，忽略第一个列（行号）,exceljs库读取时每行第一个单元格是空
                csvStream.write(cellContent.slice(1))
            } else {
                return
            }
        });
    });

    workbookReader.on('end', () => {
        // 所有表格读取完成后，调用写入.end()方法
        csvStream.end()
        loading.succeed('临时表格创建完成');
        loading.stop()
    });
    workbookReader.on('error', (err) => {
        console.log(`❌ 解析表格错误${err}`)
        loading.fail('解析表格错误')
    });

    await new Promise((resolve, reject) => {
        csvStream.on('end', () => {
            // csvStream.end()方法触发writeStream.end()
            writeStream.end()
            resolve('WTF!!!!!')
        })
        csvStream.on('error', () => {
            reject(new Error('临时表格创建错误'))
        })
    })

    return {
        codeType: 'UTF-8',
        fileName: filename,
        outPath: tempFilePath
    }

}

async function renameHeader(tempFilePath, fileName) {
    const inputFilePath = tempFilePath;
    const outputFilePath = path.join(process.cwd(), fileName + '.utf8.csv');

    // 创建可读流和可写流
    const readStream = createReadStream(inputFilePath, { encoding: 'utf8' });
    const writeStream = createWriteStream(outputFilePath, { encoding: 'utf8' });

    // 处理未捕获的读取流错误
    readStream.on('error', (err) => {
        console.error(`❌   写入表格错误${err}`);
    });

    // 当写入流关闭时（即所有数据都已被写入）
    writeStream.on('finish', () => {
        // 删除当前目录下inputFilePath文件
        unlink(inputFilePath, (err) => {
            if (err) {
                console.error(`❌   删除文件错误${err}`);
            }
        });
        // console.log('Output file written successfully!');
    });


    let firstRow = 0
    let ddlHeader = []
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
                        ddlHeader.push(str)
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

    csvWriter.on('end', () => {
        writeStream.end()
        loading.suffixText = ``
        loading.succeed(`表格写入完成, 导入文件路径-->: ${outputFilePath}`);
        loading.stop()
    })
    await new Promise((resolve, reject) => {
        csv.parseStream(readStream)
            .on('error', error => {
                console.log(`❌ 写入表格错误${error}`)
                reject(new Error('重写表格错误'))
            })
            .on('data', (row) => {
                loading.prefixText = '重建表格'
                loading.text = 'Loading...'
                loading.start()
                loading.suffixText = `  MemoryUsed ${(((process.memoryUsage()).heapTotal) / 1024 / 1024).toFixed(2)} MB   TotalMemory ${defaultHeapSize} MB`
                csvWriter.write(row)
            })
            .on('end', rowCount => {
                console.log(`
✔️ 成功写入${rowCount}行`)
                csvWriter.end()
                resolve()
            });
    })
    return {
        ddlHeader, fileName
    }
}


export {
    fileSaveAsCsv,
    renameHeader
}