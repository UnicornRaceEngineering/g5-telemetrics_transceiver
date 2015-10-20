'use strict';

function escapeNonWords(s) {
    return s.replace(/[_\W]+/g, "-");
}

var socket = io();
var plots = {}; // Map of sensor -> chart
var x = 0;
var y = 0;
var offset = 5;
var c, ctx, blocksize, ball;


socket.on('data', function(pkt){
    if ((~pkt.name.indexOf("GX") || ~pkt.name.indexOf("GY")) && "GX" in plots) {
        // Update the plot
        if (~pkt.name.indexOf("GX")) {
            x = pkt.value;
        } else {
            y = pkt.value;
            ctx.clearRect(0,0,c.width,c.height);      //Clear the canvas
            ctx.stroke();                             //Put it onto the canvas
            ctx.putImageData(ball, c.width/2 + x*blocksize - 5, c.height/2 + y*blocksize - 5);
        }        
    } else if (pkt.name in plots) {
        // Update the plot
        var shift = plots[pkt.name].series[0].data.length > 50;
        plots[pkt.name].series[0].addPoint(pkt.value, true, shift);
    } else {
        // Element does not exists, create it
        if (~pkt.name.indexOf("GX") || ~pkt.name.indexOf("GY")){
            //Element is a G-force graph - only make on GX event.
            //GX, GY is a html5 canvas element
            $('#plots').append('<canvas class="ui-state-default" id="GX"/>');
            c = document.getElementById("GX");
            ctx = c.getContext("2d");
            ctx.strokeStyle = "lightgrey";
            blocksize = 40;
            plots["GX"] = ctx;
            
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

            ball = ctx.createImageData(10,10,20,20);
            for (var i = 0; i < ball.data.length; i+=4) {
                ball.data[i] = 255;
                ball.data[i+3] = 255;
            };
            ctx.stroke();
            //TODO: Find a dynamic offset value, maybe derive from c.height & c.width
            ctx.putImageData(ball, c.width/2 - offset, c.height/2 - offset);
        } else {
            //Element is a standard line plot
            $('#plots').append('<li class="ui-state-default" id="' + escapeNonWords(pkt.name) + '"/>');
           // $('#rawlist').append('<li><input type="checkbox" class="ui-state-default" id="' + escapeNonWords(pkt.name) + '"><label for="' + escapeNonWords(pkt.name) + '">' + _.escape(pkt.name) + '</label><li>');
            plots[pkt.name] = new Highcharts.Chart({
                chart: {
                    renderTo: escapeNonWords(pkt.name),
                    defaultSeriesType: 'spline',
                    valueDecimals: 2,
                    animation: false,
                },
                title: {
                    text: _.escape(pkt.name),
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
                    name: _.escape(pkt.name),
                    data: [pkt.value],
                }],
            });
        }
    }
    $(function() {
        $("#plots").sortable();
        $("#plots").disableSelection();
    });
});