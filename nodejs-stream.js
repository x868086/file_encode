//Node.js中使用了stream流的 .pipe() 方法，它们会自动地处理流的结束。因此，在这种情况下，不需要显式调用 writeStream.end()。
//.pipe() 方法会在源流（readStream）触发 end 事件时自动关闭目标流（writeStream）。所以，writeStream.end() 不需要手动调用。

//readStream的事件有 close,data,end,error,pause,readable,resume
//writeStream的事件有 close,drain,error,finish,pipe,unpipe,  方法有.end()


const { createReadStream, createWriteStream } = require('fs');

const readStream = createReadStream('../largefile.txt', {
    // 设置水位线
    highWaterMark: 10000
});

const writeStream = createWriteStream('./copy.txt', {
    // 设置水位线
    highWaterMark: 10000
});

readStream.on('data', function (chunk) {

    const result = writeStream.write(chunk);
    // writeStream.write(chunk) 返回 true，这意味着当前的 chunk 数据已经被成功放入缓冲区，
    //并且可以继续读取并写入更多的数据而不会阻塞，
    //如果返回 false，则意味着缓冲区已满或者由于其他原因无法立即处理更多的数据。
    if (!result) {
        console.log("BACKPRESSURE");
        // 缓冲区满时，暂停读取
        readStream.pause();
    }
});

writeStream.on('drain', () => {
    console.log("DRAINED");
    // 当内部缓冲区中的数据被操作系统成功处理并腾出空间后， 'drain' 事件就会被触发
    // drain事件触发，回复读取流数据
    readStream.resume();
});

readStream.on('end', function () {
    console.log("reading done");
    writeStream.end();
});

writeStream.on('close', function () {
    console.log("Writing done.");
});