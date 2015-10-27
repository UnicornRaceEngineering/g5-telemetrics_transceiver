'use strict';

function escapeNonWords(s) {
    return s.replace(/[_\W]+/g, "-");
}

var socket = io();
var plots = {}; // Map of sensor -> chart

//Variables used for the canvas.
var x_pos = 0;
var y_pos = 0;
var blocksize = 20;
var ball_size = 10
var offset = 5; //Moves the ball object into center
//TODO: Find a dynamic offset value, maybe derive from c.height & c.width
var c, ctx, blocksize, ball;


socket.on('data', function(pkt){
    if ((~pkt.name.indexOf("GX") || ~pkt.name.indexOf("GY")) && "GX" in plots) {
        update_g_plot(pkt);	//Update the g-force plot
    } else if (pkt.name in plots) {
        // Update the plot
        var shift = plots[pkt.name].series[0].data.length > 50;
        plots[pkt.name].series[0].addPoint(pkt.value, true, shift);
    } else {
        // Element does not exists, create it
        if (~pkt.name.indexOf("GX") || ~pkt.name.indexOf("GY")){
            create_g_plot();
        } else {
            //Element is a standard line plot
            create_line_plot(pkt);
        }
    }
    $(function() {
        $("#plots").sortable();
        $("#plots").disableSelection();
    });
});

function is_in_circle(x) {
    x = x/4;                            //Only every 4th is a new pixel
    var y = Math.floor(x/ball_size);    //New line for every ball_size pixels
    x = x%ball_size;
    var dist_center = Math.sqrt(Math.pow(5 - x, 2) + Math.pow(5 - y, 2)); //Euclidian distance to center
    window.alert(dist_center);
    if (dist_center >= 2.5) {
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
	//Element is a G-force graph - only make on GX event.
	//GX, GY is a html5 canvas element
	$('#plots').append('<canvas class="ui-state-default" id="GX"/>');
	c = document.getElementById("GX");
	ctx = c.getContext("2d");
	ctx.strokeStyle = "lightgrey";
	plots["GX"] = ctx; //Store canvas context in plots so it can be used out of scope.

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

	//Paint it red
	for (var i = 0; i < ball.data.length; i+=4) {
	    if (is_in_circle(i)) {
	        ball.data[i] = 255;     //Red 0-255
	        ball.data[i+1] = 0;     //Blue
	        ball.data[i+2] = 0;     //Green
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
}

function create_line_plot(packet) {
	$('#plots').append('<li class="ui-state-default" id="' + escapeNonWords(packet.name) + '"/>');
   	// $('#rawlist').append('<li><input type="checkbox" class="ui-state-default" id="' + escapeNonWords(packet.name) + '"><label for="' + escapeNonWords(packet.name) + '">' + _.escape(packet.name) + '</label><li>');
    plots[packet.name] = new Highcharts.Chart({
        chart: {
            renderTo: escapeNonWords(packet.name),
            defaultSeriesType: 'spline',
            valueDecimals: 2,
            animation: false,
        },
        title: {
            text: _.escape(packet.name),
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
            name: _.escape(packet.name),
            data: [packet.value],
        }],
    });
}