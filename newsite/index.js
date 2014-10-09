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

	// For debugging purpose
	//while(1){
		//var testPackage = new Buffer([0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6, 0x0a, 0x0, 0x6, 0x1, 0x2, 0x3, 0x4, 0x5, 0x6]);
		//console.log(testPackage);
		//ParsePackage(testPackage);
	//}

	serialport.on('data', function(data){
		// Data has been recieved.
		// TODO: Handle data, using io.emit() to send data to clients.
		//io.emit('rear wheel temp', data)
		console.log(data);
		ParsePackage(data);
	});
});

function Package(){
	var self = this;

	// private members
	self._id = undefined;
	self._buffer = undefined;
	self._bufferIndex = 0;
	self._startSequence = [0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6];
	self._startSequenceIndex = 0;
	self._isStartSequenceFound = false;
	self._lengthBuffer = undefined;
	self._lengthBufferIndex = 0;

	// public methods
	self.AddByte = AddByte;
	function AddByte(newByte){
		if (self._isStartSequenceFound === false){
			if (isPartOfStartSequence(newByte)){
				self._startSequenceIndex++;
				return;
			} else if (self._startSequenceIndex >= self._startSequence.length - 1){
				console.log(self._startSequenceIndex >= self._startSequence.length - 1);
				self._isStartSequenceFound = true;
				console.log("Start sequence found");
			} else {
				console.log("sequence index: " + self._startSequenceIndex);
			}
		}

		if (self._id === undefined){
			self._id = newByte;
			console.log("id: " + self._id);
			return;
		}

		// Initialize the buffer containg the length of the package
		if (self._lengthBuffer === undefined){
			self._lengthBuffer = new Buffer([0x0, 0x0]);
			console.log("Log buffer Initialized");
		}
		
		
		// add the current byte to the length buffer, if length is not found yet
		if (self._lengthBufferIndex <= self._lengthBuffer.length - 1){
			console.log("Length byte" + self._lengthBufferIndex + ": " + newByte);
			console.log("length index: " + self._lengthBufferIndex);
			console.log(self._lengthBuffer);
			self._lengthBuffer[self._lengthBufferIndex] = newByte;
			self._lengthBufferIndex++;
			return;
		}

		if (self._buffer === undefined){
			// get buffer length
			var n = self._lengthBuffer.readUInt16BE(0)
			console.log("Length of package: " + n);
			self._buffer = new Buffer(n);
			self._bufferIndex = 0;
		}

		if (self._bufferIndex <= self._buffer.length - 1){
			self._buffer[self._bufferIndex] = newByte;
			console.log("BufferIndex: " + self._bufferIndex);
			console.log("byte added: " + newByte);
			console.log(self._buffer);
			self._bufferIndex++;
		} else {
			// package is full reset all values
			self._id = undefined;
			self._buffer = undefined;
			self._bufferIndex = 0;
			self._startSequence = [0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6];
			self._startSequenceIndex = 0;
			self._isStartSequenceFound = false;
			self._lengthBuffer = undefined;
			self._lengthBufferIndex = 0;
			console.log("bufferIndex out of range: " + self._bufferIndex);
		}
	};
	self.GetId = GetId;
	function GetId(){
		return self._id;
	};
	self.GetLength = GetLength;
	function GetLength(){
		return self._buffer.length;
	};
	self.GetBuffer = GetBuffer;
	function GetBuffer(){
		return self._buffer;
	};
	self.IsFull = IsFull;
	function IsFull(){
		if (self._buffer === undefined){
			console.log("is full: buffer undefined");
			return false;
		}

		if (self._bufferIndex === self._buffer.length) {
			console.log("Is full: true");
			return true;
		} else {
			console.log("Is full: false");
			return false;
		}
	};

	// private methods
	var isPartOfStartSequence = function(currentByte){
		if (currentByte === self._startSequence[self._startSequenceIndex]){
			console.log("part of start sequence: " + self._startSequenceIndex);
			return true;
		}
		console.log("Not part of start sequence");
		return false;
	};

	return self;
};

var currentPack = new Package();

var ParsePackage = function(data){
	for(i = 0; i < data.length; i++){
		var currentByte = data[i];
		console.log("Current byte: " + currentByte); // Let's see what we are reading
		currentPack.AddByte(currentByte);
		if (currentPack.IsFull()){
			console.log(currentPack.GetBuffer());
			currentPack = new Package();
		}
		console.log() // newline
	}
};
