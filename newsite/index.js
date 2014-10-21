// Enable/disable debugging messages.
var debug = new Debug();
debug.SetEnabled(false);
debug.SetOutput(console.log);
debug.SetLogLevel = Debug.INFO;

/* Includes/Imports */
var path = require('path'); // init path so we can create paths using path.join()
// init app using express to make app a function handler which we can parse on to the HTTP server
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var SerialPort = require('serialport').SerialPort
var dataType = require('./sensor_config')

// Open a connection to a serial port
var serialport = new SerialPort("/dev/ttyUSB0", {
	baudrate: 115200
});
var clientsConnected = 0; // Keep statistics of the amount of connected clients
var currentPack = new Package(); // The package which we are currently building

// Defining the route handler
app.get('/', function(request, response){
	response.sendFile(path.join(__dirname, 'index.html'));
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
http.listen(3000, function(){
	console.log('listening on *:3000');
});

// the serial port is opened asynchronously, meaning we are not able to read data
// before the 'open' event has happened.
serialport.on('open', function(){
	console.log('Serial port is now open');

	// Event for received data
	serialport.on('data', function(data){
		// Data has been received.
		ParsePackage(data);
	});
	// Error handling
	serialPort.write("ls\n", function(err, results) {
		console.log('err ' + err);
	});
});
serialport.on('error', function(error){
	console.log(error);
	process.kill();
})

var printDebug = function(msg){
	if (debug)
		console.log(msg);
};

// Parses the data buffer we are receiving from xbee
var ParsePackage = function(data){
	for(i = 0; i < data.length; i++){
		var currentByte = data[i];
		currentPack.AddByte(currentByte);
		if (currentPack.IsFull()){ // our package is ready for dispatch to the client
			
			// Get the sensor type from the sensor config using the retrieved id from the package
			var sensorType = dataType.sensorConfig[currentPack.GetId()];
			// Create the sensor structure
			var sensor = { 
				name: sensorType.name,
				value: currentPack.GetValue().toFixed(2),
				timestamp: new Date().getTime()
			};
			// send data to client
			debug.Print("Package recieved", debug.INFO);
			debug.Print("Id: " + currentPack.GetId(), debug.INFO);
			debug.Print(currentPack.GetBuffer(), debug.INFO);
			debug.Print(sensor, debug.INFO);
			debug.Print();
			io.emit(sensor.name, sensor);
			currentPack = new Package();
		}
	}
};

/* 	Package object for handling data packages.
	Start sequence: 0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6
	Package structure: byte0 = id, byte1-2 = length of value, rest: Value */
function Package(){
	// gives us the possibility to refer to our variables inside the function
	var self = this;

	// Package id
	self._id = undefined;
	self._buffer = undefined;
	self._bufferIndex = 0;
	self._startSequence = [0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6];
	self._startSequenceIndex = 0;
	self._isStartSequenceFound = false;
	self._lengthBuffer = undefined;
	self._lengthBufferIndex = 0;

	// public methods
	/*
		AddByte is used for adding a byte to the package.
		Start packages are automatically detected by the AddByte method.
		Several other getter methods are available to retrieve specific fields
		of a package when the package has been fully created.
	*/
	self.AddByte = AddByte;
	function AddByte(newByte){
		if (self._isStartSequenceFound === false){
			if (isPartOfStartSequence(newByte)){
				self._startSequenceIndex++;
				return;
			} else if (self._startSequenceIndex >= self._startSequence.length - 1){
				self._isStartSequenceFound = true;
			} else {
				self._startSequenceIndex = 0;
				self._isStartSequenceFound = false;
				return;
			}
		}

		// We just read the start package and id is undefined. Thus current byte is our package id
		if (self._id === undefined){
			self._id = newByte;
			return;
		}

		// If lengthBuffer is undefined - Add two bytes to lengthBuffer since length is the next 16 bits
		// Initialize the buffer containing the length of the package
		if (self._lengthBuffer === undefined){
			self._lengthBuffer = new Buffer([0x0, 0x0]);
		}
		// add the current byte to the length buffer, if length is not found yet
		if (self._lengthBufferIndex < self._lengthBuffer.length){
			self._lengthBuffer[self._lengthBufferIndex] = newByte;
			self._lengthBufferIndex++;
			return;
		}

		// if buffer in undefined we are about to receive a new package.
		// prepare buffer by initializing it to the proper length
		if (self._buffer === undefined){
			// get buffer length
			var n = self._lengthBuffer.readUInt16BE(0)
			self._buffer = new Buffer(n);
			self._bufferIndex = 0;
		}

		// we are receiving a byte for the package
		if (self._bufferIndex < self._buffer.length){
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
		}
	};
	// Gets the id of the data package.
	// This value is the id of the sensor in the Sensor config. Thus it can be used to retrive
	// The sensor structure from this configuration.
	self.GetId = GetId;
	function GetId(){
		return self._id;
	};
	// Gets the length of the buffer
	self.GetLength = GetLength;
	function GetLength(){
		return self._buffer.length;
	};
	// Returns the value of the data package build in the buffer
	self.GetValue = GetValue;
	function GetValue(){
		return self._buffer.readFloatLE(0);
	};
	// Returns the buffer which is begin build in this class.
	self.GetBuffer = GetBuffer;
	function GetBuffer(){
		return self._buffer;
	};
	// Determines whether all bytes of the package has been added.
	self.IsFull = IsFull;
	function IsFull(){
		if (self._buffer === undefined){
			return false;
		}

		if (self._bufferIndex === self._buffer.length) {
			return true;
		} else {
			return false;
		}
	};

	// private methods
	// Determines whether the parsed byte is part of the start sequence at the correct index
	var isPartOfStartSequence = function(currentByte){
		if (currentByte === self._startSequence[self._startSequenceIndex]){
			return true;
		}
		return false;
	};

	return self;
};

function Debug(){
	var self = this;

	self.ERROR = 1
	self.WARNING = 2;
	self.INFO = 3;
	self.VERBOSE = 4;

	self.Enabled = false;
	self.Level = self.ERROR;
	self.Out = console.log;

	self.Print = Print;
	function Print(msg, loglevel){
		if (self.Enabled && loglevel >= self.Level)
			self.Out(createTimeStamp() + " " + msg);
	};
	self.SetOutput = SetOutput;
	function SetOutput(output){
		self.Out = output;
	};
	self.SetEnabled = SetEnabled;
	function SetEnabled(enabled){
		self.Enabled = enabled;
	};
	self.SetLogLevel = SetLogLevel;
	function SetLogLevel(loglevel){
		if (loglevel <= 4)
			self.Level = loglevel;
		else
			console.log("Debug: loglevel is out of bounds");
			process.kill();
	};

	var createTimeStamp = function(){
		var d = new Date();
		var timestamp =  "[" + ensureTwoDigits(d.getFullYear()) + "-" + ensureTwoDigits((d.getMonth()+1)) + "-" + ensureTwoDigits(d.getDate()) + " " + 
						ensureTwoDigits(d.getHours()) + "-" + ensureTwoDigits(d.getMinutes()) + "-" + ensureTwoDigits(d.getSeconds()) + "]";
		return timestamp;
	};
	var ensureTwoDigits = function(number){
		return ("0" + (number)).slice(-2);
	};
}
