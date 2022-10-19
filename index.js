var crypto=require('crypto');

//暂未考虑 TCP 分包/粘包
function decodeDataFrame(buffer) {
  var i = 0,j,s;
  this.stream = this.stream||[];
  // 解析前两个字节的基本数据
  var frame = {
    FIN: buffer[i] >> 7, //是否最后一个包(结束帧)
    //ExtProto: (buffer[i] >> 4) & 7, //扩展协议
    Opcode: buffer[i ++] & 15,
    Mask: buffer[i] >> 7,
    PayloadLength: buffer[i ++] & 0x7F
  };
  // 处理特殊长度126和127
  if(frame.PayloadLength === 126) //2字节
    frame.PayloadLength = (buffer[i ++] << 8) + buffer[i ++];
  if(frame.PayloadLength === 127) //8字节
    i+=4, // 长度一般用四字节的整型，前四个字节通常为长整形留空的
    frame.PayloadLength = (buffer[i ++] << 24) + (buffer[i ++] << 16) + (buffer[i ++] << 8) + buffer[i ++];
  // 判断是否使用掩码
  if(frame.Mask) // 获取掩码实体
    frame.MaskKey = [buffer[i ++],buffer[i ++],buffer[i ++],buffer[i ++]];
  // 对数据和掩码做异或运算
  for(j = 0; j < frame.PayloadLength; j ++)
    this.stream.push(frame.Mask ? buffer[i+j] ^ frame.MaskKey[j%4] : buffer[i+j]);

  if(!frame.FIN) return false;
  // 设置上数据部分, 数组转换成缓冲区来使用
  frame.PayloadData = new Buffer(this.stream);
  this.stream = [];
  // 返回数据帧
  return frame;
}

function encodeDataFrame(frame){
  var head = [];
  var body;
  if(frame.PayloadData instanceof Buffer){ //Binary
    frame.Opcode = 2;
    body = frame.PayloadData;
  } else { //Others
    frame.Opcode = frame.Opcode || 1;
    body = new Buffer(frame.PayloadData);
  }
  var l = body.length;
  // 输入第一个字节
  head.push((frame.FIN << 7) + frame.Opcode);
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

// 启动服务
var Server = function() {
  this.events=[];
}

var pingInterval = {};

// 本体
var Socket = function(conn, id) {
  this.conn = conn;
  this.id = id;
  // 设置一个轮询，用于查看这个连接是不是还连着
  var that = this;
  function ping() {
  if(that.conn && that.conn.readyState=='open')
    that.conn.write(encodeDataFrame({FIN:1,Opcode:9, PayloadData: "ping"}));
  };
  ping();
  pingInterval[this.id] = setInterval(ping, 30000);
};

// 绑定事件
Server.prototype.on = function(eventName, callback) {
  this.events[eventName] = callback;
};

// 触发事件
Server.prototype.emit = function(eventName) {
  if(!this.events[eventName]) return;
  this.events[eventName].apply(null, Array.prototype.slice.call(arguments, 1));
};

// 发送 string 或者 Buffer
Socket.prototype.send = function(data) {
  // 在用户没有销毁socket对象就关闭之并且还想发送数据的时候进行提示
  if(!this.conn || !pingInterval[this.id]) {
    console.log('WebSocket Error: This socket has been ended by the other party');
    console.log('You should emit server\'s close event and delete socket object when frontend exit');
    return;
  }
  this.conn.write(encodeDataFrame({FIN:1,Opcode:1,PayloadData: data}));
};

// 主动调用close方法
Socket.prototype.close = function(reason) {
  this.conn.write(encodeDataFrame({FIN:1,Opcode:8,PayloadData: reason}));
  this.conn.end();
  clearInterval(pingInterval[this.id]);
  delete pingInterval[this.id];
  that.emit('close', this.id);
};

// 握手
function handShark(svr,sk,buffer){
  // 获取发送过来的KEY
  var head = buffer.toString();
  var key = head.match(/Sec-WebSocket-Key: (.+)/)[1];
  // 连接上这个(加盐)字符串，并做一次sha1运算，最后转换成Base64
  key = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  // 解析出socketId
  let socketId=head.match(/Cookie: (.+)/);
  if(socketId && socketId.length>1) {
    socketId = socketId[1];
    socketId=socketId.match(/socketId=(.+)(?:;)?(?: )?/)
    if(socketId && socketId.length>1)
      socketId = socketId[1];
  }
  // 输出返回给客户端的数据，这些字段都是必须的
  sk.write('HTTP/1.1 101 Switching Protocols\r\n');
  sk.write('Upgrade: websocket\r\n');
  sk.write('Connection: Upgrade\r\n');
  // 这个字段带上服务器处理后的KEY
  sk.write('Sec-WebSocket-Accept: ' + key + '\r\n');
  // 做一个cookieID
  if(!socketId){
    socketId = new Date().toISOString() + Math.random();
    sk.write('Set-Cookie: socketId=' + socketId + '\r\n');
  }
  // 输出空行，使HTTP头结束
  sk.write('\r\n');
  // 成功连接事件，创建socket
  socket = new Socket(sk, socketId);
  svr.emit('connect', socket);
  return socket;
}

// 数据处理
function parseFrame(svr,socket,buffer){
  let frame = decodeDataFrame(buffer);
  if(!frame) return;
  if(!frame) {
    console.error('WebSocket Error: Can\'t parse buffer data');
    return;
  }
  // 经过多次试验，在前端断开后均会在code为10之后立即传回8
  // 第一次ping时即返回8，则取socketId.
  if(frame.Opcode === 8) { //close
    clearInterval(pingInterval[socket.id]);
    delete pingInterval[socket.id];
    socket.conn.end();
    socket.closed=true;
    svr.emit('close', socket);
    return;
  }
  if(frame.Opcode === 10) { //pong
    //console.error("pong",socket.id);
    return
  }
  //console.log('WebSocket Recive: ',frame);
  // 接收的数据
  if(frame.Opcode == 1)
    svr.emit('text', frame.PayloadData.toString(), socket);//把缓冲区转换成字符串
  else //二进制数据
    svr.emit('data', frame.PayloadData, socket);
}

Server.prototype.start = function(port) {
  var that = this;
  require('net').createServer(function(sk){
    var socket = null;
    sk.on('data', function(buffer) {
      if(socket == null){ //握手
        socket = handShark(that,sk,buffer);
      }
      else{
        parseFrame(that,socket,buffer);
      }
    }).on('close',function(e){
      if(!socket.closed)
        socket.closed = true, that.emit('close', socket)
    });
  }).listen(port,()=>{
    console.info('WebSocket Server Running at port ' + port);
  });
}

module.exports = {
  Server : Server
}
