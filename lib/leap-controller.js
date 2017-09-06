const Leap = require('leapjs');

// Functional programming libraries
const R = require('ramda');
const M = require('ramda-fantasy').Maybe;

// Logging
const { tapWithLog } = require('./logger');

// BEGIN Matching code

// PINCH_THRESHOLD: Number
const PINCH_THRESHOLD = 0.96;

// PALM_Z_THRESHOLD: Number
const PALM_Z_THRESHOLD = 0.55;

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
  R.compose(R.not, isPinched, secondHand)
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
  isExtended('pinky'),
]);

const angleVec3 = (a, b) => {
  const tempA = Leap.vec3.fromValues(a[0], a[1], a[2]);
  const tempB = Leap.vec3.fromValues(b[0], b[1], b[2]);
  Leap.vec3.normalize(tempA, tempA);
  Leap.vec3.normalize(tempB, tempB);
  const cosine = Leap.vec3.dot(tempA, tempB);
  if(cosine > 1.0) {
    return 0;
  }
  else if(cosine < -1.0) {
    return Math.PI;
  } else {
    return Math.acos(cosine);
  }
}
// palmFacingForward: Maybe Hand -> Boolean
const palmFacingForward = M.maybe(
  false,
  (hand) => {
    const palmNormalZ = hand.palmNormal[2];
    return palmNormalZ <= -PALM_Z_THRESHOLD;
  }
);

// openPalmStrech: [Frame, Frame] -> Boolean
const openPalmStrech = R.allPass([
  R.compose(isOpenPalm, firstHand, curframe),
  R.compose(isOpenPalm, secondHand, curframe)
]);

// openPalmFacingForward: [Frame, Frame] -> Boolean
const openPalmFacingForward = R.allPass([
  R.compose(isOpenPalm, firstHand),
  R.compose(palmFacingForward, firstHand)
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
    R.compose(oneHandLShape, curframe),
    processFrameWith(
      (hand, frame) => viewportController.point(hand, frame), // run pinch action
      [
        R.o(firstHand, curframe), //with the first hand
        R.o(M.Just, lastframe) // and the current frame
      ]
    )
  ],
  [
    R.compose(openPalmFacingForward, curframe),
    processFrameWith(
      (hand, frame) => viewportController.openPalm(hand, frame),
      [
        R.o(firstHand, curframe), //with the first hand
        R.o(M.Just, lastframe) // and the current frame
      ]
    )
  ],
  [
    R.compose(oneHandOnlyPinch, curframe),
    processFrameWith(
      (hand, frame) => viewportController.oneHandPinch(hand, frame),
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
