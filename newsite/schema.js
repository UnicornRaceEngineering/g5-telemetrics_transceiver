'use strict';

var _ = require('lodash');
var Int64 = require('node-int64');

var ECUdata = {
	"Empty" : 0,
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
	LAST_ECU_PKT: 37,

	"heart beat": 38,

	"paddle status": 41,

	"current gear": 42,
	"neutral enabled": 43,

	"front right wheel speed (km/h)": 44,
	"front left wheel speed (km/h)": 45,
};
// Create the inverse
_.forEach(pktTypes, function(n, key) {
	pktTypes[n] = key;
});

module.exports = {
	unpack: function(buf, cb) {
		var i = 0;

		while (i < buf.length) {
			var pktType = buf.readUInt16LE(i);
			i += 2;

			if ((pktType >= pktTypes.ECU) && (pktType <= pktTypes.LAST_ECU_PKT)) {
				var ecuPktType = pktType - pktTypes.ECU;
				cb(null, {
					name: "ECU " + ECUdata[ecuPktType],
					value: buf.readFloatLE(i),
				});
				i += 4;
			} else {
				var pkt = {name: pktTypes[pktType]};
				switch (pktType) {
					case pktTypes["paddle status"]:
					case pktTypes["current gear"]:
					case pktTypes["neutral enabled"]:
					case pktTypes["heart beat"]:
						pkt.value = buf.readUInt8(i);
						i += 1;
						break;

					case pktTypes["front right wheel speed (km/h)"]:
					case pktTypes["front left wheel speed (km/h)"]:
						pkt.value = buf.readFloatLE(i);
						i += 4;
						break;
					default: cb("Unknown pkt type " + pktType + " at index " + i, pkt); continue;
				}
				cb(null, pkt);
			}
		}
	},
};
