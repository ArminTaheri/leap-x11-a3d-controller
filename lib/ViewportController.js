const Leap = require('leapjs');
const R = require('ramda');
const { log } = require('./logger');

const SCREEN_TO_HANDS_SCALE = 2;

const HAND_TO_ZOOM_SCALE = 1;

const SWIPE_SPEED_THRESHOLD = 12;

const DRAG_DISTANCE_LIMIT = 10;

const TIMEOUT = 20;

const VIEWPORT_PROPORTION_PERCENT = { x: 50, y: 50 };

class Viewport {
  constructor(eventManager, params) {
    this.cursorCenterPercent = params.cursorCenterPercent;
    this.cursorOffset = [0, 0];
    this.swipeDirection = params.swipeDirection;
    this.boundingBox = params.boundingBox;
    this.eventManager = eventManager;
    this.panlock = false;
    this.zoomlock = false;
    this.fullscreenRef = { ref: false };
  }
  setFullscreenRef(ref) {
    this.fullscreenRef = ref;
  }
  getCenterPercent() {
    return [
      this.cursorCenterPercent[0],
      this.cursorCenterPercent[1]
    ];
  }
  setOffset({x, y}) {
    if (x) { this.cursorOffset[0] = x; }
    if (y) { this.cursorOffset[1] = y; }
  }
  moveCursorToOffset() {
    const d = this.eventManager.getDimensions();
    const fsScale = {
      x: 100 / VIEWPORT_PROPORTION_PERCENT.x,
      y: 100 / VIEWPORT_PROPORTION_PERCENT.y,
    };
    let pos;
    if (this.fullscreenRef.ref) {
      pos = [
        50 * d.width / 100 + this.cursorOffset[0] * fsScale.y,
        50 * d.height / 100 + this.cursorOffset[1] * fsScale.x
      ];
    } else {
      pos = [
        this.cursorCenterPercent[0] * d.width / 100 + this.cursorOffset[0],
        this.cursorCenterPercent[1] * d.height / 100 + this.cursorOffset[1]
      ];
    }
    return this.eventManager.move(...pos);
  }
  pan(delta, clickCode=2) {
    const scaled = Leap.vec3.create();
    Leap.vec3.scale(scaled, delta, SCREEN_TO_HANDS_SCALE);
    if (this.panlock) {
      this.eventManager.moveRelative(...scaled);
      return;
    }
    this.moveCursorToOffset()
      .then(() => this.eventManager.mouseDown(clickCode))
      .then(() => this.eventManager.moveRelative(...scaled))
      .then(() => {
        this.panlock = true;
        setTimeout(() => {
          this.panlock = false;
          this.eventManager.mouseUp(clickCode)
            .then(() => this.eventManager.click(clickCode));
        }, TIMEOUT * 2.5);
      });
  }
  zoom(deltaY, clickCode=3) {
    const scaledY = deltaY * HAND_TO_ZOOM_SCALE;
    if (this.zoomlock) {
      this.eventManager.moveRelative(0, scaledY);
      return;
    }
    this.moveCursorToOffset()
      .then(() => this.eventManager.mouseDown(clickCode))
      .then(() => this.eventManager.moveRelative(0, scaledY))
      .then(() => {
        this.zoomlock = true;
        setTimeout(() => {
          this.zoomlock = false;
          this.eventManager.mouseUp(clickCode)
            .then(() => this.eventManager.click(clickCode));
        }, TIMEOUT);
      });
  }
}

class PerspViewport extends Viewport {
  constructor(eventManager, params) {
    super(eventManager, params);
  }
  pinch(delta, clickCode=1) {
    const scaled = Leap.vec3.create();
    Leap.vec3.scale(scaled, delta, SCREEN_TO_HANDS_SCALE);
    this.moveCursorToOffset()
      .then(() => this.eventManager.mouseDown(clickCode))
      .then(() => this.eventManager.moveRelative(...scaled))
      .then(() => this.eventManager.mouseUp(clickCode))
      .then(() => this.eventManager.click(clickCode));
  }
}

class OrthoViewport extends Viewport {
  constructor(eventManager, params) {
    super(eventManager, params)
    this.xChangeCallbacks = [];
    this.yChangeCallbacks = [];
  }
  onXChange(callback) {
    if (callback instanceof Function) {
      this.xChangeCallbacks.push(callback);
    }
  }
  onYChange(callback) {
    if (callback instanceof Function) {
      this.yChangeCallbacks.push(callback);
    }
  }
  clickRelativeBounded(x, y, clickCode=1) {
    const d = this.eventManager.getDimensions();
    const center = [
      this.cursorCenterPercent[0] * d.width / 100,
      this.cursorCenterPercent[1] * d.height / 100
    ];
    const cursorPos = [
      center[0] + this.cursorOffset[0],
      center[1] + this.cursorOffset[1]
    ];
    const newCursorPos = [cursorPos[0] + x, cursorPos[1] + y];
    if (newCursorPos[0] < this.boundingBox.left * d.width / 100) {
      newCursorPos[0] = this.boundingBox.left * d.width / 100;
    }
    if (newCursorPos[0] > this.boundingBox.right * d.width / 100) {
      newCursorPos[0] = this.boundingBox.right * d.width / 100;
    }
    if (newCursorPos[1] < this.boundingBox.top * d.height / 100) {
      newCursorPos[1] = this.boundingBox.top * d.height / 100;
    }
    if (newCursorPos[1] > this.boundingBox.bottom * d.height / 100) {
      newCursorPos[1] = this.boundingBox.bottom * d.height / 100;
    }
    this.cursorOffset[0] = newCursorPos[0] - center[0];
    this.cursorOffset[1] = newCursorPos[1] - center[1];
    this.xChangeCallbacks.forEach(f => f(this.cursorOffset[0]));
    this.yChangeCallbacks.forEach(f => f(this.cursorOffset[1]));
    return this.moveCursorToOffset()
      .then(() => this.eventManager.click(clickCode));
  }
  pinch(delta, clickCode=1) {
    const scaled = Leap.vec3.create();
    Leap.vec3.scale(scaled, delta, SCREEN_TO_HANDS_SCALE);
    this.clickRelativeBounded(scaled[0], scaled[1], clickCode);
  }
}

module.exports = class ViewportController {
  constructor(initialViewport, eventManager) {
    this.viewPorts = {};
    this.eventManager = eventManager;
    this.viewPorts.TOP_LEFT = new OrthoViewport(eventManager, {
      cursorCenterPercent: [25, 25],
      swipeDirection: [-1, 1, 0],
      boundingBox: { left: 5, right: 45, top: 5, bottom: 45 }
    });
    this.viewPorts.TOP_RIGHT = new OrthoViewport(eventManager, {
      cursorCenterPercent: [75, 25],
      swipeDirection: [1, 1, 0],
      boundingBox: { left: 55, right: 95, top: 5, bottom: 45 }
    });
    this.viewPorts.BOTTOM_LEFT = new OrthoViewport(eventManager, {
      cursorCenterPercent: [25, 75],
      swipeDirection: [-1, -1, 0],
      boundingBox: { left: 5, right: 45, top: 55, bottom: 95 }
    });
    this.viewPorts.BOTTOM_RIGHT = new PerspViewport(eventManager, {
      cursorCenterPercent: [75, 75],
      swipeDirection: [1, -1, 0]
    });
    this.viewPorts.TOP_LEFT.onXChange((x) => {
      this.viewPorts.BOTTOM_LEFT.setOffset({y: -x});
    });
    this.viewPorts.TOP_LEFT.onYChange((y) => {
      this.viewPorts.TOP_RIGHT.setOffset({y});
    });
    this.viewPorts.TOP_RIGHT.onXChange((x) => {
      this.viewPorts.BOTTOM_LEFT.setOffset({x});
    });
    this.viewPorts.TOP_RIGHT.onYChange((y) => {
      this.viewPorts.TOP_LEFT.setOffset({y});
    });
    this.viewPorts.BOTTOM_LEFT.onXChange((x) => {
      this.viewPorts.TOP_RIGHT.setOffset({x});
    });
    this.viewPorts.BOTTOM_LEFT.onYChange((y) => {
      this.viewPorts.TOP_LEFT.setOffset({x: -y});
    });
    this.fullscreenRef = { ref: false };
    Object.keys(this.viewPorts).forEach((k) => {
      this.viewPorts[k].setFullscreenRef(this.fullscreenRef);
    });
    this.setViewport(initialViewport);
  }
  isFullScreen() {
    return this.fullscreenRef.ref;
  }
  setViewport(viewport) {
    const viewportInstance = this.viewPorts[viewport];
    return viewportInstance.moveCursorToOffset()
      .then(() => this.eventManager.click(3))
      .then(() => { this.currentViewport = viewport; });
  }
  currentViewportInstance() {
    return this.viewPorts[this.currentViewport];
  }
  computeNextViewport(hand, frame) {
    const handVelocity = hand.translation(frame);
    const normalize = (v) => {
      const out = Leap.vec3.create();
      Leap.vec3.normalize(out, v);
      return out;
    }
    const viewportScore = direction => Leap.vec3.dot(handVelocity, direction);
    const scoredDirections = R.keys(this.viewPorts)
      // First get viewport and swipeDirection as pairs
      .map(k => [k, this.viewPorts[k].swipeDirection])
      // Then convert swipe directions to vectors.
      .map(pair => [pair[0], Leap.vec3.fromValues(...pair[1])])
      // Then normalize the swipe direction.
      .map(pair => [pair[0], normalize(pair[1])])
      // Then score the directions
      .map(pair => [pair[0], viewportScore(pair[1])]);

    // Score direction by dot product with hand velocity
    // Compare scores of two viewports
    const compareViewports = R.maxBy(pair => pair[1]);
    // Select the best viewport
    const bestViewport = R.reduce(compareViewports, ['', -Infinity], scoredDirections);
    // Return the name of the viewport
    return bestViewport[0];
  }
  switchViewport(hand, frame) {
    const squaredVel = Leap.vec3.squaredLength(hand.translation(frame));
    if (squaredVel < SWIPE_SPEED_THRESHOLD * SWIPE_SPEED_THRESHOLD) {
      return;
    }
    const next = this.computeNextViewport(hand, frame);
    if (this.currentViewport === next) {
      return;
    }
    const currentInstance = this.currentViewportInstance();
    this.setViewport(next);
  }
  pinch(hand, frame) {
    const vel = hand.translation(frame);
    vel[1] = -vel[1];
    this.viewPorts[this.currentViewport].pinch(vel, 1);
  }
  pan(hand, frame) {
    const vel = hand.translation(frame);
    vel[1] = -vel[1];
    this.viewPorts[this.currentViewport].pan(vel, 2);
  }
  zoom(curHands, lastHands) {
    const amount = handDistanceDelta(curHands, lastHands);
    this.viewPorts[this.currentViewport].zoom(amount, 3);
  }
  fullScreen(curHands, lastHands) {
    const F = 70;
    const amount = handDistanceDelta(curHands, lastHands);
    if (Math.abs(amount) < SWIPE_SPEED_THRESHOLD) {
      return;
    }
    const direction = Math.sign(amount);
    if (direction > 0 && !this.fullscreenRef.ref) {
      this.eventManager.keyPress(F).then(() => {
        this.fullscreenRef.ref = true;
        this.viewPorts[this.currentViewport].moveCursorToOffset();
      });
      return;
    }
    if (direction < 0 && this.fullscreenRef.ref) {
      this.eventManager.keyPress(F).then(() => {
        this.fullscreenRef.ref = false;
        this.viewPorts[this.currentViewport].moveCursorToOffset();
      });
      return;
    }

  }
}

function handDistanceDelta(curHands, lastHands) {
    const curDistance = Leap.vec3.distance(...curHands.map(h => h.palmPosition));
    const lastDistance = Leap.vec3.distance(...lastHands.map(h => h.palmPosition));
    return curDistance - lastDistance;
}
