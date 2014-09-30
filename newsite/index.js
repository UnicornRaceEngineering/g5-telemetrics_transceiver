/* Includes/Imports */

var path = require('path'); // init path so we can create paths using path.join()
// init app using express to make app a function handler which we can parse on to the HTTP server
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var SerialPort = require('serialport').SerialPort

/* Global variabels */
// Open a connection to a serial port
var serialport = new SerialPort("/dev/ttyUSB0", {
	baudrate: 115200
});
var clientsAmout = 0; // Keep statistics of the amount of connected clients
var startSequence = [0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6];

// Defining the route handler /
app.get('/', function(request, response){
	//response.send("Hello")
	response.sendFile(path.join(__dirname, 'index.html'));
});

// We hook up on the socket.io connection event.
io.on('connection', function(socket){
	clientsAmout++; // increment amount of clients
	console.log('a client connected');
	console.log("Total: " + clientsAmout);
	// Hook up for disconnect event
	socket.on('disconnect', function(){
		clientsAmout--; // decrement amount of clients
		console.log("a client disconnected");
		console.log("Total: " + clientsAmout);
	});
});

// We make the http server listen to port 3000
http.listen(3000, function(){
	console.log('listening on *:3000');
});

/* Start sequence
0xA01
0xB02
0xC03
0xD04
0xE05
0xF06
*/
// the serial port is opened asynchronously, meaning we are not able to read data
// before the 'open' event has happened.
serialport.on('open', function(){
	console.log('Serial port is now open');
	serialport.on('data', function(data){
		// Data has been recieved.
		// TODO: Handle data, using io.emit() to send data to clients.
		//io.emit('rear wheel temp', data)
		//console.log(data);
		ParsePackage(data);
	});
});

var ParsePackage = function(data){
	var isStartPackageFound = false;
	var startPackageCounter = 0; // keeps track of where we are in the start package

	for(i = 0; i < data.length; i++){
		var currentByte = data.readUInt8(i);
		if (isStartPackageFound === false){
			startPackageCounter = isPartOfStartPack(currentByte, startPackageCounter);
			// if our counter is has same value as the length of the start sequence we are ready to receive a package
			if (startPackageCounter === (startSequence.length - 1)){
				isStartPackageFound = true;
				console.log("Start package found!");
			}
			continue;
			
			console.log(currentByte);
		} else {
			//TODO: build buffer by reading id which is byte 1 and length which is byte 2 and 3
		}
	}
};

var isPartOfStartPack = function(currentByte, counter){
	if (currentByte === startSequence[counter]){
		counter++;
	} else {
		counter = 0;
	}
	return counter;
};
