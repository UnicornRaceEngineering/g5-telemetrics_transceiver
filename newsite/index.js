/* Includes/Imports */
var path = require('path'); // init path so we can create paths using path.join()
// init app using express to make app a function handler which we can parse on to the HTTP server
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var SerialPort = require('serialport').SerialPort;
var dataType = require('./sensor_config');
var Parser = require('./parser').Parser();

// Open a connection to a serial port
var serialport = new SerialPort("/dev/ttyUSB0", {
	baudrate: 115200
	parser: Parser.Parser;
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
http.listen(3000, function(){
	console.log('listening on *:3000');
});

// the serial port is opened asynchronously, meaning we are not able to read data
// before the 'open' event has happened.
serialport.on('open', function(){
	console.log('Serial port is now open');

	// Event for received data
	serialport.on('package', function(sensor){
		// Data has been received.
		io.emit(sensor.name, sensor);
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