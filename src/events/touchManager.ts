// Test via a getter in the options object to see if the passive property is accessed
let supportsPassive = false;
try {
  const opts = Object.defineProperty({}, 'passive', {
    get: () => {
      supportsPassive = true;
      return true;
    }
  });
  // a no-op listener: the probe only needs the options object read
  const noop = () => {};
  window.addEventListener('test', noop, opts);
  window.removeEventListener('test', noop, opts);
} catch {
  // passive events not supported
}

const behaviors: any = {
  orientation: undefined,
  time_threshold: 200,
  diff_threshold: 130,
  press_hold_threshold: 400,
  prevent_touch: true,
  prevent_double_tap: false,
  addSwipeTarget(target) {
    target.addEventListener('touchstart', handleTouchStart, supportsPassive ? { passive: true } : false);
    target.addEventListener('touchmove', handleTouchMove, supportsPassive ? { passive: true } : false);
    target.addEventListener('touchend', swipeTouchEnd, false);

    target.addEventListener('mousedown', handleTouchStart, false);
    target.addEventListener('mousemove', handleTouchMove, false);
    target.addEventListener('mouseup', swipeTouchEnd, false);
  },
  addPressAndHold(target) {
    target.addEventListener('touchstart', handleTouchStart, supportsPassive ? { passive: true } : false);
    target.addEventListener('mousedown', handleTouchStart, false);
    target.addEventListener('touchend', pressAndHoldEnd, false);
    target.addEventListener('mouseup', pressAndHoldEnd, false);
  },
  disableDrag() {
    document.addEventListener('touchmove', preventDrag, false);
    document.addEventListener('touchend', preventDoubleTap, false);
    document.addEventListener('mousemove', preventDrag, false);
    document.addEventListener('mouseup', preventDoubleTap, false);
  }
};

/* to make it appear more like a native app disable dragging and double tap */
function preventDrag(evt) {
  if (behaviors.prevent_touch && (window.innerHeight > 450 || behaviors.orientation == 'landscape'))
    evt.preventDefault();
}

function preventDoubleTap(evt) {
  const now = new Date().getTime();
  if (behaviors.prevent_double_tap && now - last_touch < 500) evt.preventDefault();
  last_touch = now;
}

let xDown: number | null = null;
let yDown: number | null = null;
let xDiff: number | null = null;
let yDiff: number | null = null;
let timeDown: number | null = null;
let touch_target: any = null;
let last_touch = new Date().getTime();

function handleTouchMove(evt) {
  if (!xDown || !yDown) return;
  let xUp: number, yUp: number;
  if (evt.type == 'mousemove') {
    xUp = evt.clientX;
    yUp = evt.clientY;
  } else {
    xUp = evt.touches[0].clientX;
    yUp = evt.touches[0].clientY;
  }
  xDiff = xDown - xUp;
  yDiff = yDown - yUp;
}

/**
function containsClassName(evntarget, classArr) {
  for (let i = classArr.length - 1; i >= 0; i--) {
    if (evntarget.classList.contains(classArr[i])) return true;
  }
}
*/

function handleTouchStart(evt) {
  touch_target = evt.target;
  timeDown = Date.now();
  if (evt.type == 'mousedown') {
    xDown = evt.clientX;
    yDown = evt.clientY;
  } else {
    xDown = evt.touches[0].clientX;
    yDown = evt.touches[0].clientY;
  }
  xDiff = 0;
  yDiff = 0;
}

function findAncestor(el, cls) {
  if (el.classList.contains(cls)) return el;
  while ((el = el.parentNode && el.classList && !el.classList.contains(cls)));
  return el;
}

function invokeSwipeHandler(handlerName: string) {
  if (typeof behaviors[handlerName] == 'function') {
    behaviors[handlerName](findAncestor(touch_target, 'swipe'));
  }
}

function dispatchSwipe(dx: number, dy: number) {
  if (Math.abs(dx) > Math.abs(dy)) {
    invokeSwipeHandler(dx > 0 ? 'swipeLeft' : 'swipeRight');
  } else {
    invokeSwipeHandler(dy > 0 ? 'swipeUp' : 'swipeDown');
  }
}

function resetTouch() {
  xDown = null;
  yDown = null;
  timeDown = null;
}

function swipeTouchEnd() {
  // no touch started (an end without a start): nothing to measure, as before (the elapsed time read as huge)
  if (timeDown === null || xDiff === null || yDiff === null) return resetTouch();
  const timeDiff = Date.now() - timeDown;
  const exceedsThreshold =
    (Math.abs(xDiff) > behaviors.diff_threshold || Math.abs(yDiff) > behaviors.diff_threshold) &&
    timeDiff < behaviors.time_threshold;

  if (exceedsThreshold) dispatchSwipe(xDiff, yDiff);

  xDown = null;
  yDown = null;
  timeDown = null;
}

function pressAndHoldEnd() {
  // no touch started: before, this called findAncestor(null) and threw
  if (timeDown === null) return resetTouch();
  const timeDiff = Date.now() - timeDown;
  if (timeDiff > behaviors.press_hold_threshold && typeof behaviors.pressAndHold == 'function')
    behaviors.pressAndHold(findAncestor(touch_target, 'pressAndHold'));
  xDown = null;
  yDown = null;
  timeDown = null;
}

export const touchManager = behaviors;
export default behaviors;
