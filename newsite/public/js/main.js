'use strict';

var escapeNonWordsRegexp = /[_\W]+/g // precompile regex
function escapeNonWords(s) {
    return s.replace(escapeNonWordsRegexp, "-");
}

var socket = io();
var plots = {}; // Map of sensor -> chart
var rawlist = {};
var packets = [];

var PLOTLENGTH = 100;   //Data points in plots before shifting
//TODO: Replace with isScrolling which is bound to site slider
var scrolling = false;  //Is true when scrolling through older data - Stops redrawing of plots


//Variables used for the canvas.
var x_pos = 0;
var y_pos = 0;
var blocksize = 20;
var ball_size = 6;
var offset = ball_size/2; //Moves the ball object into center
//TODO: Find a dynamic offset value, maybe derive from c.height & c.width
var c, ctx, blocksize, ball;

setInterval(function() {
    if(!scrolling) {
        redrawPlots();
    }
}, 500);

var updateSidebarValue = _.throttle(function(nameVal, pkt) {
    document.getElementById(nameVal).innerHTML = pkt.value.toFixed(2);
}, 1);

socket.on('download-log', function(csvLog) {
    var a = document.createElement('a');
    a.href = 'data:attachment/csv;base64,' + btoa(csvLog);
    a.target = '_blank';
    a.download = 'LogData.csv';
    a.click();
});

socket.on('download-log-remaining', function(remainingBytes) {
    // TODO Show the user a progress bar
    console.log("remainingBytes: ", remainingBytes);
    // throw "Not yet implemented";
})

socket.on('data', function(pkts){
    //Temporary measure till we can split pkts on their timestamp
    packets.push(pkts); //store pkts for scrolling
    if (!scrolling) {
        unpack(pkts);       //Unpack pkts and push them
    }
});

$(function() {
    $("#plots").sortable();
    $("#plots").disableSelection();
    $("#slider-range").slider({
        range: true,
        min: 0,
        max: 500,
        values: [ 0, 500 ],
        stop:function(event, ui) {
            console.log("Slider moved to: " + ui.values[0] + "-" + ui.values[1]);
            //scrollAB(ui.values[0], ui.values[1]);
        }
    });
});

function isScrolling() {
    var values = $("#slider-range").slider("values");
    return (values[0] != 0 || values[1] != 500);
}

//Purges all plots in plots array of data points
function clearPlots() {
    for (var m in plots) {
        //Pass over if it is not a highcharts
        var plot = plots[m];
        if (isUndefined(plot.redraw)) {
            continue;
        }
        //plot holds series property which is an array, as a chart can hold multiple lines
        //Every series holds a readonly data property (all the data points)
        //setData is the public method with parameters: New data, [Redraw chart after], [mixed animation], [updatePoints]
        plot.series[0].setData([], false);
    }
}

//Order all charts in plots to redraw
function redrawPlots() {
    for (var m in plots) {
            var plot = plots[m];
            //Check if the plot has a redraw function
            if (isUndefined(plot.redraw)) { //G-plots do not have a redraw function
                continue;
            }
            plot.redraw();      //Execute a redraw
    }
}

function isUndefined(arg) {
    return (typeof arg === "undefined");
}

//Scrolls from packet beg (int) to end (int)
function scrollAB(beg, end){
    //beg smaller than end AND end smaller than total packet number
    //if (beg < end && end < packets.length) {
    if(beg != 0 || end != 500){ //isScrolling() is bound to slider
        console.log("Scrolling");
        scrolling = true;   //Stops redrawing of charts
        clearPlots();       //Clears charts of datapoints
        var start = Math.floor(packets.length*beg/500);
        var stop = Math.floor(packets.length*end/500);
        console.log("Start-Stop: " + start + "-" + stop);
        for (var i = start; i < stop; i++){
            unpack(packets[i]);
        }
        redrawPlots();
    } else {    //
        scrolling = false;  //Start updating and redrawing plots
        clearPlots();       //Clean up the plots

        /* To unpack the last PLOTLENGTH number of packages,
         * we first check if number is lower than plotlength */
        var i = packets.length - PLOTLENGTH;
        if (i < 0) {
            i = 0;
        }

        //Unpack 
        for (i; i < packets.length; i++) {
            unpack(packets[i]);
        }
    }
}

function unpack(pkts) {
    for (var i = 0; i < pkts.length; i++) {
        var pkt = pkts[i];

        if (pkt.name === "request log") {
            throw {
                name : "NotYetImplementedError", 
                message : "A request log packet was registered. All features with request logs are currently not supported."
            };
        }
        else{
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
                    var shift = plots[pkt.name].series[0].data.length > PLOTLENGTH;
                    plots[pkt.name].series[0].addPoint(pkt.value, false, shift);
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
                        '<td> <input type="number" name="'+ escapedName +'-watch" style="width:40px"/> </td>' +
                        '<td id="' + nameVal + '">'+pkt.value.toFixed(2) +'</td>'+
                        '</tr>'
                    );
                    rawlist[pkt.name] = pkt;
                }
            }
        }
    }
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
                margin: 0
            },
            credits: {
                enabled: false
            },
            legend: {
                enabled: false
            },
            xAxis: {
                labels: {
                    format: '{value:.2f}',
                }
            },
            yAxis: {
                title: {
                    text: 'Value'
                },
                labels: {
                    format: '{value:.2f}'
                }
                /* Test plotline
                ,plotLines: [{
                    color: 'red', // Color value
                    value: 3, // Value of where the line will appear
                    width: 2, // Width of the line
                    id: 'plotline'
                }]*/
            },
            plotOptions: {
                rangeSelector: {
                    enabled: false
                },
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
                data: [value]
            }],
        });
    } else {  //ELement already exists, so we delete it
        plots[name].destroy();
        $('#'+ escapeNonWords(name) + '-graph').remove();
        $('#' + escapeNonWords(name)).css("background-color", "lightgrey");
        delete plots[name];
    }
}

//Takes a chart and adds a plotline to it
function togglePlotline(chart){
    console.log(chart);
    if(chart.yAxis[0].plotBands != undefined) {
        chart.yAxis[0].removePlotband('plotline');
    } else {
        chart.yAxis[0].addPlotBand({
            color: 'red', // Color value
            value: 3, // Value of where the line will appear
            width: 2, // Width of the line
            id: 'plotline'
        });
    }
}

function download_data(){
    var logNumber = document.getElementById('log-number').value
    socket.emit('download', logNumber);
}