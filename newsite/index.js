'use strict';

var _ = require('lodash');
var path = require('path'); // init path so we can create paths using path.join()
var os = require('os');
// init app using express to make app a function handler which we can parse on to the HTTP server
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var SerialPort = require('serialport').SerialPort;
var schema = require("./schema");

require("serialport").list(function (err, ports) {
    ports.forEach(function(port) {
        console.log(port);
    });
});

// Open a connection to a serial port
var ports = {
    "linux": "/dev/ttyUSB0",
    "darwin": "/dev/tty.usbserial-A900FLLE",
    "win32": "COM3",
};
var serialport = new SerialPort(ports[os.platform()], {
    baudrate: 115200,
    parser: require('./parser')(),
});
var clientsConnected = 0; // Keep statistics of the amount of connected clients

app.use(express.static(path.join(__dirname, 'public')));


// We hook up on the socket.io connection event.
io.on('connection', function(socket){
    clientsConnected++; // increment amount of clients
    console.log('a client connected');
    console.log("Total: " + clientsConnected);
    //Throw them session storage
    io.emit('storage', storage);
    // Hook up for disconnect event
    socket.on('disconnect', function(){
        clientsConnected--; // decrement amount of clients
        console.log("a client disconnected");
        console.log("Total: " + clientsConnected);
    });

	serialport.write(new Buffer([0x02])); // request number of logs
	console.log("\n\nsend req to car\n\n");

    socket.on('download', function(logNumber) {
        var buf = new Buffer(3); // 3: uint8 - uint16 -
        buf.writeUInt8(0x01, 0); // 1 is request log
        buf.writeUInt16LE(logNumber, 1);
        serialport.write(buf);
    });
});

var storage = [];

var sendPackage = (function(){
	var pktList = [];
	var lastSend = Date.now();
	var timeout = null;
	return function(key, pkt) {
		if (timeout !== null) clearTimeout(timeout);
		pktList.push(pkt);
		var timeoutTime = 100;
		var now = Date.now();
		var flush = function() {
			io.emit(key, pktList);
			pktList = [];
			lastSend = now;
		}
		if (now - lastSend > timeoutTime) {
			flush();
		} else {
			timeout = setTimeout(flush, timeoutTime);
		}
	};
})();


// We make the http server listen to port 3000
var PORT = 3000;
http.listen(PORT, function(){
    console.log('listening on port', PORT);
});

// the serial port is opened asynchronously, meaning we are not able to read data
// before the 'open' event has happened.
serialport.on('open', function(error) {
    if (error) console.log(error);
    console.log('Serial port is now open');

    // Event for received data
    serialport.on('data', function(data){
        schema.unpack(data, function(err, pkt) {
            if (err) {
                console.warn(err);
                return
            }
            console.log(pkt, ",");
            if (pkt.name === "request log") {
                pkt.value = require("./log2csv").toCsv(pkt.value);
				// console.log(pkt)
            }
            //Store the package locally
            storage.push(pkt);
            //Push the data live
            sendPackage('data', pkt);
        });
    });


});
serialport.on('error', function(error){
    //throw new Error(error);
    console.log(error);
});

var debug = true;
//Debug functions
if(debug) {
    setInterval(function() {
        sendPackage('data', {
            name: 'RoadSpeed (km/h)',
            value: (Math.random() - 0.5) * 20
        });
    }, 10);

    setInterval(function() {
        sendPackage('data', {
            name: 'GX',
            value: Math.floor(Math.random() * 3)+2.5
        });
    }, 10);

    setInterval(function() {
        sendPackage('data', {
            name: 'GY',
            value: Math.floor(Math.random() * 3)
        });
    }, 10);

    setInterval(function() {
        sendPackage('data', {
            name: 'GZ',
            value: Math.floor(Math.random() * 3)-2.5
        });
    }, 10);

	(function(){
		var dt = 0.0;
		setInterval(function() {
			dt += 0.1;
			sendPackage('data', {
				name: 'sine wave',
				value: Math.sin(dt)
			});
		}, 25);
	})();

	(function(){
		var dt = 0.0;
		setInterval(function() {
			dt += 0.1;
			sendPackage('data', {
				name: 'Spike noisy sin',
				value: Math.tan(dt) + Math.sin(dt)
			});
		}, 10);
	})();

	(function(){
		var dt = 0.0;
		setInterval(function() {
			dt += 0.1;
			sendPackage('data', {
				name: 'noisy sine',
				value: Math.sin(dt) * Math.random()
			});
		}, 10);
	})();

	for (var i = 0; i < 50; i++) {
		(function(i){
			setInterval(function() {
				sendPackage('data', {
					name: 'data-' + i,
					value: Math.floor(Math.random() * i)-2.5
				});
			}, 10);
		})(i)
	}
}
