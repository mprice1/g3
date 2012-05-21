var G3 = G3 || {};

//
// A histogram view for graphite data.
//

G3.Histogram = function(container_id, initial_data, bins) {
	var self = this;
	this.container_id = container_id;
	this.container = document.getElementById(container_id);
	this.cw = this.container.clientWidth;
	this.ch = this.container.clientHeight;

	this.metrics = [];

    // Static display sizes for layout, etc.
	var X_AXIS_MARGIN = 0,
	    Y_AXIS_MARGIN = 24,
	    METRIC_LABEL_MARGIN = 25;
	var margin = {top: 0,
				  right: 0,
				  bottom: X_AXIS_MARGIN + METRIC_LABEL_MARGIN,
				  left: Y_AXIS_MARGIN};
	this.w = this.cw - margin.left - margin.right;
	this.h = this.ch - margin.top - margin.bottom;

	// Init colors.
	this.colors = d3.scale.category20();

	// If there is initial data, populate.
	if (initial_data) this.setData(initial_data, bins);
	else throw "Histogram requires initial data";
	this.initializeScales();

	// The main graph background stuff.
	this.vis = d3.select("body").select("#" + container_id)
		.append("svg")
			.attr("width", this.w + margin.left + margin.right)
			.attr("height", this.h + margin.top + margin.bottom)
		.append("g")
			.attr("transform", "translate(" + margin.left + "," + margin.top + ")")
			.call(d3.behavior.zoom().x(this.linear_x).scaleExtent([0, 200]).on("zoom", self.redraw()));

	// Clip rectangle.
	this.vis.append("defs")
		.append("clipPath")
			.attr("id", this.container_id + "_clip")
			.append("rect")
				.attr("width", this.w)
				.attr("height", this.h);

	// Background rectangle.
	this.vis.append("rect")
		.attr("width", this.w)
		.attr("height", this.h)
		.attr("class", "graph_bg");

	// Axes
	this.vis.append("g")
      .attr("class", "y axis")
      .call(this.yAxis);

    // Label container.
    this.label_container = d3.select("body").select("#"+container_id)
    	.append("div")
        	.attr("class", "label_container")
        	.style("height", METRIC_LABEL_MARGIN)
      		.style("width", this.cw);

    this.update();
    //this.setNumBins(4);
}

// Given time series data in the form of a graphite metric object,
// create the histogram layout.
G3.Histogram.prototype.timeSeriesToHistogram = function(data, bins) {
  if (!data) return [[0,0]];
  // Make the histogram object using d3 histogram layout.
  var hist = d3.layout.histogram().value(function(d){return d[0];});
  if (bins) hist = hist.bins(bins);
  return hist(data.datapoints);
}

G3.Histogram.prototype.initializeScales = function() {
	if (!this.histogram) throw "initializeScales for Histogram requires data to be set.";
	var self = this;
	this.x = d3.scale.ordinal()
      .domain(this.histogram.map(function(d) { return d.x; }))
      .rangeRoundBands([0, this.w]);

    this.linear_x = d3.scale.linear()
      .domain([0, d3.max(this.histogram, function(d) { return (d.x+d.dx) ? (d.x+d.dx) : 0; })])
      .range([0,  d3.max(this.histogram, function(d) { return (d.x+d.dx) ? (d.x+d.dx) : 0; })]);

    this.y = d3.scale.linear()
      .domain([Math.max(0, d3.min(this.histogram, function(d) { return d.y ? d.y : 0; })- 5), d3.max(this.histogram, function(d) { return d.y ? d.y : 0; }) + 5])
      .range([this.h, 0]);

    this.yAxis = d3.svg.axis()
      .scale(self.y)
      .orient("left")
      .tickSize(-this.w);
}

G3.Histogram.prototype.setData = function(metrics, bins) {
	// Histogram is only operating on one metric, but is passed an array of metrics.
	// Thus we take the first.
	this.metric = metrics[0];	
    this.histogram = this.timeSeriesToHistogram(this.metric, bins);       
}

G3.Histogram.prototype.update = function() {
	var self = this;

	var bars = this.vis.append("g")
	.attr("clip-path", "url(#" + this.container_id + "_clip)")
	.selectAll("rect.histbar")
		.data(this.histogram);
	bars.enter().append("svg:rect")
		.attr("class", "histbar");
	bars.exit().remove();

	bars
		.attr("transform", function(d) {return "translate(" + self.x(d.x) + "," + self.y(d.y) + ")"})
		.attr("width", self.x.rangeBand())
		.attr("height", function(d) { return self.h - self.y(d.y); })
	bars.enter().append("text")
		.attr("transform", function(d) {return "translate(" + (self.x(d.x)+3) + "," + (self.h-5) + ")"})
		.attr("class", "histbar")
		.style("fill", "white")
		.text(function(d) { return "" + d3.round(d.x, 1);})
    

	// Label for the metric.
	var labels = this.label_container.selectAll("div.metric_label")
       .data([this.metric]);
    labels.enter().append("div")
      .attr("class", "metric_label");
    labels.exit().remove();

	labels
	  .text(function(d) { return d.target; })
      .selectAll("div")
      .data(function(d) { return [d.target];} )
      .enter()
      .append("div")
          .attr("class", "metric_label_color")
          .style("background-color", function(d) { return self.colors(d); } )
}

G3.Histogram.prototype.redraw = function() {
	var self = this;
	return function() {
	// Compute the width hackily
	var w = self.linear_x(self.x(self.histogram[0].x));
	w = self.linear_x(self.x(self.histogram[1].x)) - w;
	self.vis.selectAll("rect.histbar")
		.attr("transform", function(d) {return "translate(" + self.linear_x(self.x(d.x)) + "," + self.y(d.y) + ")"})
		.attr("width", w)
	self.vis.selectAll("text.histbar")
		.attr("transform", function(d) {return "translate(" + (self.linear_x(self.x(d.x))+3) + "," + (self.h-5) + ")"})
	}
}

G3.Histogram.prototype.setNumBins = function(num_bins) {
	this.setData([this.metric], num_bins);
}
