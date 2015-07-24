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
	"win32": "COM4",
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
	// Hook up for disconnect event
	socket.on('disconnect', function(){
		clientsConnected--; // decrement amount of clients
		console.log("a client disconnected");
		console.log("Total: " + clientsConnected);
	});
});

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
			if (err) throw err;
			console.log(pkt);
			io.emit('data', pkt);
		});
	});


});
serialport.on('error', function(error){
	//throw new Error(error);
	console.log(error);
});

var debug = false;
//Debug functions
if(debug) {
	setInterval(function() {
		io.emit('data', {
			name: 'RoadSpeed (km/h)',
			value: (Math.random() - 0.5) * 20
		});
	}, 1000/6);

	setInterval(function() {
		io.emit('data', {
			name: 'GX',
			value: Math.floor(Math.random() * 3)+2.5
		});
	}, 1000/6);

	setInterval(function() {
		io.emit('data', {
			name: 'GY',
			value: Math.floor(Math.random() * 3)
		});
	}, 1000/6);

	setInterval(function() {
		io.emit('data', {
			name: 'GZ',
			value: Math.floor(Math.random() * 3)-2.5
		});
	}, 1000/6);
}
