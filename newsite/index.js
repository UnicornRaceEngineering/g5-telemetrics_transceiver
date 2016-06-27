'use strict';

var _ = require('lodash');
var path = require('path'); // init path so we can create paths using path.join()
var os = require('os');
// init app using express to make app a function handler which we can parse on to the HTTP server
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var carprotocol = require('./carcomprotocol/protocol');

require("serialport").list(function (err, ports) {
    ports.forEach(function(port) {
        console.log(port);
    });
});

var clientsConnected = 0; // Keep statistics of the amount of connected clients

app.use(express.static(path.join(__dirname, 'public')));

var proto = new carprotocol();
proto.emitter.on('open', function() {
	proto.emitter.on('data', function(pkt) {
		console.log(pkt);
		sendPackage('data', pkt);
	})
});

// We hook up on the socket.io connection event.
io.on('connection', function(socket){
    clientsConnected++; // increment amount of clients
    console.log('a client connected');
    console.log("Total: " + clientsConnected);
    // Hook up for disconnect event
    socket.on('disconnect', function(){
        clientsConnected--; // decrement amount of clients
        console.log("a client disconnected");
        console.log("Total: " + clientsConnected);
    });

    socket.on('download', function(logNumber) {
		proto.requestLogfile(logNumber, function(err, remaining, log) {
			if (err) {
				if (err.toString() === "Error: No such file") {

				} else {
					throw err;
					return;
				}
			}
			socket.emit('download-log-remaining', remaining);
			if (remaining === 0) {
				var csvLog = require("./log2csv").toCsv(log)
				socket.emit('download-log', csvLog);
			}
		});
    });
});

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


var debug = false;
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

	// for (var i = 0; i < 50; i++) {
	// 	(function(i){
	// 		setInterval(function() {
	// 			sendPackage('data', {
	// 				name: 'data-' + i,
	// 				value: Math.floor(Math.random() * i)-2.5
	// 			});
	// 		}, 10);
	// 	})(i)
	// }
}
