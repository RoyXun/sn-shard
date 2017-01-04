var fs = require('fs');
var path = require('path');
var nodeShard = require('../src/index');

var inputFile = path.resolve(__dirname, './input.txt');
var outputFile = path.resolve(__dirname, './output.txt');

//先清空文件
fs.writeFileSync(outputFile, '');

var shardConfig = [];

//生产一般32组shard
for (var i = 1; i < 33; i++) {
    shardConfig.push({
        name: 'shard' + i,
        weight: 1,
        servers: 'h' + i
    });
}

nodeShard.init(shardConfig);

//test
fs.readFile(inputFile, 'utf-8', function (err, data) {
    if (err) throw err;

    var authIds = data.trim().split('\r\n');
    var writeContent = [];
    authIds.forEach(function (authId, i) {
        var shard = nodeShard.getShard(authId);
        var content = authId + '\t' + shard.name + '\r\n';
        writeContent.push(content);
    });
    console.log('sn-shard package is likely to be installed correctly if you see this log.');
    fs.appendFile(outputFile, writeContent.join(''));
});