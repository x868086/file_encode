import { promises as fs } from 'fs';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'path';
import languageEncoding from 'detect-file-encoding-and-language'
import iconv from 'iconv-lite'
import inquirer from 'inquirer';
import chalk from 'chalk'
import ExcelJS from 'exceljs';

import csv from 'fast-csv';

import ora from 'ora';

import v8 from 'v8';
const heapStatistics = v8.getHeapStatistics();
const defaultHeapSize = (heapStatistics.heap_size_limit / 1024 / 1024).toFixed(2)

const loading = ora({
    color: 'green',
    text: 'Loading...',
    prefixText: '读取表格',
});


const fileTypeHandle = {
    'xlsx': fileSaveAsCsv2,
    'xls': fileSaveAsCsv2,
    'csv': csvMethod
}

const tableHeadReg = /([\u3002|\uff1f|\uff01|\uff0c|\u3001|\uff1b|\uff1a|\u201c|\u201d|\u2018|\u2019|\uff08|\uff09|\u300a|\u300b|\u3008|\u3009|\u3010|\u3011|\u300e|\u300f|\u300c|\u300d|\ufe43|\ufe44|\u3014|\u3015|\u2026|\u2014|\uff5e|\ufe4f|\uffe5]+)|([\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*`·+,\-.\/:;<=>?@\[\]^{|}~]+)/g
// const tableHeadReg = /([\u3002|\uff1f|\uff01|\uff0c|\u3001|\uff1b|\uff1a|\u201c|\u201d|\u2018|\u2019|\uff08|\uff09|\u300a|\u300b|\u3008|\u3009|\u3010|\u3011|\u300e|\u300f|\u300c|\u300d|\ufe43|\ufe44|\u3014|\u3015|\u2026|\u2014|\uff5e|\ufe4f|\uffe5]+)|([\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*`·+,\-.\/:;<=>?@\[\]^_{|}~]+)/g
const commaReg = /[\uff0c]+|,+/g

// 生成DDL时间戳函数
function getFormattedDateTime() {
    var date = new Date();
    var month = (date.getMonth() + 1).toString().padStart(2, '0'); // 月份从0开始，需要加1
    var day = date.getDate().toString().padStart(2, '0');
    var hours = date.getHours().toString().padStart(2, '0');
    var minutes = date.getMinutes().toString().padStart(2, '0');
    var seconds = date.getSeconds().toString().padStart(2, '0');

    var formattedDateTime = month + day + hours + minutes + seconds;
    return formattedDateTime;
}

//清洗单元格comma
function cleanComma(str, commaReg) {
    return str.replaceAll(commaReg, '')
}




// csv文件方法
async function csvMethod(choice) {
    let { fileName, souceType } = await detectEncode(choice)
    if (souceType === 'UTF-8') {
        console.log(`✔️ 当前格式为${chalk.bgGreen(souceType)}可直接导入, 文件路径-->：${path.join(process.cwd(), fileName)}`)
        return {
            codeType: souceType,
            fileName: fileName,
            outPath: path.join(process.cwd(), fileName)
        }
    } else if (souceType === 'GB18030') {
        let { outPath } = await encodeSave(fileName, souceType)
        return {
            codeType: souceType,
            fileName: fileName,
            outPath: outPath
        }
    } else {
        console.log(`❌ 不支持的文件编码格式`)
        return false
    }
}


//异步读取文件列表
async function getFileList(filePath) {
    try {
        const files = await fs.readdir(filePath)
        const excelFiles = files.filter(file => path.extname(file) === '.xlsx' || path.extname(file) === '.xls' || path.extname(file) === '.csv');
        return excelFiles
    } catch (error) {
        throw `❌   读取当前目录文件出错${error}`
    }
}

// 打印文件列表
async function diyFiles(lists) {
    const promptList = [
        {
            type: 'list',
            message: '请选择一个选项:',
            name: 'choice',
            choices: lists,
        },
    ];

    let answers = await inquirer.prompt(promptList)
    return answers.choice
}

// csv格式文件转码另存
async function encodeSave(filePath, souceType) {
    let encoded = await convertEncoding(filePath, souceType)
    let { codeType, fileName, outPath } = await writeFileStream(filePath, encoded)
    return {
        codeType: codeType,
        fileName: fileName,
        outPath: outPath
    }
}

// 文件转码
async function convertEncoding(filePath, souceType) {
    console.log(chalk.yellow(`当前格式为${souceType},正在转换成UTF-8`))
    let data = await fs.readFile(filePath, 'binary')
    const decoded = iconv.decode(data, souceType.toLowerCase());
    const encoded = iconv.encode(decoded, 'utf8');
    return encoded
}

//写入文件
async function writeFileStream(filename, data) {
    let outPath = path.join(process.cwd(), filename + '.utf8.csv')
    await fs.writeFile(filename + '.utf8.csv', data.toString(), 'utf-8');
    console.log(`✔️ 成功转码${chalk.bgGreen('UTF-8')},  文件路径-->：${outPath}`);
    return {
        codeType: 'UTF-8',
        fileName: filename,
        outPath: outPath
    }
}


//Excel文件同步读取方法 弃用
// async function fileSaveAs(filename) {
//     const workbook = XLSX.readFile(filename)
//     const csvContent = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
//     let outPath = path.join(process.cwd(), filename + '.utf8.csv')
//     await fs.writeFile(filename + '.utf8.csv', csvContent, 'utf-8');
//     console.log(`✔️ EXCEL另存为CSV,编码格式${chalk.bgGreen('UTF-8')},  文件路径-->：${outPath}`);
//     return {
//         codeType: 'UTF-8',
//         fileName: filename,
//         outPath: outPath
//     }
// }

// 常规流的方式读取表格，不适用于大型表格文件
async function fileSaveAsCsv(filename) {
    let { workbook, worksheet } = await readExcelStream(filename)

    let outPath = path.join(process.cwd(), filename + '.utf8.csv')
    const stream = createWriteStream(outPath);
    stream.on('data', chunk => {
        // 处理每个数据块
        console.log('Received', chunk.length, 'bytes of data.');
    })
    stream.on('end', () => {
        // console.log(`✔️ 读取文件结束，文件路径-->: ${filepath}`);
    })
    stream.on('error', error => {
        throw new Error(`❌ CSV文件读取文件错误${error}`)
    })
    await workbook.csv.write(stream, { sheetId: 1 });
    console.log(`✔️ EXCEL另存为CSV,编码格式${chalk.bgGreen('UTF-8')},  文件路径-->：${outPath}`);
    stream.end()
    return {
        codeType: 'UTF-8',
        fileName: filename,
        outPath: outPath
    }
}


// 流式读取表格逐行处理，另存为utf8 csv文件，适用大型表格文件
async function fileSaveAsCsv2(filename) {
    let outPath = path.join(process.cwd(), filename + '.utf8.csv')
    const writeStream = createWriteStream(outPath);
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
            loading.suffixText = `  内存使用 ${(((process.memoryUsage()).heapTotal) / 1024 / 1024).toFixed(2)} MB`
            // 只读取第一个sheet
            if (row.worksheet.id === 1) {
                // 第一轮遍历将单元格公式转换成具体的值
                var cellContent = row.values.map(e => {
                    return (e instanceof Object && e['result']) ? e['result'] : e
                })
                    //第二轮遍历去除逗号
                    .map(e => {
                        return (typeof (e) === 'string') ? cleanComma(e, commaReg) : e
                    })
                // console.log(row.number)
                // 忽略第一个列（行号）
                csvStream.write(cellContent.slice(1))
            }
        });
    });

    // workbookReader.on('end', () => {
    //     loading.succeed('表格读取完成');
    //     loading.stop()
    // });
    // workbookReader.on('error', (err) => {
    //     console.log(`✔️ 读取表格错误${err}`)
    //     loading.fail('表格读取错误')
    // });

    // 将以上方法改写为异步方法，表格读取完成后resolve，读取错误是reject错误信息
    // 整个函数使用 await fileSaveAsCsv2 进行调用以获取return {codeType: 'UTF-8',fileName: filename,outPath: outPath} 的返回值
    await new Promise((resolve, reject) => {
        workbookReader.on('end', () => {
            csvStream.end()
            loading.succeed('表格读取完成');
            loading.stop()
            resolve()
        });
        workbookReader.on('error', (err) => {
            console.log(`✔️ 读取表格错误${err}`)
            loading.fail('表格读取错误')
            reject(new Error('表格读取错误'))
        });
    })

    return {
        codeType: 'UTF-8',
        fileName: filename,
        outPath: outPath
    }

}


//检测文件编码格式
async function detectEncode(fileName) {
    const data = await fs.readFile(fileName)
    const fileInfo = await languageEncoding(data)
    let souceType = fileInfo.encoding
    let dict = {
        'UTF-8': chalk.bgGreen(`${souceType}`),
        'GB18030': chalk.bgYellow(`${souceType}`)
    }
    console.log(`文件当前编码格式:${dict[souceType]} 文件名称:${fileName}`)
    return {
        fileName,
        souceType
    }
}

// csv文件流式读取
// async function readCSVStream(filepath) {
//     const workbook = new ExcelJS.Workbook();
//     const stream = createReadStream(filepath);
//     stream.on('data', chunk => {
//         // 处理每个数据块
//         // console.log('Received', chunk.length, 'bytes of data.');
//     })
//     stream.on('end', () => {
//         // console.log(`✔️ 读取文件结束，文件路径-->: ${filepath}`);
//     })
//     stream.on('error', error => {
//         throw new Error(`❌ CSV文件读取文件错误${error}`)
//     })

//     // await workbook.xlsx.read(stream);
//     // const worksheet = workbook.getWorksheet(1);
//     const worksheet = await workbook.csv.read(stream);

//     return { workbook, worksheet }
// }

async function readCSVStream2(filepath) {
    // const workbook = new ExcelJS.Workbook();
    // const stream = createReadStream(filepath);
    // stream.on('data', chunk => {
    //     // 处理每个数据块
    //     // console.log('Received', chunk.length, 'bytes of data.');
    // })
    // stream.on('end', () => {
    //     // console.log(`✔️ 读取文件结束，文件路径-->: ${filepath}`);
    // })
    // stream.on('error', error => {
    //     throw new Error(`❌ CSV文件读取文件错误${error}`)
    // })

    // // await workbook.xlsx.read(stream);
    // // const worksheet = workbook.getWorksheet(1);
    // const worksheet = await workbook.csv.read(stream);
    // // const worksheet = await workbook.csv.readFile(filepath);
    // return { workbook, worksheet }

    const readStream = createReadStream(filepath);
    const csvStream = csv.parseStream({ headers: true });

    csvStream.on('data', (data) => {
        // 修改数据逻辑
        const modifiedData = {};
        for (const key in data) {
            modifiedData[key.toUpperCase()] = data[key];
        }

        // 处理修改后的数据，例如写入新的CSV文件或者进行其他操作
        console.log(modifiedData);
    });

    csvStream.on('end', () => {
        console.log('CSV parsing finished.');
        readStream.close();
    });

    readStream.pipe(csvStream);
}


// excel文件流式读取
async function readExcelStream(filepath) {
    const workbook = new ExcelJS.Workbook();
    const stream = createReadStream(filepath);

    stream.on('data', chunk => {
        // 处理每个数据块

        console.log('Received', chunk.length, 'bytes of data.');
    })
    stream.on('end', () => {
        // console.log(`✔️ 读取文件结束，文件路径-->: ${filepath}`);
    })
    stream.on('error', error => {
        throw new Error(`❌ EXCEL文件读取文件错误${error}`)
    })
    const worksheet = await workbook.xlsx.read(stream);
    return { workbook, worksheet }
}


async function getHeaderCol(worksheet) {
    const headers = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) {
            row.eachCell({ includeEmpty: true }, (cell) => {
                headers.push({
                    value: cell.text,
                    address: cell.address
                });
            });
        } else {
            return
        }
    });
    return { headers: headers, colLenth: worksheet.columns.length }
}

// async function cleanHeader(filePath) {
//     let { workbook, worksheet } = await readCSVStream(filePath);
//     let { headers, colLenth } = await getHeaderCol(worksheet)
//     let newHeaders = []
//     headers.forEach((e, i, a) => {
//         // step0 去除空格,step1 去除标点符号, step2数字开头修复,step3 字符长度限制
//         let step0 = e.value.replaceAll(' ', '');
//         let step1 = step0.replaceAll(tableHeadReg, '')
//         let step2 = /^(\d)/.test(step1) ? `修正${step1}` : step1
//         let step3 = step2.length > 15 ? step2.slice(0, 15) : step2
//         let str = (e.value.trim().length === 0) ? `空字段${i + 1}` : step3
//         newHeaders.push(str)
//     })
//     return { workbook, worksheet, newHeaders }
// }

async function cleanHeader2(filePath) {
    let { workbook, worksheet } = await readCSVStream2(filePath);
    let { headers, colLenth } = await getHeaderCol(worksheet)
    let newHeaders = []
    headers.forEach((e, i, a) => {
        // step0 去除空格,step1 去除标点符号, step2数字开头修复,step3 字符长度限制
        let step0 = e.value.replaceAll(' ', '');
        let step1 = step0.replaceAll(tableHeadReg, '')
        let step2 = /^(\d)/.test(step1) ? `修正${step1}` : step1
        let step3 = step2.length > 15 ? step2.slice(0, 15) : step2
        let str = (e.value.trim().length === 0) ? `空字段${i + 1}` : step3
        newHeaders.push(str)
    })
    console.log(newHeaders)
    // return { workbook, worksheet, newHeaders }
}

async function appendNewHeader(workbook, worksheet, arr, outPath) {
    try {
        const insertedRow = await worksheet.insertRow(1, arr)
        // const row1 = worksheet.getRow(1)
        // const row2 = worksheet.getRow(2)
        // const row3 = worksheet.getRow(3)
        await worksheet.spliceRows(2, 1)
        await workbook.csv.writeFile(`${outPath}`, { encoding: 'utf-8' })
        console.log(`✔️ 表头已清洗`)
        return {
            ddlHeader: arr
        }
    } catch (error) {
        console.log(`❌ 清洗表头出错,请检查表头是否有特殊字符`)
    }
}

// 创建表 DDL
async function createDDL(arr, tableName, fileName) {
    let str = '';
    arr.forEach((e, i, a) => {
        if (i === a.length - 1) {
            str += `${e} varchar(255)`
        } else {
            str += `${e} varchar(255),
            `
        }

    })
    let ddl = `
    CREATE TABLE ${tableName} 
    (
            ${str}
    );`
    // DDL写入到文本文件
    let outPath = path.join(process.cwd(), fileName + '.DDL.txt')
    //fs.writeFile(outPath, ddl, (err) => {
    //     if (err) {
    //         console.error('❌ 写入DDL文件时发生错误:', err);
    //     } else {
    //         console.log('✔️ DDL文件创建成功, DDL路径-->：${outPath}');
    //     }
    // });
    try {
        await fs.writeFile(outPath, ddl)
        console.log(`✔️ DDL文件创建成功, DDL路径-->：${outPath}`);
    } catch (error) {
        console.error(`❌ 写入DDL文件时发生错误: ${error}`);
    }

    return ddl
}


async function handleFile(filePath) {
    let files = await getFileList(filePath)
    let choice = await diyFiles(files)
    const extension = path.extname(choice)
    const extensionWithoutDot = extension.replace(/^\./, '');
    if ((/\.xlsx$|\.xls$|\.csv$/g).test(extension)) {
        // 不同类型文件调用不同方法 - table drive 
        let { codeType, fileName, outPath } = await fileTypeHandle[extensionWithoutDot](choice)
        // await fileTypeHandle[extensionWithoutDot](choice)
        //将转码utf-8后的csv文件，清洗表头，另存为同名原文件
        await cleanHeader2(outPath)

        // 延迟读取，疑似有写入未释放就开始读取了
        // await (function () {
        //     setTimeout(async function () {
        //         await cleanHeader2(outPath)
        //     }, 3000)
        // }())

        // let { workbook, worksheet, newHeaders } = await cleanHeader2(outPath)
        // let { ddlHeader } = await appendNewHeader(workbook, worksheet, newHeaders, outPath)
        // let ddl = await createDDL(ddlHeader, `IMPORT_${getFormattedDateTime()}`, fileName)
        // console.log(ddl)
    } else {
        console.log(`❌ ${chalk.green(暂不支持该文件格式)}`)
        return false
    }
}

handleFile(process.cwd()).catch(err => {
    console.log(`❌ 读取命令行发生错误：, ${err}`)
    throw err
})

// function getFileList(filePath) {
//     return fs.readdir(filePath)

// }

// getFileList(process.cwd())
//     .then(result => {
//         const excelFiles = result.filter(file => path.extname(file) === '.xlsx' || path.extname(file) === '.xls' || path.extname(file) === '.csv');
//         let chatChoices = [
//             {
//                 type: 'list',
//                 message: '请选择一个选项:',
//                 name: 'choice',
//                 choices: excelFiles,
//             },
//         ];
//         inquirer.prompt(chatChoices).then((answers) => {
//             console.log('你选择了:', answers.choice);
//         });
//     })
//     .catch(err => console.log('读取文件错误', err))


// https://www.npmjs.com/package/detect-file-encoding-and-language
// https://www.npmjs.com/package/iconv-lite
// https://www.npmjs.com/package/pkg



// 遍历文件列表
// for (const file of files) {
//     const filePath = path.join(process.cwd(), file);
//     const stats = fs.lstatSync(filePath);

//     if (filePath.endsWith('.csv')) {
//         console.log(filePath)
//         const innerStats = fs.lstatSync(filePath);
//         console.log(innerStats.isFile())

//         fs.readFile(filePath, (err, data) => {
//             if (err) {
//                 console.error('Error reading file:', err);
//             } else {
//                 languageEncoding(data).then(fileInfo => {
//                     console.log('File encoding:', fileInfo.encoding, filePath);

//                     if (fileInfo.encoding !== 'UTF-8') {
//                         convertEncoding(filePath)
//                     }
//                 }).catch(error => {
//                     console.error('Error detecting encoding:', error);
//                 });
//             }
//         });
//     }
// }

// function convertEncoding(filename) {
//     // 以二进制方式读取GB18030编码格式的csv文件
//     fs.readFile(filename, 'binary', (err, data) => {
//         if (err) throw err;

//         // 使用GB18030编码解析csv文件内容
//         const decoded = iconv.decode(data, 'gb18030');

//         // 将解析后的csv内容重新编码为UTF-8
//         const encoded = iconv.encode(decoded, 'utf8');

//         // 以UTF-8编码将csv内容写入新的文件
//         fs.writeFile(filename + '.utf8.csv', encoded.toString(), 'utf-8', (err) => {
//             if (err) throw err;
//             console.log('Conversion completed');
//         });
//     });
// }



// // 当前nodejs环境已分配的堆内存的大小
// const memoryUsage = process.memoryUsage();
// console.log('Heap memory usage:');
// console.log('Total:', `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
// console.log('Used:', `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);

// // 当前nodejs环境默认的堆内存大小，默认情况下，Node.js 进程可以使用的最大堆内存大小
// const v8 = require('v8');
// const heapStatistics = v8.getHeapStatistics();
// console.log(`Default heap size:, ${(heapStatistics.heap_size_limit/1024/1024).toFixed(2)} MB`);

// node --max-old-space-size=8192 your_script.js  增加Node.js的堆内存限制单位MB



// 要以流的方式将 Excel 文件读取为 Workbook，并将其写入 CSV 文件，您可以使用 Node.js 的流（Stream）来实现。

// 以下是一个示例代码，演示如何使用流将 Excel 文件读取为 Workbook，并将其写入 CSV 文件：

// const fs = require('fs');
// const ExcelJS = require('exceljs');
// const { createObjectCsvWriter } = require('csv-writer');

// // 创建一个可写流，用于写入 CSV 文件
// const csvStream = fs.createWriteStream('output.csv');

// // 创建一个 CSV 写入器
// const csvWriter = createObjectCsvWriter({
//   path: 'output.csv',
//   header: ['Column1', 'Column2', 'Column3'], // 替换为实际的列名
//   alwaysQuote: true, // 可选：如果需要始终引用字段值，请设置为 true
// });

// // 创建一个 Workbook 实例
// const workbook = new ExcelJS.Workbook();

// // 从流中读取 Excel 文件
// const readStream = fs.createReadStream('input.xlsx');

// // 将读取的流传递给 Workbook 的 read 方法
// workbook.xlsx.read(readStream)
//   .then(() => {
//     const worksheet = workbook.getWorksheet(1); // 选择第一个工作表

//     // 将 CSV 写入流
//     csvWriter.pipe(csvStream);

//     // 通过逐行读取 Excel 文件，并将数据写入 CSV 文件
//     worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
//       const rowData = row.values.slice(1); // 忽略第一个列（行号）

//       // 将数据写入 CSV 文件
//       csvWriter.writeRecords([rowData])
//         .then(() => {
//           console.log(`Row ${rowNumber} written to CSV`);
//         })
//         .catch((error) => {
//           console.error(`Error writing row ${rowNumber} to CSV:`, error);
//         });
//     });

//     // 结束 CSV 写入流
//     csvWriter.end();
//   })
//   .catch((error) => {
//     console.error('Error reading Excel file:', error);
//   });


//   在上述示例中，我们使用 fs.createReadStream() 方法创建一个可读流，以从文件中读取 Excel 文件。然后，我们将读取的流传递给 workbook.xlsx.read() 方法，将其读取为 Workbook。

// 接下来，我们创建一个可写流 csvStream，用于写入 CSV 文件。然后，我们使用 createObjectCsvWriter 创建一个 CSV 写入器 csvWriter。

// 在读取 Excel 文件和准备写入 CSV 文件之后，我们使用 pipe() 方法将 CSV 写入器的输出流连接到 CSV 写入流，以便将数据写入 CSV 文件。

// 最后，我们通过逐行读取 Excel 文件的方式将数据写入 CSV 文件。在写入完所有行后，我们调用 csvWriter.end() 结束 CSV 写入流。

// 请注意，您需要将示例代码中的 input.xlsx 替换为实际的 Excel 文件路径，以及根据实际的列名调整 header 数组。另外，您还可以根据需要进行错误处理和其他自定义操作。

// 这样，您就可以以流的方式将 Excel 文件读取为 Workbook，并将其写入 CSV 文件了。



// const { createReadStream, createWriteStream } = require('fs');

// const readStream = createReadStream('../largefile.txt', {
//     highWaterMark: 10000
// });

// const writeStream = createWriteStream('./copy.txt', {
//     highWaterMark: 10000
// });

// readStream.on('data', function (chunk) {
//     const result = writeStream.write(chunk);

//     if (!result) {
//         console.log("BACKPRESSURE");
//         readStream.pause();
//     }
// });

// writeStream.on('drain', () => {
//     console.log("DRAINED");
//     readStream.resume();
// });

// readStream.on('end', function () {
//     console.log("reading done");
//     writeStream.end();
// });

// writeStream.on('close', function () {
//     console.log("Writing done.");
// });





//         const batchSize = 1000;
// let currentBatch = [];

// worksheet.on('row', row => {
//     var abc = row.values.map(e => {
//         return (e instanceof Object && e['result']) ? e['result'] : e;
//     });

//     currentBatch.push(abc);

//     if (currentBatch.length >= batchSize) {
//         // 处理批次（例如，写入CSV）
//         csvStream.write(currentBatch);

//         // 为下一组行清除批次
//         currentBatch = [];
//     }
// });

// // 确保在循环后处理任何剩余的行
// worksheet.on('end', () => {
//     if (currentBatch.length > 0) {
//         // 处理剩余的行
//         csvStream.write(currentBatch);
//     }
// });


// console.log(row.worksheet)
// console.log(row.worksheet.id)
// console.log(row.worksheet.workbook.stream)
// console.log(row.worksheet._events)

// console.log(row.worksheet.workbook._events)
// console.log(row.worksheet.workbook.stream.bytesRead)
// console.log(row.worksheet.workbook.options)
// console.log(row.worksheet.workbook.sharedStrings)
// console.log(row.worksheet.workbook.properties)
// console.log(row.worksheet.workbook.workbookRels)



// 在Node.js中，os模块提供了一些与操作系统相关的实用函数和属性。这里的EOL是一个常量，它代表了当前操作系统的行尾符（End Of Line）。

// 在Windows系统上，EOL的值是 \r\n。
// 在Unix/Linux系统以及macOS上，EOL的值是 \n。
// 通过引入这个常量，你可以确保在编写跨平台代码时使用正确的换行符，而无需关心具体运行环境。例如，在写入文件或生成字符串内容时，可以这样使用：
// const { EOL } = require('os');
// const text = 'Hello' + EOL + 'World';