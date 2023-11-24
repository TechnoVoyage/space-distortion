const { SerialPort } = require('serialport')
const WebSocket = require('ws');

const wss = new WebSocket.WebSocketServer({ port: 8000 });
const serialport = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 115200 })

wss.on('connection', function connection(ws) {
    ws.on('error', console.error);
    ws.on('message', function message(msg) {
      console.log(String(msg))
      serialport.write(msg)
    });
    console.log("connect")
  });