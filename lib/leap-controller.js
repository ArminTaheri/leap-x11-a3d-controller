const Leap = require('leapjs');

// Functional programming libraries
const R = require('ramda');
const M = require('ramda-fantasy').Maybe;

// Logging
const { tapWithLog } = require('./logger');

// BEGIN Matching code

// PINCH_THRESHOLD: Number
const PINCH_THRESHOLD = 0.96;

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

// bothHands: Frame -> Maybe [Hand]
const bothHands = R.pipe(
  getHands(2),
  R.ifElse(
    // If the number of hands is less than 2
    R.propSatisfies(R.lt(R.__, 2), 'length'),
    // return nothing
    M.Nothing,
    // else return the just both hands
    M.Just
  )
);

// isPinched = Maybe Hand -> Boolean
const isPinched = M.maybe(
  false,
  R.propSatisfies(R.gte(R.__, PINCH_THRESHOLD), 'pinchStrength')
);

// isExtended = String -> Maybe Hand -> Boolean
const isExtended = finger => M.maybe(
  false,
  R.pathEq([finger, 'extended'], true)
);

// isLShape = Maybe Hand -> Boolean
const isLShape = R.allPass([
  isExtended('thumb'),
  isExtended('indexFinger'),
  R.compose(R.not, isExtended('middleFinger')),
  R.compose(R.not, isExtended('ringFinger')),
  R.compose(R.not, isExtended('pinky'))
]);

const indexIsPointing = R.allPass([
  R.compose(R.not, isExtended('thumb')),
  isExtended('indexFinger'),
  R.compose(R.not, isExtended('middleFinger')),
  R.compose(R.not, isExtended('ringFinger')),
  R.compose(R.not, isExtended('pinky'))
]);

// oneHandOnlyPinch: Frame -> Boolean
const oneHandOnlyPinch = R.allPass([
  R.compose(isPinched, firstHand),
  R.compose(R.not, isPinched, secondHand),
  R.compose(isExtended('middleFinger'), firstHand),
  R.compose(isExtended('ringFinger'), firstHand),
  R.compose(isExtended('pinky'), firstHand)
]);

// twoHandPinch: Frame -> Boolean
const twoHandPinch = R.allPass([
  R.compose(isPinched, firstHand),
  R.compose(isPinched, secondHand)
]);

// oneHandLShape: Frame -> Boolean
const oneHandLShape = R.allPass([
  R.compose(isLShape, firstHand),
  R.compose(R.not, isPinched, firstHand)
]);

// isOpenPalm: Maybe Hand -> Boolean;
const isOpenPalm = R.allPass([
  isExtended('thumb'),
  isExtended('indexFinger'),
  isExtended('middleFinger'),
  isExtended('ringFinger'),
  isExtended('pinky')
]);

// openPalmStrech: [Frame, Frame] -> Boolean
const openPalmStrech = R.allPass([
  R.compose(isOpenPalm, firstHand, curframe),
  R.compose(isOpenPalm, secondHand, curframe)
]);

// oneHandTwoFingersLShape: Frame -> Boolean
const oneHandTwoFingersLShape = R.allPass([
  R.compose(isExtended('thumb'), firstHand),
  R.compose(isExtended('indexFinger'), firstHand),
  R.compose(isExtended('middleFinger'), firstHand),
  R.compose(R.not, isExtended('ringFinger'), firstHand),
  R.compose(R.not, isExtended('pinky'), firstHand)
]);

// processFrameWith: (a -> IO ()) -> [c -> Maybe d] -> [Frame, Frame] -> Maybe (IO ())
const processFrameWith = R.curry((func, argExtractors) => R.pipe(
  // apply each possibly failing extraction to the inputed frames
  R.juxt(argExtractors),
  // sequence an array of possibly failed extractions
  // to an array of arguments if all extractions succeed
  R.sequence(M.of),
  // apply the frame processing function to the sucessfully extracted arguments
  R.map(R.apply(func))
));

// switchOnInput: ViewportController -> [Frame, Frame] -> Maybe (IO ())
const createGestureMatcher = viewportController => R.cond([
  // [If([frame, frame]), Then([frame, frame])]
  [
    R.compose(oneHandOnlyPinch, curframe),
    processFrameWith(
      (hand, frame) => viewportController.pinch(hand, frame), // run pinch action
      [
        R.o(firstHand, curframe), //with the first hand
        R.o(M.Just, lastframe) // and the current frame
      ]
    )
  ],
  [
    R.compose(twoHandPinch, curframe),
    processFrameWith(
      (curHands, lastHands) => viewportController.zoom(curHands, lastHands),
      [
        R.o(bothHands, curframe),
        R.o(bothHands, lastframe)
      ]
    )
  ],
  [
    R.compose(oneHandLShape, curframe),
    processFrameWith(
      (hand, frame) => viewportController.pan(hand, frame),
      [
        R.o(firstHand, curframe),
        R.o(M.Just, lastframe)
      ]
    )
  ],
  [
    R.compose(oneHandTwoFingersLShape, curframe),
    processFrameWith(
      (hand, frame) => viewportController.switchViewport(hand, frame),
      [
        R.o(firstHand, curframe),
        R.o(M.Just, lastframe)
      ]
    )
  ],
  [
    openPalmStrech,
    processFrameWith(
      (curHands, lastHands) => viewportController.fullScreen(curHands, lastHands),
      [
        R.o(bothHands, curframe),
        R.o(bothHands, lastframe)
      ]
    )
  ],
  // [Else(), Nothing]
  [
    R.always(true),
    M.Nothing,
  ]
]);

// END Matching code


// leapAction: (XEventManager, ScreenState, Frame, Frame) -> IO ()
module.exports.leapAction = (viewportController, lastFrame, frame) => {
  const matcher = createGestureMatcher(viewportController);
  return matcher([lastFrame, frame]);
}

// END IO code
