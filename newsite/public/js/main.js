'use strict';

var escapeNonWordsRegexp = /[_\W]+/g // precompile regex
function escapeNonWords(s) {
    return s.replace(escapeNonWordsRegexp, "-");
}

var storage = [];
var socket = io();
var plots = {}; // Map of sensor -> chart
var rawlist = {};

//Variables used for the canvas.
var x_pos = 0;
var y_pos = 0;
var blocksize = 20;
var ball_size = 6;
var offset = ball_size/2; //Moves the ball object into center
//TODO: Find a dynamic offset value, maybe derive from c.height & c.width
var c, ctx, blocksize, ball;
var requested_log_number = 0;

setInterval(function() {
    for (var m in plots) {
        var plot = plots[m];
        if (typeof plot.redraw === "undefined") {
            continue
        }
        plot.redraw();
    }
}, 50);

var updateSidebarValue = _.throttle(function(nameVal, pkt) {
	document.getElementById(nameVal).innerHTML = pkt.value.toFixed(2);
}, 1);

//Retrieve storage from server, store it locally
socket.on('storage', function(pkt){
    storage = pkt;
});

socket.on('data', function(pkts){
	for (var i = 0; i < pkts.length; i++) {
		var pkt = pkts[i];

		if (pkt.name === "request log") {
			var csvString = pkt.value;
			var a = document.createElement('a');
			a.href = 'data:attachment/csv;base64,' + btoa(csvString);
			a.target = '_blank';
			// a.download = 'LogData'+requested_log_number+'.csv';
			a.download = 'LogData.csv';
			a.click();
			console.log(csvString);
		} else if (pkt.name === "request num log") {
			var nLogs = pkt.value;
			var options = "";
			for (var n = 0; n < nLogs; n++) {
				options += '<option value="lognr">'+n+'</option>\n';
			}
			$('#log-number').empty();
			$('#log-number').append(options);
		}
		else{
            storage.push(pkt);  //Push it onto local storage
			var escapedName = escapeNonWords(pkt.name);
			var nameVal = escapedName + '-val';
			if (pkt.name in rawlist) {
				// In all case we need to update the sidebar raw value
				updateSidebarValue(nameVal, pkt);
			};

			if (pkt.name in plots) {
				// Update the plot
				if (pkt.name === "GX" || pkt.name === "GY") {
					update_g_plot(pkt);
				} else {
					addPlotPoint(pkt.name, pkt.value);
				}
			} else {
				// Element does not exists, create it
				var showPlotFunc = onclick = 'create_line_plot';
				if (pkt.name === "GX" || pkt.name === "GY") {
					showPlotFunc = 'create_g_plot';
				}

				//Element is a standard line plot
				if ($('#' + nameVal).length === 0) {
					$('#rawlist').append(
						'<tr id="'+ escapedName + '" class="ui-state-default" onclick="'+showPlotFunc+'(\'' + pkt.name + '\', ' + pkt.value + ')">' +
						'<td>'+pkt.name+'</td>'+
						'<td id="' + nameVal + '">'+pkt.value.toFixed(2) +'</td>'+
						'</tr>'
					);
					rawlist[pkt.name] = pkt;
				}
			}
		}
		$(function() {
			$("#plots").sortable();
			$("#plots").disableSelection();
		});
	}
});

function addPlotPoint(name, value){
    var shift = plots[name].series[0].data.length > 400;
    plots[name].series[0].addPoint(value, false, shift);
}

function is_in_circle(x) {
    x = x/4;                            //Only every 4th is a new pixel
    var y = Math.floor(x/ball_size);    //New line for every ball_size pixels
    x = x%ball_size;
    var dist_center = Math.sqrt(Math.pow(ball_size/2 - x, 2) + Math.pow(ball_size/2 - y, 2)); //Euclidian distance to center
    if (dist_center >= ball_size/2.5) {
        return false;
    } else {
        return true;
    }
}

function update_g_plot(packet){
	if (~packet.name.indexOf("GX")) {
        x_pos = packet.value;
    } else {
    //GY-event is usually sent directly after GX-event
    //so we do not update at both events
        y_pos = packet.value;
        ctx.clearRect(0,0,c.width,c.height);                                                //Clear the canvas
        ctx.stroke();                                                                       //Apply grid colors again
        ctx.putImageData(ball, c.width/2 + x_pos*blocksize - offset, c.height/2 + y_pos*blocksize - offset);  //Place ball object
    }
}

function create_g_plot() {
	if ($('#G-plot').length === 0) {
		//Element is a G-force graph - only make on GX event.
		//GX, GY is a html5 canvas element
		$('#plots').append('<canvas class="ui-state-default" id="G-plot"/>');
		c = document.getElementById("G-plot");
		ctx = c.getContext("2d");
		ctx.strokeStyle = "lightgrey";
		plots["GX"] = plots["GY"] = ctx; //Store canvas context in plots so it can be used out of scope.

		//Make the grid
		for (var i = 0; i < c.width/2; i+=blocksize) {
			ctx.moveTo(c.width/2 + i, 0)
			ctx.lineTo(c.width/2 + i, c.height)
			ctx.moveTo(c.width/2 - i, 0)
			ctx.lineTo(c.width/2 - i, c.height)
		};
		for (var i = 0; i < c.height/2; i+=blocksize) {
			ctx.moveTo(0, c.height/2 + i)
			ctx.lineTo(c.width, c.height/2 + i)
			ctx.moveTo(0, c.height/2 - i)
			ctx.lineTo(c.width, c.height/2 - i)
		};
		//Make the x and y axis more pronounced.
		ctx.moveTo(c.width/2, 0);
		ctx.lineTo(c.width/2, c.height);
		ctx.moveTo(0, c.height/2);
		ctx.lineTo(c.width, c.height/2);

		//Making a plot indicator object
		ball = ctx.createImageData(ball_size, ball_size); //Height = width => square

		//Paint it royal purple
		for (var i = 0; i < ball.data.length; i+=4) {
			if (is_in_circle(i)) {
				ball.data[i] = 120;     //Red 0-255
				ball.data[i+1] = 81;     //Blue
				ball.data[i+2] = 169;     //Green
				ball.data[i+3] = 255;   //Alpha - transparancy
			} else {
				ball.data[i] = 0;       //Red
				ball.data[i+1] = 0;     //Blue
				ball.data[i+2] = 0;     //Green
				ball.data[i+3] = 0;     //Alpha - transparancy
			}
		};
		//Apply our lines onto ctx.
		ctx.stroke();
		ctx.putImageData(ball, c.width/2 - offset, c.height/2 - offset);

		$('#GX').css("background-color", "lightblue");
		$('#GY').css("background-color", "lightblue");
	} else {
		$('#G-plot').remove();
		$('#GX').css("background-color", "lightgrey");
		$('#GY').css("background-color", "lightgrey");
	}
}

function create_line_plot(name, value) {
    //No graph exists, create it
    if ($('#' + escapeNonWords(name) + '-graph').length == 0) {
        $('#plots').append('<li class="ui-state-default" id="' + escapeNonWords(name) + '-graph"/>');
		$('#' + escapeNonWords(name)).css("background-color", "lightblue");
        plots[name] = new Highcharts.Chart({
            chart: {
                renderTo: escapeNonWords(name)+'-graph',
                defaultSeriesType: 'spline',
                valueDecimals: 2,
                animation: false,
            },
            title: {
                text: _.escape(name),
            },
            xAxis: {
                labels: {
                    format: '{value:.2f}',
                },
            },
            yAxis: {
                title: {
                    text: 'Value',
                },
                labels: {
                    format: '{value:.2f}'
                },
            },
            plotOptions: {
                series: {
                    enableMouseTracking: false,
                    animation: false,
                    marker : {
                        enabled: false
                    }
                },
            },
            series: [{
                name: _.escape(name),
                data: [value],
            }],
        });
        //for (var i = storage.length - 400; i < storage.length; i++) {
        for (var i = 0; i < storage.length; i++) {
            if (storage[i].name === name) {
                addPlotPoint(name, storage[i].value);
            }
        }
    } else {  //ELement already exists, so we delete it
        plots[name].destroy();
        $('#' + escapeNonWords(name) + '-graph').remove();
		$('#' + escapeNonWords(name)).css("background-color", "lightgrey");
        delete plots[name];
    }
}

function download_data(){
    var e = document.getElementById('log-number');
    var logNumber = e.options[e.selectedIndex].text;
    requested_log_number = logNumber;
    socket.emit('download', logNumber);
}
function add_plotline(name){
    if ($('#' + escapeNonWords(name) + '-graph').length == 0) {
            $('#' + escapeNonWords(name) + '-graph').yAxis[0].addPlotline({
            plotLines: [{
                id: name +'-plotline',
                color: 'red',
                width: 1,
                value: $('#' + name + '-watch').value
            }]
        });
    }
}
