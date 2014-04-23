var dataType = require('../sensor_config');

var startSequence = [255, 123, 10];		//Signature of the start of a can frame?

/* Checks three databytes, and returns true if they contain
 * a start sequence.
 * Input: An array containing three bytes
 * OutPut: True if the three bytes matches the start sequence, False if not.
 */
function isStartSequence(data) {

	for(var i = 0; i < data.length; i++) {
		if (data[i] !== startSequence[i]) {
			return false;
		}
	}

	return true;
	//Legacy code, kept tempt uncommented for now. Should be removed when new code has been proven
	/*if((package_start_counter === 0) && (currByte === startSequence[0]))
		package_start_counter = 1;
	else if((package_start_counter === 1) && (currByte === startSequence[1]))
		package_start_counter = 2;
	else if((package_start_counter === 2) && (currByte === startSequence[2]))
	{
		package_start_counter = 0;
		package_start = true;
		continue;
	}*/
}



module.exports = function(data) {
	// Data from serialport
	var datain = data;
	//Output
	var valOut = 0;
	//Size of remaining package bytes
	var bytesToRead = -1;

	//Processes each data byte
	while (datain.length !== 0) {
		currByte = datain[0];
		var startSequenceLength = 3;
		//Looks for a package  start sequence
		if (isStartSequence(datain.slice(0,startSequenceLength))) {
			//removes the start sequence bytes
			datain = datain.slice(3);
			currByte = datain[0];
			//Gets the packagetype
			var packageTypeKey = getDataType(dataType, currByte);



		}
		else {
			datain.Shift()
		}
	}

	//Loops through each byte in data stream
	for(var i=0; i<datain.length; i++) {
		var currByte = datain[i]; // the current byte in the stream
		var startSequenceLength = 3;

		/*Looks for start sequence*/
		if (isStartSequence(datain.slice(i, i + startSequenceLength))) {
			package_start = true;
			//Start sequence found, move the index past the start sequence bytes
			i += startSequenceLength;
			currByte = datain[i];


		}

		//Begin Legacy code /*********************************************************

		////console.log("("+currByte+")");

		// Search data pack. start sequence, if found then next byte is a type
		/*if((package_start_counter === 0) && (currByte === startSequence[0]))
			package_start_counter = 1;
		else if((package_start_counter === 1) && (currByte === startSequence[1]))
			package_start_counter = 2;
		else if((package_start_counter === 2) && (currByte === startSequence[2])){
			package_start_counter = 0;
			package_start = true;
			continue;
		}*/

		//End legacy code*************************************************************

		// Packet start found, get packet ID and size
		if (package_start){

			// Reset
			package_start = false;
			valOut = 0;
			//Get data type key
			dataTypeKey = getDataType(dataType,currByte);

			// Valid data type found
			if(dataTypeKey !== -1){
				bytesToRead = (dataType[dataTypeKey].datalength/8); // Bytes to read
			}
			else
				console.error("Invalid data (ID: "+currByte+")");
			continue;
		}

		// Read Data bytes
		if(bytesToRead > 0){
			valOut = valOut + (currByte << (8*(bytesToRead-1)));	// Shift bytes
			bytesToRead -= 1; // Databyte counter
			continue;
		}

		// No more data bytes,
		if(bytesToRead === 0){

			var name = dataType[dataTypeKey].name;
			var  value = dataType[dataTypeKey].conv(valOut);

			//Format value to range
			value = Math.min(value, dataType[dataTypeKey].max);
			value = Math.max(value, dataType[dataTypeKey].min);

			var sensor = {
				name: name,
				val: value,
				timestamp: new Date().getTime()
			};
			sensors[numSensors++] = sensor;

			// Store the bytes
			if(dataType[dataTypeKey].active === 1){
				// Add to data pack
				dataTx[dataCounter++] = sensor;

			}

			// Reset
			bytesToRead = -1;
			valOut = 0;

			// Next data byte ?
			dataTypeKey = getDataType(dataType,currByte);
			// Valid ?
			if(dataTypeKey !== -1){
				bytesToRead = (dataType[dataTypeKey].datalength/8);
			}
			// No more data, transmit fetched data to client
			// Pak data her, og kald dataTx
			else{
				// Tx data to all clients
				//console.log("Tx data -------------------------------------------------");
				txData(dataTx);
				dataCounter = 0;
				dataTx = [];

				// flush all collected data to db
				db.sensor.insert(sensors);
				sensors = [];
				numSensors = 0;
			}

		}
	}


}
