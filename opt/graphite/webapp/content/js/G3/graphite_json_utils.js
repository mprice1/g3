var G3 = G3 || {};

//
// Class GraphiteClient is an abstraction for sending requests to a Graphite server.
//

// Constructor stores the server URL.  If the server is the same as the server for this file
// it may be omitted.
G3.GraphiteClient = function(server_url) {
	this.server = server_url ? server_url : "";
}

// Makes and sends a request to the graphite server.
// Executes the provided callback when the request comes back.
// The callback is expected to take the parsed JSON result as a parameter.
G3.GraphiteClient.prototype.makeRequest = function (params, id, record, callback) {
  var qurl = this.makeQueryURL(new G3.GraphiteRequestParams(params));
  var request = new XMLHttpRequest();
  request.open("GET", qurl, true);
  request.send();
  request.onreadystatechange = function() {
  	if (request.readyState == 4) {
  		callback(JSON.parse(request.responseText), id, record);
  	}
  }
}

G3.GraphiteClient.prototype.makeUpdateRequest = function (params, graph, callback) {
  var qurl = this.makeQueryURL(new G3.GraphiteRequestParams(params));
  var request = new XMLHttpRequest();
  request.open("GET", qurl, true);
  request.send();
  request.onreadystatechange = function() {
  	if (request.readyState == 4) {
  		callback(JSON.parse(request.responseText), graph);
  	}
  }
}

G3.GraphiteClient.prototype.makeQueryURL = function(params) {
  var qurl = this.server + "/render?";
  for (var i = 0; i < params.targets.length; i++) {
  	qurl = qurl + "&target=" + params.targets[i];
  }
  qurl = qurl + "&from=" + params.from
  			  + "&until=" + params.until
  			  + "&format=json";
  return qurl;
}

//
// Class GraphiteRequestParams.
// A container for  request parameters that ensures reasonable defaults.
// This constructor is called by GraphiteClient.makeRequest(), so you shouldn't
// need to call it directly.
//

G3.GraphiteRequestParams = function(params) {
	// Targets should be an array of metric names.
	this.targets = params.target ? params.target : [];
	// "from" and "until" may be either javascript Date objects or strings. 
	if (params.from)
		this.from = params.from instanceof Date ? G3.dateToQueryDateString(params.from) : params.from;
	else this.from = "-24h";
	if (params.until)
		this.until = params.until instanceof Date ? G3.dateToQueryDateString(params.until) : params.until;
	else this.until = "-0h";
}

//
// Static utility functions.
//

// Converts a javascript Date object into an absolute time string of the form HH:MM_YYYYMMDD.
G3.dateToQueryDateString = function(d) {
  return (+d)/1000;
  var h = d.getHours(),
  	  min = d.getMinutes(),
  	  y = d.getUTCFullYear(),
  	  mon = d.getUTCMonth(),
  	  day = d.getUTCDate();
  return "" + (h<10? "0" : "") + h + ":"
            + (min<10? "0" : "") + min + "_"
            + y
            + (mon<10 ? "0" : "") + mon
            + (day<10 ? "0" : "") + day;
}

// Returns a javascript Date object from the graphite time value (which is in seconds instead of milliseconds).
G3.makeDate = function(t) {
  return new Date(t * 1000);
}

// Given the datapoints array of a metric, convert all dates to javascript objects.
G3.convertDates = function(datapoints) {
  // First verify that it isn't already!
  if (datapoints.length==0 || datapoints[0][1] instanceof Date) return;
  for (var i = 0; i < datapoints.length; i++) datapoints[i][1] = G3.makeDate(datapoints[i][1]);
}
