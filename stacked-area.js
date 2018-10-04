let svg,
  focus,
  context,
  svgWidth,
  svgHeight,
  focusHeight = 352,
  margin = { top: 20, right: 20, bottom: 30, left: 50 },
  margin2 = { top: focusHeight + 56, right: 20, bottom: 30, left: 40 },
  width,
  height,
  height2,
  labels,
  handle,
  configStuff;

const parseDate = d3.timeFormat('%H:%M');

let x = d3.scaleTime(),
  x2 = d3.scaleTime(),
  y = d3.scaleLinear(),
  y2 = d3.scaleLinear(),
  z;

let customXAxis;

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

let brush = d3.brushX();

let zoom = d3
  .zoom()
  .scaleExtent([1, Infinity])
  .on('zoom', zoomed);

let xAxis = d3.axisTop(x),
  xAxis2 = d3.axisTop(x2),
  yAxis = d3.axisRight(y);

// voronoi layout
let voronoi = d3
  .voronoi()
  .x(function(d) {
    return x(d.x);
  })
  .y(function(d) {
    return y(d.y);
  });

const dispatch = d3.dispatch('mousedOver', 'mousedOut');

let pointData = null;

let wrapper;

let threshold, thresholdLabel;

window.addEventListener('resize', function() {
  const debounce = _.debounce(resizeChart, 250);
  debounce();
});

let cacheResize;

function resizeChart() {
  const resizeWidth = parseInt(wrapper.style('width'));

  if (resizeWidth < width || cacheResize < resizeWidth) {
    console.log('resize');
    cacheResize = resizeWidth;
    width = resizeWidth;
    x.range([0, resizeWidth]);
    x2.range([0, resizeWidth]);

    focus.select('.area').attr('d', area);
    focus.select('.x-axis').call(customXAxis);
    focus
      .select('.threshold')
      .datum(threshold)
      .call(drawThresholdLine);

    context.select('.area').attr('d', area2);
    context.select('.x-axis').call(xAxis2);
    context.call(brush).call(brush.move, x2.range());

    d3.select('.circles')
      .selectAll('circle')
      .call(positionCircles);

    drawVoronoi();
  }
}

function drawChart(config) {
  configStuff = config;
  wrapper = d3.select(config.selector);
  wrapperHeight = parseInt(wrapper.style('height'));
  wrapperWidth = parseInt(wrapper.style('width'));
  (width = wrapperWidth - margin.left - margin.right),
    (height = focusHeight - margin.top - margin.bottom);
  height2 = +wrapperHeight - margin2.top - margin2.bottom;

  z = d3.scaleOrdinal(config.layerColors);

  brush.extent([[0, 0], [width, height2]]).on('start brush end', brushed);
  x.range([0, width]);
  x2.range([0, width]);
  y.range([height, 0]), y2.range([height2, 0]);
  yAxis.tickSize(width);
  xAxis.tickSize(height);
  xAxis2.tickSize(height2);
  zoom
    .translateExtent([[0, 0], [width, height]])
    .extent([[0, 0], [width, height]]);

  voronoi.extent([[-1, -1], [width + 1, height + 1]]);

  function customYAxis(g) {
    g.call(yAxis);
    g.select('.domain').remove();
    g.selectAll('.tick line')
      .attr('stroke', '#E4E4E4')
      .attr('stroke-width', '1px')
      .style('opacity', 0.8);
    g.selectAll('.tick text')
      .attr('x', -14)
      .attr('dy', 2);
  }

  customXAxis = function(g) {
    g.call(xAxis);
    g.select('.domain').remove();
    g.selectAll('.tick line')
      .attr('stroke', '#E4E4E4')
      .attr('stroke-width', '1px')
      .style('opacity', 0.8);
    g.selectAll('.tick text')
      .attr('x', 0)
      .attr('dy', focusHeight - margin.bottom);
  };

  function customXAxis2(g) {
    g.call(xAxis2);
    g.select('.domain').remove();
    g.selectAll('.tick line')
      .attr('stroke', '#E4E4E4')
      .attr('stroke-width', '1px')
      .style('opacity', 0.8);
    g.selectAll('.tick text')
      .attr('x', 0)
      .attr('dy', height2 + margin2.bottom / 2);
  }

  svg = d3
    .select(config.selector)
    .append('svg')
    .attr('height', wrapperHeight)
    .attr('width', wrapperWidth);

  svg
    .append('defs')
    .append('clipPath')
    .attr('id', 'clip')
    .append('rect')
    .attr('width', width)
    .attr('height', height);

  focus = svg
    .append('g')
    .attr('class', 'focus')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

  const bgFocus = focus.append('g').attr('class', 'background');
  bgFocus
    .append('path')
    .attr('class', 'background-focus')
    .attr('fill', 'none')
    .attr('stroke', '#E4E4E4')
    .attr('d', function(d) {
      return `M0,0 L${width} 0`;
    });

  context = svg
    .append('g')
    .attr('class', 'context')
    .attr('transform', 'translate(' + margin.left + ',' + margin2.top + ')');

  const contextBg = context.append('g').attr('class', 'context-background');

  contextBg
    .append('rect')
    .attr('class', 'background-context')
    .attr('height', height2)
    .attr('fill', 'none')
    .attr('stroke', '#E4E4E4')
    .attr('width', width);

  let g = svg
    .append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

  if (config.data) {
    let data = config.data.data;
    threshold = config.data.percentile95;
    thresholdLabel = config.threshold;
    labels = config.tooltip;

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

    const minDate = new Date(config.data.range.min);
    const maxDate = new Date(config.data.range.max);

    x.domain([minDate, maxDate]);
    z.domain(keys);
    y.domain([0, maxVal]);
    x2.domain(x.domain());
    y2.domain(y.domain());
    stack.keys(keys).order(d3.stackOrderReverse);

    const bgHeight = focusHeight - margin.top - margin.bottom;

    // focus y axis
    focus
      .append('g')
      .attr('class', 'y-axis')
      .call(customYAxis);

    //focus x axis
    focus
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', 'translate(0,' + height + ')')
      .call(customXAxis);

    // area chart
    let areaLayer = focus
      .selectAll('.layer')
      .data(stack(data))
      .enter()
      .append('g')
      .attr('class', 'layer');

    areaLayer
      .append('path')
      .attr('class', 'area')
      .attr('id', d => d.key)
      .style('opacity', 0.9)
      .style('fill', function(d) {
        return z(d.key);
      })
      .attr('d', area);

    pointData = generatePointData(stack(data)); // data for circles and voronoi

    // circles
    let circleGroup = focus.append('g').attr('class', 'circles');

    circleGroup
      .selectAll('circle')
      .data(pointData)
      .enter()
      .append('circle')
      .attr('class', (d, i) => {
        return `circle-${i}`;
      })
      .attr('r', 8)
      .attr('fill', '#fff')
      .attr('stroke-width', '5px')
      .attr('stroke', d => {
        return z(d.key);
      })
      .attr('opacity', 0)
      .call(positionCircles);

    drawVoronoi();

    focus = areaLayer;

    // brush x axis
    context
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', 'translate(0,' + height2 + ')')
      .call(customXAxis2);

    // brush layer
    context = context
      .selectAll('.layer')
      .data(stack(data))
      .enter()
      .append('g')
      .attr('class', 'layer');

    context
      .append('path')
      .attr('class', 'area')
      .style('fill', function(d) {
        return z(d.key);
      })
      .attr('d', area2);

    // brush
    let gBrush = context
      .append('g')
      .attr('class', 'brush')
      .call(brush);

    handle = gBrush
      .selectAll('.handle--custom--group')
      .data([{ type: 'w' }, { type: 'e' }])
      .enter()
      .append('g')
      .attr('class', 'handle--custom--group');

    handle
      .append('path')
      .attr('class', 'handle--custom')
      .attr('fill', '#7AB800')
      .attr('stroke', '#7AB800')
      .attr('d', d => {
        if (d.type === 'e') {
          return `M0,-21 L-46,-21 L-46,0 L-2,0 L0,74`;
        }
        return 'M 0,-21 L 46,-21 L46,0 L2,0 L0,74';
      });

    handle
      .append('text')
      .attr('class', 'custom-handle-text')
      .attr('fill', '#fff')
      .style('font-size', '11px')
      .attr('dx', d => {
        if (d.type === 'e') {
          return -30;
        }
        return 16;
      })
      .attr('dy', -8);

    gBrush.call(brush.move, x2.range());

    // threshold line
    focus
      .append('path')
      .attr('class', 'threshold')
      .datum(threshold)
      .attr('stroke-width', '1px')
      .attr('stroke', '#7AB800')
      .call(drawThresholdLine);

    focus
      .append('text')
      .attr('class', 'threshold-label')
      .datum(threshold)
      .attr('fill', '#568F00')
      .attr('x', 5)
      .attr('y', d => {
        const yPos = Math.floor(y(d));
        return yPos - 5;
      })
      .text(d => {
        return config.threshold.replace('val', d);
      });

    // zoom rect
    svg
      .append('rect')
      .attr('class', 'zoom')
      .attr('width', width)
      .attr('height', height)
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
      .call(zoom);

    // custom mouseover events for layer paths to highlight when voronoi is interacted with
    dispatch.on('mousedOver', function(sel) {
      d3.select(`#${sel}`).attr('opacity', 0.7);
    });

    dispatch.on('mousedOut', function(sel) {
      d3.select(`#${sel}`).attr('opacity', 1);
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
    .attr('cx', d => {
      return x(d.x);
    })
    .attr('cy', d => {
      return y(d.y);
    });
}

function drawVoronoi(sel) {
  d3.select('g.polygons').remove(); // remove

  // redraw
  let polygonGroup = svg.append('g').attr('class', 'polygons');

  polygonGroup
    .selectAll('path')
    .data(voronoi.polygons(pointData))
    .enter()
    .append('path')
    .attr('fill', 'none')
    .attr('stroke', 'none')
    .attr('class', (d, i) => {
      return `polygon-${i}`;
    })
    .attr('key', d => {
      return d ? d.data.key : '';
    })
    .style('pointer-events', 'all')
    .call(redrawPolygon)
    .on('mouseover', mouseover)
    .on('mouseout', mouseout);
}

function mouseover() {
  dispatch.call('mousedOver', this, d3.select(this).attr('key'));
  const className = d3.select(this).attr('class');
  togglePoint(1, className);
}

function mouseout() {
  dispatch.call('mousedOut', this, d3.select(this).attr('key'));
  const className = d3.select(this).attr('class');
  togglePoint(0, className);
}

function togglePoint(val, className) {
  const id = getIdFromString(className);
  const sel = `circle.circle-${id}`;
  d3.select(sel).attr('opacity', val);

  const cx = d3.select(sel).attr('cx'),
    cy = d3.select(sel).attr('cy'),
    d = d3.select(sel).data();

  let label = configStuff.tooltip.label;
  label = label.replace('val1', configStuff.tooltip.map[d[0].key]);
  label = label.replace('val2', d[0].y);

  const debounced = _.debounce(() => {
    var event = new CustomEvent('toggleTooltip', {
      detail: { show: val, xPos: cx, yPos: cy, label: label }
    });

    document.querySelector('div.container').dispatchEvent(event);
  }, 150);

  debounced();
}

function getIdFromString(className) {
  const regex = /[0-9]+/g;
  return className.match(regex).map(Number)[0];
}

function redrawPolygon(polygon) {
  polygon.attr('d', function(d) {
    return d ? 'M' + d.join('L') + 'Z' : null;
  });
}

function drawThresholdLine(line) {
  line.attr('d', d => {
    const yPos = Math.floor(y(d));
    return `M0,${yPos}, L${width},${yPos}Z`;
  });
}

function positionThresholdText(text) {
  const yPos = Math.floor(y(d));
  text
    .attr('x', 0)
    .attr('y', yPos)
    .text('test');
}

function brushed() {
  // custom handle
  var s = d3.event.selection;
  if (s == null) {
    handle.attr('display', 'none');
  } else {
    var sx = s.map(x2.invert);
    handle.selectAll('text').text(d => {
      const val = d.type === 'w' ? sx[0] : sx[1];
      return parseDate(val);
    });

    handle.attr('transform', function(d, i) {
      return 'translate(' + s[i] + ',' + 0 + ')';
    });
  }

  // zoom
  if (d3.event.sourceEvent && d3.event.sourceEvent.type === 'zoom') return; // ignore brush-by-zoom
  var s = d3.event.selection || x2.range();
  x.domain(s.map(x2.invert, x2));
  focus.select('.area').attr('d', area);
  focus.select('.x-axis').call(customXAxis);
  d3.select('.circles')
    .selectAll('circle')
    .call(positionCircles);
  drawVoronoi();
  svg
    .select('.zoom')
    .call(
      zoom.transform,
      d3.zoomIdentity.scale(width / (s[1] - s[0])).translate(-s[0], 0)
    );
}

function brushmoved() {
  var s = d3.event.selection;
  if (s == null) {
    handle.attr('display', 'none');
  } else {
    handle.attr('transform', function(d, i) {
      return 'translate(' + s[i] + ',' + 0 + ')';
    });
  }
}

function zoomed() {
  if (d3.event.sourceEvent && d3.event.sourceEvent.type === 'brush') return; // ignore zoom-by-brush
  var t = d3.event.transform;
  x.domain(t.rescaleX(x2).domain());
  focus.select('.area').attr('d', area);
  focus.select('.x-axis').call(customXAxis);
  d3.select('.circles')
    .selectAll('circle')
    .call(positionCircles);
  drawVoronoi();
  context.select('.brush').call(brush.move, x.range().map(t.invertX, t));
}
