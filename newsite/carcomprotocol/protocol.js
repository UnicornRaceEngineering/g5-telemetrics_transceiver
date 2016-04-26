'use strict';

var _ = require('lodash');
var os = require('os');
var assert = require('assert');
var EventEmitter = require('events');
var SerialPort = require('serialport').SerialPort;
var schema = require("../schema");
var log2csv = require("../log2csv");

var TIME_OUT_ERR = new Error("Send timed out");

var ACK_TIMEOUT = 100;

var START_BYTE = 0xA1;

var PACKAGE_TYPE_ENUM = {
	"handshake": 0,
	"ack/nack": 1,
	"request/response": 2,
	"stream-data": 3,
};
// Create inverse
_.forEach(PACKAGE_TYPE_ENUM, function(n, key) {
	PACKAGE_TYPE_ENUM[n] = key;
});

var PACKAGE_TYPE_RESERVED_LENGTH = {
	"handshake": 0,
	"ack/nack": 1,
	"request/response": 0,
	"stream-data": 0,
};

var chksum = function(buff) {
	return _.reduce(buff, function(sum, n) {
		return sum ^= n;
	}, 0);
};

var parser = function() {
	var self = this;

	self.resetState = function() {
		self.foundStartByte = false;
		self.foundTypeAndLength = false;

		self.pktType = 0;
		self.len = 0;

		self.payload = [];
	}
	self.resetState();

	// A pkt contains of 4 parts that looks like:
	// [startbyte | type/length | payload | xorsum]
	// where all except payload is 1 byte. The payload size is 'length' bytes
	// The for the type/length byte, type is the the 2 top bits and length is
	// the 6 lower bits
	self.addByte = function(b, emitter) {
		if (!self.foundStartByte) {
			if (b === START_BYTE) self.foundStartByte = true;
		} else if (!self.foundTypeAndLength) {
			self.foundTypeAndLength = true;

			var topTwoBitsMSK = (((1 << 0) | (1 << 1)) << 6);
			self.pktType = b >> 6; // two top bits. We just shift the lower bits away
			self.len = b & (~topTwoBitsMSK); // remove two top bits, keeping the lower 6 bits
		} else if (self.payload.length < self.len) {
			self.payload.push(b);
		} else {
			var recvChk = b;
			var calcChk = chksum(self.payload);
			if (recvChk !== calcChk) {
				var err = new Error("Invalid checksum. Got " + recvChk + " Expected " + calcChk);
				emitter.emit("error", err);
			} else {
				var pktDescription = PACKAGE_TYPE_ENUM[self.pktType];
				var buf = new Buffer(self.payload); // Buffer.from(self.payload);

				var reservedLength = PACKAGE_TYPE_RESERVED_LENGTH[pktDescription];

				var reserved = buf.slice(0, reservedLength);
				var payload = buf.slice(reservedLength, buf.length);
console.log("LOW", pktDescription, payload, reserved);
				emitter.emit(pktDescription, payload, reserved);
			}
			self.resetState();
		}
	};
};

var ports = {
	"linux": "/dev/ttyUSB0",
	"darwin": "/dev/tty.usbserial-A900FLLE",
	"win32": "COM3",
};

var createPkt = function(type, payload, reserved) {
	if (typeof(type) != "number") throw new TypeError("type is not a number");
	payload = payload || new Buffer(0); // defaults to empty buffer
	if (!(payload instanceof Buffer)) throw new TypeError("payload is not a buffer");
	reserved = reserved || new Buffer(0); // defaults to empty buffer
	if (!(reserved instanceof Buffer)) throw new TypeError("reserved is not a buffer");

	var total = payload.length + reserved.length;
	if (total > (1 << 6)) throw new TypeError("payload is too big:" + total);
	var typeLen = (type << 6) | total;

	var i = 0;

	// startbyte + type/length + reserved + payload + xorsum
	var buf = new Buffer(1 + 1 + reserved.length + payload.length + 1);
	buf.writeUInt8(START_BYTE, i++);
	buf.writeUInt8(typeLen, i++);
	reserved.copy(buf, i); // Copy the reserved into the buffer
	i += reserved.length;
	payload.copy(buf, i); // Copy the payload into the buffer
	i += payload.length;
	buf.writeUInt8(chksum(reserved) ^ chksum(payload), i++);

	assert(buf.length === i);

	return buf;
};

var protocol = function(emitter) {
	var self = this;
	self.emitter = emitter || new EventEmitter();
	self.event = new EventEmitter(); // for internal events

	self.createHandshake = function() {
		var ts = Math.round((new Date()).getTime() / 1000);
		var bitflags = 0;

		var payload = new Buffer(4 + 4);
		payload.writeUInt32LE(ts, 0);
		payload.writeUInt32LE(bitflags, 4);

		return createPkt(PACKAGE_TYPE_ENUM["handshake"], payload);
	};

	self.send = function(pkt, cb) {
		if (!(pkt instanceof Buffer)) throw new TypeError("pkt is not a buffer");
		if (pkt.readUInt8(0) !== START_BYTE) throw new TypeError("pkt is malformed (invalid start byte)");

		self.sp.write(pkt, function() {
			console.log("write", pkt)

			var timeout = setTimeout(function() {
				console.log("TIMEOUT");
				self.event.removeListener('ack/nack', ackCB);
				cb(TIME_OUT_ERR, null);
			}, ACK_TIMEOUT);

			var ackCB = function(ack, payload) {
				console.log("ACK_CB", ack, payload)
				clearTimeout(timeout);
				if (!ack) {
					// Not ack so we resend the same
					self.send(pkt, cb);
				} else {
					cb(null, payload);
				}
			};

			self.event.once('ack/nack', ackCB);
		});
	};

	self.handshake = function(cb) {
		var hs = self.createHandshake();
		self.send(hs, function(err) {
			if (err == TIME_OUT_ERR) {
				self.handshake(cb);
			} else {
				cb(err)
			}
		});
	};

	self.sendACK = function(ackOrNack, cb) {
		var pkt = createPkt(PACKAGE_TYPE_ENUM["ack/nack"], null, new Buffer([ackOrNack]));
		console.log("writeACK", pkt);
		self.sp.write(pkt, cb);
	};

	self.makeRequest = function(req, cb) {
		var payload = new Buffer(1);
		payload.writeUInt8(req, 0);

		var pkt = createPkt(PACKAGE_TYPE_ENUM["request/response"], payload);

		var chunks = [];

		self.send(pkt, function(err) {
			if (err) throw err;

			var recvChunk = function(chunk) {
				chunks.push(chunk);

				self.sendACK(true, function(err) {
					if (err) throw err;
				});

				// Empty chunk signals end
				if (chunk.length === 0) {
					self.event.removeListener("req/res", recvChunk);

					// concat all chunks into a new buffer
					var buf = new Buffer(_.reduce(chunks, function(sum, n) {
						return sum + n.length;
					} ,0));

					var i = 0;
					_.forEach(chunks, function(chunk) {
						chunk.copy(buf, i);
						i += chunk.length;
					});

					assert(i === buf.length);

					cb(null, buf);
				}
			};

			self.event.on("req/res", recvChunk);
		});
	}

	var port = "/dev/tty.usbserial-A600JE0S"; //ports[os.platform()];
	self.sp = new SerialPort(port, {
		baudrate: 115200,
		parser: (function() {
			var p = new parser();
			return function(emitter, buf) {
console.log("raw input:", buf);
				_.forEach(buf, function(b) {
					p.addByte(b, emitter);
				});
			};
		})(),
	});
	self.sp.on('error', function(err) {
		console.warn(err);
		self.sendACK(false, function(err) {
			if (err) throw err;
		});
	});


	self.sp.on('open', function(err) {
		if (err) console.warn(err);

		self.sp.on('request/response', function(payload) {
			self.event.emit("req/res", payload);
		});

		self.sp.on('handshake', function() {
			console.log("recv handshake");
		});

		self.sp.on('stream-data', function(data) {
			schema.unpack(data, function(err, pkt) {
				if (err) {
					console.warn(err);
					return
				}

				console.log(pkt);

				if (pkt.name === "request log") {
					pkt.value = log2csv.toCsv(pkt.value);
				}
				self.emitter.emit("data", pkt);
			});
		});

		self.sp.on('ack/nack', function(payload, reserved) {
			var ackStatus = reserved.readUInt8(0) == true;
console.log(ackStatus, payload);

			self.event.emit('ack/nack', ackStatus, payload);
		});

		self.handshake(function(err) {
			if (err) {
				throw err;
			}
			self.emitter.emit('open', err);
		});
	});

};

// TEST EXAMPLE
var proto = new EventEmitter();
var p = new protocol(proto);

proto.on('open', function(err) {
	if (err) throw err;

	p.makeRequest(0x00, function(err, response) {
		if (err) throw err;
		console.log("done making request");
		console.log(response);
	})
});
