let svg,
  focus,
  context,
  svgWidth = 1355,
  svgHeight = 530,
  focusHeight = 500,
  margin = { top: 20, right: 20, bottom: 130, left: 50 },
  margin2 = { top: 430, right: 20, bottom: 30, left: 40 },
  width = svgWidth - margin.left - margin.right,
  height = focusHeight - margin.top - margin.bottom;
height2 = +svgHeight - margin2.top - margin2.bottom;

const parseDate = d3.timeFormat("%H:%M:%S");

let x = d3.scaleTime().range([0, width]),
  x2 = d3.scaleTime().range([0, width]),
  y = d3.scaleLinear().range([height, 0]),
  y2 = d3.scaleLinear().range([height2, 0]),
  z = d3.scaleOrdinal(["#F24092", "#007DB8"]);

let stack = d3.stack();

let area = d3
  .area()
  .x(function(d, i) {
    return x(d.data.time);
  })
  .y0(function(d) {
    return y(d[0]);
  })
  .y1(function(d) {
    return y(d[1]);
  });

let area2 = d3
  .area()
  .x(function(d, i) {
    return x2(d.data.time);
  })
  .y0(function(d) {
    return y2(d[0]);
  })
  .y1(function(d) {
    return y2(d[1]);
  });

let brush = d3
  .brushX()
  .extent([[0, 0], [width, height2]])
  .on("brush end", brushed);

let zoom = d3
  .zoom()
  .scaleExtent([1, Infinity])
  .translateExtent([[0, 0], [width, height]])
  .extent([[0, 0], [width, height]])
  .on("zoom", zoomed);

let xAxis = d3.axisBottom(x),
  xAxis2 = d3.axisBottom(x2),
  yAxis = d3.axisLeft(y);

// voronoi layout
let voronoi = d3
  .voronoi()
  .x(function(d) {
    return x(d.x);
  })
  .y(function(d) {
    return y(d.y);
  })
  .extent([[-1, -1], [width + 1, height + 1]]);

const dispatch = d3.dispatch("mousedOver", "mousedOut");

let pointData = null;

let wrapper;

let threshold;

window.addEventListener("resize", function() {
  resizeChart();
});

function resizeChart() {
  console.log("resize");
  const resizeWidth = parseInt(wrapper.style("width"));
  console.log(resizeWidth);

  if (resizeWidth < svgWidth || width < resizeWidth) {
    width = resizeWidth;
    x.range([0, resizeWidth]);
    x2.range([0, resizeWidth]);

    // x.domain([0, resizeWidth]);
    focus.select(".area").attr("d", area);
    focus.select(".x-axis").call(xAxis);
    focus
      .select(".threshold")
      .datum(threshold)
      .call(drawThresholdLine);

    context.select(".area").attr("d", area2);
    context.select(".x-axis").call(xAxis2);
    //   context.call(brush).call(brush.move, x2.range());

    d3.select(".circles")
      .selectAll("circle")
      .call(positionCircles);
    drawVoronoi();
  }
}

function drawChart(container, dataSource) {
  wrapper = d3.select(container);

  svg = d3
    .select(container)
    .append("svg")
    .attr("height", svgHeight)
    .attr("width", svgWidth);

  svg
    .append("defs")
    .append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

  focus = svg
    .append("g")
    .attr("class", "focus")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  context = svg
    .append("g")
    .attr("class", "context")
    .attr("transform", "translate(" + margin2.left + "," + margin2.top + ")");

  let g = svg
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  if (dataSource) {
    let data = dataSource.data;
    threshold = dataSource.percentile95;

    const keys = d3.keys(data[0]).slice(1);

    // mutate data to append time in correct format
    data = data
      .map((d, i) => {
        return { ...d, time: new Date(d.t), id: i };
      })
      .sort((a, b) => {
        return a.time > b.time ? 1 : -1;
      });

    // get a sum of all values to use for y scale
    const maxVal = Math.floor(
      d3.max(data, d => {
        const vals = keys.map(k => {
          return d[k];
        });
        return d3.sum(vals);
      })
    );

    const minDate = new Date(dataSource.range.min);
    const maxDate = new Date(dataSource.range.max);

    x.domain([minDate, maxDate]);
    z.domain(keys);
    y.domain([0, maxVal]);
    x2.domain(x.domain());
    y2.domain(y.domain());
    stack.keys(keys).order(d3.stackOrderReverse);

    // area chart
    let areaLayer = focus
      .selectAll(".layer")
      .data(stack(data))
      .enter()
      .append("g")
      .attr("class", "layer");

    areaLayer
      .append("path")
      .attr("class", "area")
      .attr("id", d => d.key)
      .style("opacity", 0.8)
      .style("fill", function(d) {
        return z(d.key);
      })
      .attr("d", area);

    pointData = generatePointData(stack(data)); // data for circles and voronoi

    // circles
    let circleGroup = focus.append("g").attr("class", "circles");

    circleGroup
      .selectAll("circle")
      .data(pointData)
      .enter()
      .append("circle")
      .attr("class", (d, i) => {
        return `circle-${i}`;
      })
      .attr("r", 8)
      .attr("fill", "#fff")
      .attr("stroke-width", "5px")
      .attr("stroke", d => {
        return z(d.key);
      })
      .attr("opacity", 0)
      .call(positionCircles);

    drawVoronoi();

    focus = areaLayer;

    //focus x axis
    focus
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis);

    // focus y axis
    focus
      .append("g")
      .attr("class", "y-axis")
      .call(yAxis);

    // brush layer
    context = context
      .selectAll(".layer")
      .data(stack(data))
      .enter()
      .append("g")
      .attr("class", "layer");

    context
      .append("path")
      .attr("class", "area")
      .style("fill", function(d) {
        return z(d.key);
      })
      .attr("d", area2);

    // brush x axis
    context
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", "translate(0," + height2 + ")")
      .call(xAxis2);

    // brush
    context
      .append("g")
      .attr("class", "brush")
      .call(brush)
      .call(brush.move, x.range());

    // threshold line
    focus
      .append("path")
      .attr("class", "threshold")
      .datum(threshold)
      .attr("stroke-width", "1px")
      .attr("stroke", "#7AB800")
      .call(drawThresholdLine);

    // zoom rect
    svg
      .append("rect")
      .attr("class", "zoom")
      .attr("width", width)
      .attr("height", height)
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
      .call(zoom);

    // custom mouseover events for layer paths to highlight when voronoi is interacted with
    dispatch.on("mousedOver", function(sel) {
      d3.select(`#${sel}`).attr("opacity", 0.7);
    });

    dispatch.on("mousedOut", function(sel) {
      d3.select(`#${sel}`).attr("opacity", 1);
    });
  }
}

function generatePointData(stackData) {
  // create data for circles and voronoi
  const temp = [];
  stackData.forEach(d => {
    const points = d
      .filter(p => {
        // filter out data that has 0 value
        return p.data[d.key] > 0;
      })
      .map(f => {
        return { x: f.data.time, y: f[1], key: d.key };
      });
    temp.push(points);
  });

  return _.flatten(temp); // data for circles and voronoi
}

function positionCircles(circle) {
  circle
    .attr("cx", d => {
      return x(d.x);
    })
    .attr("cy", d => {
      return y(d.y);
    });
}

function drawVoronoi(sel) {
  d3.select("g.polygons").remove(); // remove

  // redraw
  let polygonGroup = svg.append("g").attr("class", "polygons");

  polygonGroup
    .selectAll("path")
    .data(voronoi.polygons(pointData))
    .enter()
    .append("path")
    .attr("fill", "none")
    .attr("stroke", "none")
    .attr("class", (d, i) => {
      return `polygon-${i}`;
    })
    .attr("key", d => {
      return d ? d.data.key : "";
    })
    .style("pointer-events", "all")
    .call(redrawPolygon)
    .on("mouseover", mouseover)
    .on("mouseout", mouseout);
}

function mouseover() {
  dispatch.call("mousedOver", this, d3.select(this).attr("key"));
  const className = d3.select(this).attr("class");
  togglePoint(1, className);
}

function mouseout() {
  dispatch.call("mousedOut", this, d3.select(this).attr("key"));
  const className = d3.select(this).attr("class");
  togglePoint(0, className);
}

function togglePoint(val, className) {
  const id = getIdFromString(className);
  const sel = `circle.circle-${id}`;
  d3.select(sel).attr("opacity", val);
}

function getIdFromString(className) {
  const regex = /[0-9]+/g;
  return className.match(regex).map(Number)[0];
}

function redrawPolygon(polygon) {
  polygon.attr("d", function(d) {
    return d ? "M" + d.join("L") + "Z" : null;
  });
}

function drawThresholdLine(line) {
  console.log(line);
  line.attr("d", d => {
    const yPos = Math.floor(y(d));
    console.log("d", d);
    return `M0,${yPos}, L${width},${yPos}Z`;
  });
}

function brushed() {
  if (d3.event.sourceEvent && d3.event.sourceEvent.type === "zoom") return; // ignore brush-by-zoom
  var s = d3.event.selection || x2.range();
  x.domain(s.map(x2.invert, x2));
  focus.select(".area").attr("d", area);
  focus.select(".x-axis").call(xAxis);
  d3.select(".circles")
    .selectAll("circle")
    .call(positionCircles);
  drawVoronoi();
  svg
    .select(".zoom")
    .call(
      zoom.transform,
      d3.zoomIdentity.scale(width / (s[1] - s[0])).translate(-s[0], 0)
    );
}

function zoomed() {
  if (d3.event.sourceEvent && d3.event.sourceEvent.type === "brush") return; // ignore zoom-by-brush
  var t = d3.event.transform;
  x.domain(t.rescaleX(x2).domain());
  focus.select(".area").attr("d", area);
  focus.select(".x-axis").call(xAxis);
  d3.select(".circles")
    .selectAll("circle")
    .call(positionCircles);
  drawVoronoi();
  context.select(".brush").call(brush.move, x.range().map(t.invertX, t));
}
