import serial
import canparser
from ctypes import c_uint8, cast, POINTER

#SERIAL_PORT = 


#ser = serial.Serial(SERIAL_PORT)
#print ser.name
ser = open('./testdata', "rb")
try:
	rawdata = ser.read(1)
	while rawdata != "":
		# load data into c function return realdata
		parser_t = canparser.parser_t()
		sensor_t = canparser.sensor_t()

		realdata = canparser.parseNext(cast(rawdata, POINTER(c_uint8)).contents.value, sensor_t, parser_t)
		if parser_t.sensorFound: # We got data in sensor_t
			print("id: {} name: {}: value: {}".format(sensor_t.id, sensor_t.name, sensor_t.value))

		rawdata = ser.read(1)

finally:
	ser.close()
