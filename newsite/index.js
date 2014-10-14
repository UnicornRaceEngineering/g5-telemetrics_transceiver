// Enable/disable debug
var debug = false;

/* Includes/Imports */
var path = require('path'); // init path so we can create paths using path.join()
// init app using express to make app a function handler which we can parse on to the HTTP server
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var SerialPort = require('serialport').SerialPort
var dataType = require('./sensor_config')

/* Global variables */

// Open a connection to a serial port
var serialport = new SerialPort("/dev/ttyUSB0", {
	baudrate: 115200
});
var clientsAmout = 0; // Keep statistics of the amount of connected clients
var currentPack = new Package(); // The package which we are currently building

// Defining the route handler
app.get('/', function(request, response){
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

	// Event for received data
	serialport.on('data', function(data){
		// Data has been received.
		// TODO: Handle data, using io.emit() to send data to clients.
		//io.emit('rear wheel temp', data)
		ParsePackage(data);
	});
});

var printDebug = function(msg){
	if (debug)
		console.log(msg);
};

// Parses the data buffer we are receiving from xbee
var ParsePackage = function(data){
	for(i = 0; i < data.length; i++){
		var currentByte = data[i];
		printDebug("Current byte: " + currentByte); // Let's see what we are reading
		currentPack.AddByte(currentByte);
		if (currentPack.IsFull()){
			
			var sensorType = dataType.sensorConfig[currentPack.GetId()];
			var sensor = {
				name: sensorType.name,
				value: currentPack.GetValue().toFixed(2),
				timestamp: new Date().getTime()
			};
			// send data to client
			console.log("Package recieved");
			console.log("Id: " + currentPack.GetId());
			console.log(currentPack.GetBuffer());
			console.log(sensor);
			console.log(); // newline
			io.emit(sensor.name, sensor);
			currentPack = new Package();
		}
	}
};

function Package(){
	// gives us the possibility to refer to our instance inside the functions
	var self = this;

	// members
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
				self._isStartSequenceFound = true;
				printDebug("Start sequence found");
			} else {
				self._startSequenceIndex = 0;
				self._isStartSequenceFound = false;
				printDebug("sequence index: " + self._startSequenceIndex);
				return;
			}
		}

		// We just read the start package and id is undefined. Thus current byte is our package id
		if (self._id === undefined){
			self._id = newByte;
			printDebug("id: " + self._id);
			return;
		}

		// Initialize the buffer containing the length of the package
		if (self._lengthBuffer === undefined){
			self._lengthBuffer = new Buffer([0x0, 0x0]);
			printDebug("Length buffer Initialized");
		}
		
		
		// add the current byte to the length buffer, if length is not found yet
		if (self._lengthBufferIndex < self._lengthBuffer.length){
			printDebug("Length byte" + self._lengthBufferIndex + ": " + newByte);
			printDebug("length index: " + self._lengthBufferIndex);
			printDebug(self._lengthBuffer);
			self._lengthBuffer[self._lengthBufferIndex] = newByte;
			self._lengthBufferIndex++;
			return;
		}

		// if buffer in undefined we are about to receive a new package.
		// prepare buffer by initializing it to the proper length
		if (self._buffer === undefined){
			// get buffer length
			var n = self._lengthBuffer.readUInt16BE(0)
			printDebug("Length of package: " + n);
			self._buffer = new Buffer(n);
			self._bufferIndex = 0;
		}

		// we are receiving byte for the package
		if (self._bufferIndex < self._buffer.length){
			printDebug("BufferIndex: " + self._bufferIndex + " / " + self._buffer.length);
			printDebug("byte added: " + newByte);
			printDebug(self._buffer);
			self._buffer[self._bufferIndex] = newByte;
			self._bufferIndex++;
		} else { // package is full reset all values
			self._id = undefined;
			self._buffer = undefined;
			self._bufferIndex = 0;
			self._startSequenceIndex = 0;
			self._isStartSequenceFound = false;
			self._lengthBuffer = undefined;
			self._lengthBufferIndex = 0;
			printDebug("bufferIndex out of range: " + self._bufferIndex);
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
	self.GetValue = GetValue;
	function GetValue(){
		return self._buffer.readFloatLE(0);
	};
	self.GetBuffer = GetBuffer;
	function GetBuffer(){
		return self._buffer;
	};
	self.IsFull = IsFull;
	function IsFull(){
		if (self._buffer === undefined){
			printDebug("Is full: buffer undefined");
			return false;
		}

		if (self._bufferIndex === self._buffer.length) {
			printDebug("Is full: true");
			return true;
		} else {
			printDebug("Is full: false");
			return false;
		}
	};

	// private methods
	// Determines whether the parsed byte is part of the start sequence at the current index
	var isPartOfStartSequence = function(currentByte){
		if (currentByte === self._startSequence[self._startSequenceIndex]){
			printDebug("part of start sequence: " + self._startSequenceIndex);
			return true;
		}
		printDebug("Not part of start sequence");
		return false;
	};

	return self;
};
