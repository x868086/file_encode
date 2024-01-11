import { promises as fs } from 'fs';
import path from 'path';
import XLSX from 'xlsx'
import languageEncoding from 'detect-file-encoding-and-language'
import iconv from 'iconv-lite'
import inquirer from 'inquirer';
import chalk from 'chalk'

const fileTypeHandle = {
    excelHandle: fileSaveAs,
    // csvHandle: 
}

const codeTypeHandle = {
    'UTF-8': readHeader,
    'GB18030': convertEncoding
}

const fileExtension = {
    detectExcel: /\.xlsx$|\.xls$/g,
    detectCsv: /\.csv$/g
}

//异步读取文件列表
async function getFileList(filePath) {
    try {
        const files = await fs.readdir(filePath)
        const excelFiles = files.filter(file => path.extname(file) === '.xlsx' || path.extname(file) === '.xls' || path.extname(file) === '.csv');
        return excelFiles
    } catch (error) {
        throw `读取当前目录文件出错${error}`
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
    console.log(`已选择文件:${answers.choice}`);
    return answers.choice
}


// 文件转换另存
async function convertEncoding(filePath, souceType) {
    let data = await fs.readFile(filePath, 'binary')
    const decoded = iconv.decode(data, souceType.toLowerCase());
    const encoded = iconv.encode(decoded, 'utf8');
    return encoded
}

//写入文件
async function writeFileStream(filename, data) {
    let outPath = path.join(process.cwd(), filename + '.utf8.csv')
    await fs.writeFile(filename + '.utf8.csv', data.toString(), 'utf-8');
    console.log(`成功转码${chalk.bgGreen('UTF-8')},文件路径-->：${outPath}`);
}


//另存文件格式
async function fileSaveAs(filename) {
    const workbook = XLSX.readFile(filename)
    const csvContent = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
    let outPath = path.join(process.cwd(), filename + '.utf8.csv')
    await fs.writeFile(filename + '.utf8.csv', csvContent, 'utf-8');
    console.log(`EXCEL另存为CSV,编码格式${chalk.bgGreen('UTF-8')} 文件路径-->：${outPath}`);
}

//检测文件编码格式
async function detectEncode(filePath) {
    const data = await fs.readFile(filePath)
    const fileInfo = await languageEncoding(data)
    let codeType = fileInfo.encoding
    let dict = {
        'UTF-8': chalk.bgGreen(`${codeType}`),
        'GB18030': chalk.bgYellow(`${codeType}`)
    }
    console.log(`文件当前编码格式:${dict[codeType]} 文件名称:${filePath}`)
    return {
        codeType,
        filePath
    }
}

function readHeader(filePath) {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const headers = [];
    for (let cell in worksheet) {
        if (cell[0] === '!') continue;
        if (cell[1] === '1') {
            headers.push(worksheet[cell].v);
        }
    }
    console.log(headers);
}



async function handleFile(filePath) {
    let files = await getFileList(filePath)
    let choice = await diyFiles(files)
    let detectExcel = /\.xlsx$|\.xls$/g
    let detectCsv = /\.csv$/g
    if (detectExcel.test(choice)) {
        await fileSaveAs(choice)
    } else if (detectCsv.test(choice)) {
        let { codeType, filePath } = await detectEncode(choice)
        if (codeType === 'UTF-8') {
            console.log(chalk.green(`当前格式为${codeType}可直接导入,是否生成DDL?`))
            readHeader(filePath)
        } else {
            console.log(chalk.yellow(`当前格式为${codeType},正在转换成UTF-8`))
            let encoded = await convertEncoding(filePath, codeType)
            await writeFileStream(filePath, encoded)
        }
    } else {
        console.log(`${chalk.green(暂不支持该文件格式)}`)
        return false
    }
}

handleFile(process.cwd()).catch(err => {
    console.log('读取命令行发生错误：', err)
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