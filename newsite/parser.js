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

var Parser = function() {
	var self = this;

	self.MAX_PACKET_LENGTH = 1024 * 1024; // 1 mb

	self.eventEmitter = new events.EventEmitter();
	self.on = function(event, cb) {
		self.eventEmitter.on(event, cb);
	};

	self.startSeqFound = false;
	self.startSeqIndx = 0;

	self.len = [];
	self.payload = [];
	self.payloadSize = 0;

	self.reset = function() {
		self.len = [];
		self.payload = [];
		self.payloadSize = 0;
		self.startSeqFound = false;
	};

	self.addByte = function(b) {
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
				if (self.len.length < 2) {
					self.len.push(b);
				} else {
					self.payloadSize = new Buffer(self.len).readUInt16LE();
					self.payload.push(b);
				}
			} else {
				self.payload.push(b);
				if (self.payload.length === self.payloadSize) {
					var recvChk = self.payload.pop();
					var calcChk = chksum(self.payload);
					if (recvChk !== calcChk) {
						self.eventEmitter.emit('error', new Error("Invalid checksum. Got " + recvChk + " Expected " + calcChk));
					} else {
						self.eventEmitter.emit('data', new Buffer(self.payload));
					}
					self.reset();
				}
			}
		}
	};
};

module.exports = Parser;
