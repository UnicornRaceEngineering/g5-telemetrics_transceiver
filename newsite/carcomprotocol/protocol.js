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

var REQUESTS_ENUM = {
	GET_LOG: 0,
	GET_NUM_LOG: 1,

};

var PACKAGE_TYPE_RESERVED_LENGTH = {
	"handshake": 0,
	"ack/nack": 1,
	"request/response": 0,
	"stream-data": 0,
};

var debug = function() {
	if (true) console.log.apply(console, arguments);
};

// see http://stackoverflow.com/a/6798829
var toUint = function(x) { return x >>> 0; };

var chksum = function(buff) {
	return _.reduce(buff, function(sum, n) {
		return sum ^= n;
	}, 0);
};

var concatBuffers = function(buffers) {
	var buf = new Buffer(_.sumBy(buffers, function(b) {return b.length;}));
	_(buffers).reduce(function(acc, chunk) {
		return acc + chunk.copy(buf, acc);
	}, 0);
	return buf;
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

			var topTwoBitsMSK = toUint(((1 << 0) | (1 << 1)) << 6);
			self.pktType = toUint(b >>> 6); // two top bits. We just shift the lower bits away
			self.len = toUint(b & (~topTwoBitsMSK)); // remove two top bits, keeping the lower 6 bits
		} else if (self.payload.length < self.len) {
			self.payload.push(b);
		} else {
			var recvChk = b;
			var calcChk = chksum(self.payload);
			if (recvChk !== calcChk) {
				var err = new Error("Invalid checksum. Got " + recvChk + " Expected " + calcChk);
				err.got = recvChk;
				err.expected = calcChk;
				emitter.emit("error", err);
			} else {
				var pktDescription = PACKAGE_TYPE_ENUM[self.pktType];
				var buf = new Buffer(self.payload); // Buffer.from(self.payload);

				var reservedLength = PACKAGE_TYPE_RESERVED_LENGTH[pktDescription];

				var reserved = buf.slice(0, reservedLength);
				var payload = buf.slice(reservedLength, buf.length);
				emitter.emit(pktDescription, payload, reserved);
			}
			self.resetState();
		}
	};
};

var ports = {
	"linux": "/dev/ttyUSB0",
	"darwin": "/dev/tty.usbserial-A700eCo8",//"/dev/tty.usbserial-A900FLLE",
	"win32": "COM3",
};

var createPkt = function(type, payload, reserved) {
	if (!_.isInteger(type)) throw new TypeError("type is not a number");
	payload = payload || new Buffer(0); // defaults to empty buffer
	if (!_.isBuffer(payload)) throw new TypeError("payload is not a buffer");
	reserved = reserved || new Buffer(0); // defaults to empty buffer
	if (!_.isBuffer(reserved)) throw new TypeError("reserved is not a buffer");

	var total = payload.length + reserved.length;
	if (total > toUint(1 << 6)) throw new TypeError("payload is too big:" + total);
	var typeLen = toUint((type << 6) | total);

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
	self.callbacks = {
		ack: function(){},
		reqres: function(){},
	};

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

		debug("SEND", "pkt", pkt);
		self.sp.write(pkt, function() {
			var timeout = setTimeout(function() {
				cb(TIME_OUT_ERR, null);
			}, ACK_TIMEOUT);

			self.callbacks.ack = _.once(function(ack, payload) {
				clearTimeout(timeout);
				if (!ack) {
					// Not ack so we resend the same
					debug("SEND", "received NACK");
					self.send(pkt, cb);
				} else {
					cb(null, payload);
				}
			});
		});
	};

	self.handshake = function(cb) {
		var hs = self.createHandshake();
		self.send(hs, function(err) {
			if (err == TIME_OUT_ERR) {
				debug("Resending handshake", hs);
				self.handshake(cb);
			} else {
				cb(err);
			}
		});
	};

	self.sendACK = function(ackOrNack, cb) {
		debug("Sending ack", ackOrNack);
		var pkt = createPkt(PACKAGE_TYPE_ENUM["ack/nack"], null, new Buffer([ackOrNack]));
		self.sp.write(pkt, cb);
	};

	self.makeRequest = function(req, payload, cb) {
		var buf = concatBuffers([new Buffer([req]), payload]);
		var pkt = createPkt(PACKAGE_TYPE_ENUM["request/response"], buf);

		self.send(pkt, function(err) {
			if (err) throw err;

			self.callbacks.reqres = function(chunk) {
				debug("RECV chunk", chunk);
				self.sendACK(true, function(err) {
					if (err) throw err;
				});

				// Empty chunk signals end
				if (chunk.length === 0) {
					self.callbacks.reqres = function(){};
				}
				cb(null, chunk);
			};
		});
	};

	self.requestLogfile = function(logNumber, cb) {
		var payload = new Buffer(2);
		payload.writeUInt16LE(logNumber, 0);

		var chunks = [];
		var remaining = null;

		self.makeRequest(REQUESTS_ENUM.GET_LOG, payload, function(err, chunk) {
			// The first chunk only contains the total length;
			if (remaining === null) {
				remaining = chunk.readUInt32LE(0);
			} else {
				chunks.push(chunk);
				remaining -= chunk.length;
				cb(err, remaining, concatBuffers(chunks));
			}
		});
	};

	var port = "/dev/tty.usbserial-A900FLLE"; //"/dev/tty.usbserial-A600JE0S"; //ports[os.platform()];
	self.sp = new SerialPort(port, {
		baudrate: 115200,
		parser: (function() {
			var p = new parser();
			return function(emitter, buf) {
				// debug("RAW RECV", buf);

				_.forEach(buf, function(b) {
					p.addByte(b, emitter);
				});
			};
		})(),
	});
	self.sp.on('error', function(err) {
		if (_.startsWith(err.message, "Invalid checksum.")) {
			self.sendACK(false, function(err) {
				if (err) throw err;
			});
		} else {
			console.warn(err);
		}
	});


	self.sp.on('open', function(err) {
		if (err) console.warn(err);

		self.sp.on('request/response', function(payload) {
			self.callbacks.reqres(payload);
		});

		self.sp.on('handshake', function() {
			console.log("recv handshake");
		});

		var totalLiveRecv = 0;
		var start = new Date().getTime();
		self.sp.on('stream-data', function(data) {
			totalLiveRecv += data.length;
			var now = new Date().getTime();
			var since = (now - start) / 1000;
			console.log("livedatabytes/sec", totalLiveRecv/since);
			// reset every 5 seconds
			if (since > 5) {
				start = now;
				totalLiveRecv = 0;
			}

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
			debug("RECV ack/nack", ackStatus);
			self.callbacks.ack(ackStatus, payload);
		});

		self.handshake(function(err) {
			if (err) {
				throw err;
			}
			debug("handshake successfull");
			self.emitter.emit('open', err);
		});
	});

};

// TEST EXAMPLE
var proto = new EventEmitter();
var p = new protocol(proto);

proto.on('open', function(err) {
	if (err) throw err;

	console.log("open");

	var req = function() {
		var logNumber = 0;
		p.requestLogfile(logNumber, function(err, remaining, log) {
			if (err) throw err;
			// console.log("done making request");
			console.log(remaining);

			if (remaining === 0) setTimeout(req, 1000*10);
		});
	};
	req();

});
