var dataType = require('./sensor_config');

var startSequence = [255, 123, 10];		//Signature of the start of a can frame?

/*
 *
 *
 *
 */
function isStartSequence(data) {

	for(var i = 0; i < data.length, i++) {
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

	//Loops through each byte in data stream
	for(var i=0; i<datain.length; i++){
		var currByte = datain[i]; // the current byte in the stream

		//console.log("("+currByte+")");
		
		// Search data pack. start sequence, if found then next byte is a type
		if((package_start_counter === 0) && (currByte === startSequence[0]))
			package_start_counter = 1;
		else if((package_start_counter === 1) && (currByte === startSequence[1]))
			package_start_counter = 2;
		else if((package_start_counter === 2) && (currByte === startSequence[2])){
			package_start_counter = 0;
			package_start = true;
			continue;
		}
				
		// Packet start found, get packet ID
		if (package_start){	
		
			// Reset
			package_start = false;
			bytesToRead = -1;
			valOut = 0;
			
			dataTypeKey = getDataType(dataType,currByte);
			
			// Valid data type found
			if(dataTypeKey !== -1){		
				bytesToRead = (dataType[dataTypeKey].datalength/8); // Bytes to read
			}
			else
				console.log("Invalid data (ID: "+currByte+")");
			continue;
		}			
		
		// Data bytes 
		if(bytesToRead > 0){	
			valOut = valOut + (currByte << (8*(bytesToRead-1)));	// Shift bytes
			bytesToRead -= 1; // Databyte counter
			continue;
		}	
	
		// No more data bytes, 
		if(bytesToRead === 0){
			var nameTerm = dataType[dataTypeKey].name.rpad(" ", 10); // Dette skal ikke ske
			var name = dataType[dataTypeKey].name;
			var  value = dataType[dataTypeKey].conv(valOut);
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
				//console.log("ID:\t"+dataType[dataTypeKey].ID+"\tType:\t"+nameTerm+"\tData:\t"+value);
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