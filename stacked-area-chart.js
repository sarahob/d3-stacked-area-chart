class StackedAreaChart {
  constructor(config) {
    this.config = config;

    this.width = 0;
    this.focusMargin = 0;
    this.contextMargin = 0;
    this.focusHeight = 0;
    this.contextHeight = 0;
    this.handle = null;

    this.parseDate = d3.timeFormat('%H:%M');

    this.xScaleFocus = d3.scaleTime();
    this.xScaleContext = d3.scaleTime();
    this.yScaleFocus = d3.scaleLinear();
    this.yScaleContext = d3.scaleLinear();
    this.colorScale = d3.scaleOrdinal();

    this.brushSelection = [];

    this.stack = d3.stack();

    this.areaFocus = d3
      .area()
      .x((d, i) => {
        return this.xScaleFocus(d.data.time);
      })
      .y0(d => {
        return this.yScaleFocus(d[0]);
      })
      .y1(d => {
        return this.yScaleFocus(d[1]);
      });

    this.areaContext = d3
      .area()
      .x(d => {
        return this.xScaleContext(d.data.time);
      })
      .y0(d => {
        return this.yScaleContext(d[0]);
      })
      .y1(d => {
        return this.yScaleContext(d[1]);
      });

    this.brush = d3.brushX();

    this.zoom = d3
      .zoom()
      .scaleExtent([1, Infinity])
      .on('zoom', this.zoomed.bind(this));

    this.xAxisFocus = d3.axisTop(this.xScaleFocus);
    this.xAxisContext = d3.axisTop(this.xScaleContext);
    this.yAxisFocus = d3.axisRight(this.yScaleFocus);

    // voronoi layout
    this.voronoi = d3
      .voronoi()
      .x(d => {
        return this.xScaleFocus(d.x);
      })
      .y(d => {
        return this.yScaleFocus(d.y);
      });

    this.dispatch = d3.dispatch('mousedOver', 'mousedOut');

    this.pointData = [];

    this.cacheResize;
  }

  get chartInstance() {
    return this;
  }

  draw() {
    const wrapper = d3.select(this.config.selector);
    const wrapperHeight = parseInt(wrapper.style('height'));
    const wrapperWidth = parseInt(wrapper.style('width'));
    const width =
      wrapperWidth < this.config.layout.maxWidth
        ? wrapperWidth
        : this.config.layout.maxWidth;
    this.focusMargin = this.config.layout.focusMargin;
    this.focusHeight = this.config.layout.height;
    this.contextMargin = this.config.layout.contextMargin;
    this.width = width - this.focusMargin.left - this.focusMargin.right;
    const height =
      this.focusHeight - this.focusMargin.top - this.focusMargin.bottom;
    this.contextHeight =
      +wrapperHeight - this.contextMargin.top - this.contextMargin.bottom;

    this.colorScale.range(this.config.layerColors);

    this.brush
      .extent([[0, 0], [this.width, this.contextHeight]])
      .on('start brush end', this.brushed.bind(this));
    this.xScaleFocus.range([0, this.width]);
    this.xScaleContext.range([0, this.width]);
    this.yScaleFocus.range([height, 0]),
      this.yScaleContext.range([this.contextHeight, 0]);
    this.yAxisFocus.tickSize(this.width);
    this.xAxisFocus.tickSize(height);
    this.xAxisContext.tickSize(this.contextHeight);
    this.zoom
      .translateExtent([[0, 0], [this.width, height]])
      .extent([[0, 0], [this.width, height]]);

    this.voronoi.extent([[-1, -1], [this.width + 1, height + 1]]);

    const svg = d3
      .select(this.config.selector)
      .append('svg')
      .attr('height', wrapperHeight)
      .attr('width', wrapperWidth);

    svg
      .append('defs')
      .append('clipPath')
      .attr('id', 'clip')
      .append('rect')
      .attr('width', this.width)
      .attr('height', height);

    let focus = svg
      .append('g')
      .attr('class', 'focus')
      .attr(
        'transform',
        'translate(' + this.focusMargin.left + ',' + this.focusMargin.top + ')'
      );

    let context = svg
      .append('g')
      .attr('class', 'context')
      .attr(
        'transform',
        'translate(' +
          this.focusMargin.left +
          ',' +
          this.contextMargin.top +
          ')'
      );

    context
      .append('rect')
      .attr('class', 'background-context')
      .attr('height', this.contextHeight)
      .attr('fill', 'none')
      .attr('stroke', '#E4E4E4')
      .attr('width', this.width);

    let data = this.config.data;
    const threshold = this.config.threshold;

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

    const minDate = new Date(this.config.range.min);
    const maxDate = new Date(this.config.range.max);

    this.xScaleFocus.domain([minDate, maxDate]);
    this.colorScale.domain(keys);
    this.yScaleFocus.domain([0, maxVal]);
    this.xScaleContext.domain(this.xScaleFocus.domain());
    this.yScaleContext.domain(this.yScaleFocus.domain());
    this.stack.keys(keys).order(d3.stackOrderReverse);

    // focus y axis
    focus
      .append('g')
      .attr('class', 'y-axis')
      .call(this.customYAxis.bind(this));

    //focus x axis
    focus
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', 'translate(0,' + height + ')')
      .call(this.customXAxisFocus.bind(this));

    // area chart
    let areaLayer = focus
      .selectAll('.layer')
      .data(this.stack(data))
      .enter()
      .append('g')
      .attr('class', 'layer');

    areaLayer
      .append('path')
      .attr('class', 'area')
      .attr('id', d => d.key)
      .style('opacity', 0.9)
      .style('fill', d => {
        return this.colorScale(d.key);
      })
      .attr('d', this.areaFocus);

    this.pointData = this.generatePointData(this.stack(data)); // data for circles and voronoi

    // circles
    let circleGroup = focus.append('g').attr('class', 'circles');

    circleGroup
      .selectAll('circle')
      .data(this.pointData)
      .enter()
      .append('circle')
      .attr('class', (d, i) => {
        return `circle-${i}`;
      })
      .attr('r', 8)
      .attr('fill', '#fff')
      .attr('stroke-width', '5px')
      .attr('stroke', d => {
        return this.colorScale(d.key);
      })
      .attr('opacity', 0)
      .call(this.positionCircles.bind(this));

    this.drawVoronoi(this.pointData);

    // brush x axis
    context
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', 'translate(0,' + this.contextHeight + ')')
      .call(this.customXAxisContext.bind(this));

    // brush layer
    context = context
      .selectAll('.layer')
      .data(this.stack(data))
      .enter()
      .append('g')
      .attr('class', 'layer');

    context
      .append('path')
      .attr('class', 'area')
      .style('fill', d => {
        return this.colorScale(d.key);
      })
      .attr('d', this.areaContext);

    // brush
    let gBrush = d3
      .select('.context')
      .append('g')
      .attr('class', 'brush')
      .call(this.brush);

    this.handle = gBrush
      .selectAll('.handle-custom-group')
      .data([{ type: 'w' }, { type: 'e' }])
      .enter()
      .append('g')
      .attr('class', 'handle-custom-group');

    this.handle
      .append('path')
      .attr('class', d => {
        const pos = d.type === 'w' ? 'left' : 'right';
        return `'handle-custom ${pos}`;
      })
      .attr('fill', '#7AB800')
      .attr('stroke', '#7AB800')
      .style('cursor', 'pointer')
      .attr('d', d => {
        if (d.type === 'e') {
          return `M0,-21 L-46,-21 L-46,0 L-2,0 L0,74`;
        }
        return 'M 0,-21 L 46,-21 L46,0 L2,0 L0,74';
      });

    this.handle
      .append('text')
      .attr('class', d => {
        const pos = d.type === 'e' ? 'txt-right' : 'txt-left';
        return `custom-handle-text ${pos}`;
      })
      .attr('fill', '#fff')
      .style('font-size', '11px')
      .style('cursor', 'pointer')
      .attr('dx', d => {
        if (d.type === 'e') {
          return -38;
        }
        return 11;
      })
      .attr('dy', -7);

    gBrush.call(this.brush.move, this.xScaleContext.range());

    // threshold line
    focus
      .append('path')
      .attr('class', 'threshold')
      .datum(threshold)
      .attr('stroke-width', '1px')
      .attr('stroke', '#7AB800')
      .attr('d', d => {
        const yPos = Math.floor(this.yScaleFocus(d));
        return `M0,${yPos}, L0,${yPos}Z`;
      })
      .call(this.drawThresholdLine.bind(this));

    focus
      .append('text')
      .attr('class', 'threshold-label')
      .datum(threshold)
      .attr('fill', '#568F00')
      .attr('x', 5)
      .attr('y', d => {
        const yPos = Math.floor(this.yScaleFocus(d));
        return yPos - 5;
      })
      .text(d => {
        return this.config.thresholdLabel(d);
      });

    // zoom rect
    svg
      .append('rect')
      .attr('class', 'zoom')
      .attr('width', this.width)
      .attr('height', height)
      .attr(
        'transform',
        'translate(' + this.focusMargin.left + ',' + this.focusMargin.top + ')'
      )
      .call(this.zoom);
  }

  customYAxis(g) {
    g.call(this.yAxisFocus);
    g.select('.domain')
      .attr('stroke', '#E4E4E4')
      .attr('stroke-width', '1px')
      .style('opacity', 0.8)
      .attr('d', () => {
        return `M0,0 L${this.width} 0`;
      });
    g.selectAll('.tick line')
      .attr('stroke', '#E4E4E4')
      .attr('stroke-width', '1px')
      .style('opacity', 0.8)
      .attr('x1', 0)
      .attr('x2', this.width);
    g.selectAll('.tick text')
      .attr('x', -14)
      .attr('dy', 2);
  }

  customXAxisFocus(g) {
    g.call(this.xAxisFocus);

    g.select('.domain')
      .attr('stroke', '#E4E4E4')
      .attr('stroke-width', '1px')
      .style('opacity', 0)
      .attr('d', () => {
        return `M0,0 L${this.width} 0`;
      });

    g.selectAll('.tick line')
      .attr('stroke', '#E4E4E4')
      .attr('stroke-width', '1px')
      .style('opacity', 0.8);
    g.selectAll('.tick text')
      .attr('x', 0)
      .attr('dy', () => {
        return this.focusHeight - this.focusMargin.bottom;
      });
  }

  customXAxisContext(g) {
    g.call(this.xAxisContext);

    g.select('.domain')
      .attr('stroke', '#E4E4E4')
      .attr('stroke-width', '1px')
      .style('opacity', 0.8)
      .attr('d', () => {
        return `M0,0 L${this.width} 0`;
      });

    g.selectAll('.tick line')
      .attr('stroke', '#E4E4E4')
      .attr('stroke-width', '1px')
      .style('opacity', 0.8);
    g.selectAll('.tick text')
      .attr('x', 0)
      .attr('dy', this.contextHeight + this.contextMargin.bottom / 2);
  }

  /**
   * Create point data for circles and voronoi from stack data
   * @param {*} stackData
   */
  generatePointData(stackData) {
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

  /**
   * Update position of circles
   * @param {*} circle
   */
  positionCircles(circle) {
    circle
      .attr('cx', d => {
        return this.xScaleFocus(d.x);
      })
      .attr('cy', d => {
        return this.yScaleFocus(d.y);
      });
  }

  /**
   *  Draw Voronoi with points data,
   *  voronoi will overlay our chart and trigger hover events when user is near a point
   * @param {*} data
   */
  drawVoronoi(data) {
    // remove existing voronoi (for redraw)
    d3.select('g.polygons').remove();

    const polygonGroup = d3
      .select('svg')
      .append('g')
      .attr('class', 'polygons');

    polygonGroup
      .selectAll('path')
      .data(this.voronoi.polygons(data))
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
      .call(this.redrawPolygon)
      .on('mouseover', (d, i) => {
        this.mouseover.apply(this, [i]);
      })
      .on('mouseout', (d, i) => {
        this.mouseout.apply(this, [i]);
      });
  }

  /**
   * Fire mouse over event
   * toggle circle point at correct position
   */
  mouseover(id) {
    // this.dispatch.call('mousedOver', this, d3.select(this).attr('key'));
    this.togglePoint(1, id);
  }

  /**
   * Fire mouse out event
   * toggle circle point at correct position
   */
  mouseout(id) {
    //   this.dispatch.call('mousedOut', this, d3.select(this).attr('key'));
    this.togglePoint(0, id);
  }

  /**
   * Toggle circle that is present within the voronoi selection
   * Fire custom event outside of chart to toggle tooltip
   * @param {*} val
   * @param {*} className
   */
  togglePoint(val, id) {
    const sel = `circle.circle-${id}`,
      cx = d3.select(sel).attr('cx'),
      cy = d3.select(sel).attr('cy'),
      d = d3.select(sel).data(),
      label = this.config.tooltipLabel(d[0].key, d[0].y);

    // toggle opacity
    d3.select(sel).attr('opacity', val);

    // only show tooltip for circles within bounds
    if (cx < this.width && cx > 0) {
      // wrap event dispatch in debounce
      const debounced = _.debounce(() => {
        var event = new CustomEvent('toggleTooltip', {
          detail: { id: id, show: val, xPos: cx, yPos: cy, label: label }
        });

        document.querySelector('div.container').dispatchEvent(event);
      }, 150);

      debounced();
    }
  }

  /**
   * Draw polygon for voronoi
   * @param {*} polygon
   */
  redrawPolygon(polygon) {
    polygon.attr('d', function(d) {
      return d ? 'M' + d.join('L') + 'Z' : null;
    });
  }

  /**
   * Draw Threshold Line
   * @param {*} line
   */
  drawThresholdLine(line) {
    line.transition().attr('d', d => {
      const yPos = Math.floor(this.yScaleFocus(d));
      return `M0,${yPos}, L${this.width},${yPos}Z`;
    });
  }

  /**
   * Brush function: transform custom handles, implement zoom
   */
  brushed() {
    const s = d3.event.selection || this.xScaleContext.range();
    const sx = s.map(this.xScaleContext.invert);

    if (s == null) {
      this.handle.attr('display', 'none');
    } else if (sx[0].toString() === sx[1].toString()) {
      return;
    } else {
      this.handle.selectAll('text').text(d => {
        const val = d.type === 'w' ? sx[0] : sx[1];
        return this.parseDate(val);
      });

      this.handle
        .attr('transform', function(d, i) {
          return 'translate(' + s[i] + ',' + 0 + ')';
        })
        .each((d, i) => {
          if (d.type === 'w') {
            if (s[i] > 46) {
              this.handle
                .select('.left')
                .transition()
                .attr('d', 'M 0,-21 L-46,-21 L-46,0 L-2,0 L0,74');

              this.handle
                .select('.txt-left')
                .transition()
                .attr('dx', '-36');
            } else {
              this.handle
                .select('.left')
                .transition()
                .attr('d', 'M 0,-21 L46,-21 L46,0 L2,0 L0,74');

              this.handle
                .select('.txt-left')
                .transition()
                .attr('dx', '11');
            }
          }

          if (d.type === 'e') {
            if (s[i] < this.width - 46) {
              this.handle
                .select('.right')
                .transition()
                .attr('d', 'M 0,-21 L 46,-21 L46,0 L2,0 L0,74');

              this.handle
                .select('.txt-right')
                .transition()
                .attr('dx', '11');
            } else {
              this.handle
                .select('.right')
                .transition()
                .attr('d', 'M 0,-21 L -46,-21 L-46,0 L-2,0 L0,74');

              this.handle
                .select('.txt-right')
                .transition()
                .attr('dx', '-36');
            }
          }
        });
    }

    // zoom
    if (d3.event.sourceEvent && d3.event.sourceEvent.type === 'zoom') return; // ignore brush-by-zoom

    this.xScaleFocus.domain(
      s.map(this.xScaleContext.invert, this.xScaleContext)
    );
    d3.select('.focus')
      .selectAll('.layer')
      .select('.area')
      .attr('d', this.areaFocus);
    d3.select('.focus')
      .selectAll('.layer')
      .select('.x-axis')
      .call(this.customXAxisFocus.bind(this));
    d3.select('.circles')
      .selectAll('circle')
      .call(this.positionCircles.bind(this));
    this.drawVoronoi(this.pointData);
    d3.select('svg')
      .select('.zoom')
      .call(
        this.zoom.transform,
        d3.zoomIdentity.scale(this.width / (s[1] - s[0])).translate(-s[0], 0)
      );
  }

  zoomed() {
    if (d3.event.sourceEvent && d3.event.sourceEvent.type === 'brush') return; // ignore zoom-by-brush
    var t = d3.event.transform;

    this.xScaleFocus.domain(t.rescaleX(this.xScaleContext).domain());
    d3.select('.focus')
      .selectAll('.layer')
      .select('.area')
      .attr('d', this.areaFocus);
    d3.select('.focus')
      .selectAll('.layer')
      .select('.x-axis')
      .call(this.customXAxisFocus.bind(this));
    d3.select('.circles')
      .selectAll('circle')
      .call(this.positionCircles.bind(this));
    this.drawVoronoi(this.pointData);

    this.brushSelection = this.xScaleFocus.range().map(t.invertX, t);

    d3.select('.context')
      .select('.brush')
      .call(this.brush.move, this.brushSelection);
    this.drawBrushShadowOverlay(this.brushSelection);
  }

  /**
   * Draw brush shadow overlay so selection is transparent and area not selected
   * has overlay. This is the inverse of the default experience.
   * @param {*} selectionArray
   */
  drawBrushShadowOverlay(selectionArray) {
    if (d3.select('.overlay-shadow.left').empty()) {
      d3.select('.context')
        .select('.brush')
        .append('rect')
        .attr('class', 'overlay-shadow left')
        .attr('height', this.contextHeight)
        .attr('width', selectionArray[0])
        .attr('pointer-events', 'none')
        .attr('fill', '#777')
        .attr('opacity', '0.3');
    } else {
      if (selectionArray) {
        d3.select('.overlay-shadow.left').attr('width', selectionArray[0]);
      }
    }

    if (d3.select('.overlay-shadow.right').empty()) {
      d3.select('.context')
        .select('.brush')
        .append('rect')
        .attr('class', 'overlay-shadow right')
        .attr('pointer-events', 'none')
        .attr('height', this.contextHeight)
        .attr('width', () => {
          return Math.floor(this.width - selectionArray[1]);
        })
        .attr('x', Math.floor(selectionArray[1]))
        .attr('fill', '#777')
        .attr('opacity', '0.3');
    } else {
      if (selectionArray) {
        d3.select('.overlay-shadow.right')
          .attr('width', () => {
            const width = Math.floor(this.width - selectionArray[1]);
            return width > 0 ? width : 0;
          })
          .attr('x', Math.floor(selectionArray[1]));
      } else {
        const x = d3.select('.overlay-shadow.right').attr('x');
        d3.select('.overlay-shadow.right').attr('width', () => {
          const width = Math.floor(this.width - x);
          return width > 0 ? width : 0;
        });
      }
    }
  }

  resize() {
    const wrapper = d3.select('div.wrapper');
    const resizeWidth = parseInt(wrapper.style('width'));

    if (resizeWidth < this.width || resizeWidth > this.width) {
      const wrapperWidth =
        resizeWidth < this.config.layout.maxWidth
          ? resizeWidth
          : this.config.layout.maxWidth;

      this.width =
        wrapperWidth - this.focusMargin.left - this.focusMargin.right;

      this.xScaleFocus.range([0, this.width]);
      this.xScaleContext.range([0, this.width]);

      d3.select('svg').attr('width', wrapperWidth);

      d3.select('.focus').attr(
        'transform',
        'translate(' + this.focusMargin.left + ',' + this.focusMargin.top + ')'
      );

      d3.select('.focus')
        .selectAll('.layer')
        .select('.area')
        .attr('d', this.areaFocus);

      d3.select('.focus')
        .select('.x-axis')
        .call(this.customXAxisFocus.bind(this));

      d3.select('.focus')
        .select('.y-axis')
        .call(this.customYAxis.bind(this));

      d3.select('.focus')
        .select('.threshold')
        .datum(this.config.threshold)
        .call(this.drawThresholdLine.bind(this));

      d3.select('.context')
        .select('.background-context')
        .attr('width', this.width);

      d3.select('.context')
        .selectAll('.layer')
        .select('.area')
        .attr('d', this.areaContext);

      d3.select('.context')
        .select('.x-axis')
        .call(this.customXAxisContext.bind(this));

      this.brush.extent([[0, 0], [this.width, this.contextHeight]]);

      d3.select('.context')
        .select('g.brush')
        .call(this.brush)
        .call(this.brush.move, this.xScaleContext.range());

      if (this.brushSelection[1] > this.width) {
        this.brushSelection[1] = this.width;
      }

      this.drawBrushShadowOverlay(this.brushSelection);

      d3.select('.circles')
        .selectAll('circle')
        .call(this.positionCircles.bind(this));

      this.drawVoronoi(this.pointData);

      d3.select('svg')
        .select('#clip')
        .select('rect')
        .attr('width', this.width);
    }
  }
}
