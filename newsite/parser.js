'use strict';

var _ = require('lodash');
var assert = require('assert');
var events = require('events');

var START_SEQ = new Buffer([0xA1, 0xB2, 0xC3]);

var chksum = function(buff) {
	return _.reduce(buff, function(sum, n) {
		return sum ^= n;
	}, 0);
};

var Parser = function(lenbufSize) {
	var self = this;

	self.lenbufSize = lenbufSize;
	switch (self.lenbufSize) {
		case 1:
			self.readLen = function(buf) {
				return buf.readUInt8();
			};
			break;
		case 2:
			self.readLen = function(buf) {
				return buf.readUInt16LE();
			};
			break;
		default: throw new Error("Unuseable length");
	}

	self.startSeqFound = false;
	self.startSeqIndx = 0;

	self.lenbuf = [];
	self.payload = [];
	self.payloadSize = 0;

	self.reset = function() {
		self.lenbuf = [];
		self.payload = [];
		self.payloadSize = 0;
		self.startSeqFound = false;
	};

	self.addByte = function(b, cb) {
		if (!self.startSeqFound) {
			// Check if the current byte is part of the start sequence. If the
			// sequence is broken reset and start over
			if (START_SEQ[self.startSeqIndx] === b) {
				self.startSeqIndx++;
			} else {
				self.startSeqIndx = 0;
			}

			if (self.startSeqIndx === START_SEQ.length) {
				self.startSeqIndx = 0;
				self.startSeqFound = true;
			}
		} else {
			if (self.payloadSize === 0) {
				if (self.lenbuf.length < self.lenbufSize) {
					self.lenbuf.push(b);
				} else {
					self.payloadSize = self.readLen(new Buffer(self.lenbuf));
					self.payload.push(b);
				}
			} else {
				self.payload.push(b);
				if (self.payload.length === self.payloadSize) {
					var recvChk = self.payload.pop();
					var calcChk = chksum(self.payload);
					if (recvChk !== calcChk) {
						cb(new Error("Invalid checksum. Got " + recvChk + " Expected " + calcChk), null);
					} else {
						cb(null, new Buffer(self.payload));
					}
					self.reset();
				}
			}
		}
	};
};

var factory = function() {
	var parser = new Parser(1);

	return function(emitter, buffer) {
		_.forEach(buffer, function(n) {
			parser.addByte(n, function(err, data) {
				if (err) {
					emitter.emit("error", err);
				} else {
					emitter.emit("data", data);
				}
			});
		});
	};
};

module.exports = factory;
