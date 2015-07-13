var uuid = require('node-uuid');
var crypto=require('crypto');

var WS='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

var decodeDataFrame = function(buffer) {
  var i = 0,j,s;
  var frame = {
  // 解析前两个字节的基本数据
    FIN: buffer[i] >> 7,
    Opcode: buffer[i ++] & 15,
    Mask: buffer[i] >> 7,
    PayloadLength: buffer[i ++] & 0x7F
  };
  // 处理特殊长度126和127
  if(frame.PayloadLength === 126)
    frame.PayloadLength = (buffer[i ++] << 8) + buffer[i ++];
  if(frame.PayloadLength === 127)
    i+=4, // 长度一般用四字节的整型，前四个字节通常为长整形留空的
    frame.PayloadLength = (buffer[i ++] << 24) + (buffer[i ++] << 16) + (buffer[i ++] << 8) + buffer[i ++];
  // 判断是否使用掩码
  if(frame.Mask){
    // 获取掩码实体
    frame.MaskingKey = [buffer[i ++],buffer[i ++],buffer[i ++],buffer[i ++]];
    // 对数据和掩码做异或运算
  for(j = 0, s=[]; j < frame.PayloadLength; j ++)
    s.push(buffer[i + j] ^ frame.MaskingKey[j % 4]);
  } else {
    s = buffer.slice(i, frame.PayloadLength); // 否则直接使用数据
  }
  // 数组转换成缓冲区来使用
  s = new Buffer(s);
  // 如果有必要则把缓冲区转换成字符串来使用
  if(frame.Opcode === 1) s = s.toString();
  // 设置上数据部分
  frame.PayloadData = s;
  // 返回数据帧
  return frame;
}

var encodeDataFrame = function(data){
  var head = [];
  var body = new Buffer(data.PayloadData);
  var l = body.length;
  // 输入第一个字节
  head.push((data.FIN << 7) + data.Opcode);
  // 输入第二个字节，判断它的长度并放入相应的后续长度消息
  // 永远不使用掩码
  if(l < 126) {
    head.push(l);
  } else if(l < 0x10000) {
    head.push(126, (l & 0xFF00) >> 8,l & 0xFF);
  } else {
    head.push(
      127, 0, 0, 0, 0, // 8字节数据，前4字节一般没用留空
      (l&0xFF000000)>>24,(l&0xFF0000)>>16,(l&0xFF00)>>8,l&0xFF
    );
  }
  // 返回头部分和数据部分的合并缓冲区
  return Buffer.concat([new Buffer(head), body]);
};

// 本体
var Socket = function() {
  this.conn = null;
}

// 一个处理事件的类
function EventEmitter() {
  this.events = {};
}
// 绑定事件
EventEmitter.prototype.on = function(eventName, callback) {
  this.events[eventName] = callback;
}
// 触发事件
EventEmitter.prototype.emit = function(eventName) {
  if(!this.events[eventName]) return;
  this.events[eventName].apply(null, Array.prototype.slice.call(arguments, 1));
}

Socket.prototype = new EventEmitter();

Socket.prototype.send = function(data) {
  if(!this.conn) return;
  this.conn.write(encodeDataFrame({FIN:1,Opcode:1,PayloadData: (new Buffer(data))}));
}

Socket.prototype.start = function(port) {
  var that = this;
  require('net').createServer(function(o){
    var key;
    var socketId;
    that.conn = o;
    o.on('data', function(buffer) {
      if(!key){
        // 获取发送过来的KEY
        var head = buffer.toString();
        key = head.match(/Sec-WebSocket-Key: (.+)/)[1];
        // 连接上WS这个字符串，并做一次sha1运算，最后转换成Base64
        key = crypto.createHash('sha1').update(key + WS).digest('base64');
        // 解析出socketId
        if(socketId) socketId = head.match(/Cookie: (.+)/)[1];
        if(socketId) socketId = socketId.match(/socketId=(.+)(?:;)?(?: )?/)[1];
        // 输出返回给客户端的数据，这些字段都是必须的
        o.write('HTTP/1.1 101 Switching Protocols\r\n');
        o.write('Upgrade: websocket\r\n');
        o.write('Connection: Upgrade\r\n');
        // 这个字段带上服务器处理后的KEY
        o.write('Sec-WebSocket-Accept: ' + key + '\r\n');
        // 做一个cookieID
        if(!socketId) o.write('Set-Cookie: socketId=' + uuid.v4() + '\r\n');
        // 输出空行，使HTTP头结束
        o.write('\r\n');
      }else{
        //数据处理
        var json = decodeDataFrame(buffer);
        if(!json || json.Opcode !== 1) {
          // 结束连接
          o.write(encodeDataFrame({
            FIN: 1,
            Opcode: 8,
            PayloadData: 'some error occurs,or Opcode = 8'
          }));
          return;
        }
        data = JSON.parse(json.PayloadData);
        // bind events
        if(data.event) {
          that.emit(data.event, data.data, socketId);
        }
      };
    });
  }).listen(port);
  console.log('websocket' + 'running at port ' + port);
}

exports.init = new Socket();
