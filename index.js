import { promises as fs } from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk'

import {
    fileSaveAsCsv,
    renameHeader
} from './excel-methods.js'

import { csvMethod } from './csv-methods.js'


const fileTypeHandle = {
    'xlsx': fileSaveAsCsv,
    'xls': fileSaveAsCsv,
    'csv': csvMethod
}


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
    let ddlPath = path.join(process.cwd(), fileName + '.DDL.txt')
    try {
        await fs.writeFile(ddlPath, ddl)
    } catch (error) {
        console.error(`❌ 写入DDL文件时发生错误: ${error}`);
    }

    return { ddl, ddlPath }
}


async function handleFile(filePath) {
    let files = await getFileList(filePath)
    let choice = await diyFiles(files)
    // debug flag
    // let choice = '2024年1月以移带固.xlsx'
    // let choice = '67890.xlsx'
    // let choice = 'demo3.csv'
    const extension = path.extname(choice)
    const extensionWithoutDot = extension.replace(/^\./, '');
    if ((/\.xlsx$|\.xls$|\.csv$/g).test(extension)) {
        // 不同类型文件调用不同方法 - table drive 
        let { codeType, fileName, outPath } = await fileTypeHandle[extensionWithoutDot](choice)
        let { ddlHeader } = await renameHeader(outPath, fileName)
        let { ddl, ddlPath } = await createDDL(ddlHeader, `IMPORT_${getFormattedDateTime()}`, fileName)
        // console.log(ddl)
        console.log(`
✔️ DDL文件创建成功, DDL路径-->: ${ddlPath}`)
    } else {
        console.log(`❌ ${chalk.green(暂不支持该文件格式)}`)
        return false
    }
}

handleFile(process.cwd()).catch(err => {
    console.log(`❌ 读取命令行发生错误：, ${err}`)
    throw err
})