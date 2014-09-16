/* canparser.i */
%module canparser
%{
/* Put header files here or function declarations like below */
#include "./canparser.h"
extern int parseNext(uint8_t dataByte, sensor_t *sensor, parser_t *p);
void canfile2csv(const char *path);
%}

%include "canparser.h"

int parseNext(uint8_t dataByte, sensor_t *sensor, parser_t *p);
void canfile2csv(const char *path);
