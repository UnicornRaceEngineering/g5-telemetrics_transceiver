'use strict';

/**
 * Implementation of receiving data directly from the FFJ105 ECU.
 * It needs a direct serial connection to the ECU.
 */

var _ = require('lodash');
var serialport = require('serialport');

var ecuData = [
	{sensor: "FUEL_PRESSURE", 			length: 2,},
	{sensor: "STATUS_LAP_COUNT", 		length: 2,},
	{sensor: "STATUS_INJ_SUM", 			length: 2,},
	{sensor: "LAST_GEAR_SHIFT", 		length: 2,},
	{sensor: "MOTOR_OILTEMP", 			length: 2,},
	{sensor: "OIL_PRESSURE", 			length: 2,},
	{sensor: "STATUS_TIME", 			length: 4,},
	{sensor: "STATUS_LAP_TIME", 		length: 4,},
	{sensor: "GEAR_OIL_TEMP", 			length: 2,},
	{sensor: "STATUS_TRACTION", 		length: 2,},
	{sensor: "STATUS_GAS", 				length: 2,},
	{sensor: "STATUS_LAMBDA_V2", 		length: 2,},
	{sensor: "STATUS_CAM_TRIG_P1", 		length: 2,},
	{sensor: "STATUS_CAM_TRIG_P2", 		length: 2,},
	{sensor: "STATUS_CHOKER_ADD", 		length: 2,},
	{sensor: "STATUS_LAMBDA_PWM", 		length: 2,},

	{sensor: "EMPTY", 					length: 10,},

	{sensor: "WATER_TEMP", 				length: 2,},
	{sensor: "MANIFOLD_AIR_TEMP", 		length: 2,},
	{sensor: "POTMETER", 				length: 2,},

	{sensor: "EMPTY", 					length: 2,},

	{sensor: "RPM", 					length: 2,},
	{sensor: "TRIGGER_ERR", 			length: 2,},
	{sensor: "CAM_ANGLE1", 				length: 2,},
	{sensor: "CAM_ANGLE2", 				length: 2,},
	{sensor: "ROAD_SPEED", 				length: 2,},
	{sensor: "MAP_SENSOR", 				length: 2,},
	{sensor: "BATTERY_V", 				length: 2,},
	{sensor: "LAMBDA_V", 				length: 2,},

	{sensor: "EMPTY", 					length: 4,},

	{sensor: "LOAD", 					length: 2,},

	{sensor: "EMPTY", 					length: 2,},

	{sensor: "INJECTOR_TIME", 			length: 2,},

	{sensor: "EMPTY", 					length: 2,},

	{sensor: "IGNITION_TIME", 			length: 2,},
	{sensor: "DWELL_TIME", 				length: 2,},

	{sensor: "EMPTY", 					length: 10,},

	{sensor: "GX", 						length: 2,},
	{sensor: "GY", 						length: 2,},
	{sensor: "GZ", 						length: 2,},

	{sensor: "EMPTY", 					length: 8,},

	{sensor: "MOTOR_FLAGS", 			length: 1,},

	{sensor: "EMPTY", 					length: 1,},

	{sensor: "OUT_BITS", 				length: 1,},
	{sensor: "TIME", 					length: 1,},
];

var pktLen = _.reduce(ecuData, function(result, n, key) {
	return result + n.length;
}, 0);

var a = "/dev/tty.usbserial-A900FLLE";
var b = "/dev/tty.usbserial";
var sp = new serialport.SerialPort(b, {
	baudrate: 19200,
	parser: serialport.parsers.byteLength(pktLen),
});

sp.on("open", function(err) {
	if (err) console.log(err);

	console.log("serialport open");

	// Send heartbeat to the ECU so it know that we are listning for data
	setInterval(function() {
		sp.write(new Buffer([0x12, 0x34, 0x56, 0x78, 0x17, 0x08, 0, 0, 0, 0]));
	}, 24*8);

	sp.on('data', function(data) {
		// Convert buffer to normal js array
		data = _.map(data, function(n) {return n;});
		// copy the ecuData
		var ecu = JSON.parse(JSON.stringify(ecuData));
		_.map(ecu, function(n) {
			n.value = 0;
			while(n.length--) {
				n.value += (data.shift() << (8 * n.length));
			}
			return n;
		});

		for (var i = 0; i < ecu.length; i++) {
			var clamp = function(x) { return (x > (1 << 15)) ? -(0xFFFF - x) : x;};
			switch(ecu[i].sensor) {
				case "STATUS_LAMBDA_V2":
					ecu[i].value = (70 - clamp(ecu[i].value) / 64.0);
					break;
				case "WATER_TEMP":
				case "MANIFOLD_AIR_TEMP":
					ecu[i].value = (ecu[i].value * (-150.0 / 3840) + 120);
					break;
				case "POTMETER":
					ecu[i].value = ((ecu[i].value - 336) / 26.9);
					break;
				case "RPM":
					ecu[i].value = (ecu[i].value * 0.9408);
					break;
				case "MAP_SENSOR":
					ecu[i].value = (ecu[i].value * 0.75);
					break;
				case "BATTERY_V":
					ecu[i].value = (ecu[i].value * (1.0 / 210) + 0);
					break;
				case "LAMBDA_V":
					ecu[i].value = ((70 - clamp(ecu[i].value) / 64.0) / 100);
					break;
				case "INJECTOR_TIME":
				case "IGNITION_TIME":
					ecu[i].value = (-0.75 * ecu[i].value + 120);
					break;
				case "GX":
				case "GY":
				case "GZ":
					ecu[i].value = (clamp(ecu[i].value) * (1.0 / 16384));
					break;
			}
		}

		ecu = _.map(ecu, function(n) {
			return _.omit(n, 'length');
		});

		console.log(ecu);
	});
});
