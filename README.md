# websocket

parse socket buffer, add event emitter and cookie id

## download & install
    // in package.json
    "dependencies": {
      "node.websocket": ">=0.0.1"
    }
    $ npm install

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

* Socket.prototype.close(data);

## bug && suggestion?
[Tell Me Please~](https://github.com/lzpong/node.websocket/issues)
