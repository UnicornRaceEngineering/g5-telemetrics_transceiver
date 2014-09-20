#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <glob.h>
#include "canparser.h"

int main(){
	glob_t data;
	glob("./testdata/*", 0, NULL, &data);

	parser_t parser;
	sensor_t sensor;
	
	int i;
	for(i = 0; i < data.gl_pathc; i++){
		int notFundCount = 0;
		printf("%s\n", data.gl_pathv[i]);
		size_t readElements = 1;
		FILE *fp;
		int buffer = 1;

		fp = fopen(data.gl_pathv[i], "rb");
		while(buffer == 1){
			
			buffer = getc(fp);

			//printf("Name: %s\n", sensor->name);

			parseNext((uint8_t)buffer, &sensor, &parser);

			if (parser.sensorFound){
				printf("id: %d name: %s value: %g\n", sensor.id, sensor.name, sensor.value);
			}
			else {
				notFundCount++;
				printf("%s\n", "Sensor not found");
			}

			//printf("%s\n", buffer);
		}
		printf("%d\n", notFundCount);
		printf("Press any key to parse next file");
		char s;
		scanf("%s", &s);
	}

	return 0;
}