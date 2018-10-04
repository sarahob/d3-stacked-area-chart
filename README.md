D3 Stacked Area Chart
----------------------

Stacked Area Chart with brush and zoom functionality. 
Chart is overlayed with voronoi so points will show when user hovers close to them on the chart.
Tooltip is triggered when voronoi is mousedover, tooltip is "outside D3" and appended to DOM via a custom event which is fired, this is so it will always be absolutely positioned and not relative to the container. 
