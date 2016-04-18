'use strict';

var _ = require('lodash');

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

				emitter.emit(pktDescription, payload, reserved);
			}
			self.resetState();
		}
	};
};

module.exports = function() {
	var p = new parser();
	return function(emitter, buf) {
		_.forEach(buf, function(b) {
			p.addByte(b, emitter);
		});
	}
}
