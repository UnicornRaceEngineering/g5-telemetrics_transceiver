import serial
import canparser
from ctypes import c_uint8, cast, POINTER
import os

#SERIAL_PORT = 


#ser = serial.Serial(SERIAL_PORT)
#print ser.name
for file in os.listdir("./testdata"):
	ser = open("./testdata/{}".format(file), "rb")
	try:
		byteCount = 0
		byte = ser.read(1)
		while byte:
			byteCount = byteCount + 1
			# load data into c function return realdata
			parser_t = canparser.parser_t()
			sensor_t = canparser.sensor_t()

			realdata = canparser.parseNext(cast(byte, POINTER(c_uint8)).contents.value, sensor_t, parser_t)
			if parser_t.sensorFound: # We got data in sensor_t
				print("id: {} name: {}: value: {}".format(sensor_t.id, sensor_t.name, sensor_t.value))
				input()
			#else:
				#print(byteCount)
			
			byte = ser.read(1)
			print(realdata)
		break
		print("Total byte count: {}".format(byteCount))
		print("Press any key for next file")
		input()

	finally:
		ser.close()
