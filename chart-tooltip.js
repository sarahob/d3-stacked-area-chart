class ChartTooltip {
  constructor(config) {
    this.config = config;
    this.tooltip = document.querySelector('div.tooltip-wrapper');
    this.tooltipContent = document.querySelector('div.tooltip');
  }

  show() {
    const leftPos = `${parseInt(this.config.xPos) + 10}px`,
      topPos = `${parseInt(this.config.yPos) - 70}px`,
      label = this.config.label;

    this.tooltip.style.left = leftPos;
    this.tooltip.style.top = topPos;
    this.tooltip.style.visibility = 'visible';
    this.tooltipContent.innerHTML = label;
  }

  hide() {
    this.tooltip.style.visibility = 'hidden';
    this.tooltipContent.innerHTML = '';
  }
}
