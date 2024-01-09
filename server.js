const { SerialPort } = require('serialport')
const WebSocket = require('ws');

const wss = new WebSocket.WebSocketServer({ port: 8000 });
const printer_serialport = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 115200 })
const shooter_serialport = new SerialPort({ path: '/dev/ttyUSB1', baudRate: 9600 })

wss.on('connection', function connection(ws) {
  ws.on('error', console.error);
  ws.on('message', function message(msg) {
    console.log(String(msg))
    if (String(msg) == "shoot") {
      shooter_serialport.write("1")
    } else { //gcode
      printer_serialport.write(msg)
    }
  });
  console.log("connect")
});