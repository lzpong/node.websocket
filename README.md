# WebSocket Server <i>for Nodejs</i>

简单通用的 Nodejs WebSocket Server , 可以区分每个连接的 socket.  
A Node.js module for WebSocket server. Simple to use, blazing fast and thoroughly tested.


## download & install
    down from https://github.com/lzpong/node.websocket

## config & run
    
    // in your nodeserver file
    const {Server}= require("node.websocket");
    //创建服务
    var wssvr=new Server();
    //建立新连接
    wssvr.on('connect',(socket)=>{
        console.info(socket.id,'connect')
    });
    //收到文本数据
    wssvr.on('text',(data, socket)=>{
        console.info(socket.id,"Text",data);
        socket.send("recived: "+data);
        var json=JSON.parse(data);
        Worker(json);
    });
    //收到二进制数据
    wssvr.on('data',(data, socket)=>{
        console.info(socket.id,"Binary",data.length,data)
        socket.send("recived: "+data)
    });
    //连接关闭
    wssvr.on('close',(socket)=>{
        console.info(socket.id,'close')
    });

    //启动 WS 服务
    wssvr.start(8088);

## emit in frondend
    // you need creat socket object first
    socket.send(JSON.stringify({
      event: 'join',
      data: {
        room: room
      }
    }));
    socket.send(new ArrayBuffer(1234));

## all arguments & events & methods

* Server.prototype.start(port)

* Server 'connect' event, emit when connect success, create socket object in callback

* Server 'close' event, emit when a socket ended, return socketId.

* Server.prototype.on(eventName, callback);  
    eventName: 'connect','text','data','close'

* Server.prototype.emit(eventName, data);  
    eventName: 'connect','text','data','close'

* socket.id, ID in cookie,key: socketId

* Socket.prototype.send(data);  
    发送 string 或者 Buffer, 将自动识别为 文本帧 或 二进制帧;  
    如果数据不是Buffer实例,也不是string类型对象, 将自动转换为 json-string.  
    socket.send("text string");  
    socket.send(new Buffer(1234));  
    socket.send({a:1,b:"b",c:true});  
    socket.send([1,'a',true]);

* Socket.prototype.close(reason);

## bug && suggestion?
[Tell Me Please~](https://github.com/lzpong/node.websocket/issues)
