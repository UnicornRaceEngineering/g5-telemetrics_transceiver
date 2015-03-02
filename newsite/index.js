'use strict';

var _ = require('lodash');
var path = require('path'); // init path so we can create paths using path.join()
var os = require('os');
// init app using express to make app a function handler which we can parse on to the HTTP server
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var SerialPort = require('serialport').SerialPort;
var Parser = require('./parser');

require("serialport").list(function (err, ports) {
	ports.forEach(function(port) {
		console.log(port);
	});
});

// Open a connection to a serial port
var ports = {
	"linux": "/dev/ttyUSB0",
	"darwin": "/dev/tty.usbserial-A900FLLE",
};
var serialport = new SerialPort(ports[os.platform()], {
	baudrate: 115200,
	// parser: serialport.parsers.raw,
});
var clientsConnected = 0; // Keep statistics of the amount of connected clients

// Defining the route handlers
app.get('/', function(request, response){
	response.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/public/jquery-2.1.1.min.js', function(req, res){
  res.sendFile(path.join(__dirname, '/public/jquery-2.1.1.min.js'));
});
app.get('/public/highcharts.js', function(req, res){
  res.sendFile(path.join(__dirname, '/public/highcharts.js'));
});
app.get('/public/highcharts-more.js', function(req, res){
  res.sendFile(path.join(__dirname, '/public/highcharts-more.js'));
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

	var parser = new Parser();
	parser.on('data', function(data) {
		io.emit('package', data);
	});
	parser.on('error', function(err) {
		console.warn(err);
	});

	// Event for received data
	serialport.on('data', function(data){
		// flushTime = 5; // Reset the flush time
		_.forEach(data, function(b) {
			parser.addByte(b);
		});
	});


});
serialport.on('error', function(error){
	//throw new Error(error);
	console.log(error);
});
