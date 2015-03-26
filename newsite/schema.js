'use strict';

var _ = require('lodash');
var Int64 = require('node-int64');

var datatypes = {
	boolean: 0,

	uint8: 1,
	int8: 2,
	uint16: 3,
	int16: 4,
	uint32: 5,
	int32: 6,
	uint64: 7,
	int64: 8,

	float32: 9,
	float64: 10,

	cstring: 11,

	utcDatetime: 12,
};
// Create the inverse
_.forEach(datatypes, function(n, key) {
	datatypes[n] = key;
});

var datatypeLength = {
	boolean: 1,

	uint8: 1,
	int8: 1,
	uint16: 2,
	int16: 2,
	uint32: 4,
	int32: 4,
	uint64: 8,
	int64: 8,

	float32: 4,
	float64: 8,

	cstring: 1,

	utcDatetime: 8,

	schema: 0,
	schemaEnd: 0,
};


var ECUdata = {
	"" : 0,
	"Fuel Press.": 1,
	"Status Lap Counter": 2,
	"Status Injection Sum": 3,
	"Last Gear Shift": 4,
	"Motor Oil Temp": 5,
	"Oil Pressure": 6,
	"Status Time" : 7,
	"Status Lap Time": 8,
	"Gear Oil Temp": 9,
	"Status Traction": 10,
	"Status Gas": 11,
	"Status LambdaV2": 12,
	"Status Cam Trig P1": 13,
	"Status Cam Trig P2": 14,
	"Status Choker Add": 15,
	"Status Lambda PWM": 16,
	"WaterMotor temp": 17,
	"ManifoldAir temp": 18,
	"Potmeter (0-100%)": 19,
	"RPM": 20,
	"Trigger Err": 21,
	"Cam Angle1": 22,
	"Cam Angle2": 23,
	"RoadSpeed (km/h)": 24,
	"Manifold press. (mBar)": 25,
	"Batt. volt": 26,
	"Lambda (<1 => Rich)": 27,
	"Load": 28,
	"Injector Time": 29,
	"Ignition Time": 30,
	"Dwell Time": 31,
	"GX": 32,
	"GY": 33,
	"GZ": 34,
	"Motor Flags": 35,
	"Out Bits": 36,
	"Time": 37,
};
// Create the inverse
_.forEach(ECUdata, function(n, key) {
	ECUdata[n] = key;
});


var pktTypes = {
	ECU: 0,
};
// Create the inverse
_.forEach(pktTypes, function(n, key) {
	pktTypes[n] = key;
});

var readInt64LE = function(buf, i) {
	var lo = buf.readInt32LE(i);
	var hi = buf.readInt32LE(i+4);
	return new Int64(hi, lo);
};

var readPkt = function(buf) {
	var pkt = [];
	var i = 0;
	while (i < buf.length) {
		var dt = datatypes[buf.readInt8(i++)];
		var data;
		switch (dt) {
			case "boolean": data = buf.readInt8(i) ? true : false; break;
			case "int8":    data = buf.readInt8(i); break;
			case "uint8":   data = buf.readUInt8(i); break;
			case "int16":   data = buf.readInt16LE(i); break;
			case "uint16":  data = buf.readUInt16LE(i); break;
			case "int32":   data = buf.readInt32LE(i); break;
			case "uint32":  data = buf.readUInt32LE(i); break;
			case "int64":   data = readInt64LE(buf, i); break;
			case "uint64":  throw new Error("not yet implemented");
			case "float32": data = buf.readFloatLE(i); break;
			case "float64": data = buf.readDoubleLE(i); break;

			case "cstring": throw new Error("not yet implemented");
			case "utcDatetime": data = new Date(readInt64LE(buf, i)); break;

			default: throw new Error("Unknown datatype");
		}
		i += datatypeLength[dt];
		pkt.push(data);
	}
	return pkt;
};

var parseECU = function(pkt) {
	return {
		'name': ECUdata[pkt.shift()],
		data: pkt.shift(),
		ts: pkt.shift(),
	};
};

var unpack = function(buf) {
	var pkt = readPkt(buf);

	// console.log(pkt);

	var type = pktTypes[pkt.shift()];
	switch(type) {
		case "ECU": return parseECU(pkt);

		default: throw new Error("Unknown package type");
	}
};


/*
var parseSchema = function(input) {
	var id = input[0];
	var schema = {};
	// schema[id] = {};

	var body = []
	input = input.slice(1);

	var i = 0;
	while (i < input.length) {
		var iStart = i;
		while(input[i++] != 0) {
			if (i > input.length ) break;
		}
		var element = {};

		var key = input.slice(iStart, i-1).toString(); // -1 because null terminator
		element[key] = datatypes[input[i++]]
		body.push(element);
	}

	var schemaStarts = [];
	var schemaEnds = [];
	_.forEach(body, function(e, n) {
		var dt = _.values(e)[0];
		switch (dt) {
			case "schema": schemaStarts.push(n); break;
			case "schema_end": schemaEnds.push(n); break;
		}
	})

	if (schemaStarts.length !== schemaEnds.length) {
		// ERROR
		console.warn("mismatch error");
	}

	_(schemaStarts).reverse();
	_(schemaEnds).reverse();

	while (1) {
		var start = schemaStarts.pop();
		var end = schemaEnds.pop();
		if (start === undefined || end === undefined) break;

		var key = _.keys(body[start])[0];
		body[start] = {};
		body[start][key] = [];

		_.forEach(_.range(start+1, end), function(n) {
			body[start][key].push(body[n])
		});
		_.pullAt(body, _.range(start+1, end+1)); // TODO pull from nested data structure
	}

	schema[id] = body;
	console.log(JSON.stringify(body, null, 2))
	console.log();
	console.log(body)
}

var test = function() {
	var buf = new Buffer([0x01,0x73,0x63,0x68,0x65,0x6d,0x61,0x00,0x0d,0x6b,0x65,0x79,0x00,0x01,0x6b,0x65,0x79,0x32,0x00,0x02,0x00,0x0e]);
	var buf2 = new Buffer([1, 115, 111, 109, 101, 32, 105, 110, 116, 0, 1, 115, 99, 104, 101, 109, 97, 0, 13, 107, 101, 121, 0, 1, 107, 101, 121, 50, 0, 2, 0, 14, 97, 110, 111, 116, 104, 101, 114, 32, 115, 99, 104, 101, 109, 97, 0, 13, 115, 111, 109, 101, 116, 104, 105, 110, 103, 0, 1, 78, 101, 115, 116, 101, 100, 32, 115, 99, 104, 101, 109, 97, 0, 13, 110, 101, 115, 116, 101, 100, 49, 0, 1, 110, 101, 115, 116, 101, 100, 50, 0, 1, 0, 14, 0, 14,]);
	parseSchema(buf2);
}

test()
*/

module.exports = {
	unpack: unpack,
};
