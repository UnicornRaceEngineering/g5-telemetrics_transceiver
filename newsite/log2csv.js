var schema = require("./schema");
var fs = require('fs');
var util = require('util');

var fileName = process.argv[2]; // 0 and 1 is node and script name

var toCsv = function(dataSet) {
	var timeStamp = 0;

	output = "TimeStamp,Name,Value\n";

	for (var i = 0; i < dataSet.length; i++) {
		var dataPoint = dataSet[i];

		if (dataPoint.name == "system time") {
			timeStamp = dataPoint.value;
			continue;
		}
		output += util.format('%d,"%s",%d\n', timeStamp, dataPoint.name, dataPoint.value);
	}
	return output;
}

module.exports.toCsv = toCsv
/*
fs.readFile(fileName, function(err, data) {
	if (err) throw err;

	var dataPoints = [];
	schema.unpack(data, function(err, pkt, progress) {
		if (err) {
			console.warn(err);
		} else {
			dataPoints.push(pkt);
		}

		if (progress === data.length || err != null) {
			var csv = toCsv(dataPoints);
			console.log(csv);
		}
	});
});
*/