/* canparser.i */
%module canparser
%{
/* Put header files here or function declarations like below */
#include "./canparser.h"
#include <stdint.h>
extern int parseNext(uint8_t dataByte, sensor_t *sensor, parser_t *p);
void canfile2csv(const char *path);
%}
%include "stdint.i"
%include "canparser.h"

int parseNext(uint8_t dataByte, sensor_t *sensor, parser_t *p);
void canfile2csv(const char *path);
