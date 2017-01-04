### 简介
为passport实现的node版的redis分片算法，目的是为了和java端分片算法根据sessionID映射相同的shard，底层基于murmurhash算法。

### 安装
```
npm install sn-shard --save
```

### 使用
```javascript
var nodeShard = require('sn-shard');
//your custom config
var shardConfig = [
    {name: 'shard1', weight: 1, server: [{port: 6379, host: '127.0.0.1'}]},
    {name: 'shard2', weight: 1, server: [{port: 6379, host: '127.0.0.1'}]},
    {name: 'shard3', weight: 1, server: [{port: 6379, host: '127.0.0.1'}]},
    {name: 'shard4', weight: 1, server: [{port: 6379, host: '127.0.0.1'}]},
];
nodeShard.init(shardConfig);
...
var shard = nodeShard.getShard(sessionID);

```

### 测试
```
npm run test
```
得到test/output.txt，可以与output_java.txt对比，查看两者映射的shard是否一致。

由于写文件是异步的，所以可能顺序不一致，需要自己写个简单的脚本测试两个文件内容是否相同。我在本地测试了10000组随机数，得到的结果和Java端一致。由于本人水平太菜，Java端代码就不放出了，如感兴趣可以豆芽找本人（13075766）索要Java代码
