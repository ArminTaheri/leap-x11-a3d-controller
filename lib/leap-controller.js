const Leap = require('leapjs');

// Functional programming libraries
const R = require('ramda');
const M = require('ramda-fantasy').Maybe;

const { tapWithLog, tapWithDebugger } = require('./logger');
// BEGIN Constants

// PINCH_THRESHOLD: Number
const PINCH_THRESHOLD = 0.93;

// SCREEN_TO_HANDS_SCALE: Number
const SCREEN_TO_HANDS_SCALE = 1;

// SCROLL_TO_HANDS_SCALE: Number
const SCROLL_TO_HANDS_SCALE = 0.5;


// SWIPE_SPEED_THRESHHOLD: Number
const SWIPE_SPEED_THRESHHOLD = 10;

// VIEWPORTS: { { [Number], [Number] } }
const { VIEWPORTS } = require('./ScreenState');
// END Constants

// BEGIN Transformation code

// last Frame and current frame getters: [Frame, Frame] -> Frame
const lastframe = a => a[0];
const curframe = a => a[1];

// getHands: Number -> Frame -> [Hand]
const getHands = number => R.pipe(
  R.prop('hands'),
  R.take(number)
);

// firstHand: Frame -> Maybe Hand
const firstHand = R.pipe(
  getHands(1),
  R.ifElse(
    R.isEmpty,
    M.Nothing,
    R.compose(M.Just, R.head)
  )
);

// secondHand: Frame -> Maybe Hand
const secondHand = R.pipe(
  getHands(2),
  R.ifElse(
    // If the number of hands is less than 2
    R.propSatisfies(R.lt(R.__, 2), 'length'),
    // return nothing
    M.Nothing,
    // else return the just second hand
    R.compose(M.Just, R.nth(1))
  )
);

// displacementSince: Frame -> Hand -> Leap.Vec3
const displacementSince = R.curry((frame, hand) => hand.translation(frame));

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

// oneHandOnlyPinch: Frame -> Boolean
const oneHandOnlyPinch = R.allPass([
  R.compose(isPinched, firstHand),
  R.compose(R.not, isPinched, secondHand)
]);

// twoHandPinch: Frame -> Boolean
const twoHandPinch = R.allPass([
  R.compose(isPinched, firstHand),
  R.compose(isPinched, secondHand)
]);

// oneHandLShape: Frame -> Boolean
const oneHandLShape = R.allPass([
  R.compose(isExtended('thumb'), firstHand),
  R.compose(isExtended('indexFinger'), firstHand),
  R.compose(R.not, isExtended('middleFinger'), firstHand),
  R.compose(R.not, isExtended('ringFinger'), firstHand),
  R.compose(R.not, isExtended('pinky'), firstHand)
]);

// tryGetDisplacement: (Frame -> Maybe Hand) -> [Frame, Frame] -> Maybe Leap.Vec3
const tryGetDisplacement = getHand => R.pipe(
  R.of,
  R.ap([
    R.compose(R.map, displacementSince, lastframe), // get distplacement from last frame
    R.compose(getHand, curframe) // get first hand in current frame
  ]),
  R.apply(R.call) // Apply distplacementsince from lastframe to firstHand
);

// firstHandIsSwiping: [Frame, Frame] -> Boolean
const firstHandIsSwiping = R.pipe(
  tryGetDisplacement(firstHand),
  R.map(Leap.vec3.squaredLength), // get squared distance
  R.map(R.gt(R.__, SWIPE_SPEED_THRESHHOLD * SWIPE_SPEED_THRESHHOLD)), // compare to threshhold
  M.maybe(false, R.identity) // extract comparison from (Maybe Boolean) value.
);

// oneHandTwoFingersSwipe: [Frame, Frame] -> Boolean
const oneHandTwoFingersSwipe = R.allPass([
  R.compose(R.not, isExtended('thumb'), firstHand, curframe),
  R.compose(isExtended('indexFinger'), firstHand, curframe),
  R.compose(R.not, isExtended('middleFinger'), firstHand, curframe),
  R.compose(R.not, isExtended('ringFinger'), firstHand, curframe),
  R.compose(R.not, isExtended('pinky'), firstHand, curframe),
  R.compose(firstHandIsSwiping)
]);

// swipeToViewport: [Frame, Frame] -> Maybe String
const swipeToViewport = frames => {
  const vel = tryGetDisplacement(firstHand)(frames)
  const dot = R.liftN(2, Leap.vec3.dot);
  const viewportKeys = R.keys(VIEWPORTS)
  const viewportSwipeValues = R.ap(
    R.map(R.prop, viewportKeys),
    R.of(R.pluck('swipeDirection', VIEWPORTS))
  );
  const maybeDottedValues = R.traverse(
    M.of,
     // apply lifted dot(vel) to second argument of key value pairs.
    R.compose(dot(vel), M.of),
    viewportSwipeValues
  );
  const maybeDotted = R.map(R.zip(viewportKeys), maybeDottedValues);
  console.log(maybeDotted);
  const maxSwipe = R.map(R.reduce(R.maxBy(R.nth(1)), ['', -Infinity]), maybeDotted);
  console.log(maxSwipe);
  return R.map(R.nth(0), maxSwipe);
}

// toMouseMove: Leap.Vec3 -> (Number, Number)
const toMouseMove = R.pipe(
  // Scale each vector components to screen
  R.map(R.multiply(SCREEN_TO_HANDS_SCALE)),
  // Get X and -Y displacement
  v => [v[0], -v[1]]
);

// handToMouse: (Frame -> Maybe Hand) -> [Frame, Frame] -> Maybe (Number, Number)
const handToMouse = getHand => R.pipe(
  tryGetDisplacement(getHand),
  R.map(toMouseMove)
);

// toMiddleMouseDrag: Number -> Number
const toMiddleMouseDrag = R.pipe(
  R.multiply(-1),
  R.multiply(SCROLL_TO_HANDS_SCALE)
);

// handDistance: Hand -> Hand -> Number
const handDistance = (first, second) => {
  const out = Leap.vec3.create();
  Leap.vec3.subtract(out, first.palmPosition, second.palmPosition);
  return Leap.vec3.length(out);
}

// handsDistanceMaybe: Frame -> Maybe Number
const handsDistanceMaybe = R.pipe(
  R.of, // wrap frame in array
  R.ap([firstHand, secondHand]), // Try to get first and second hand.
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

// END Transformation code

// BEGIN IO code

// toggleFullScreen: { EventManager, ScreenState } -> IO ()
const toggleFullScreen = R.curry((state) => {
  const { eventManager, screenState } = state;
  const F = 70;
  eventManager.keyDown(F)
    .then(() => eventManager.keyUp(F))
    .then(() => screenState.toggleFullScreen());
});

// setViewportAndClick: String -> { EventManager, ScreenState } -> IO ()
const setViewportAndClick = R.curry((viewport, state) => {
  const { eventManager, screenState } = state;
  if (screenState.isFullScreen()) {
    return;
  }
  if (screenState.getViewport() === viewport) {
    return;
  }
  const position = VIEWPORTS[viewport].cursorCenterPercent
  eventManager.move(...position)
    .then(() => eventManager.click(1))
    .then(() => {
      screenState.setViewport(viewport);
      screenState.setCenterPercent(...position);
    });
});

// doMouseDrag: Number -> [Number] -> { EventManager, ScreenState } -> IO ()
const doMouseDrag = R.curry((clickCode, v, state) => {
  const { eventManager, screenState } = state;
  const position = screenState.getCenterPercent();
  eventManager.move(...position)
    .then(() => eventManager.mouseDown(clickCode))
    .then(() => eventManager.moveRelative(...v))
    .then(() => eventManager.mouseUp(clickCode))
    .then(() => eventManager.move(...position));
});

// switchOnInput: [Frame, Frame] -> { EventManager, ScreenState } -> Maybe (IO ())
const switchOnInput = R.cond([
  // [If([frame, frame]), Then([frame, frame])]
  [
    R.compose(oneHandOnlyPinch, curframe),
    R.pipe(handToMouse(firstHand), R.map(doMouseDrag(1)))
  ],
  [
    R.compose(twoHandPinch, curframe),
    R.pipe(handsStretchToMouse, R.map(doMouseDrag(2)))
  ],
  [
    R.compose(oneHandLShape, curframe),
    R.pipe(handToMouse(firstHand), R.map(doMouseDrag(3)))
  ],
  [
    R.compose(oneHandTwoFingersSwipe),
    R.pipe(swipeToViewport, R.map(setViewportAndClick))
  ],
  // [Else(), Nothing]
  [
    R.always(true),
    M.Nothing,
  ]
]);

// leapControllerInit: (XEventManager, ScreenState) -> IO ()
module.exports.leapControllerInit = (eventManager, screenState) => {
  setViewportAndClick('TOP_LEFT', { eventManager, screenState });
}

// leapAction: (XEventManager, ScreenState, Frame, Frame) -> IO ()
module.exports.leapAction = (eventManager, screenState, lastFrame, frame) => {
  const maybeAction = switchOnInput([lastFrame, frame]);
  // tapWithLog(maybeAction);
  return R.ap(
    maybeAction,
    M.Just({ eventManager, screenState })
  );
}

// END IO code
