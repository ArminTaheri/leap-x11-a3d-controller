
module.exports.VIEWPORTS = {
  TOP_LEFT: { cursorCenterPercent: [25, 25], swipeDirection: [-1, 1, 0] },
  TOP_RIGHT: { cursorCenterPercent: [75, 25], swipeDirection: [1, 1, 0] },
  BOTTOM_LEFT: { cursorCenterPercent: [25, 75], swipeDirection: [-1, -1, 0] },
  BOTTOM_RIGHT: { cursorCenterPercent: [75, 75], swipeDirection: [1, -1, 0] }
};

module.exports.ScreenState = class ScreenState {
  constructor() {
    this.centerPercent = null;
    this.viewport = null;
    this.fullscreen = false;
  }
  isFullScreen() {
    return this.fullscreen;
  }
  toggleFullScreen() {
    this.fullscreen = !this.fullscreen;
  }
  setCenterPercent(xPercent, yPercent) {
    this.centerPercent = [xPercent, yPercent];
  }
  getCenterPercent() {
    return this.centerPercent;
  }
  setViewport(viewport) {
    this.viewport = viewport;
  }
  getViewport() {
    return this.viewport;
  }
}
