var murmurHash = require('murmurhash-native').murmurHash64x64;
var Decimal = require('decimal.js');
//反码映射
var hexBinMap = {
    0: '1111',
    1: '1110',
    2: '1101',
    3: '1100',
    4: '1011',
    5: '1010',
    6: '1001',
    7: '1000',
    8: '0111',
    9: '0110',
    a: '0101',
    b: '0100',
    c: '0011',
    d: '0010',
    e: '0001',
    f: '0000',
    A: '0101',
    B: '0100',
    C: '0011',
    D: '0010',
    E: '0001',
    F: '0000'
};

var hashNodes = [];
var shards = [];

/**
 * 传入需要哈希的字符串，得到和Java端一致的十进制有符号字符串。
 * Java端得到的哈希值是long类型，超出js能表示范围，虽然这里使用的murmurhash-native和Java端是同一套算法，
 * 得到的结果数值上和Java端一致，但是结果是十六进制的，这边利用decimal.js处理大数之间的进制转换；
 * decimal.js貌似把所有数当无符号数处理，所以这边需要先判断符号，负数先求得二进制反码再传给decimal.js处理。
 * 
 * @param {string} str - 需要哈希处理的字符串
 * @return {string} - 十进制有符号字符串
 */
function hash(str) {
    var hexStr = murmurHash(str, 0x1234ABCD);
    //根据十六进制字符串首位是否大于7判断正负号
    if (parseInt(hexStr[0], 16) > 7) {
        var bins = ['0b'];
        var len = hexStr.length;
        for (var i = 0; i < len; i++) {
            bins.push(hexBinMap[hexStr[i]]);
        }
        var decStr = new Decimal(bins.join('')).plus(1).toString();
        return '-' + decStr;
    } else {
        return new Decimal('0x' + hexStr).toString();
    }
}

/**
 * @param {array} shardConfig - redis shard配置
 */
function init(shardConfig) {
    if (shards.length) return;

    shards = shardConfig;
    shards.forEach(function(shard, i) {
        var n, hashKey;
        if (!shard.name) {
            for (n = 0; n < 160 * shard.weight; n++) {
                hashKey = hash('SHARD-' + i + '-NODE-' + n);
                hashNodes.push(generateNode(hashKey, i));
            }
        } else {
            for (n = 0; n < 160 * shard.weight; n++) {
                hashKey = hash(shard.name + '*' + shard.weight + n);
                hashNodes.push(generateNode(hashKey, i));
            }
        }
    });
    //排序
    hashNodes.sort(compare);
}

/**
 * 生成自定义哈希节点
 * @param {string} hashKey - 哈希字符串
 * @param {number} shardIndex - shard索引
 * @return {object} -自定义节点，定义这么多字段主要为了方便比较大数字符串（超出js表达范围）大小
 */
function generateNode(hashKey, shardIndex) {
    var node;

    if (hashKey.length >= 10) {
        var high = parseInt(hashKey.slice(0, -8));//高位
        var low = parseInt(hashKey.slice(-8)); //低位
        var isPositive = high > 0;

        node = {
            isPositive: isPositive,
            high: Math.abs(high),
            low: low,
            hashKey: hashKey,
            shardIndex: shardIndex
        };
    } else {
        node = {
            isPositive: hashKey > 0,
            high: 0,
            low: Math.abs(hashKey),
            hashKey: hashKey,
            shardIndex:shardIndex
        }
    }

    return node;
}

/**
 * 比较函数
 * node1排node2前面，返回负数；node1排node2后面，返回正数；相等返回0
 * @param {object} node1 - 自定义哈希节点
 * @param {object} node2 - 同上
 */
function compare(node1, node2) {
    //先根据正负号判断大小
    if (node1.isPositive < node2.isPositive) {
        return -1;
    } else if (node1.isPositive > node2.isPositive) {
        return 1;
    }

    //正负号相同，再根据高位判断大小
    var sign = node1.isPositive && 1 || -1;
    if (node1.high < node2.high) {
        return sign * -1;
    } else if (node1.high > node2.high) {
        return sign;
    } else {//高位相同，再判断低位
        return sign * (node1.low - node2.low);
    }
}


/**
 * 查找hashKey不小于node的节点中最小节点的下标
 * @param {object} node - 需要查找的节点
 * @param {array} hashNodes - 从小到大排好序的所有节点
 * @param {number} start - 开始下标
 * @param {number} end - 结束下标
 * @return {number} - 返回满足条件的节点的下标或-1
 */
function findClosestIndex(node, hashNodes, start, end) {
    if (start == end) return -1;
    if (end - start == 1) {
        var startNode = hashNodes[start];
        var endNode = hashNodes[end];
        if (compare(startNode, node) >= 0) {
            return start;
        } else if (compare(endNode, node) >= 0) {
            return end;
        } else {
            return -1;
        }
    }

    var mid = Math.floor((start + end) / 2);
    var midNode = hashNodes[mid];

    if (node.hashKey == midNode.hashKey) {
        return mid;
    } else if (compare(node, midNode) > 0) {
        return findClosestIndex(node, hashNodes, mid, end);
    } else {
        return findClosestIndex(node, hashNodes, start, mid);
    }

}

/**
 * 根据sessionId查找目标shard
 * 在所有节点中查找hashkey不小于当前sessionIdentifier经过murmurhash得到的哈希值的节点，如果所有节点都小于该哈希值，则返回第一个节点对应的shard
 * @param {string} sessionIdentifier - sessioinId
 * @return {object} - shard配置
 */
function getShard(sessionIdentifier) {
    if (!hashNodes.length) {
        throw new Error('You have not initialized shardConfig yet!');
    }
    var hashKey = hash(sessionIdentifier);
    var index = findClosestIndex(generateNode(hashKey), hashNodes, 0, hashNodes.length - 1);
    var node = index == -1 ? hashNodes[0] : hashNodes[index];

    return shards[node.shardIndex];
}

exports.init = init;
exports.getShard = getShard;
