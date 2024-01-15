import { promises as fs } from 'fs';
import { createReadStream } from 'node:fs';
import path from 'path';
import XLSX from 'xlsx'
import languageEncoding from 'detect-file-encoding-and-language'
import iconv from 'iconv-lite'
import inquirer from 'inquirer';
import chalk from 'chalk'
import ExcelJS from 'exceljs';

const fileTypeHandle = {
    'xlsx': fileSaveAs,
    'xls': fileSaveAs,
    'csv': csvMethod
}

const tableHeadReg = /([\u3002|\uff1f|\uff01|\uff0c|\u3001|\uff1b|\uff1a|\u201c|\u201d|\u2018|\u2019|\uff08|\uff09|\u300a|\u300b|\u3008|\u3009|\u3010|\u3011|\u300e|\u300f|\u300c|\u300d|\ufe43|\ufe44|\u3014|\u3015|\u2026|\u2014|\uff5e|\ufe4f|\uffe5]+)|([\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*`·+,\-.\/:;<=>?@\[\]^_{|}~]+)/g




// csv文件方法
async function csvMethod(choice) {
    let { fileName, souceType } = await detectEncode(choice)
    if (souceType === 'UTF-8') {
        console.log(`✔️ 当前格式为${souceType}可直接导入, 文件路径-->：${path.join(process.cwd(), fileName)}`)
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


//Excel文件方法
async function fileSaveAs(filename) {
    const workbook = XLSX.readFile(filename)
    const csvContent = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
    let outPath = path.join(process.cwd(), filename + '.utf8.csv')
    await fs.writeFile(filename + '.utf8.csv', csvContent, 'utf-8');
    console.log(`✔️ EXCEL另存为CSV,编码格式${chalk.bgGreen('UTF-8')},  文件路径-->：${outPath}`);
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


async function readExcelStream(filepath) {
    const workbook = new ExcelJS.Workbook();
    const stream = createReadStream(filepath);
    stream.on('data', chunk => {
        // 处理每个数据块
        //   console.log('Received', chunk.length, 'bytes of data.');
    })
    stream.on('end', () => {
        console.log(`✔️ 读取文件结束，文件路径为${filepath}`);
    })
    stream.on('error', error => {
        throw new Error(`读取文件错误${error}`)
    })

    // await workbook.xlsx.read(stream);
    // const worksheet = workbook.getWorksheet(1);
    const worksheet = await workbook.csv.read(stream);

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

async function cleanHeader(filePath) {
    let { workbook, worksheet } = await readExcelStream(filePath);
    let { headers, colLenth } = await getHeaderCol(worksheet)

    let newHeaders = []
    headers.forEach((e, i, a) => {
        let str = (e.value.trim().length === 0) ? `空位${i + 1}` : e.value.replaceAll(tableHeadReg, '')
        newHeaders.push(str)
    })
    return { workbook, worksheet, newHeaders }
}

async function appendNewHeader(workbook, worksheet, arr) {
    const insertedRow = await worksheet.insertRow(1, arr)
    const row1 = worksheet.getRow(1)
    const row2 = worksheet.getRow(2)
    const row3 = worksheet.getRow(3)
    await workbook.csv.writeFile(`test.csv`, { encoding: 'utf-8' })
}


async function handleFile(filePath) {
    let files = await getFileList(filePath)
    let choice = await diyFiles(files)
    const extension = path.extname(choice)
    const extensionWithoutDot = extension.replace(/^\./, '');
    if ((/\.xlsx$|\.xls$|\.csv$/g).test(extension)) {
        let { codeType, fileName, outPath } = await fileTypeHandle[extensionWithoutDot](choice)
        let { workbook, worksheet, newHeaders } = await cleanHeader(outPath)
        await appendNewHeader(workbook, worksheet, newHeaders)

    } else {
        console.log(`❌ ${chalk.green(暂不支持该文件格式)}`)
        return false
    }
}

handleFile(process.cwd()).catch(err => {
    console.log('❌ 读取命令行发生错误：', err)
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