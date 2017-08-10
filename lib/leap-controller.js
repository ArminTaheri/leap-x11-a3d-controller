const { exec } = require('child_process');
const x11 = require('x11');
const XEventManager = require('./XEventManager');
const Leap = require('leapjs');

// Functional programming libraries
const R = require('ramda');
const M = require('ramda-fantasy').Maybe;
const IO = require('ramda-fantasy').IO;

// BEGIN debugging
const Jetty = require('jetty');
const jetty = new Jetty(process.stdout);

function log(string) {
  jetty.clear()
  jetty.moveTo([0, 0]);
  jetty.text(string);
}

const present = require('present');
let last = present();
function time() {
  out = String(present() - last);
  last = present();
  return out;
}
// END debugging


// PINCH_THRESHOLD: Number
const PINCH_THRESHOLD = 0.93;

// SCREEN_TO_HANDS_SCALE: Number
const SCREEN_TO_HANDS_SCALE = 3;

// SCROLL_TO_HANDS_SCALE: Number
const SCROLL_TO_HANDS_SCALE = 2;

// last Frame and current frame getters: [Frame, Frame] -> Frame
const lastframe = a => a[0];
const curframe = a => a[1];

// getHand: String -> Frame -> Maybe Hand
const getHand = hand => R.pipe(
  R.prop('hands'),
  R.filter(R.propEq('type', hand)),
  R.ifElse(R.isEmpty, M.Nothing, R.compose(M.Just, R.head))
);

// leftHand: Frame -> Maybe Hand
const leftHand = getHand('left');

// rightHand: Frame -> Maybe Hand
const rightHand = getHand('right');

// displacementSince: Frame -> Hand -> Leap.Vec3
const displacementSince = R.invoker(1, 'translation');

// isPinched = Maybe Hand -> Boolean
const isPinched = M.maybe(
  false,
  R.propSatisfies(R.gte(R.__, PINCH_THRESHOLD), 'pinchStrength')
);

// isExtended = String -> Maybe Hand -> Boolean
const isExtended = finger => M.maybe(
  false,
  R.pathEq([finger, 'extended'], true)
)

// rightOnlyPinch: Frame -> Boolean
const rightOnlyPinch = R.allPass([
  R.compose(R.not, isPinched, leftHand),
  R.compose(isPinched, rightHand)
]);

// leftrightPinch: Frame -> Boolean
const leftrightPinch = R.allPass([
  R.compose(isPinched, rightHand),
  R.compose(isPinched, leftHand)
]);

// rightHandLShape: Frame -> Boolean
const rightHandLShape = R.allPass([
  R.compose(isExtended('thumb'), rightHand),
  R.compose(isExtended('indexFinger'), rightHand),
  R.compose(R.not, isExtended('middleFinger'), rightHand),
  R.compose(R.not, isExtended('ringFinger'), rightHand),
  R.compose(R.not, isExtended('pinky'), rightHand)
]);

// toMouseMove: Leap.Vec3 -> (Number, Number)
const toMouseMove = R.pipe(
  // Scale each vector components to screen
  R.map(R.multiply(SCREEN_TO_HANDS_SCALE)),
  // Get X and -Y displacement
  v => [v[0], -v[1]]
);

// rightHandToMouse: [Frame, Frame] -> Maybe (Number, Number)
const rightHandToMouse = R.pipe(
  // wrap (frame, frame) in array
  R.of,
   // Bind getDisplacement with last fram and get rightHand from current frame
  R.ap([R.compose(R.map, displacementSince, lastframe), R.compose(rightHand, curframe)]),
  // Call the bound and lifted getDisplacement with the right hand
  R.apply(R.call),
  // Map to screen distplacement
  R.map(toMouseMove)
);

// toMiddleMouseDrag: Number -> Number
const toMiddleMouseDrag = R.pipe(
  R.multiply(-1),
  R.multiply(SCROLL_TO_HANDS_SCALE)
);

// handDistance: Hand -> Hand -> Number
const handDistance = (left, right) => {
  const out = Leap.vec3.create();
  Leap.vec3.subtract(out, left.palmPosition, right.palmPosition);
  return Leap.vec3.length(out);
}

// handsDistanceMaybe: Frame -> Maybe Number
const handsDistanceMaybe = R.pipe(
  R.of, // wrap frame in array
  R.ap([leftHand, rightHand]), // Try to get left and right hand.
  R.apply(R.lift(handDistance)) // Try to find the distance between them.
);

// handsStretchToMouse: [Frame, Frame] -> Maybe Number
const handsStretchToMouse = R.pipe(
  R.of, // wrap [frame, frame] in array
  R.ap([curframe, lastframe]), // Get last and current frame
  R.map(handsDistanceMaybe), // Get distance between hands (or nothing if there is 1 hand)
  R.apply(R.liftN(2, R.subtract)), // subtract last distance from current.
  R.map(R.compose(R.prepend(0), R.of, toMiddleMouseDrag)) // Convert to middle mouse drag vector
);


// doMouseDrag: [Number] -> EventManager -> IO ()
const doMouseDrag = R.curry((clickCode, v, em) => IO(() => {
  em.move(50, 50)
    .then(() => em.mouseDown(clickCode))
    .then(() => em.moveRelative(...v))
    .then(() => em.mouseUp(clickCode))
    .then(() => em.move(50, 50));
}));

// switchOnInput: [Frame, Frame] -> Maybe (IO ())
const switchOnInput = R.cond([
  // [If([frame, frame]), Then([frame, frame])]
  [R.compose(rightOnlyPinch, curframe), R.pipe(rightHandToMouse, R.map(doMouseDrag(1)))],
  [R.compose(leftrightPinch, curframe), R.pipe(handsStretchToMouse, R.map(doMouseDrag(2)))],
  [R.compose(rightHandLShape, curframe), R.pipe(rightHandToMouse, R.map(doMouseDrag(3)))],
  // [Else(), Nothing]
  [R.always(true), M.Nothing]
]);

const runIO = R.invoker(0, 'runIO');

// leapController: (XEventManager, Frame, Frame) -> IO ()
module.exports = (eventManager, lastframe, frame) => {
  const action = R.ap(switchOnInput([lastFrame, frame]), M.Just(eventManager));
  log(`${action.toString()}\n${time()}\n`);
  R.map(runIO, action);
  lastFrame = frame;
}
