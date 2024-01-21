
import path from 'path'
import languageEncoding from 'detect-file-encoding-and-language'
import { createReadStream, createWriteStream, unlink } from 'node:fs';
import chalk from 'chalk'

import iconv from 'iconv-lite'

import ora from 'ora';

const loading = ora({
    color: 'green',
    text: 'Loading...',
    prefixText: '文件编码',
});


//检测文件编码格式
async function detectEncode(fileName) {
    try {
        let filePath = path.join(process.cwd(), fileName)
        const fileInfo = await languageEncoding(filePath)
        let souceType = fileInfo.encoding
        console.log(souceType)
        let dict = {
            'UTF-8': chalk.bgGreen(`${souceType}`),
            'GB18030': chalk.bgYellow(`${souceType}`)
        }
        console.log(`文件当前编码格式:${dict[souceType]} 文件名称:${fileName}`)
        return {
            fileName,
            souceType
        }
    } catch (error) {
        throw new Error(`检测文件编码格式错误, ${error}`)
    }

}



// csv格式文件转码另存
async function encodeSave(fileName, souceType) {
    try {
        console.log(chalk.yellow(`当前格式为${souceType},正在转换成UTF-8`))
        let outPath = path.join(process.cwd(), `${fileName}.temp.csv`);
        const readStream = createReadStream(fileName);
        const writeStream = createWriteStream(outPath);

        readStream.on('data', e => {
            loading.text = 'Loading...'
            loading.start()
        })

        readStream
            .pipe(iconv.decodeStream(souceType.toLowerCase()))
            .pipe(iconv.encodeStream('utf8'))
            .pipe(writeStream);

        // writeStream.on('finish', () => {
        //     loading.succeed(`文件成功编码为${chalk.bgGreen('UTF-8')}`);
        //     loading.stop()
        // })

        await new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                loading.succeed(`文件成功编码为${chalk.bgGreen('UTF-8')}`);
                loading.stop()
                resolve()
            })
            writeStream.on('error', (err) => {
                reject(new Error('文件编码错误'))
            })
        })
        return {
            codeType: 'UTF-8',
            fileName: fileName,
            outPath: outPath
        }
    } catch (error) {
        throw new Error(`CSV文件编码另存错误, ${error}`)
    }

}





async function csvMethod(choice) {
    try {
        let { fileName, souceType } = await detectEncode(choice)
        if (souceType === 'UTF-8') {
            return {
                codeType: souceType,
                fileName: fileName,
                outPath: path.join(process.cwd(), fileName)
            }
        } else if (souceType === 'GB18030') {
            let { codeType, outPath } = await encodeSave(fileName, souceType)
            return {
                codeType: codeType,
                fileName: fileName,
                outPath: outPath
            }
        } else {
            console.log(`❌ 不支持的文件编码格式`)
            return false
        }
    } catch (error) {
        throw new Error(`处理CSV文件错误, ${error}`)
    }

}

// csvMethod(`demo1.csv`)

// encodeSave('demo3.csv', 'GB18030')

export {
    csvMethod
}