const MOVE_OUT_CLASS = 'move-out-click';
const TRANSLATE_X_0 = 'translateX(0px)';
const TRANSLATE_Z_0 = 'translateZ(0)';

const util = {
  hasClass: function (e: Element, c: string) {
    const re = new RegExp('(^|\\s)' + c + '(\\s|$)');
    return re.test(e.className);
  },
  addClass: function (e: Element, c: string) {
    if (this.hasClass(e, c)) {
      return;
    }
    const newclass = e.className.split(' ');
    newclass.push(c);
    e.className = newclass.join(' ');
  },
  removeClass: function (e: Element, c: string) {
    if (!this.hasClass(e, c)) {
      return;
    }
    const re = new RegExp('(^|\\s)' + c + '(\\s|$)', 'g');
    e.className = e.className.replace(re, '');
  }
};

function setTranslateX(el: any, x: number) {
  el.style.transform = 'translateX(' + x + 'px)';
}

function createButtons(instance: any, opt: any) {
  let leftpx = 0;
  let rightpx = 0;
  opt.buttons.forEach((button: any) => {
    const btn = document.createElement('div');
    btn.textContent = button.text;
    btn.className = button.class;
    if (button.side == 'right') {
      leftpx += button.width || 0;
      btn.style.right = -1 * leftpx + 'px';
    }
    if (button.side == 'left') {
      rightpx += button.width || 0;
      btn.style.left = -1 * rightpx + 'px';
    }
    const abtn = instance.appendChild(btn);
    if (button.image) {
      const img = document.createElement('img');
      img.src = button.image;
      img.className = button.image_class;
      abtn.appendChild(img);
    }
  });
}

function clampSwipe(moveX: number, swipeLeft: number, isOut: boolean): number {
  const absMoveX = Math.abs(moveX);
  if (moveX > 0 && isOut) return absMoveX > swipeLeft ? 0 : -swipeLeft + moveX;
  if (moveX > 0) return absMoveX > swipeLeft ? swipeLeft : moveX;
  if (moveX < 0 && !isOut) return absMoveX > swipeLeft ? -swipeLeft : moveX;
  return absMoveX > swipeLeft ? swipeLeft : moveX;
}

function handleTouchMove(instance: any, moveX: number, swipeLeft: number, swipeRight: number) {
  const isOut = util.hasClass(instance, MOVE_OUT_CLASS);
  const canSwipeRight = moveX > 0 && (isOut || swipeRight);
  const canSwipeLeft = moveX < 0 && (!isOut || swipeRight);
  if (canSwipeRight || canSwipeLeft) {
    setTranslateX(instance, clampSwipe(moveX, swipeLeft, isOut));
  }
}

function handleTouchEndActive(instance: any, moveX: number, swipeLeft: number, swipeRight: number) {
  if (moveX > 0 && swipeLeft) {
    const x = moveX > 10 ? 0 : -swipeLeft;
    setTranslateX(instance, x);
    if (x === 0) util.removeClass(instance, MOVE_OUT_CLASS);
  } else if (swipeRight) {
    const x = moveX < -10 ? 0 : swipeLeft;
    setTranslateX(instance, x);
    if (x === 0) util.removeClass(instance, MOVE_OUT_CLASS);
  }
}

function handleTouchEndInactive(instance: any, moveX: number, swipeLeft: number, swipeRight: number) {
  if (moveX < 0 && swipeLeft) {
    const x = Math.abs(moveX) > swipeLeft / 2 ? -swipeLeft : 0;
    setTranslateX(instance, x);
    if (x !== 0) util.addClass(instance, MOVE_OUT_CLASS);
  } else if (swipeRight) {
    const x = Math.abs(moveX) > swipeLeft / 2 ? swipeLeft : 0;
    setTranslateX(instance, x);
    if (x !== 0) util.addClass(instance, MOVE_OUT_CLASS);
  }
}

export const SwipeList = {
  init: (opt: any) => {
    let swipeLeft = 0;
    let swipeRight = 0;
    opt.buttons.forEach((b: any) => {
      if (b.side == 'right') swipeLeft += b.width || 0;
      if (b.side == 'left') swipeRight += b.width || 0;
    });

    const instances = Array.from(document.querySelectorAll(opt.container));
    instances.forEach((instance) => {
      let moveX = 0;
      let moveY = 0;
      let moveStart: any = null;

      createButtons(instance, opt);

      // Hardware Acceleration
      instance.style.webkitTransform = TRANSLATE_Z_0;
      instance.style.transform = TRANSLATE_Z_0;

      // Slide Start
      instance.addEventListener(
        'touchstart',
        function (event: any) {
          instance.style.transitionDuration = '0ms';

          // Close other items
          instances.forEach((inst) => {
            if (util.hasClass(inst, MOVE_OUT_CLASS) && inst != instance) {
              inst.style.transitionDuration = '325ms';
              inst.style.webkitTransform = TRANSLATE_X_0;
              inst.style.transform = TRANSLATE_X_0;
              util.removeClass(inst, MOVE_OUT_CLASS);
            }
          });

          const touches = event.changedTouches;
          moveStart = { x: touches[0].pageX, y: touches[0].pageY };
        },
        true
      );

      // Sliding Animation
      instance.addEventListener(
        'touchmove',
        function (event: any) {
          if (moveStart === null) return;

          const touches = event.changedTouches;
          moveX = touches[0].pageX - moveStart.x;
          moveY = touches[0].pageY - moveStart.y;

          if (Math.abs(moveX) > Math.abs(moveY)) {
            handleTouchMove(instance, moveX, swipeLeft, swipeRight);
          }
        },
        true
      );

      // Finish Sliding Action
      instance.addEventListener(
        'touchend',
        function () {
          if (moveStart === null) return;

          instance.style.transitionDuration = '125ms';

          if (util.hasClass(instance, MOVE_OUT_CLASS)) {
            handleTouchEndActive(instance, moveX, swipeLeft, swipeRight);
          } else {
            handleTouchEndInactive(instance, moveX, swipeLeft, swipeRight);
          }

          moveStart = null;
          moveX = 0;
        },
        true
      );

      // Cancel
      instance.addEventListener(
        'touchcancel',
        function () {
          instance.style.transitionDuration = '225ms';
          instance.style.webkitTransform = TRANSLATE_X_0;
          instance.style.transform = TRANSLATE_X_0;
          util.removeClass(instance, MOVE_OUT_CLASS);
          moveStart = null;
          moveX = 0;
        },
        true
      );
    });
  }
};
