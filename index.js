const x11 = require('x11');
const { exec } = require('child_process');
const Leap = require('leapjs');
const { map } = require('ramda');

const ON_DEATH = require('death')({ SIGHUP: true });

const XEventManager = require('./lib/XEventManager');
const ViewportController = require('./lib/ViewportController');

const { leapControllerInit, leapAction } = require('./lib/leap-controller');
const { log, time } = require('./lib/logger');

function controllerLoop(eventManager) {
  const viewportController = new ViewportController('TOP_LEFT', eventManager);
  return () => {
    let lastFrame;
    Leap.loop({
      frame: function (frame) {
        if (!lastFrame) {
          lastFrame = frame;
          return;
        }
        leapAction(viewportController, lastFrame, frame);
        // log(`Time per frame: ${time()} ms`);
        lastFrame = frame;
      },
    });
  };
}
process.on('unhandledRejection', r => console.log(r));
x11.createClient((err, display) => {
  const X = display.client;
  exec("xwininfo | grep 'xwininfo: Window id:' | awk '{print $4}'", (err, stdout) => {
    if (err) {
      throw err;
    }
    const wid = Number(stdout.trim());
    const em = new XEventManager();
    em.init(wid, X).then(() => {
      ON_DEATH(() => {
        em.mouseUp(1);
        em.mouseUp(2);
        em.mouseUp(3);
        process.exit();
      });
      X.SetInputFocus(wid);
      setTimeout(controllerLoop(em), 300);
    });
  });
});
