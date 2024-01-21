// 文件操作

//获取文件扩展名
path.extname(file)

// 遍历文件列表
for (const file of files) {
    const filePath = path.join(process.cwd(), file);
    const stats = fs.lstatSync(filePath);

    if (filePath.endsWith('.csv')) {
        console.log(filePath)
        const innerStats = fs.lstatSync(filePath);
        console.log(innerStats.isFile())

        fs.readFile(filePath, (err, data) => {
            if (err) {
                console.error('Error reading file:', err);
            } else {
                languageEncoding(data).then(fileInfo => {
                    console.log('File encoding:', fileInfo.encoding, filePath);

                    if (fileInfo.encoding !== 'UTF-8') {
                        convertEncoding(filePath)
                    }
                }).catch(error => {
                    console.error('Error detecting encoding:', error);
                });
            }
        });
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

getFileList(process.cwd())
    .then(result => {
        const excelFiles = result.filter(file => path.extname(file) === '.xlsx' || path.extname(file) === '.xls' || path.extname(file) === '.csv');
        let chatChoices = [
            {
                type: 'list',
                message: '请选择一个选项:',
                name: 'choice',
                choices: excelFiles,
            },
        ];
        inquirer.prompt(chatChoices).then((answers) => {
            console.log('你选择了:', answers.choice);
        });
    })
    .catch(err => console.log('读取文件错误', err))


//写入文件
async function writeFile(filename, data) {
    let outPath = path.join(process.cwd(), filename + '.utf8.csv')
    await fs.writeFile(filename + '.utf8.csv', data.toString(), 'utf-8');
    console.log(`✔️ 成功转码${chalk.bgGreen('UTF-8')},  文件路径-->：${outPath}`);
    return {
        codeType: 'UTF-8',
        fileName: filename,
        outPath: outPath
    }
}

// 命令行打印文件列表
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

// exceljs库，以流的方式读取表格，不适用于大型表格文件
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

//exceljs库，以流的方式写入表格，不适用于大型表格文件
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
// exceljs流式读取excel文件，然后使用fast-csv库写入csv文件，关闭数据流的顺序建议如下，有待验证合适关闭writeStream.end()方法：
// 1.创建写入流：    const writeStream = createWriteStream(tempFilePath);
// 2.创建csv写入流,与ExcelJS的写入流pipe
//const csvStream = csv.format({ headers: true })
//csvStream.pipe(writeStream)
// 3.exceljs库创建流式读取excel
// const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filename, options);
// workbookReader.read();
// 4.workbookReader worksheet事件中的row事件中，遍历每个row,然后使用csvStream写入row的数据 csvStream.write(cellContent.slice(1))
// 5.workbookReader.end()中调用csvStream.end()，触发csvStream的end事件，在csvStream.end()事件中调用writeStream.end()
//

// https://github.com/fast-csv/fast-csv
// exceljs库，通过以上流的方式读取excel时，worksheet事件中row事件可以获取到的变量如下
// console.log(row.worksheet)
// console.log(row.worksheet.id)
// console.log(row.worksheet._events)
// console.log(row.worksheet.workbook._events)
// console.log(row.worksheet.workbook.stream)
// console.log(row.worksheet.workbook.stream.bytesRead)
// console.log(row.worksheet.workbook.options)
// console.log(row.worksheet.workbook.sharedStrings)
// console.log(row.worksheet.workbook.properties)
// console.log(row.worksheet.workbook.workbookRels)


// exceljs库获取表格表头
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

// exceljs库写入新表头
async function appendNewHeader(workbook, worksheet, arr, outPath) {
    try {
        const insertedRow = await worksheet.insertRow(1, arr)
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