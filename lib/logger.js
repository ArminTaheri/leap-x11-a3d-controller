const Jetty = require('jetty');
const present = require('present');
const R = require('ramda');

const jetty = new Jetty(process.stdout);
function log(string) {
  jetty.clear()
  jetty.moveTo([0, 0]);
  jetty.text(string);
}
module.exports.log = log;

let last = present();
module.exports.time = function time() {
  out = String(present() - last);
  last = present();
  return out;
}

module.exports.tapWithLog = R.tap(
  R.compose(
    log,
    R.ifElse(R.isNil, R.identity, R.invoker(0, 'toString'))
  )
);

module.exports.tapWithDebugger = R.tap(() => {
  debugger;
});
