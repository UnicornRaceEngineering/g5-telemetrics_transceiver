function Debug(){
	var self = this;

	self.ERROR = 1
	self.WARNING = 2;
	self.INFO = 3;
	self.VERBOSE = 4;

	self.Enabled = false;
	self.Level = self.ERROR;
	self.Out = console.log;

	self.Print = Print;
	function Print(msg, loglevel){
		if (self.Enabled && loglevel >= self.Level)
			self.Out(createTimeStamp() + " " + msg);
	};
	self.SetOutput = SetOutput;
	function SetOutput(output){
		self.Out = output;
	};
	self.SetEnabled = SetEnabled;
	function SetEnabled(enabled){
		self.Enabled = enabled;
	};
	self.SetLogLevel = SetLogLevel;
	function SetLogLevel(loglevel){
		if (loglevel <= 4)
			self.Level = loglevel;
		else
			console.log("Debug: loglevel is out of bounds");
			process.kill();
	};

	var createTimeStamp = function(){
		var d = new Date();
		var timestamp =  "[" + ensureTwoDigits(d.getFullYear()) + "-" + ensureTwoDigits((d.getMonth()+1)) + "-" + ensureTwoDigits(d.getDate()) + " " + 
						ensureTwoDigits(d.getHours()) + "-" + ensureTwoDigits(d.getMinutes()) + "-" + ensureTwoDigits(d.getSeconds()) + "]";
		return timestamp;
	};
	var ensureTwoDigits = function(number){
		return ("0" + (number)).slice(-2);
	};
};

module.exports = new Debug();