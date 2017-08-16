const x11 = require('x11');
const { exec } = require('child_process');
const Leap = require('leapjs');
const { map } = require('ramda');

const XEventManager = require('./lib/XEventManager');
const { ScreenState } = require('./lib/ScreenState');
const { leapControllerInit, leapAction } = require('./lib/leap-controller');
const { log, time } = require('./lib/logger');

function controllerLoop(eventManager) {
  const screenState = new ScreenState();
  leapControllerInit(eventManager, screenState);
  return () => {
    let lastFrame;
    Leap.loop({
      frame: function (frame) {
        if (!lastFrame) {
          lastFrame = frame;
          return;
        }
        leapAction(eventManager, screenState, lastFrame, frame);
       // log(`Time per frame: ${time()} ms`);
        lastFrame = frame;
      },
    });
  };
}

x11.createClient((err, display) => {
  const X = display.client;
  exec("xwininfo | grep 'xwininfo: Window id:' | awk '{print $4}'", (err, stdout) => {
    if (err) {
      throw err;
    }
    const wid = Number(stdout.trim());
    const em = new XEventManager();
    em.init(wid, X).then(() => {
      X.SetInputFocus(wid);
      setTimeout(controllerLoop(em), 300);
    });
  });
});
