var G3 = G3 || {};

//
// An interactive line graph view for graphite data.
//

G3.LineGraph = function(container_id, initial_data, g_element) {
  var self = this;
  this.container_id = container_id;
        this.container = document.getElementById(container_id);
        this.cx = this.container.clientWidth;
    this.cy = this.container.clientHeight;
    this.vertical_zoom = false;
        this.graphElement = g_element;
    // The default date range is the last 24 hour period.
    this.x_max = new Date();
    this.x_min = new Date();
    this.x_min.setHours(this.x_min.getHours() - 24);
    this.min_queried_t = +this.x_min;
    this.max_queried_t = +this.x_max;

    // The default value range is 1 to 100.
    this.y_min = 0;
    this.y_max = 100;

    this.metrics = [];

    // Static display sizes for graph.
    var X_AXIS_MARGIN = 12,
        Y_AXIS_MARGIN = 24,
        METRIC_LABEL_MARGIN = 25;
    var margin = {top: 0,
                  right: 0,
                  bottom: X_AXIS_MARGIN + METRIC_LABEL_MARGIN,
                  left: Y_AXIS_MARGIN};
    this.width = this.cx - margin.left - margin.right,
    this.height = this.cy - margin.top - margin.bottom;

    // If there is data to start with, then populate the metrics list.
    // Also, frame the view around the initial data.
    if (initial_data) this.addData(initial_data);
    else this.initializeScales();

    // The main graph background stuff.
        this.vis = d3.select("body").select("#"+container_id)
      .append("svg")
        .attr("width", this.width + margin.left + margin.right)
        .attr("height", this.height + margin.top + margin.bottom)
        .attr("id", this.container_id + "_viz")
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")") 
        .call(d3.behavior.zoom().x(this.x)/*.y(this.y)*/.scaleExtent([0, 200]).on("zoom", this.redraw()));

     this.vis.append("defs").append("clipPath").attr("id", this.container_id + "_clip").append("rect")
      .attr("width", this.width)
      .attr("height", this.height);


        this.vis.append("rect")
      .attr("width", this.width)
      .attr("height", this.height);

      this.vis.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + this.height + ")")
      .call(this.xAxis);

        this.vis.append("g")
      .attr("class", "y axis")
      .call(this.yAxis);

  this.label_container = d3.select("body").select("#"+container_id).append("div")
      .attr("class", "label_container")
      .style("height", METRIC_LABEL_MARGIN)
      .style("width", this.cx)

  this.colors = d3.scale.category20();

  //
  // Hacky Manual Zooming
  // Triggers the zoom behavior by firing a mouse wheel event.
  //
  this.rdrag = false;
  this.vis.on("mousedown", function(){
    if(d3.event.button!=0) {
      self.rdrag = true;
      self.lx = d3.event.x;
    }
  })
  this.vis.on("mousemove", function(){
    if(self.rdrag) {
      var dx = d3.event.x - self.lx;
      dx = (!dx) ? 0 : dx/Math.abs(dx);
      self.lx = d3.event.x;
      if (/Firefox/.test(navigator.userAgent)) {
        // TODO: These firefox mouse events don't seem to be working
        var evt = document.createEvent("MouseEvents");
        var vvz = self.vis[0][0];
        evt.initMouseEvent('DOMMouseScroll.zoom', true, true, window, dx, 0,0,0,0,0,0,0,0,0,null);
        evt.detail = dx;
        vvz.dispatchEvent(evt);
      } else {  // If not Firefox, assume Webkit for now.
        var evt = document.createEvent("WheelEvent");
        var vvz = self.vis[0][0];
        evt.initWebKitWheelEvent(0, dx, window, 0,0,0,0, false, false, false, false);
        vvz.dispatchEvent(evt);
      }
    }
  })
  this.vis.on("mouseup", function(){ self.rdrag = false; })

  // UI arrows for toggling zoom mode.
  this.zui = this.vis.append("g")
      .attr("transform", "translate(" + (this.width - 25) + ",25)scale(.25 .25)")
      .on("click", function() { self.toggleVerticalZoom(); })

  var hzui = this.zui.append("g")
  var vzui = this.zui.append("g")
      .attr("id", this.container_id + "_vz_arrows")
      .attr("opacity", 0)

  hzui.append("g")
      .attr("transform", "rotate(90 0 0) translate(0 -50)")
      .append("path")
          .attr("d", "m0,50l-25,0l0,-75l-25,0l50,-25l50,25l-25,0l0,75l-25,0")
          .style("fill", "black")
  hzui.append("g")
      .attr("transform", "rotate(-90 0 0) translate(0 -50)")
      .append("path")
          .attr("d", "m0,50l-25,0l0,-75l-25,0l50,-25l50,25l-25,0l0,75l-25,0")
          .style("fill", "black")
  vzui.append("g")
      .attr("transform", "translate(0 -50)")
      .append("path")
          .attr("d", "m0,50l-25,0l0,-75l-25,0l50,-25l50,25l-25,0l0,75l-25,0")
          .style("fill", "black")
  vzui.append("g")
      .attr("transform", "rotate(180 0 0) translate(0 -50)")
      .append("path")
          .attr("d", "m0,50l-25,0l0,-75l-25,0l50,-25l50,25l-25,0l0,75l-25,0")
          .style("fill", "black")

  this.zui.append("text")
      .attr("x", -55)
      .attr("y", 12)
      .style("font-size", 40)
      .style("font-weight", "bold")
      .style("fill", "white")
      .text("ZOOM")
    this.update();
}

// Given raw Graphite JSON, adds it to this graph's internal data array.
// If this is the first metric in the graph, we also set the graph bounds.
G3.LineGraph.prototype.addData = function(metrics) {
  var first = !this.metrics.length;
  var xmin_o = G3.makeDate(metrics[0].datapoints[0][1]), xmax_o = 0,
          ymin_o = 0, ymax_o = 0;
  for (var i = 0; i < metrics.length; i++) {
                var metric = metrics[i];
                var data = metric.datapoints;
                G3.convertDates(data);
                this.metrics.push(metric);
                xmin_o = xmin_o < data[0][1] ? xmin_o : data[0][1];
                xmax_o = xmax_o > data[data.length-1][1] ? xmax_o : data[data.length-1][1];
                for (var j = 0; j < data.length; j++) {
                        ymin_o = ymin_o < data[j][0] ? ymin_o : data[j][0];
                        ymax_o = ymax_o > data[j][0] ? ymax_o : data[j][0];
                }
  }
  if (first) {
        this.x_max = xmax_o;
        this.x_min = xmin_o;
        this.y_max = ymax_o + (ymax_o==ymin_o ? 10 : 0);
        this.y_min = ymin_o - (ymax_o==ymin_o ? 10 : 0);
        this.min_queried_t = +this.x_min;
        this.max_queried_t = +this.x_max;
        this.query_dt = this.max_queried_t - this.min_queried_t;
        this.initializeScales();
  } else {
        this.update();
  }
}

// Similar to addData, but clears the data first.
G3.LineGraph.prototype.setData = function(metrics) {
  this.metrics = [];
  this.addData(metrics);
  this.update();
  this.vertical_zoom = false;
  this.vis.call(d3.behavior.zoom().x(this.x).scaleExtent([0, 200]).on("zoom", this.redraw()));
}

// Initialize the scale functions used for the axes of this graph.
G3.LineGraph.prototype.initializeScales = function() {
  // Scale functions
  this.x = d3.time.scale()
    .domain([this.x_min, this.x_max])
    .range([0, this.width]);

  this.y = d3.scale.linear()
    .domain([this.y_min, this.y_max])
    .range([this.height, 0]);

  this.xAxis = d3.svg.axis()
    .scale(this.x)
    .orient("bottom")
    .tickSize(-this.height)
    .tickFormat(d3.time.format("%m/%d %H:%M"));

  this.yAxis = d3.svg.axis()
    .scale(this.y)
    .orient("left")
    .ticks(5)
    .tickSize(-this.width);
}

// Update the graph with new data.
G3.LineGraph.prototype.update = function() {
  var self = this;

  // We bind an svg group to each metrico.
  var metric_groups = this.vis.selectAll("g.metric_group")
        .data(this.metrics)

  metric_groups.enter().append("g")
        .attr("class", "metric_group")
        .attr("clip-path", "url(#" + this.container_id + "_clip)")
        .style("fill", function(d,i) {  return self.colors(d.target);})
        .style("stroke", function(d,i) {  return self.colors(d.target);})

  metric_groups.exit().remove();
    // Path drawing.
        var line = d3.svg.line()
                         .x(function(d) { return self.x(d[1]); })
                         .y(function(d) { return self.y(d[0]); });

        var paths = metric_groups.selectAll("path")
                                .data(function(d) { return [d.datapoints]; })

        paths.enter().append("path")
        .attr("class", "line")

        paths.exit().transition().style("opacity","0").duration(1000).remove()

        paths.attr("d", line);

    // Labels for each metric.
    var labels = this.label_container.selectAll("div.metric_label")
      .data(this.metrics)

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

  // Hackily re-append the zoom UI to make sure it appears on top.
  this.vis[0][0].appendChild(this.zui[0][0]);
}

// Redraw the graph, assuming a possible change in scale function,
// but no change in data.
G3.LineGraph.prototype.redraw = function() {
  var self = this;
  return function() {

  // Redraw the axis labels.
  self.vis.select(".x.axis").call(self.xAxis);
  self.vis.select(".y.axis").call(self.yAxis);

  // Redraw the line.
  self.vis.selectAll("path.line")
    .attr("d", d3.svg.line()
                         .x(function(d) { return self.x(d[1]); })
                                 .y(function(d) { return self.y(d[0]); }));

  self.checkBounds();
  }
}

// Toggles between uniformly zooming and zooming only in the x direction.
G3.LineGraph.prototype.toggleVerticalZoom = function() {
  var self = this;
        this.vertical_zoom = !this.vertical_zoom;
        if (this.vertical_zoom) {
                this.vis.call(d3.behavior.zoom().x(this.x).y(this.y).scaleExtent([0, 200]).on("zoom", this.redraw()));
    d3.select("#" + self.container_id + "_vz_arrows")
      .transition()
      .attr("opacity", 1)
        } else {
                this.vis.call(d3.behavior.zoom().x(this.x).scaleExtent([0, 200]).on("zoom", this.redraw()));
    d3.select("#" + self.container_id + "_vz_arrows")
      .transition()
      .attr("opacity", 0)
  }
}

// Checks where we are w.r.t. horizontal zooming and attempts to get data from the server if it exists.
G3.LineGraph.prototype.checkBounds = function() {
  var self = this;
  var mnt = this.min_queried_t;
  var mxt = this.max_queried_t;
  var mxxt = mxt + this.query_dt;
  var mnnt = mnt - this.query_dt;
  var targets = [];
  for (var i=0; i<this.metrics.length; i++) {
    targets.push(this.metrics[i]["target"]);
  }
  if (this.x(this.min_queried_t) > 25) {
      this.min_queried_t = mnnt;
      // Get previous data and merge into graph.    
      var min_rparam = {
        "target" : targets,
        "targets": targets,
        "from"    : new Date(mnnt),
        "until"   : new Date(mnt)};
      var gg = new G3.GraphiteClient();
      gg.makeRequest(min_rparam, null, null, function(d){self.mergeData(d);});
  } 
  if (this.x(this.max_queried_t) < this.width - 25) {
      this.max_queried_t = mxxt;
      // Get future data and merge into graph.
      var max_rparam = {
        "target" : targets,
        "targets": targets,
        "from"    : new Date(mxt),
        "until"   : new Date(mxxt)};
      var gg = new G3.GraphiteClient();
      gg.makeRequest(max_rparam, null, null, function(d) {self.mergeData(d);});
  }
}

// Given some new raw Graphite JSON, merge this data into this graphs existing data.
// Update the view (without having it recenter)
G3.LineGraph.prototype.mergeData = function (nmetrics) {
  for (var i=0; i<nmetrics.length; i++) G3.convertDates(nmetrics[i]["datapoints"])
  this.metrics = G3.mergeGraphiteJson(this.metrics, nmetrics);
  this.update();
}


// Given two sets of Graphite JSON, merge them together sensibly.
G3.mergeGraphiteJson = function(dold, dnew) {
  if(dnew.length==0) return dold;
  // Returns true if a metric of metric_name is in data.
  function metricIdx(data, metric_name) {
    for (var i in data) {
      if (data[i]["target"] == metric_name) return i;
    }
    return -1;
  }

  // Given two sorted arrays of timestamp-value pairs of continuous data, merge them.
  function mergeDatapoints(dpold, dpnew) {
    if (dpnew.length == 0) return dpold;
    if (dpold.length == 0) return dpnew;
    var lb = dpold[0][1] <= dpnew[0][1] ? dpold : dpnew;
    var ub = dpold[dpold.length-1][1] >= dpnew[dpnew.length-1][1] ? dpold : dpnew;
    if (lb == ub) return lb;
    var lts = Math.max(dpold[0][1], dpnew[0][1]);
    var lbi = 0;
    var to_prepend = [];
    while (lbi<lb.length && lb[lbi][1] < lts) {
      to_prepend.push(lb[lbi]);
      lbi++;
    }
    return to_prepend.concat(ub);
  }

  for (var i=0; i<dnew.length; i++) {
    var idx = metricIdx(dold, dnew[i]["target"]);
    if (idx == -1) {
      dold.push(dnew[i]);
    } else {
      // Actually merge the metrics based on timestamps.
      dold[idx]["datapoints"] = mergeDatapoints(dold[idx]["datapoints"], dnew[i]["datapoints"]);
    }
  }
  return dold;
}
