/**
 * Whether the current browser supports local storage as a way of storing data
 * @var {Boolean}
 */
const _hasLocalStorageSupport = (function () {
  try {
    return typeof window !== 'undefined' && window.localStorage !== null;
  } catch {
    return false;
  }
})();

/**
 * @param {String} name The name of the property to read from this document's cookies
 * @return {?String} The specified cookie property's value (or null if it has not been set)
 */
const _readCookie = function (name: string) {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
    if (c.startsWith(nameEQ)) return c.substring(nameEQ.length, c.length);
  }

  return null;
};

/**
 * @param {String} name The name of the property to set by writing to a cookie
 * @param {String} value The value to use when setting the specified property
 * @param {int} [days] The number of days until the storage of this item expires
 */
const _writeCookie = function (name: string, value: string, days?: any) {
  const expiration = (function () {
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      return '; expires=' + date.toUTCString();
    } else {
      return '';
    }
  })();

  document.cookie = name + '=' + value + expiration + '; path=/';
};

export const browserStorage = {
  /**
   * @param {String} name The name of the property to set
   * @param {String} value The value to use when setting the specified property
   * @param {int} [days] The number of days until the storage of this item expires (if storage of the provided item must fallback to using cookies)
   */
  set: function (name: string, value: string, days?: any) {
    _hasLocalStorageSupport ? localStorage.setItem(name, value) : _writeCookie(name, value, days);
  },

  /**
   * @param {String} name The name of the value to retrieve
   * @return {?String} The value of the
   */
  get: function (name: string) {
    return _hasLocalStorageSupport ? localStorage.getItem(name) : _readCookie(name);
  },

  /**
   * @param {String} name The name of the value to delete/remove from storage
   */
  remove: function (name: string) {
    _hasLocalStorageSupport ? localStorage.removeItem(name) : this.set(name, '', -1);
  }
};
