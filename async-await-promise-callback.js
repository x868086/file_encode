// 异步函数起始运行
handleFile(process.cwd()).catch(err => {
    console.log(`❌ 读取命令行发生错误：, ${err}`)
    throw err
})