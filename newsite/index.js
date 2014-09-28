// init path so we can create paths using path.join
var path = require('path');
// init app using express to make app a function handler which we can parse on to the HTTP server
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
// Open a connection to a serial port
var SerialPort = require('serialport').SerialPort
var serialport = new SerialPort("/dev/ttyXXX", {
	baudrate: XXXXXX
});

var clientsAmout = 0;

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

// We make the http server listen to port 3000
http.listen(3000, function(){
	console.log('listening on *:3000');
});

// the serial port is opened asynchronously, meaning we are not able to read data
// before the 'open' event has happened.
serialport.on('open', function(){
	console.log('Serial port is now open');
	serialport.on('data', function(data){
		// Data has been recieved.
		// TODO: Handle data, using io.emit() to send data to clients.
	});
	serialport.write('ls\n', function(err, results){
		console.log('err ' + err);
		console.log('results ' + results);
	});
});
