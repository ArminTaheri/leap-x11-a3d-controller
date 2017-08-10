const leapController = require('./lib/leap-controller');

function controllerLoop(eventManager) {
  return () => {
    let lastFrame;
    Leap.loop({
      frame: function (frame => {
        if (!lastFrame) {
          lastFrame = frame;
          return;
        }
        leapController(eventManager, lastframe, frame);
        lastframe = frame;
    });
  }
}

x11.createClient((err, display) => {
  const X = display.client;
  exec("xwininfo | grep 'xwininfo: Window id:' | awk '{print $4}'", (err, stdout) => {
    if (err) {
      throw err;
    }
    const wid = Number(stdout.trim());
    const em = new XEventManager(wid, X);
    X.SetInputFocus(wid);
    setTimeout(controllerLoop(em), 300);
  });
});
