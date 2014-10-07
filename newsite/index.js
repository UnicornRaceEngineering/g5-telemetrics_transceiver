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
0xA1
0xB2
0xC3
0xD4
0xE5
0xF6
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

function Package(){
	//init self
	var self = this; // this makes us availble to refrence this object in inner functions.
	
	// private members
	var _id = undefined;
	var _buffer = undefined;
	var _bufferIndex = 0;
	var _startSequence = [0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6];
	var _startSequenceIndex = undefined;
	var _isStartSequenceFound = undefined;
	var _lengthBuffer = undefined;
	var _lengthBufferIndex = undefined;

	// constructor
	this.ctor = function(){
		self._bufferIndex = 0;
		self._isStartSequenceFound = false;
		self._startSequenceIndex = 0;
		self._lengthBuffer = new Buffer(2);
		self._lengthBufferIndex = 0;
		console.log("constructor run");
	}

	// public methods
	this.AddByte = AddByte;
	function AddByte(newByte){
		if (self._isStartSequenceFound === false && isPartOfStartSequence(newByte)){
			if (self._isStartSequenceIndex === self._startSequence.length){
				self._isStartSequenceFound = true;
			}
			return;
		}
		console.log("Start sequence found");

		if (self._id === undefined){
			self._id = newByte;
			return;
		}
		console.log("id found: " + self._id);

		if (self._lengthBuffer === undefined){
			self._lengthBuffer = new Buffer(2);
		}

		if (self._lengthBufferIndex < self._lengthBuffer.length - 1){
			self._lengthBuffer[self._lengthBufferIndex] = newByte;
			self._lengthBufferIndex++;
			return;
		}
		console.log("length found");
		console.log(self._lengthBuffer);
		if (self._buffer === undefined){
			// get buffer length
			n = self._lengthBuffer.readInt16BE(0);
			self._buffer = new Buffer(n);
		}
		console.log(self._lengthBuffer.length);
		if (self._bufferIndex !== self._buffer.length - 1){
			console.log(_bufferIndex);
			self._buffer[self._bufferIndex] = newByte;
			self._bufferIndex++;
			console.log("byte added");
		} else {
			console.log("bufferIndex out of range");
		}
	}
	this.GetId = GetId;
	function GetId(){
		return self._id;
	}
	this.GetLength = GetLength;
	function GetLength(){
		return self._buffer.length;
	}
	this.GetBuffer = GetBuffer;
	function GetBuffer(){
		return self._buffer;
	}
	this.IsFull = IsFull;
	function IsFull(){
		if (self._buffer === undefined)
			return false;

		if (self._bufferIndex === self._buffer.length - 1)
			return true;
		else
			return false;
	}

	// private methods
	var isPartOfStartSequence = function(currentByte){
		if (currentByte === self._startSequence[self._startSequenceIndex]){
			self._startSequenceIndex++;
			return true;
		}

		return false;
	}
}

var currentPack = new Package();

var ParsePackage = function(data){

	for(i = 0; i < data.length; i++){
		var currentByte = data.readInt8(i);
		currentPack.AddByte(currentByte);
		if (currentPack.IsFull()){
			console.log(currentPack.GetBuffer())
			currentPack = new Package();
		}
	}
};
