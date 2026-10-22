var Qo = { exports: {} }, tl = {}, Ko = { exports: {} }, L = {};
/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var Xn = Symbol.for("react.element"), uc = Symbol.for("react.portal"), oc = Symbol.for("react.fragment"), sc = Symbol.for("react.strict_mode"), ac = Symbol.for("react.profiler"), cc = Symbol.for("react.provider"), fc = Symbol.for("react.context"), dc = Symbol.for("react.forward_ref"), pc = Symbol.for("react.suspense"), hc = Symbol.for("react.memo"), mc = Symbol.for("react.lazy"), Mu = Symbol.iterator;
function vc(e) {
  return e === null || typeof e != "object" ? null : (e = Mu && e[Mu] || e["@@iterator"], typeof e == "function" ? e : null);
}
var Yo = { isMounted: function() {
  return !1;
}, enqueueForceUpdate: function() {
}, enqueueReplaceState: function() {
}, enqueueSetState: function() {
} }, Xo = Object.assign, Go = {};
function ln(e, t, n) {
  this.props = e, this.context = t, this.refs = Go, this.updater = n || Yo;
}
ln.prototype.isReactComponent = {};
ln.prototype.setState = function(e, t) {
  if (typeof e != "object" && typeof e != "function" && e != null) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
  this.updater.enqueueSetState(this, e, t, "setState");
};
ln.prototype.forceUpdate = function(e) {
  this.updater.enqueueForceUpdate(this, e, "forceUpdate");
};
function Zo() {
}
Zo.prototype = ln.prototype;
function Ui(e, t, n) {
  this.props = e, this.context = t, this.refs = Go, this.updater = n || Yo;
}
var $i = Ui.prototype = new Zo();
$i.constructor = Ui;
Xo($i, ln.prototype);
$i.isPureReactComponent = !0;
var Du = Array.isArray, Jo = Object.prototype.hasOwnProperty, Ai = { current: null }, qo = { key: !0, ref: !0, __self: !0, __source: !0 };
function bo(e, t, n) {
  var r, l = {}, i = null, u = null;
  if (t != null) for (r in t.ref !== void 0 && (u = t.ref), t.key !== void 0 && (i = "" + t.key), t) Jo.call(t, r) && !qo.hasOwnProperty(r) && (l[r] = t[r]);
  var o = arguments.length - 2;
  if (o === 1) l.children = n;
  else if (1 < o) {
    for (var s = Array(o), c = 0; c < o; c++) s[c] = arguments[c + 2];
    l.children = s;
  }
  if (e && e.defaultProps) for (r in o = e.defaultProps, o) l[r] === void 0 && (l[r] = o[r]);
  return { $$typeof: Xn, type: e, key: i, ref: u, props: l, _owner: Ai.current };
}
function yc(e, t) {
  return { $$typeof: Xn, type: e.type, key: t, ref: e.ref, props: e.props, _owner: e._owner };
}
function Vi(e) {
  return typeof e == "object" && e !== null && e.$$typeof === Xn;
}
function gc(e) {
  var t = { "=": "=0", ":": "=2" };
  return "$" + e.replace(/[=:]/g, function(n) {
    return t[n];
  });
}
var Iu = /\/+/g;
function kl(e, t) {
  return typeof e == "object" && e !== null && e.key != null ? gc("" + e.key) : t.toString(36);
}
function wr(e, t, n, r, l) {
  var i = typeof e;
  (i === "undefined" || i === "boolean") && (e = null);
  var u = !1;
  if (e === null) u = !0;
  else switch (i) {
    case "string":
    case "number":
      u = !0;
      break;
    case "object":
      switch (e.$$typeof) {
        case Xn:
        case uc:
          u = !0;
      }
  }
  if (u) return u = e, l = l(u), e = r === "" ? "." + kl(u, 0) : r, Du(l) ? (n = "", e != null && (n = e.replace(Iu, "$&/") + "/"), wr(l, t, n, "", function(c) {
    return c;
  })) : l != null && (Vi(l) && (l = yc(l, n + (!l.key || u && u.key === l.key ? "" : ("" + l.key).replace(Iu, "$&/") + "/") + e)), t.push(l)), 1;
  if (u = 0, r = r === "" ? "." : r + ":", Du(e)) for (var o = 0; o < e.length; o++) {
    i = e[o];
    var s = r + kl(i, o);
    u += wr(i, t, n, s, l);
  }
  else if (s = vc(e), typeof s == "function") for (e = s.call(e), o = 0; !(i = e.next()).done; ) i = i.value, s = r + kl(i, o++), u += wr(i, t, n, s, l);
  else if (i === "object") throw t = String(e), Error("Objects are not valid as a React child (found: " + (t === "[object Object]" ? "object with keys {" + Object.keys(e).join(", ") + "}" : t) + "). If you meant to render a collection of children, use an array instead.");
  return u;
}
function tr(e, t, n) {
  if (e == null) return e;
  var r = [], l = 0;
  return wr(e, r, "", "", function(i) {
    return t.call(n, i, l++);
  }), r;
}
function wc(e) {
  if (e._status === -1) {
    var t = e._result;
    t = t(), t.then(function(n) {
      (e._status === 0 || e._status === -1) && (e._status = 1, e._result = n);
    }, function(n) {
      (e._status === 0 || e._status === -1) && (e._status = 2, e._result = n);
    }), e._status === -1 && (e._status = 0, e._result = t);
  }
  if (e._status === 1) return e._result.default;
  throw e._result;
}
var oe = { current: null }, kr = { transition: null }, kc = { ReactCurrentDispatcher: oe, ReactCurrentBatchConfig: kr, ReactCurrentOwner: Ai };
function es() {
  throw Error("act(...) is not supported in production builds of React.");
}
L.Children = { map: tr, forEach: function(e, t, n) {
  tr(e, function() {
    t.apply(this, arguments);
  }, n);
}, count: function(e) {
  var t = 0;
  return tr(e, function() {
    t++;
  }), t;
}, toArray: function(e) {
  return tr(e, function(t) {
    return t;
  }) || [];
}, only: function(e) {
  if (!Vi(e)) throw Error("React.Children.only expected to receive a single React element child.");
  return e;
} };
L.Component = ln;
L.Fragment = oc;
L.Profiler = ac;
L.PureComponent = Ui;
L.StrictMode = sc;
L.Suspense = pc;
L.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = kc;
L.act = es;
L.cloneElement = function(e, t, n) {
  if (e == null) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + e + ".");
  var r = Xo({}, e.props), l = e.key, i = e.ref, u = e._owner;
  if (t != null) {
    if (t.ref !== void 0 && (i = t.ref, u = Ai.current), t.key !== void 0 && (l = "" + t.key), e.type && e.type.defaultProps) var o = e.type.defaultProps;
    for (s in t) Jo.call(t, s) && !qo.hasOwnProperty(s) && (r[s] = t[s] === void 0 && o !== void 0 ? o[s] : t[s]);
  }
  var s = arguments.length - 2;
  if (s === 1) r.children = n;
  else if (1 < s) {
    o = Array(s);
    for (var c = 0; c < s; c++) o[c] = arguments[c + 2];
    r.children = o;
  }
  return { $$typeof: Xn, type: e.type, key: l, ref: i, props: r, _owner: u };
};
L.createContext = function(e) {
  return e = { $$typeof: fc, _currentValue: e, _currentValue2: e, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null }, e.Provider = { $$typeof: cc, _context: e }, e.Consumer = e;
};
L.createElement = bo;
L.createFactory = function(e) {
  var t = bo.bind(null, e);
  return t.type = e, t;
};
L.createRef = function() {
  return { current: null };
};
L.forwardRef = function(e) {
  return { $$typeof: dc, render: e };
};
L.isValidElement = Vi;
L.lazy = function(e) {
  return { $$typeof: mc, _payload: { _status: -1, _result: e }, _init: wc };
};
L.memo = function(e, t) {
  return { $$typeof: hc, type: e, compare: t === void 0 ? null : t };
};
L.startTransition = function(e) {
  var t = kr.transition;
  kr.transition = {};
  try {
    e();
  } finally {
    kr.transition = t;
  }
};
L.unstable_act = es;
L.useCallback = function(e, t) {
  return oe.current.useCallback(e, t);
};
L.useContext = function(e) {
  return oe.current.useContext(e);
};
L.useDebugValue = function() {
};
L.useDeferredValue = function(e) {
  return oe.current.useDeferredValue(e);
};
L.useEffect = function(e, t) {
  return oe.current.useEffect(e, t);
};
L.useId = function() {
  return oe.current.useId();
};
L.useImperativeHandle = function(e, t, n) {
  return oe.current.useImperativeHandle(e, t, n);
};
L.useInsertionEffect = function(e, t) {
  return oe.current.useInsertionEffect(e, t);
};
L.useLayoutEffect = function(e, t) {
  return oe.current.useLayoutEffect(e, t);
};
L.useMemo = function(e, t) {
  return oe.current.useMemo(e, t);
};
L.useReducer = function(e, t, n) {
  return oe.current.useReducer(e, t, n);
};
L.useRef = function(e) {
  return oe.current.useRef(e);
};
L.useState = function(e) {
  return oe.current.useState(e);
};
L.useSyncExternalStore = function(e, t, n) {
  return oe.current.useSyncExternalStore(e, t, n);
};
L.useTransition = function() {
  return oe.current.useTransition();
};
L.version = "18.3.1";
Ko.exports = L;
var Bi = Ko.exports;
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var Sc = Bi, xc = Symbol.for("react.element"), Ec = Symbol.for("react.fragment"), Cc = Object.prototype.hasOwnProperty, _c = Sc.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, Nc = { key: !0, ref: !0, __self: !0, __source: !0 };
function ts(e, t, n) {
  var r, l = {}, i = null, u = null;
  n !== void 0 && (i = "" + n), t.key !== void 0 && (i = "" + t.key), t.ref !== void 0 && (u = t.ref);
  for (r in t) Cc.call(t, r) && !Nc.hasOwnProperty(r) && (l[r] = t[r]);
  if (e && e.defaultProps) for (r in t = e.defaultProps, t) l[r] === void 0 && (l[r] = t[r]);
  return { $$typeof: xc, type: e, key: i, ref: u, props: l, _owner: _c.current };
}
tl.Fragment = Ec;
tl.jsx = ts;
tl.jsxs = ts;
Qo.exports = tl;
var h = Qo.exports, ns = { exports: {} }, ge = {}, rs = { exports: {} }, ls = {};
/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
(function(e) {
  function t(C, j) {
    var z = C.length;
    C.push(j);
    e: for (; 0 < z; ) {
      var W = z - 1 >>> 1, G = C[W];
      if (0 < l(G, j)) C[W] = j, C[z] = G, z = W;
      else break e;
    }
  }
  function n(C) {
    return C.length === 0 ? null : C[0];
  }
  function r(C) {
    if (C.length === 0) return null;
    var j = C[0], z = C.pop();
    if (z !== j) {
      C[0] = z;
      e: for (var W = 0, G = C.length, bn = G >>> 1; W < bn; ) {
        var mt = 2 * (W + 1) - 1, wl = C[mt], vt = mt + 1, er = C[vt];
        if (0 > l(wl, z)) vt < G && 0 > l(er, wl) ? (C[W] = er, C[vt] = z, W = vt) : (C[W] = wl, C[mt] = z, W = mt);
        else if (vt < G && 0 > l(er, z)) C[W] = er, C[vt] = z, W = vt;
        else break e;
      }
    }
    return j;
  }
  function l(C, j) {
    var z = C.sortIndex - j.sortIndex;
    return z !== 0 ? z : C.id - j.id;
  }
  if (typeof performance == "object" && typeof performance.now == "function") {
    var i = performance;
    e.unstable_now = function() {
      return i.now();
    };
  } else {
    var u = Date, o = u.now();
    e.unstable_now = function() {
      return u.now() - o;
    };
  }
  var s = [], c = [], v = 1, m = null, p = 3, w = !1, k = !1, S = !1, F = typeof setTimeout == "function" ? setTimeout : null, f = typeof clearTimeout == "function" ? clearTimeout : null, a = typeof setImmediate < "u" ? setImmediate : null;
  typeof navigator < "u" && navigator.scheduling !== void 0 && navigator.scheduling.isInputPending !== void 0 && navigator.scheduling.isInputPending.bind(navigator.scheduling);
  function d(C) {
    for (var j = n(c); j !== null; ) {
      if (j.callback === null) r(c);
      else if (j.startTime <= C) r(c), j.sortIndex = j.expirationTime, t(s, j);
      else break;
      j = n(c);
    }
  }
  function y(C) {
    if (S = !1, d(C), !k) if (n(s) !== null) k = !0, yl(E);
    else {
      var j = n(c);
      j !== null && gl(y, j.startTime - C);
    }
  }
  function E(C, j) {
    k = !1, S && (S = !1, f(P), P = -1), w = !0;
    var z = p;
    try {
      for (d(j), m = n(s); m !== null && (!(m.expirationTime > j) || C && !Ne()); ) {
        var W = m.callback;
        if (typeof W == "function") {
          m.callback = null, p = m.priorityLevel;
          var G = W(m.expirationTime <= j);
          j = e.unstable_now(), typeof G == "function" ? m.callback = G : m === n(s) && r(s), d(j);
        } else r(s);
        m = n(s);
      }
      if (m !== null) var bn = !0;
      else {
        var mt = n(c);
        mt !== null && gl(y, mt.startTime - j), bn = !1;
      }
      return bn;
    } finally {
      m = null, p = z, w = !1;
    }
  }
  var _ = !1, N = null, P = -1, H = 5, T = -1;
  function Ne() {
    return !(e.unstable_now() - T < H);
  }
  function sn() {
    if (N !== null) {
      var C = e.unstable_now();
      T = C;
      var j = !0;
      try {
        j = N(!0, C);
      } finally {
        j ? an() : (_ = !1, N = null);
      }
    } else _ = !1;
  }
  var an;
  if (typeof a == "function") an = function() {
    a(sn);
  };
  else if (typeof MessageChannel < "u") {
    var Ou = new MessageChannel(), ic = Ou.port2;
    Ou.port1.onmessage = sn, an = function() {
      ic.postMessage(null);
    };
  } else an = function() {
    F(sn, 0);
  };
  function yl(C) {
    N = C, _ || (_ = !0, an());
  }
  function gl(C, j) {
    P = F(function() {
      C(e.unstable_now());
    }, j);
  }
  e.unstable_IdlePriority = 5, e.unstable_ImmediatePriority = 1, e.unstable_LowPriority = 4, e.unstable_NormalPriority = 3, e.unstable_Profiling = null, e.unstable_UserBlockingPriority = 2, e.unstable_cancelCallback = function(C) {
    C.callback = null;
  }, e.unstable_continueExecution = function() {
    k || w || (k = !0, yl(E));
  }, e.unstable_forceFrameRate = function(C) {
    0 > C || 125 < C ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : H = 0 < C ? Math.floor(1e3 / C) : 5;
  }, e.unstable_getCurrentPriorityLevel = function() {
    return p;
  }, e.unstable_getFirstCallbackNode = function() {
    return n(s);
  }, e.unstable_next = function(C) {
    switch (p) {
      case 1:
      case 2:
      case 3:
        var j = 3;
        break;
      default:
        j = p;
    }
    var z = p;
    p = j;
    try {
      return C();
    } finally {
      p = z;
    }
  }, e.unstable_pauseExecution = function() {
  }, e.unstable_requestPaint = function() {
  }, e.unstable_runWithPriority = function(C, j) {
    switch (C) {
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        break;
      default:
        C = 3;
    }
    var z = p;
    p = C;
    try {
      return j();
    } finally {
      p = z;
    }
  }, e.unstable_scheduleCallback = function(C, j, z) {
    var W = e.unstable_now();
    switch (typeof z == "object" && z !== null ? (z = z.delay, z = typeof z == "number" && 0 < z ? W + z : W) : z = W, C) {
      case 1:
        var G = -1;
        break;
      case 2:
        G = 250;
        break;
      case 5:
        G = 1073741823;
        break;
      case 4:
        G = 1e4;
        break;
      default:
        G = 5e3;
    }
    return G = z + G, C = { id: v++, callback: j, priorityLevel: C, startTime: z, expirationTime: G, sortIndex: -1 }, z > W ? (C.sortIndex = z, t(c, C), n(s) === null && C === n(c) && (S ? (f(P), P = -1) : S = !0, gl(y, z - W))) : (C.sortIndex = G, t(s, C), k || w || (k = !0, yl(E))), C;
  }, e.unstable_shouldYield = Ne, e.unstable_wrapCallback = function(C) {
    var j = p;
    return function() {
      var z = p;
      p = j;
      try {
        return C.apply(this, arguments);
      } finally {
        p = z;
      }
    };
  };
})(ls);
rs.exports = ls;
var Pc = rs.exports;
/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var jc = Bi, ye = Pc;
function g(e) {
  for (var t = "https://reactjs.org/docs/error-decoder.html?invariant=" + e, n = 1; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
  return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
}
var is = /* @__PURE__ */ new Set(), Tn = {};
function Lt(e, t) {
  Jt(e, t), Jt(e + "Capture", t);
}
function Jt(e, t) {
  for (Tn[e] = t, e = 0; e < t.length; e++) is.add(t[e]);
}
var We = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), Kl = Object.prototype.hasOwnProperty, zc = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/, Fu = {}, Uu = {};
function Lc(e) {
  return Kl.call(Uu, e) ? !0 : Kl.call(Fu, e) ? !1 : zc.test(e) ? Uu[e] = !0 : (Fu[e] = !0, !1);
}
function Tc(e, t, n, r) {
  if (n !== null && n.type === 0) return !1;
  switch (typeof t) {
    case "function":
    case "symbol":
      return !0;
    case "boolean":
      return r ? !1 : n !== null ? !n.acceptsBooleans : (e = e.toLowerCase().slice(0, 5), e !== "data-" && e !== "aria-");
    default:
      return !1;
  }
}
function Rc(e, t, n, r) {
  if (t === null || typeof t > "u" || Tc(e, t, n, r)) return !0;
  if (r) return !1;
  if (n !== null) switch (n.type) {
    case 3:
      return !t;
    case 4:
      return t === !1;
    case 5:
      return isNaN(t);
    case 6:
      return isNaN(t) || 1 > t;
  }
  return !1;
}
function se(e, t, n, r, l, i, u) {
  this.acceptsBooleans = t === 2 || t === 3 || t === 4, this.attributeName = r, this.attributeNamespace = l, this.mustUseProperty = n, this.propertyName = e, this.type = t, this.sanitizeURL = i, this.removeEmptyString = u;
}
var ee = {};
"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e) {
  ee[e] = new se(e, 0, !1, e, null, !1, !1);
});
[["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(function(e) {
  var t = e[0];
  ee[t] = new se(t, 1, !1, e[1], null, !1, !1);
});
["contentEditable", "draggable", "spellCheck", "value"].forEach(function(e) {
  ee[e] = new se(e, 2, !1, e.toLowerCase(), null, !1, !1);
});
["autoReverse", "externalResourcesRequired", "focusable", "preserveAlpha"].forEach(function(e) {
  ee[e] = new se(e, 2, !1, e, null, !1, !1);
});
"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e) {
  ee[e] = new se(e, 3, !1, e.toLowerCase(), null, !1, !1);
});
["checked", "multiple", "muted", "selected"].forEach(function(e) {
  ee[e] = new se(e, 3, !0, e, null, !1, !1);
});
["capture", "download"].forEach(function(e) {
  ee[e] = new se(e, 4, !1, e, null, !1, !1);
});
["cols", "rows", "size", "span"].forEach(function(e) {
  ee[e] = new se(e, 6, !1, e, null, !1, !1);
});
["rowSpan", "start"].forEach(function(e) {
  ee[e] = new se(e, 5, !1, e.toLowerCase(), null, !1, !1);
});
var Hi = /[\-:]([a-z])/g;
function Wi(e) {
  return e[1].toUpperCase();
}
"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e) {
  var t = e.replace(
    Hi,
    Wi
  );
  ee[t] = new se(t, 1, !1, e, null, !1, !1);
});
"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e) {
  var t = e.replace(Hi, Wi);
  ee[t] = new se(t, 1, !1, e, "http://www.w3.org/1999/xlink", !1, !1);
});
["xml:base", "xml:lang", "xml:space"].forEach(function(e) {
  var t = e.replace(Hi, Wi);
  ee[t] = new se(t, 1, !1, e, "http://www.w3.org/XML/1998/namespace", !1, !1);
});
["tabIndex", "crossOrigin"].forEach(function(e) {
  ee[e] = new se(e, 1, !1, e.toLowerCase(), null, !1, !1);
});
ee.xlinkHref = new se("xlinkHref", 1, !1, "xlink:href", "http://www.w3.org/1999/xlink", !0, !1);
["src", "href", "action", "formAction"].forEach(function(e) {
  ee[e] = new se(e, 1, !1, e.toLowerCase(), null, !0, !0);
});
function Qi(e, t, n, r) {
  var l = ee.hasOwnProperty(t) ? ee[t] : null;
  (l !== null ? l.type !== 0 : r || !(2 < t.length) || t[0] !== "o" && t[0] !== "O" || t[1] !== "n" && t[1] !== "N") && (Rc(t, n, l, r) && (n = null), r || l === null ? Lc(t) && (n === null ? e.removeAttribute(t) : e.setAttribute(t, "" + n)) : l.mustUseProperty ? e[l.propertyName] = n === null ? l.type === 3 ? !1 : "" : n : (t = l.attributeName, r = l.attributeNamespace, n === null ? e.removeAttribute(t) : (l = l.type, n = l === 3 || l === 4 && n === !0 ? "" : "" + n, r ? e.setAttributeNS(r, t, n) : e.setAttribute(t, n))));
}
var Xe = jc.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED, nr = Symbol.for("react.element"), Ot = Symbol.for("react.portal"), Mt = Symbol.for("react.fragment"), Ki = Symbol.for("react.strict_mode"), Yl = Symbol.for("react.profiler"), us = Symbol.for("react.provider"), os = Symbol.for("react.context"), Yi = Symbol.for("react.forward_ref"), Xl = Symbol.for("react.suspense"), Gl = Symbol.for("react.suspense_list"), Xi = Symbol.for("react.memo"), Ze = Symbol.for("react.lazy"), ss = Symbol.for("react.offscreen"), $u = Symbol.iterator;
function cn(e) {
  return e === null || typeof e != "object" ? null : (e = $u && e[$u] || e["@@iterator"], typeof e == "function" ? e : null);
}
var V = Object.assign, Sl;
function gn(e) {
  if (Sl === void 0) try {
    throw Error();
  } catch (n) {
    var t = n.stack.trim().match(/\n( *(at )?)/);
    Sl = t && t[1] || "";
  }
  return `
` + Sl + e;
}
var xl = !1;
function El(e, t) {
  if (!e || xl) return "";
  xl = !0;
  var n = Error.prepareStackTrace;
  Error.prepareStackTrace = void 0;
  try {
    if (t) if (t = function() {
      throw Error();
    }, Object.defineProperty(t.prototype, "props", { set: function() {
      throw Error();
    } }), typeof Reflect == "object" && Reflect.construct) {
      try {
        Reflect.construct(t, []);
      } catch (c) {
        var r = c;
      }
      Reflect.construct(e, [], t);
    } else {
      try {
        t.call();
      } catch (c) {
        r = c;
      }
      e.call(t.prototype);
    }
    else {
      try {
        throw Error();
      } catch (c) {
        r = c;
      }
      e();
    }
  } catch (c) {
    if (c && r && typeof c.stack == "string") {
      for (var l = c.stack.split(`
`), i = r.stack.split(`
`), u = l.length - 1, o = i.length - 1; 1 <= u && 0 <= o && l[u] !== i[o]; ) o--;
      for (; 1 <= u && 0 <= o; u--, o--) if (l[u] !== i[o]) {
        if (u !== 1 || o !== 1)
          do
            if (u--, o--, 0 > o || l[u] !== i[o]) {
              var s = `
` + l[u].replace(" at new ", " at ");
              return e.displayName && s.includes("<anonymous>") && (s = s.replace("<anonymous>", e.displayName)), s;
            }
          while (1 <= u && 0 <= o);
        break;
      }
    }
  } finally {
    xl = !1, Error.prepareStackTrace = n;
  }
  return (e = e ? e.displayName || e.name : "") ? gn(e) : "";
}
function Oc(e) {
  switch (e.tag) {
    case 5:
      return gn(e.type);
    case 16:
      return gn("Lazy");
    case 13:
      return gn("Suspense");
    case 19:
      return gn("SuspenseList");
    case 0:
    case 2:
    case 15:
      return e = El(e.type, !1), e;
    case 11:
      return e = El(e.type.render, !1), e;
    case 1:
      return e = El(e.type, !0), e;
    default:
      return "";
  }
}
function Zl(e) {
  if (e == null) return null;
  if (typeof e == "function") return e.displayName || e.name || null;
  if (typeof e == "string") return e;
  switch (e) {
    case Mt:
      return "Fragment";
    case Ot:
      return "Portal";
    case Yl:
      return "Profiler";
    case Ki:
      return "StrictMode";
    case Xl:
      return "Suspense";
    case Gl:
      return "SuspenseList";
  }
  if (typeof e == "object") switch (e.$$typeof) {
    case os:
      return (e.displayName || "Context") + ".Consumer";
    case us:
      return (e._context.displayName || "Context") + ".Provider";
    case Yi:
      var t = e.render;
      return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
    case Xi:
      return t = e.displayName || null, t !== null ? t : Zl(e.type) || "Memo";
    case Ze:
      t = e._payload, e = e._init;
      try {
        return Zl(e(t));
      } catch {
      }
  }
  return null;
}
function Mc(e) {
  var t = e.type;
  switch (e.tag) {
    case 24:
      return "Cache";
    case 9:
      return (t.displayName || "Context") + ".Consumer";
    case 10:
      return (t._context.displayName || "Context") + ".Provider";
    case 18:
      return "DehydratedFragment";
    case 11:
      return e = t.render, e = e.displayName || e.name || "", t.displayName || (e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef");
    case 7:
      return "Fragment";
    case 5:
      return t;
    case 4:
      return "Portal";
    case 3:
      return "Root";
    case 6:
      return "Text";
    case 16:
      return Zl(t);
    case 8:
      return t === Ki ? "StrictMode" : "Mode";
    case 22:
      return "Offscreen";
    case 12:
      return "Profiler";
    case 21:
      return "Scope";
    case 13:
      return "Suspense";
    case 19:
      return "SuspenseList";
    case 25:
      return "TracingMarker";
    case 1:
    case 0:
    case 17:
    case 2:
    case 14:
    case 15:
      if (typeof t == "function") return t.displayName || t.name || null;
      if (typeof t == "string") return t;
  }
  return null;
}
function ct(e) {
  switch (typeof e) {
    case "boolean":
    case "number":
    case "string":
    case "undefined":
      return e;
    case "object":
      return e;
    default:
      return "";
  }
}
function as(e) {
  var t = e.type;
  return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
}
function Dc(e) {
  var t = as(e) ? "checked" : "value", n = Object.getOwnPropertyDescriptor(e.constructor.prototype, t), r = "" + e[t];
  if (!e.hasOwnProperty(t) && typeof n < "u" && typeof n.get == "function" && typeof n.set == "function") {
    var l = n.get, i = n.set;
    return Object.defineProperty(e, t, { configurable: !0, get: function() {
      return l.call(this);
    }, set: function(u) {
      r = "" + u, i.call(this, u);
    } }), Object.defineProperty(e, t, { enumerable: n.enumerable }), { getValue: function() {
      return r;
    }, setValue: function(u) {
      r = "" + u;
    }, stopTracking: function() {
      e._valueTracker = null, delete e[t];
    } };
  }
}
function rr(e) {
  e._valueTracker || (e._valueTracker = Dc(e));
}
function cs(e) {
  if (!e) return !1;
  var t = e._valueTracker;
  if (!t) return !0;
  var n = t.getValue(), r = "";
  return e && (r = as(e) ? e.checked ? "true" : "false" : e.value), e = r, e !== n ? (t.setValue(e), !0) : !1;
}
function Tr(e) {
  if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
  try {
    return e.activeElement || e.body;
  } catch {
    return e.body;
  }
}
function Jl(e, t) {
  var n = t.checked;
  return V({}, t, { defaultChecked: void 0, defaultValue: void 0, value: void 0, checked: n ?? e._wrapperState.initialChecked });
}
function Au(e, t) {
  var n = t.defaultValue == null ? "" : t.defaultValue, r = t.checked != null ? t.checked : t.defaultChecked;
  n = ct(t.value != null ? t.value : n), e._wrapperState = { initialChecked: r, initialValue: n, controlled: t.type === "checkbox" || t.type === "radio" ? t.checked != null : t.value != null };
}
function fs(e, t) {
  t = t.checked, t != null && Qi(e, "checked", t, !1);
}
function ql(e, t) {
  fs(e, t);
  var n = ct(t.value), r = t.type;
  if (n != null) r === "number" ? (n === 0 && e.value === "" || e.value != n) && (e.value = "" + n) : e.value !== "" + n && (e.value = "" + n);
  else if (r === "submit" || r === "reset") {
    e.removeAttribute("value");
    return;
  }
  t.hasOwnProperty("value") ? bl(e, t.type, n) : t.hasOwnProperty("defaultValue") && bl(e, t.type, ct(t.defaultValue)), t.checked == null && t.defaultChecked != null && (e.defaultChecked = !!t.defaultChecked);
}
function Vu(e, t, n) {
  if (t.hasOwnProperty("value") || t.hasOwnProperty("defaultValue")) {
    var r = t.type;
    if (!(r !== "submit" && r !== "reset" || t.value !== void 0 && t.value !== null)) return;
    t = "" + e._wrapperState.initialValue, n || t === e.value || (e.value = t), e.defaultValue = t;
  }
  n = e.name, n !== "" && (e.name = ""), e.defaultChecked = !!e._wrapperState.initialChecked, n !== "" && (e.name = n);
}
function bl(e, t, n) {
  (t !== "number" || Tr(e.ownerDocument) !== e) && (n == null ? e.defaultValue = "" + e._wrapperState.initialValue : e.defaultValue !== "" + n && (e.defaultValue = "" + n));
}
var wn = Array.isArray;
function Qt(e, t, n, r) {
  if (e = e.options, t) {
    t = {};
    for (var l = 0; l < n.length; l++) t["$" + n[l]] = !0;
    for (n = 0; n < e.length; n++) l = t.hasOwnProperty("$" + e[n].value), e[n].selected !== l && (e[n].selected = l), l && r && (e[n].defaultSelected = !0);
  } else {
    for (n = "" + ct(n), t = null, l = 0; l < e.length; l++) {
      if (e[l].value === n) {
        e[l].selected = !0, r && (e[l].defaultSelected = !0);
        return;
      }
      t !== null || e[l].disabled || (t = e[l]);
    }
    t !== null && (t.selected = !0);
  }
}
function ei(e, t) {
  if (t.dangerouslySetInnerHTML != null) throw Error(g(91));
  return V({}, t, { value: void 0, defaultValue: void 0, children: "" + e._wrapperState.initialValue });
}
function Bu(e, t) {
  var n = t.value;
  if (n == null) {
    if (n = t.children, t = t.defaultValue, n != null) {
      if (t != null) throw Error(g(92));
      if (wn(n)) {
        if (1 < n.length) throw Error(g(93));
        n = n[0];
      }
      t = n;
    }
    t == null && (t = ""), n = t;
  }
  e._wrapperState = { initialValue: ct(n) };
}
function ds(e, t) {
  var n = ct(t.value), r = ct(t.defaultValue);
  n != null && (n = "" + n, n !== e.value && (e.value = n), t.defaultValue == null && e.defaultValue !== n && (e.defaultValue = n)), r != null && (e.defaultValue = "" + r);
}
function Hu(e) {
  var t = e.textContent;
  t === e._wrapperState.initialValue && t !== "" && t !== null && (e.value = t);
}
function ps(e) {
  switch (e) {
    case "svg":
      return "http://www.w3.org/2000/svg";
    case "math":
      return "http://www.w3.org/1998/Math/MathML";
    default:
      return "http://www.w3.org/1999/xhtml";
  }
}
function ti(e, t) {
  return e == null || e === "http://www.w3.org/1999/xhtml" ? ps(t) : e === "http://www.w3.org/2000/svg" && t === "foreignObject" ? "http://www.w3.org/1999/xhtml" : e;
}
var lr, hs = function(e) {
  return typeof MSApp < "u" && MSApp.execUnsafeLocalFunction ? function(t, n, r, l) {
    MSApp.execUnsafeLocalFunction(function() {
      return e(t, n, r, l);
    });
  } : e;
}(function(e, t) {
  if (e.namespaceURI !== "http://www.w3.org/2000/svg" || "innerHTML" in e) e.innerHTML = t;
  else {
    for (lr = lr || document.createElement("div"), lr.innerHTML = "<svg>" + t.valueOf().toString() + "</svg>", t = lr.firstChild; e.firstChild; ) e.removeChild(e.firstChild);
    for (; t.firstChild; ) e.appendChild(t.firstChild);
  }
});
function Rn(e, t) {
  if (t) {
    var n = e.firstChild;
    if (n && n === e.lastChild && n.nodeType === 3) {
      n.nodeValue = t;
      return;
    }
  }
  e.textContent = t;
}
var xn = {
  animationIterationCount: !0,
  aspectRatio: !0,
  borderImageOutset: !0,
  borderImageSlice: !0,
  borderImageWidth: !0,
  boxFlex: !0,
  boxFlexGroup: !0,
  boxOrdinalGroup: !0,
  columnCount: !0,
  columns: !0,
  flex: !0,
  flexGrow: !0,
  flexPositive: !0,
  flexShrink: !0,
  flexNegative: !0,
  flexOrder: !0,
  gridArea: !0,
  gridRow: !0,
  gridRowEnd: !0,
  gridRowSpan: !0,
  gridRowStart: !0,
  gridColumn: !0,
  gridColumnEnd: !0,
  gridColumnSpan: !0,
  gridColumnStart: !0,
  fontWeight: !0,
  lineClamp: !0,
  lineHeight: !0,
  opacity: !0,
  order: !0,
  orphans: !0,
  tabSize: !0,
  widows: !0,
  zIndex: !0,
  zoom: !0,
  fillOpacity: !0,
  floodOpacity: !0,
  stopOpacity: !0,
  strokeDasharray: !0,
  strokeDashoffset: !0,
  strokeMiterlimit: !0,
  strokeOpacity: !0,
  strokeWidth: !0
}, Ic = ["Webkit", "ms", "Moz", "O"];
Object.keys(xn).forEach(function(e) {
  Ic.forEach(function(t) {
    t = t + e.charAt(0).toUpperCase() + e.substring(1), xn[t] = xn[e];
  });
});
function ms(e, t, n) {
  return t == null || typeof t == "boolean" || t === "" ? "" : n || typeof t != "number" || t === 0 || xn.hasOwnProperty(e) && xn[e] ? ("" + t).trim() : t + "px";
}
function vs(e, t) {
  e = e.style;
  for (var n in t) if (t.hasOwnProperty(n)) {
    var r = n.indexOf("--") === 0, l = ms(n, t[n], r);
    n === "float" && (n = "cssFloat"), r ? e.setProperty(n, l) : e[n] = l;
  }
}
var Fc = V({ menuitem: !0 }, { area: !0, base: !0, br: !0, col: !0, embed: !0, hr: !0, img: !0, input: !0, keygen: !0, link: !0, meta: !0, param: !0, source: !0, track: !0, wbr: !0 });
function ni(e, t) {
  if (t) {
    if (Fc[e] && (t.children != null || t.dangerouslySetInnerHTML != null)) throw Error(g(137, e));
    if (t.dangerouslySetInnerHTML != null) {
      if (t.children != null) throw Error(g(60));
      if (typeof t.dangerouslySetInnerHTML != "object" || !("__html" in t.dangerouslySetInnerHTML)) throw Error(g(61));
    }
    if (t.style != null && typeof t.style != "object") throw Error(g(62));
  }
}
function ri(e, t) {
  if (e.indexOf("-") === -1) return typeof t.is == "string";
  switch (e) {
    case "annotation-xml":
    case "color-profile":
    case "font-face":
    case "font-face-src":
    case "font-face-uri":
    case "font-face-format":
    case "font-face-name":
    case "missing-glyph":
      return !1;
    default:
      return !0;
  }
}
var li = null;
function Gi(e) {
  return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
}
var ii = null, Kt = null, Yt = null;
function Wu(e) {
  if (e = Jn(e)) {
    if (typeof ii != "function") throw Error(g(280));
    var t = e.stateNode;
    t && (t = ul(t), ii(e.stateNode, e.type, t));
  }
}
function ys(e) {
  Kt ? Yt ? Yt.push(e) : Yt = [e] : Kt = e;
}
function gs() {
  if (Kt) {
    var e = Kt, t = Yt;
    if (Yt = Kt = null, Wu(e), t) for (e = 0; e < t.length; e++) Wu(t[e]);
  }
}
function ws(e, t) {
  return e(t);
}
function ks() {
}
var Cl = !1;
function Ss(e, t, n) {
  if (Cl) return e(t, n);
  Cl = !0;
  try {
    return ws(e, t, n);
  } finally {
    Cl = !1, (Kt !== null || Yt !== null) && (ks(), gs());
  }
}
function On(e, t) {
  var n = e.stateNode;
  if (n === null) return null;
  var r = ul(n);
  if (r === null) return null;
  n = r[t];
  e: switch (t) {
    case "onClick":
    case "onClickCapture":
    case "onDoubleClick":
    case "onDoubleClickCapture":
    case "onMouseDown":
    case "onMouseDownCapture":
    case "onMouseMove":
    case "onMouseMoveCapture":
    case "onMouseUp":
    case "onMouseUpCapture":
    case "onMouseEnter":
      (r = !r.disabled) || (e = e.type, r = !(e === "button" || e === "input" || e === "select" || e === "textarea")), e = !r;
      break e;
    default:
      e = !1;
  }
  if (e) return null;
  if (n && typeof n != "function") throw Error(g(231, t, typeof n));
  return n;
}
var ui = !1;
if (We) try {
  var fn = {};
  Object.defineProperty(fn, "passive", { get: function() {
    ui = !0;
  } }), window.addEventListener("test", fn, fn), window.removeEventListener("test", fn, fn);
} catch {
  ui = !1;
}
function Uc(e, t, n, r, l, i, u, o, s) {
  var c = Array.prototype.slice.call(arguments, 3);
  try {
    t.apply(n, c);
  } catch (v) {
    this.onError(v);
  }
}
var En = !1, Rr = null, Or = !1, oi = null, $c = { onError: function(e) {
  En = !0, Rr = e;
} };
function Ac(e, t, n, r, l, i, u, o, s) {
  En = !1, Rr = null, Uc.apply($c, arguments);
}
function Vc(e, t, n, r, l, i, u, o, s) {
  if (Ac.apply(this, arguments), En) {
    if (En) {
      var c = Rr;
      En = !1, Rr = null;
    } else throw Error(g(198));
    Or || (Or = !0, oi = c);
  }
}
function Tt(e) {
  var t = e, n = e;
  if (e.alternate) for (; t.return; ) t = t.return;
  else {
    e = t;
    do
      t = e, t.flags & 4098 && (n = t.return), e = t.return;
    while (e);
  }
  return t.tag === 3 ? n : null;
}
function xs(e) {
  if (e.tag === 13) {
    var t = e.memoizedState;
    if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
  }
  return null;
}
function Qu(e) {
  if (Tt(e) !== e) throw Error(g(188));
}
function Bc(e) {
  var t = e.alternate;
  if (!t) {
    if (t = Tt(e), t === null) throw Error(g(188));
    return t !== e ? null : e;
  }
  for (var n = e, r = t; ; ) {
    var l = n.return;
    if (l === null) break;
    var i = l.alternate;
    if (i === null) {
      if (r = l.return, r !== null) {
        n = r;
        continue;
      }
      break;
    }
    if (l.child === i.child) {
      for (i = l.child; i; ) {
        if (i === n) return Qu(l), e;
        if (i === r) return Qu(l), t;
        i = i.sibling;
      }
      throw Error(g(188));
    }
    if (n.return !== r.return) n = l, r = i;
    else {
      for (var u = !1, o = l.child; o; ) {
        if (o === n) {
          u = !0, n = l, r = i;
          break;
        }
        if (o === r) {
          u = !0, r = l, n = i;
          break;
        }
        o = o.sibling;
      }
      if (!u) {
        for (o = i.child; o; ) {
          if (o === n) {
            u = !0, n = i, r = l;
            break;
          }
          if (o === r) {
            u = !0, r = i, n = l;
            break;
          }
          o = o.sibling;
        }
        if (!u) throw Error(g(189));
      }
    }
    if (n.alternate !== r) throw Error(g(190));
  }
  if (n.tag !== 3) throw Error(g(188));
  return n.stateNode.current === n ? e : t;
}
function Es(e) {
  return e = Bc(e), e !== null ? Cs(e) : null;
}
function Cs(e) {
  if (e.tag === 5 || e.tag === 6) return e;
  for (e = e.child; e !== null; ) {
    var t = Cs(e);
    if (t !== null) return t;
    e = e.sibling;
  }
  return null;
}
var _s = ye.unstable_scheduleCallback, Ku = ye.unstable_cancelCallback, Hc = ye.unstable_shouldYield, Wc = ye.unstable_requestPaint, Q = ye.unstable_now, Qc = ye.unstable_getCurrentPriorityLevel, Zi = ye.unstable_ImmediatePriority, Ns = ye.unstable_UserBlockingPriority, Mr = ye.unstable_NormalPriority, Kc = ye.unstable_LowPriority, Ps = ye.unstable_IdlePriority, nl = null, Fe = null;
function Yc(e) {
  if (Fe && typeof Fe.onCommitFiberRoot == "function") try {
    Fe.onCommitFiberRoot(nl, e, void 0, (e.current.flags & 128) === 128);
  } catch {
  }
}
var Te = Math.clz32 ? Math.clz32 : Zc, Xc = Math.log, Gc = Math.LN2;
function Zc(e) {
  return e >>>= 0, e === 0 ? 32 : 31 - (Xc(e) / Gc | 0) | 0;
}
var ir = 64, ur = 4194304;
function kn(e) {
  switch (e & -e) {
    case 1:
      return 1;
    case 2:
      return 2;
    case 4:
      return 4;
    case 8:
      return 8;
    case 16:
      return 16;
    case 32:
      return 32;
    case 64:
    case 128:
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
      return e & 4194240;
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
    case 67108864:
      return e & 130023424;
    case 134217728:
      return 134217728;
    case 268435456:
      return 268435456;
    case 536870912:
      return 536870912;
    case 1073741824:
      return 1073741824;
    default:
      return e;
  }
}
function Dr(e, t) {
  var n = e.pendingLanes;
  if (n === 0) return 0;
  var r = 0, l = e.suspendedLanes, i = e.pingedLanes, u = n & 268435455;
  if (u !== 0) {
    var o = u & ~l;
    o !== 0 ? r = kn(o) : (i &= u, i !== 0 && (r = kn(i)));
  } else u = n & ~l, u !== 0 ? r = kn(u) : i !== 0 && (r = kn(i));
  if (r === 0) return 0;
  if (t !== 0 && t !== r && !(t & l) && (l = r & -r, i = t & -t, l >= i || l === 16 && (i & 4194240) !== 0)) return t;
  if (r & 4 && (r |= n & 16), t = e.entangledLanes, t !== 0) for (e = e.entanglements, t &= r; 0 < t; ) n = 31 - Te(t), l = 1 << n, r |= e[n], t &= ~l;
  return r;
}
function Jc(e, t) {
  switch (e) {
    case 1:
    case 2:
    case 4:
      return t + 250;
    case 8:
    case 16:
    case 32:
    case 64:
    case 128:
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
      return t + 5e3;
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
    case 67108864:
      return -1;
    case 134217728:
    case 268435456:
    case 536870912:
    case 1073741824:
      return -1;
    default:
      return -1;
  }
}
function qc(e, t) {
  for (var n = e.suspendedLanes, r = e.pingedLanes, l = e.expirationTimes, i = e.pendingLanes; 0 < i; ) {
    var u = 31 - Te(i), o = 1 << u, s = l[u];
    s === -1 ? (!(o & n) || o & r) && (l[u] = Jc(o, t)) : s <= t && (e.expiredLanes |= o), i &= ~o;
  }
}
function si(e) {
  return e = e.pendingLanes & -1073741825, e !== 0 ? e : e & 1073741824 ? 1073741824 : 0;
}
function js() {
  var e = ir;
  return ir <<= 1, !(ir & 4194240) && (ir = 64), e;
}
function _l(e) {
  for (var t = [], n = 0; 31 > n; n++) t.push(e);
  return t;
}
function Gn(e, t, n) {
  e.pendingLanes |= t, t !== 536870912 && (e.suspendedLanes = 0, e.pingedLanes = 0), e = e.eventTimes, t = 31 - Te(t), e[t] = n;
}
function bc(e, t) {
  var n = e.pendingLanes & ~t;
  e.pendingLanes = t, e.suspendedLanes = 0, e.pingedLanes = 0, e.expiredLanes &= t, e.mutableReadLanes &= t, e.entangledLanes &= t, t = e.entanglements;
  var r = e.eventTimes;
  for (e = e.expirationTimes; 0 < n; ) {
    var l = 31 - Te(n), i = 1 << l;
    t[l] = 0, r[l] = -1, e[l] = -1, n &= ~i;
  }
}
function Ji(e, t) {
  var n = e.entangledLanes |= t;
  for (e = e.entanglements; n; ) {
    var r = 31 - Te(n), l = 1 << r;
    l & t | e[r] & t && (e[r] |= t), n &= ~l;
  }
}
var O = 0;
function zs(e) {
  return e &= -e, 1 < e ? 4 < e ? e & 268435455 ? 16 : 536870912 : 4 : 1;
}
var Ls, qi, Ts, Rs, Os, ai = !1, or = [], nt = null, rt = null, lt = null, Mn = /* @__PURE__ */ new Map(), Dn = /* @__PURE__ */ new Map(), qe = [], ef = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");
function Yu(e, t) {
  switch (e) {
    case "focusin":
    case "focusout":
      nt = null;
      break;
    case "dragenter":
    case "dragleave":
      rt = null;
      break;
    case "mouseover":
    case "mouseout":
      lt = null;
      break;
    case "pointerover":
    case "pointerout":
      Mn.delete(t.pointerId);
      break;
    case "gotpointercapture":
    case "lostpointercapture":
      Dn.delete(t.pointerId);
  }
}
function dn(e, t, n, r, l, i) {
  return e === null || e.nativeEvent !== i ? (e = { blockedOn: t, domEventName: n, eventSystemFlags: r, nativeEvent: i, targetContainers: [l] }, t !== null && (t = Jn(t), t !== null && qi(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, l !== null && t.indexOf(l) === -1 && t.push(l), e);
}
function tf(e, t, n, r, l) {
  switch (t) {
    case "focusin":
      return nt = dn(nt, e, t, n, r, l), !0;
    case "dragenter":
      return rt = dn(rt, e, t, n, r, l), !0;
    case "mouseover":
      return lt = dn(lt, e, t, n, r, l), !0;
    case "pointerover":
      var i = l.pointerId;
      return Mn.set(i, dn(Mn.get(i) || null, e, t, n, r, l)), !0;
    case "gotpointercapture":
      return i = l.pointerId, Dn.set(i, dn(Dn.get(i) || null, e, t, n, r, l)), !0;
  }
  return !1;
}
function Ms(e) {
  var t = kt(e.target);
  if (t !== null) {
    var n = Tt(t);
    if (n !== null) {
      if (t = n.tag, t === 13) {
        if (t = xs(n), t !== null) {
          e.blockedOn = t, Os(e.priority, function() {
            Ts(n);
          });
          return;
        }
      } else if (t === 3 && n.stateNode.current.memoizedState.isDehydrated) {
        e.blockedOn = n.tag === 3 ? n.stateNode.containerInfo : null;
        return;
      }
    }
  }
  e.blockedOn = null;
}
function Sr(e) {
  if (e.blockedOn !== null) return !1;
  for (var t = e.targetContainers; 0 < t.length; ) {
    var n = ci(e.domEventName, e.eventSystemFlags, t[0], e.nativeEvent);
    if (n === null) {
      n = e.nativeEvent;
      var r = new n.constructor(n.type, n);
      li = r, n.target.dispatchEvent(r), li = null;
    } else return t = Jn(n), t !== null && qi(t), e.blockedOn = n, !1;
    t.shift();
  }
  return !0;
}
function Xu(e, t, n) {
  Sr(e) && n.delete(t);
}
function nf() {
  ai = !1, nt !== null && Sr(nt) && (nt = null), rt !== null && Sr(rt) && (rt = null), lt !== null && Sr(lt) && (lt = null), Mn.forEach(Xu), Dn.forEach(Xu);
}
function pn(e, t) {
  e.blockedOn === t && (e.blockedOn = null, ai || (ai = !0, ye.unstable_scheduleCallback(ye.unstable_NormalPriority, nf)));
}
function In(e) {
  function t(l) {
    return pn(l, e);
  }
  if (0 < or.length) {
    pn(or[0], e);
    for (var n = 1; n < or.length; n++) {
      var r = or[n];
      r.blockedOn === e && (r.blockedOn = null);
    }
  }
  for (nt !== null && pn(nt, e), rt !== null && pn(rt, e), lt !== null && pn(lt, e), Mn.forEach(t), Dn.forEach(t), n = 0; n < qe.length; n++) r = qe[n], r.blockedOn === e && (r.blockedOn = null);
  for (; 0 < qe.length && (n = qe[0], n.blockedOn === null); ) Ms(n), n.blockedOn === null && qe.shift();
}
var Xt = Xe.ReactCurrentBatchConfig, Ir = !0;
function rf(e, t, n, r) {
  var l = O, i = Xt.transition;
  Xt.transition = null;
  try {
    O = 1, bi(e, t, n, r);
  } finally {
    O = l, Xt.transition = i;
  }
}
function lf(e, t, n, r) {
  var l = O, i = Xt.transition;
  Xt.transition = null;
  try {
    O = 4, bi(e, t, n, r);
  } finally {
    O = l, Xt.transition = i;
  }
}
function bi(e, t, n, r) {
  if (Ir) {
    var l = ci(e, t, n, r);
    if (l === null) Dl(e, t, r, Fr, n), Yu(e, r);
    else if (tf(l, e, t, n, r)) r.stopPropagation();
    else if (Yu(e, r), t & 4 && -1 < ef.indexOf(e)) {
      for (; l !== null; ) {
        var i = Jn(l);
        if (i !== null && Ls(i), i = ci(e, t, n, r), i === null && Dl(e, t, r, Fr, n), i === l) break;
        l = i;
      }
      l !== null && r.stopPropagation();
    } else Dl(e, t, r, null, n);
  }
}
var Fr = null;
function ci(e, t, n, r) {
  if (Fr = null, e = Gi(r), e = kt(e), e !== null) if (t = Tt(e), t === null) e = null;
  else if (n = t.tag, n === 13) {
    if (e = xs(t), e !== null) return e;
    e = null;
  } else if (n === 3) {
    if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
    e = null;
  } else t !== e && (e = null);
  return Fr = e, null;
}
function Ds(e) {
  switch (e) {
    case "cancel":
    case "click":
    case "close":
    case "contextmenu":
    case "copy":
    case "cut":
    case "auxclick":
    case "dblclick":
    case "dragend":
    case "dragstart":
    case "drop":
    case "focusin":
    case "focusout":
    case "input":
    case "invalid":
    case "keydown":
    case "keypress":
    case "keyup":
    case "mousedown":
    case "mouseup":
    case "paste":
    case "pause":
    case "play":
    case "pointercancel":
    case "pointerdown":
    case "pointerup":
    case "ratechange":
    case "reset":
    case "resize":
    case "seeked":
    case "submit":
    case "touchcancel":
    case "touchend":
    case "touchstart":
    case "volumechange":
    case "change":
    case "selectionchange":
    case "textInput":
    case "compositionstart":
    case "compositionend":
    case "compositionupdate":
    case "beforeblur":
    case "afterblur":
    case "beforeinput":
    case "blur":
    case "fullscreenchange":
    case "focus":
    case "hashchange":
    case "popstate":
    case "select":
    case "selectstart":
      return 1;
    case "drag":
    case "dragenter":
    case "dragexit":
    case "dragleave":
    case "dragover":
    case "mousemove":
    case "mouseout":
    case "mouseover":
    case "pointermove":
    case "pointerout":
    case "pointerover":
    case "scroll":
    case "toggle":
    case "touchmove":
    case "wheel":
    case "mouseenter":
    case "mouseleave":
    case "pointerenter":
    case "pointerleave":
      return 4;
    case "message":
      switch (Qc()) {
        case Zi:
          return 1;
        case Ns:
          return 4;
        case Mr:
        case Kc:
          return 16;
        case Ps:
          return 536870912;
        default:
          return 16;
      }
    default:
      return 16;
  }
}
var et = null, eu = null, xr = null;
function Is() {
  if (xr) return xr;
  var e, t = eu, n = t.length, r, l = "value" in et ? et.value : et.textContent, i = l.length;
  for (e = 0; e < n && t[e] === l[e]; e++) ;
  var u = n - e;
  for (r = 1; r <= u && t[n - r] === l[i - r]; r++) ;
  return xr = l.slice(e, 1 < r ? 1 - r : void 0);
}
function Er(e) {
  var t = e.keyCode;
  return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
}
function sr() {
  return !0;
}
function Gu() {
  return !1;
}
function we(e) {
  function t(n, r, l, i, u) {
    this._reactName = n, this._targetInst = l, this.type = r, this.nativeEvent = i, this.target = u, this.currentTarget = null;
    for (var o in e) e.hasOwnProperty(o) && (n = e[o], this[o] = n ? n(i) : i[o]);
    return this.isDefaultPrevented = (i.defaultPrevented != null ? i.defaultPrevented : i.returnValue === !1) ? sr : Gu, this.isPropagationStopped = Gu, this;
  }
  return V(t.prototype, { preventDefault: function() {
    this.defaultPrevented = !0;
    var n = this.nativeEvent;
    n && (n.preventDefault ? n.preventDefault() : typeof n.returnValue != "unknown" && (n.returnValue = !1), this.isDefaultPrevented = sr);
  }, stopPropagation: function() {
    var n = this.nativeEvent;
    n && (n.stopPropagation ? n.stopPropagation() : typeof n.cancelBubble != "unknown" && (n.cancelBubble = !0), this.isPropagationStopped = sr);
  }, persist: function() {
  }, isPersistent: sr }), t;
}
var un = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(e) {
  return e.timeStamp || Date.now();
}, defaultPrevented: 0, isTrusted: 0 }, tu = we(un), Zn = V({}, un, { view: 0, detail: 0 }), uf = we(Zn), Nl, Pl, hn, rl = V({}, Zn, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: nu, button: 0, buttons: 0, relatedTarget: function(e) {
  return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
}, movementX: function(e) {
  return "movementX" in e ? e.movementX : (e !== hn && (hn && e.type === "mousemove" ? (Nl = e.screenX - hn.screenX, Pl = e.screenY - hn.screenY) : Pl = Nl = 0, hn = e), Nl);
}, movementY: function(e) {
  return "movementY" in e ? e.movementY : Pl;
} }), Zu = we(rl), of = V({}, rl, { dataTransfer: 0 }), sf = we(of), af = V({}, Zn, { relatedTarget: 0 }), jl = we(af), cf = V({}, un, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }), ff = we(cf), df = V({}, un, { clipboardData: function(e) {
  return "clipboardData" in e ? e.clipboardData : window.clipboardData;
} }), pf = we(df), hf = V({}, un, { data: 0 }), Ju = we(hf), mf = {
  Esc: "Escape",
  Spacebar: " ",
  Left: "ArrowLeft",
  Up: "ArrowUp",
  Right: "ArrowRight",
  Down: "ArrowDown",
  Del: "Delete",
  Win: "OS",
  Menu: "ContextMenu",
  Apps: "ContextMenu",
  Scroll: "ScrollLock",
  MozPrintableKey: "Unidentified"
}, vf = {
  8: "Backspace",
  9: "Tab",
  12: "Clear",
  13: "Enter",
  16: "Shift",
  17: "Control",
  18: "Alt",
  19: "Pause",
  20: "CapsLock",
  27: "Escape",
  32: " ",
  33: "PageUp",
  34: "PageDown",
  35: "End",
  36: "Home",
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
  45: "Insert",
  46: "Delete",
  112: "F1",
  113: "F2",
  114: "F3",
  115: "F4",
  116: "F5",
  117: "F6",
  118: "F7",
  119: "F8",
  120: "F9",
  121: "F10",
  122: "F11",
  123: "F12",
  144: "NumLock",
  145: "ScrollLock",
  224: "Meta"
}, yf = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
function gf(e) {
  var t = this.nativeEvent;
  return t.getModifierState ? t.getModifierState(e) : (e = yf[e]) ? !!t[e] : !1;
}
function nu() {
  return gf;
}
var wf = V({}, Zn, { key: function(e) {
  if (e.key) {
    var t = mf[e.key] || e.key;
    if (t !== "Unidentified") return t;
  }
  return e.type === "keypress" ? (e = Er(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? vf[e.keyCode] || "Unidentified" : "";
}, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: nu, charCode: function(e) {
  return e.type === "keypress" ? Er(e) : 0;
}, keyCode: function(e) {
  return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
}, which: function(e) {
  return e.type === "keypress" ? Er(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
} }), kf = we(wf), Sf = V({}, rl, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 }), qu = we(Sf), xf = V({}, Zn, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: nu }), Ef = we(xf), Cf = V({}, un, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }), _f = we(Cf), Nf = V({}, rl, {
  deltaX: function(e) {
    return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
  },
  deltaY: function(e) {
    return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
  },
  deltaZ: 0,
  deltaMode: 0
}), Pf = we(Nf), jf = [9, 13, 27, 32], ru = We && "CompositionEvent" in window, Cn = null;
We && "documentMode" in document && (Cn = document.documentMode);
var zf = We && "TextEvent" in window && !Cn, Fs = We && (!ru || Cn && 8 < Cn && 11 >= Cn), bu = " ", eo = !1;
function Us(e, t) {
  switch (e) {
    case "keyup":
      return jf.indexOf(t.keyCode) !== -1;
    case "keydown":
      return t.keyCode !== 229;
    case "keypress":
    case "mousedown":
    case "focusout":
      return !0;
    default:
      return !1;
  }
}
function $s(e) {
  return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
}
var Dt = !1;
function Lf(e, t) {
  switch (e) {
    case "compositionend":
      return $s(t);
    case "keypress":
      return t.which !== 32 ? null : (eo = !0, bu);
    case "textInput":
      return e = t.data, e === bu && eo ? null : e;
    default:
      return null;
  }
}
function Tf(e, t) {
  if (Dt) return e === "compositionend" || !ru && Us(e, t) ? (e = Is(), xr = eu = et = null, Dt = !1, e) : null;
  switch (e) {
    case "paste":
      return null;
    case "keypress":
      if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
        if (t.char && 1 < t.char.length) return t.char;
        if (t.which) return String.fromCharCode(t.which);
      }
      return null;
    case "compositionend":
      return Fs && t.locale !== "ko" ? null : t.data;
    default:
      return null;
  }
}
var Rf = { color: !0, date: !0, datetime: !0, "datetime-local": !0, email: !0, month: !0, number: !0, password: !0, range: !0, search: !0, tel: !0, text: !0, time: !0, url: !0, week: !0 };
function to(e) {
  var t = e && e.nodeName && e.nodeName.toLowerCase();
  return t === "input" ? !!Rf[e.type] : t === "textarea";
}
function As(e, t, n, r) {
  ys(r), t = Ur(t, "onChange"), 0 < t.length && (n = new tu("onChange", "change", null, n, r), e.push({ event: n, listeners: t }));
}
var _n = null, Fn = null;
function Of(e) {
  Js(e, 0);
}
function ll(e) {
  var t = Ut(e);
  if (cs(t)) return e;
}
function Mf(e, t) {
  if (e === "change") return t;
}
var Vs = !1;
if (We) {
  var zl;
  if (We) {
    var Ll = "oninput" in document;
    if (!Ll) {
      var no = document.createElement("div");
      no.setAttribute("oninput", "return;"), Ll = typeof no.oninput == "function";
    }
    zl = Ll;
  } else zl = !1;
  Vs = zl && (!document.documentMode || 9 < document.documentMode);
}
function ro() {
  _n && (_n.detachEvent("onpropertychange", Bs), Fn = _n = null);
}
function Bs(e) {
  if (e.propertyName === "value" && ll(Fn)) {
    var t = [];
    As(t, Fn, e, Gi(e)), Ss(Of, t);
  }
}
function Df(e, t, n) {
  e === "focusin" ? (ro(), _n = t, Fn = n, _n.attachEvent("onpropertychange", Bs)) : e === "focusout" && ro();
}
function If(e) {
  if (e === "selectionchange" || e === "keyup" || e === "keydown") return ll(Fn);
}
function Ff(e, t) {
  if (e === "click") return ll(t);
}
function Uf(e, t) {
  if (e === "input" || e === "change") return ll(t);
}
function $f(e, t) {
  return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
}
var Oe = typeof Object.is == "function" ? Object.is : $f;
function Un(e, t) {
  if (Oe(e, t)) return !0;
  if (typeof e != "object" || e === null || typeof t != "object" || t === null) return !1;
  var n = Object.keys(e), r = Object.keys(t);
  if (n.length !== r.length) return !1;
  for (r = 0; r < n.length; r++) {
    var l = n[r];
    if (!Kl.call(t, l) || !Oe(e[l], t[l])) return !1;
  }
  return !0;
}
function lo(e) {
  for (; e && e.firstChild; ) e = e.firstChild;
  return e;
}
function io(e, t) {
  var n = lo(e);
  e = 0;
  for (var r; n; ) {
    if (n.nodeType === 3) {
      if (r = e + n.textContent.length, e <= t && r >= t) return { node: n, offset: t - e };
      e = r;
    }
    e: {
      for (; n; ) {
        if (n.nextSibling) {
          n = n.nextSibling;
          break e;
        }
        n = n.parentNode;
      }
      n = void 0;
    }
    n = lo(n);
  }
}
function Hs(e, t) {
  return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? Hs(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
}
function Ws() {
  for (var e = window, t = Tr(); t instanceof e.HTMLIFrameElement; ) {
    try {
      var n = typeof t.contentWindow.location.href == "string";
    } catch {
      n = !1;
    }
    if (n) e = t.contentWindow;
    else break;
    t = Tr(e.document);
  }
  return t;
}
function lu(e) {
  var t = e && e.nodeName && e.nodeName.toLowerCase();
  return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
}
function Af(e) {
  var t = Ws(), n = e.focusedElem, r = e.selectionRange;
  if (t !== n && n && n.ownerDocument && Hs(n.ownerDocument.documentElement, n)) {
    if (r !== null && lu(n)) {
      if (t = r.start, e = r.end, e === void 0 && (e = t), "selectionStart" in n) n.selectionStart = t, n.selectionEnd = Math.min(e, n.value.length);
      else if (e = (t = n.ownerDocument || document) && t.defaultView || window, e.getSelection) {
        e = e.getSelection();
        var l = n.textContent.length, i = Math.min(r.start, l);
        r = r.end === void 0 ? i : Math.min(r.end, l), !e.extend && i > r && (l = r, r = i, i = l), l = io(n, i);
        var u = io(
          n,
          r
        );
        l && u && (e.rangeCount !== 1 || e.anchorNode !== l.node || e.anchorOffset !== l.offset || e.focusNode !== u.node || e.focusOffset !== u.offset) && (t = t.createRange(), t.setStart(l.node, l.offset), e.removeAllRanges(), i > r ? (e.addRange(t), e.extend(u.node, u.offset)) : (t.setEnd(u.node, u.offset), e.addRange(t)));
      }
    }
    for (t = [], e = n; e = e.parentNode; ) e.nodeType === 1 && t.push({ element: e, left: e.scrollLeft, top: e.scrollTop });
    for (typeof n.focus == "function" && n.focus(), n = 0; n < t.length; n++) e = t[n], e.element.scrollLeft = e.left, e.element.scrollTop = e.top;
  }
}
var Vf = We && "documentMode" in document && 11 >= document.documentMode, It = null, fi = null, Nn = null, di = !1;
function uo(e, t, n) {
  var r = n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument;
  di || It == null || It !== Tr(r) || (r = It, "selectionStart" in r && lu(r) ? r = { start: r.selectionStart, end: r.selectionEnd } : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = { anchorNode: r.anchorNode, anchorOffset: r.anchorOffset, focusNode: r.focusNode, focusOffset: r.focusOffset }), Nn && Un(Nn, r) || (Nn = r, r = Ur(fi, "onSelect"), 0 < r.length && (t = new tu("onSelect", "select", null, t, n), e.push({ event: t, listeners: r }), t.target = It)));
}
function ar(e, t) {
  var n = {};
  return n[e.toLowerCase()] = t.toLowerCase(), n["Webkit" + e] = "webkit" + t, n["Moz" + e] = "moz" + t, n;
}
var Ft = { animationend: ar("Animation", "AnimationEnd"), animationiteration: ar("Animation", "AnimationIteration"), animationstart: ar("Animation", "AnimationStart"), transitionend: ar("Transition", "TransitionEnd") }, Tl = {}, Qs = {};
We && (Qs = document.createElement("div").style, "AnimationEvent" in window || (delete Ft.animationend.animation, delete Ft.animationiteration.animation, delete Ft.animationstart.animation), "TransitionEvent" in window || delete Ft.transitionend.transition);
function il(e) {
  if (Tl[e]) return Tl[e];
  if (!Ft[e]) return e;
  var t = Ft[e], n;
  for (n in t) if (t.hasOwnProperty(n) && n in Qs) return Tl[e] = t[n];
  return e;
}
var Ks = il("animationend"), Ys = il("animationiteration"), Xs = il("animationstart"), Gs = il("transitionend"), Zs = /* @__PURE__ */ new Map(), oo = "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
function dt(e, t) {
  Zs.set(e, t), Lt(t, [e]);
}
for (var Rl = 0; Rl < oo.length; Rl++) {
  var Ol = oo[Rl], Bf = Ol.toLowerCase(), Hf = Ol[0].toUpperCase() + Ol.slice(1);
  dt(Bf, "on" + Hf);
}
dt(Ks, "onAnimationEnd");
dt(Ys, "onAnimationIteration");
dt(Xs, "onAnimationStart");
dt("dblclick", "onDoubleClick");
dt("focusin", "onFocus");
dt("focusout", "onBlur");
dt(Gs, "onTransitionEnd");
Jt("onMouseEnter", ["mouseout", "mouseover"]);
Jt("onMouseLeave", ["mouseout", "mouseover"]);
Jt("onPointerEnter", ["pointerout", "pointerover"]);
Jt("onPointerLeave", ["pointerout", "pointerover"]);
Lt("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
Lt("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
Lt("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]);
Lt("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
Lt("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
Lt("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
var Sn = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), Wf = new Set("cancel close invalid load scroll toggle".split(" ").concat(Sn));
function so(e, t, n) {
  var r = e.type || "unknown-event";
  e.currentTarget = n, Vc(r, t, void 0, e), e.currentTarget = null;
}
function Js(e, t) {
  t = (t & 4) !== 0;
  for (var n = 0; n < e.length; n++) {
    var r = e[n], l = r.event;
    r = r.listeners;
    e: {
      var i = void 0;
      if (t) for (var u = r.length - 1; 0 <= u; u--) {
        var o = r[u], s = o.instance, c = o.currentTarget;
        if (o = o.listener, s !== i && l.isPropagationStopped()) break e;
        so(l, o, c), i = s;
      }
      else for (u = 0; u < r.length; u++) {
        if (o = r[u], s = o.instance, c = o.currentTarget, o = o.listener, s !== i && l.isPropagationStopped()) break e;
        so(l, o, c), i = s;
      }
    }
  }
  if (Or) throw e = oi, Or = !1, oi = null, e;
}
function D(e, t) {
  var n = t[yi];
  n === void 0 && (n = t[yi] = /* @__PURE__ */ new Set());
  var r = e + "__bubble";
  n.has(r) || (qs(t, e, 2, !1), n.add(r));
}
function Ml(e, t, n) {
  var r = 0;
  t && (r |= 4), qs(n, e, r, t);
}
var cr = "_reactListening" + Math.random().toString(36).slice(2);
function $n(e) {
  if (!e[cr]) {
    e[cr] = !0, is.forEach(function(n) {
      n !== "selectionchange" && (Wf.has(n) || Ml(n, !1, e), Ml(n, !0, e));
    });
    var t = e.nodeType === 9 ? e : e.ownerDocument;
    t === null || t[cr] || (t[cr] = !0, Ml("selectionchange", !1, t));
  }
}
function qs(e, t, n, r) {
  switch (Ds(t)) {
    case 1:
      var l = rf;
      break;
    case 4:
      l = lf;
      break;
    default:
      l = bi;
  }
  n = l.bind(null, t, n, e), l = void 0, !ui || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (l = !0), r ? l !== void 0 ? e.addEventListener(t, n, { capture: !0, passive: l }) : e.addEventListener(t, n, !0) : l !== void 0 ? e.addEventListener(t, n, { passive: l }) : e.addEventListener(t, n, !1);
}
function Dl(e, t, n, r, l) {
  var i = r;
  if (!(t & 1) && !(t & 2) && r !== null) e: for (; ; ) {
    if (r === null) return;
    var u = r.tag;
    if (u === 3 || u === 4) {
      var o = r.stateNode.containerInfo;
      if (o === l || o.nodeType === 8 && o.parentNode === l) break;
      if (u === 4) for (u = r.return; u !== null; ) {
        var s = u.tag;
        if ((s === 3 || s === 4) && (s = u.stateNode.containerInfo, s === l || s.nodeType === 8 && s.parentNode === l)) return;
        u = u.return;
      }
      for (; o !== null; ) {
        if (u = kt(o), u === null) return;
        if (s = u.tag, s === 5 || s === 6) {
          r = i = u;
          continue e;
        }
        o = o.parentNode;
      }
    }
    r = r.return;
  }
  Ss(function() {
    var c = i, v = Gi(n), m = [];
    e: {
      var p = Zs.get(e);
      if (p !== void 0) {
        var w = tu, k = e;
        switch (e) {
          case "keypress":
            if (Er(n) === 0) break e;
          case "keydown":
          case "keyup":
            w = kf;
            break;
          case "focusin":
            k = "focus", w = jl;
            break;
          case "focusout":
            k = "blur", w = jl;
            break;
          case "beforeblur":
          case "afterblur":
            w = jl;
            break;
          case "click":
            if (n.button === 2) break e;
          case "auxclick":
          case "dblclick":
          case "mousedown":
          case "mousemove":
          case "mouseup":
          case "mouseout":
          case "mouseover":
          case "contextmenu":
            w = Zu;
            break;
          case "drag":
          case "dragend":
          case "dragenter":
          case "dragexit":
          case "dragleave":
          case "dragover":
          case "dragstart":
          case "drop":
            w = sf;
            break;
          case "touchcancel":
          case "touchend":
          case "touchmove":
          case "touchstart":
            w = Ef;
            break;
          case Ks:
          case Ys:
          case Xs:
            w = ff;
            break;
          case Gs:
            w = _f;
            break;
          case "scroll":
            w = uf;
            break;
          case "wheel":
            w = Pf;
            break;
          case "copy":
          case "cut":
          case "paste":
            w = pf;
            break;
          case "gotpointercapture":
          case "lostpointercapture":
          case "pointercancel":
          case "pointerdown":
          case "pointermove":
          case "pointerout":
          case "pointerover":
          case "pointerup":
            w = qu;
        }
        var S = (t & 4) !== 0, F = !S && e === "scroll", f = S ? p !== null ? p + "Capture" : null : p;
        S = [];
        for (var a = c, d; a !== null; ) {
          d = a;
          var y = d.stateNode;
          if (d.tag === 5 && y !== null && (d = y, f !== null && (y = On(a, f), y != null && S.push(An(a, y, d)))), F) break;
          a = a.return;
        }
        0 < S.length && (p = new w(p, k, null, n, v), m.push({ event: p, listeners: S }));
      }
    }
    if (!(t & 7)) {
      e: {
        if (p = e === "mouseover" || e === "pointerover", w = e === "mouseout" || e === "pointerout", p && n !== li && (k = n.relatedTarget || n.fromElement) && (kt(k) || k[Qe])) break e;
        if ((w || p) && (p = v.window === v ? v : (p = v.ownerDocument) ? p.defaultView || p.parentWindow : window, w ? (k = n.relatedTarget || n.toElement, w = c, k = k ? kt(k) : null, k !== null && (F = Tt(k), k !== F || k.tag !== 5 && k.tag !== 6) && (k = null)) : (w = null, k = c), w !== k)) {
          if (S = Zu, y = "onMouseLeave", f = "onMouseEnter", a = "mouse", (e === "pointerout" || e === "pointerover") && (S = qu, y = "onPointerLeave", f = "onPointerEnter", a = "pointer"), F = w == null ? p : Ut(w), d = k == null ? p : Ut(k), p = new S(y, a + "leave", w, n, v), p.target = F, p.relatedTarget = d, y = null, kt(v) === c && (S = new S(f, a + "enter", k, n, v), S.target = d, S.relatedTarget = F, y = S), F = y, w && k) t: {
            for (S = w, f = k, a = 0, d = S; d; d = Rt(d)) a++;
            for (d = 0, y = f; y; y = Rt(y)) d++;
            for (; 0 < a - d; ) S = Rt(S), a--;
            for (; 0 < d - a; ) f = Rt(f), d--;
            for (; a--; ) {
              if (S === f || f !== null && S === f.alternate) break t;
              S = Rt(S), f = Rt(f);
            }
            S = null;
          }
          else S = null;
          w !== null && ao(m, p, w, S, !1), k !== null && F !== null && ao(m, F, k, S, !0);
        }
      }
      e: {
        if (p = c ? Ut(c) : window, w = p.nodeName && p.nodeName.toLowerCase(), w === "select" || w === "input" && p.type === "file") var E = Mf;
        else if (to(p)) if (Vs) E = Uf;
        else {
          E = If;
          var _ = Df;
        }
        else (w = p.nodeName) && w.toLowerCase() === "input" && (p.type === "checkbox" || p.type === "radio") && (E = Ff);
        if (E && (E = E(e, c))) {
          As(m, E, n, v);
          break e;
        }
        _ && _(e, p, c), e === "focusout" && (_ = p._wrapperState) && _.controlled && p.type === "number" && bl(p, "number", p.value);
      }
      switch (_ = c ? Ut(c) : window, e) {
        case "focusin":
          (to(_) || _.contentEditable === "true") && (It = _, fi = c, Nn = null);
          break;
        case "focusout":
          Nn = fi = It = null;
          break;
        case "mousedown":
          di = !0;
          break;
        case "contextmenu":
        case "mouseup":
        case "dragend":
          di = !1, uo(m, n, v);
          break;
        case "selectionchange":
          if (Vf) break;
        case "keydown":
        case "keyup":
          uo(m, n, v);
      }
      var N;
      if (ru) e: {
        switch (e) {
          case "compositionstart":
            var P = "onCompositionStart";
            break e;
          case "compositionend":
            P = "onCompositionEnd";
            break e;
          case "compositionupdate":
            P = "onCompositionUpdate";
            break e;
        }
        P = void 0;
      }
      else Dt ? Us(e, n) && (P = "onCompositionEnd") : e === "keydown" && n.keyCode === 229 && (P = "onCompositionStart");
      P && (Fs && n.locale !== "ko" && (Dt || P !== "onCompositionStart" ? P === "onCompositionEnd" && Dt && (N = Is()) : (et = v, eu = "value" in et ? et.value : et.textContent, Dt = !0)), _ = Ur(c, P), 0 < _.length && (P = new Ju(P, e, null, n, v), m.push({ event: P, listeners: _ }), N ? P.data = N : (N = $s(n), N !== null && (P.data = N)))), (N = zf ? Lf(e, n) : Tf(e, n)) && (c = Ur(c, "onBeforeInput"), 0 < c.length && (v = new Ju("onBeforeInput", "beforeinput", null, n, v), m.push({ event: v, listeners: c }), v.data = N));
    }
    Js(m, t);
  });
}
function An(e, t, n) {
  return { instance: e, listener: t, currentTarget: n };
}
function Ur(e, t) {
  for (var n = t + "Capture", r = []; e !== null; ) {
    var l = e, i = l.stateNode;
    l.tag === 5 && i !== null && (l = i, i = On(e, n), i != null && r.unshift(An(e, i, l)), i = On(e, t), i != null && r.push(An(e, i, l))), e = e.return;
  }
  return r;
}
function Rt(e) {
  if (e === null) return null;
  do
    e = e.return;
  while (e && e.tag !== 5);
  return e || null;
}
function ao(e, t, n, r, l) {
  for (var i = t._reactName, u = []; n !== null && n !== r; ) {
    var o = n, s = o.alternate, c = o.stateNode;
    if (s !== null && s === r) break;
    o.tag === 5 && c !== null && (o = c, l ? (s = On(n, i), s != null && u.unshift(An(n, s, o))) : l || (s = On(n, i), s != null && u.push(An(n, s, o)))), n = n.return;
  }
  u.length !== 0 && e.push({ event: t, listeners: u });
}
var Qf = /\r\n?/g, Kf = /\u0000|\uFFFD/g;
function co(e) {
  return (typeof e == "string" ? e : "" + e).replace(Qf, `
`).replace(Kf, "");
}
function fr(e, t, n) {
  if (t = co(t), co(e) !== t && n) throw Error(g(425));
}
function $r() {
}
var pi = null, hi = null;
function mi(e, t) {
  return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
}
var vi = typeof setTimeout == "function" ? setTimeout : void 0, Yf = typeof clearTimeout == "function" ? clearTimeout : void 0, fo = typeof Promise == "function" ? Promise : void 0, Xf = typeof queueMicrotask == "function" ? queueMicrotask : typeof fo < "u" ? function(e) {
  return fo.resolve(null).then(e).catch(Gf);
} : vi;
function Gf(e) {
  setTimeout(function() {
    throw e;
  });
}
function Il(e, t) {
  var n = t, r = 0;
  do {
    var l = n.nextSibling;
    if (e.removeChild(n), l && l.nodeType === 8) if (n = l.data, n === "/$") {
      if (r === 0) {
        e.removeChild(l), In(t);
        return;
      }
      r--;
    } else n !== "$" && n !== "$?" && n !== "$!" || r++;
    n = l;
  } while (n);
  In(t);
}
function it(e) {
  for (; e != null; e = e.nextSibling) {
    var t = e.nodeType;
    if (t === 1 || t === 3) break;
    if (t === 8) {
      if (t = e.data, t === "$" || t === "$!" || t === "$?") break;
      if (t === "/$") return null;
    }
  }
  return e;
}
function po(e) {
  e = e.previousSibling;
  for (var t = 0; e; ) {
    if (e.nodeType === 8) {
      var n = e.data;
      if (n === "$" || n === "$!" || n === "$?") {
        if (t === 0) return e;
        t--;
      } else n === "/$" && t++;
    }
    e = e.previousSibling;
  }
  return null;
}
var on = Math.random().toString(36).slice(2), Ie = "__reactFiber$" + on, Vn = "__reactProps$" + on, Qe = "__reactContainer$" + on, yi = "__reactEvents$" + on, Zf = "__reactListeners$" + on, Jf = "__reactHandles$" + on;
function kt(e) {
  var t = e[Ie];
  if (t) return t;
  for (var n = e.parentNode; n; ) {
    if (t = n[Qe] || n[Ie]) {
      if (n = t.alternate, t.child !== null || n !== null && n.child !== null) for (e = po(e); e !== null; ) {
        if (n = e[Ie]) return n;
        e = po(e);
      }
      return t;
    }
    e = n, n = e.parentNode;
  }
  return null;
}
function Jn(e) {
  return e = e[Ie] || e[Qe], !e || e.tag !== 5 && e.tag !== 6 && e.tag !== 13 && e.tag !== 3 ? null : e;
}
function Ut(e) {
  if (e.tag === 5 || e.tag === 6) return e.stateNode;
  throw Error(g(33));
}
function ul(e) {
  return e[Vn] || null;
}
var gi = [], $t = -1;
function pt(e) {
  return { current: e };
}
function I(e) {
  0 > $t || (e.current = gi[$t], gi[$t] = null, $t--);
}
function M(e, t) {
  $t++, gi[$t] = e.current, e.current = t;
}
var ft = {}, le = pt(ft), fe = pt(!1), _t = ft;
function qt(e, t) {
  var n = e.type.contextTypes;
  if (!n) return ft;
  var r = e.stateNode;
  if (r && r.__reactInternalMemoizedUnmaskedChildContext === t) return r.__reactInternalMemoizedMaskedChildContext;
  var l = {}, i;
  for (i in n) l[i] = t[i];
  return r && (e = e.stateNode, e.__reactInternalMemoizedUnmaskedChildContext = t, e.__reactInternalMemoizedMaskedChildContext = l), l;
}
function de(e) {
  return e = e.childContextTypes, e != null;
}
function Ar() {
  I(fe), I(le);
}
function ho(e, t, n) {
  if (le.current !== ft) throw Error(g(168));
  M(le, t), M(fe, n);
}
function bs(e, t, n) {
  var r = e.stateNode;
  if (t = t.childContextTypes, typeof r.getChildContext != "function") return n;
  r = r.getChildContext();
  for (var l in r) if (!(l in t)) throw Error(g(108, Mc(e) || "Unknown", l));
  return V({}, n, r);
}
function Vr(e) {
  return e = (e = e.stateNode) && e.__reactInternalMemoizedMergedChildContext || ft, _t = le.current, M(le, e), M(fe, fe.current), !0;
}
function mo(e, t, n) {
  var r = e.stateNode;
  if (!r) throw Error(g(169));
  n ? (e = bs(e, t, _t), r.__reactInternalMemoizedMergedChildContext = e, I(fe), I(le), M(le, e)) : I(fe), M(fe, n);
}
var Ae = null, ol = !1, Fl = !1;
function ea(e) {
  Ae === null ? Ae = [e] : Ae.push(e);
}
function qf(e) {
  ol = !0, ea(e);
}
function ht() {
  if (!Fl && Ae !== null) {
    Fl = !0;
    var e = 0, t = O;
    try {
      var n = Ae;
      for (O = 1; e < n.length; e++) {
        var r = n[e];
        do
          r = r(!0);
        while (r !== null);
      }
      Ae = null, ol = !1;
    } catch (l) {
      throw Ae !== null && (Ae = Ae.slice(e + 1)), _s(Zi, ht), l;
    } finally {
      O = t, Fl = !1;
    }
  }
  return null;
}
var At = [], Vt = 0, Br = null, Hr = 0, ke = [], Se = 0, Nt = null, Ve = 1, Be = "";
function gt(e, t) {
  At[Vt++] = Hr, At[Vt++] = Br, Br = e, Hr = t;
}
function ta(e, t, n) {
  ke[Se++] = Ve, ke[Se++] = Be, ke[Se++] = Nt, Nt = e;
  var r = Ve;
  e = Be;
  var l = 32 - Te(r) - 1;
  r &= ~(1 << l), n += 1;
  var i = 32 - Te(t) + l;
  if (30 < i) {
    var u = l - l % 5;
    i = (r & (1 << u) - 1).toString(32), r >>= u, l -= u, Ve = 1 << 32 - Te(t) + l | n << l | r, Be = i + e;
  } else Ve = 1 << i | n << l | r, Be = e;
}
function iu(e) {
  e.return !== null && (gt(e, 1), ta(e, 1, 0));
}
function uu(e) {
  for (; e === Br; ) Br = At[--Vt], At[Vt] = null, Hr = At[--Vt], At[Vt] = null;
  for (; e === Nt; ) Nt = ke[--Se], ke[Se] = null, Be = ke[--Se], ke[Se] = null, Ve = ke[--Se], ke[Se] = null;
}
var ve = null, me = null, U = !1, Le = null;
function na(e, t) {
  var n = xe(5, null, null, 0);
  n.elementType = "DELETED", n.stateNode = t, n.return = e, t = e.deletions, t === null ? (e.deletions = [n], e.flags |= 16) : t.push(n);
}
function vo(e, t) {
  switch (e.tag) {
    case 5:
      var n = e.type;
      return t = t.nodeType !== 1 || n.toLowerCase() !== t.nodeName.toLowerCase() ? null : t, t !== null ? (e.stateNode = t, ve = e, me = it(t.firstChild), !0) : !1;
    case 6:
      return t = e.pendingProps === "" || t.nodeType !== 3 ? null : t, t !== null ? (e.stateNode = t, ve = e, me = null, !0) : !1;
    case 13:
      return t = t.nodeType !== 8 ? null : t, t !== null ? (n = Nt !== null ? { id: Ve, overflow: Be } : null, e.memoizedState = { dehydrated: t, treeContext: n, retryLane: 1073741824 }, n = xe(18, null, null, 0), n.stateNode = t, n.return = e, e.child = n, ve = e, me = null, !0) : !1;
    default:
      return !1;
  }
}
function wi(e) {
  return (e.mode & 1) !== 0 && (e.flags & 128) === 0;
}
function ki(e) {
  if (U) {
    var t = me;
    if (t) {
      var n = t;
      if (!vo(e, t)) {
        if (wi(e)) throw Error(g(418));
        t = it(n.nextSibling);
        var r = ve;
        t && vo(e, t) ? na(r, n) : (e.flags = e.flags & -4097 | 2, U = !1, ve = e);
      }
    } else {
      if (wi(e)) throw Error(g(418));
      e.flags = e.flags & -4097 | 2, U = !1, ve = e;
    }
  }
}
function yo(e) {
  for (e = e.return; e !== null && e.tag !== 5 && e.tag !== 3 && e.tag !== 13; ) e = e.return;
  ve = e;
}
function dr(e) {
  if (e !== ve) return !1;
  if (!U) return yo(e), U = !0, !1;
  var t;
  if ((t = e.tag !== 3) && !(t = e.tag !== 5) && (t = e.type, t = t !== "head" && t !== "body" && !mi(e.type, e.memoizedProps)), t && (t = me)) {
    if (wi(e)) throw ra(), Error(g(418));
    for (; t; ) na(e, t), t = it(t.nextSibling);
  }
  if (yo(e), e.tag === 13) {
    if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(g(317));
    e: {
      for (e = e.nextSibling, t = 0; e; ) {
        if (e.nodeType === 8) {
          var n = e.data;
          if (n === "/$") {
            if (t === 0) {
              me = it(e.nextSibling);
              break e;
            }
            t--;
          } else n !== "$" && n !== "$!" && n !== "$?" || t++;
        }
        e = e.nextSibling;
      }
      me = null;
    }
  } else me = ve ? it(e.stateNode.nextSibling) : null;
  return !0;
}
function ra() {
  for (var e = me; e; ) e = it(e.nextSibling);
}
function bt() {
  me = ve = null, U = !1;
}
function ou(e) {
  Le === null ? Le = [e] : Le.push(e);
}
var bf = Xe.ReactCurrentBatchConfig;
function mn(e, t, n) {
  if (e = n.ref, e !== null && typeof e != "function" && typeof e != "object") {
    if (n._owner) {
      if (n = n._owner, n) {
        if (n.tag !== 1) throw Error(g(309));
        var r = n.stateNode;
      }
      if (!r) throw Error(g(147, e));
      var l = r, i = "" + e;
      return t !== null && t.ref !== null && typeof t.ref == "function" && t.ref._stringRef === i ? t.ref : (t = function(u) {
        var o = l.refs;
        u === null ? delete o[i] : o[i] = u;
      }, t._stringRef = i, t);
    }
    if (typeof e != "string") throw Error(g(284));
    if (!n._owner) throw Error(g(290, e));
  }
  return e;
}
function pr(e, t) {
  throw e = Object.prototype.toString.call(t), Error(g(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e));
}
function go(e) {
  var t = e._init;
  return t(e._payload);
}
function la(e) {
  function t(f, a) {
    if (e) {
      var d = f.deletions;
      d === null ? (f.deletions = [a], f.flags |= 16) : d.push(a);
    }
  }
  function n(f, a) {
    if (!e) return null;
    for (; a !== null; ) t(f, a), a = a.sibling;
    return null;
  }
  function r(f, a) {
    for (f = /* @__PURE__ */ new Map(); a !== null; ) a.key !== null ? f.set(a.key, a) : f.set(a.index, a), a = a.sibling;
    return f;
  }
  function l(f, a) {
    return f = at(f, a), f.index = 0, f.sibling = null, f;
  }
  function i(f, a, d) {
    return f.index = d, e ? (d = f.alternate, d !== null ? (d = d.index, d < a ? (f.flags |= 2, a) : d) : (f.flags |= 2, a)) : (f.flags |= 1048576, a);
  }
  function u(f) {
    return e && f.alternate === null && (f.flags |= 2), f;
  }
  function o(f, a, d, y) {
    return a === null || a.tag !== 6 ? (a = Wl(d, f.mode, y), a.return = f, a) : (a = l(a, d), a.return = f, a);
  }
  function s(f, a, d, y) {
    var E = d.type;
    return E === Mt ? v(f, a, d.props.children, y, d.key) : a !== null && (a.elementType === E || typeof E == "object" && E !== null && E.$$typeof === Ze && go(E) === a.type) ? (y = l(a, d.props), y.ref = mn(f, a, d), y.return = f, y) : (y = Lr(d.type, d.key, d.props, null, f.mode, y), y.ref = mn(f, a, d), y.return = f, y);
  }
  function c(f, a, d, y) {
    return a === null || a.tag !== 4 || a.stateNode.containerInfo !== d.containerInfo || a.stateNode.implementation !== d.implementation ? (a = Ql(d, f.mode, y), a.return = f, a) : (a = l(a, d.children || []), a.return = f, a);
  }
  function v(f, a, d, y, E) {
    return a === null || a.tag !== 7 ? (a = Ct(d, f.mode, y, E), a.return = f, a) : (a = l(a, d), a.return = f, a);
  }
  function m(f, a, d) {
    if (typeof a == "string" && a !== "" || typeof a == "number") return a = Wl("" + a, f.mode, d), a.return = f, a;
    if (typeof a == "object" && a !== null) {
      switch (a.$$typeof) {
        case nr:
          return d = Lr(a.type, a.key, a.props, null, f.mode, d), d.ref = mn(f, null, a), d.return = f, d;
        case Ot:
          return a = Ql(a, f.mode, d), a.return = f, a;
        case Ze:
          var y = a._init;
          return m(f, y(a._payload), d);
      }
      if (wn(a) || cn(a)) return a = Ct(a, f.mode, d, null), a.return = f, a;
      pr(f, a);
    }
    return null;
  }
  function p(f, a, d, y) {
    var E = a !== null ? a.key : null;
    if (typeof d == "string" && d !== "" || typeof d == "number") return E !== null ? null : o(f, a, "" + d, y);
    if (typeof d == "object" && d !== null) {
      switch (d.$$typeof) {
        case nr:
          return d.key === E ? s(f, a, d, y) : null;
        case Ot:
          return d.key === E ? c(f, a, d, y) : null;
        case Ze:
          return E = d._init, p(
            f,
            a,
            E(d._payload),
            y
          );
      }
      if (wn(d) || cn(d)) return E !== null ? null : v(f, a, d, y, null);
      pr(f, d);
    }
    return null;
  }
  function w(f, a, d, y, E) {
    if (typeof y == "string" && y !== "" || typeof y == "number") return f = f.get(d) || null, o(a, f, "" + y, E);
    if (typeof y == "object" && y !== null) {
      switch (y.$$typeof) {
        case nr:
          return f = f.get(y.key === null ? d : y.key) || null, s(a, f, y, E);
        case Ot:
          return f = f.get(y.key === null ? d : y.key) || null, c(a, f, y, E);
        case Ze:
          var _ = y._init;
          return w(f, a, d, _(y._payload), E);
      }
      if (wn(y) || cn(y)) return f = f.get(d) || null, v(a, f, y, E, null);
      pr(a, y);
    }
    return null;
  }
  function k(f, a, d, y) {
    for (var E = null, _ = null, N = a, P = a = 0, H = null; N !== null && P < d.length; P++) {
      N.index > P ? (H = N, N = null) : H = N.sibling;
      var T = p(f, N, d[P], y);
      if (T === null) {
        N === null && (N = H);
        break;
      }
      e && N && T.alternate === null && t(f, N), a = i(T, a, P), _ === null ? E = T : _.sibling = T, _ = T, N = H;
    }
    if (P === d.length) return n(f, N), U && gt(f, P), E;
    if (N === null) {
      for (; P < d.length; P++) N = m(f, d[P], y), N !== null && (a = i(N, a, P), _ === null ? E = N : _.sibling = N, _ = N);
      return U && gt(f, P), E;
    }
    for (N = r(f, N); P < d.length; P++) H = w(N, f, P, d[P], y), H !== null && (e && H.alternate !== null && N.delete(H.key === null ? P : H.key), a = i(H, a, P), _ === null ? E = H : _.sibling = H, _ = H);
    return e && N.forEach(function(Ne) {
      return t(f, Ne);
    }), U && gt(f, P), E;
  }
  function S(f, a, d, y) {
    var E = cn(d);
    if (typeof E != "function") throw Error(g(150));
    if (d = E.call(d), d == null) throw Error(g(151));
    for (var _ = E = null, N = a, P = a = 0, H = null, T = d.next(); N !== null && !T.done; P++, T = d.next()) {
      N.index > P ? (H = N, N = null) : H = N.sibling;
      var Ne = p(f, N, T.value, y);
      if (Ne === null) {
        N === null && (N = H);
        break;
      }
      e && N && Ne.alternate === null && t(f, N), a = i(Ne, a, P), _ === null ? E = Ne : _.sibling = Ne, _ = Ne, N = H;
    }
    if (T.done) return n(
      f,
      N
    ), U && gt(f, P), E;
    if (N === null) {
      for (; !T.done; P++, T = d.next()) T = m(f, T.value, y), T !== null && (a = i(T, a, P), _ === null ? E = T : _.sibling = T, _ = T);
      return U && gt(f, P), E;
    }
    for (N = r(f, N); !T.done; P++, T = d.next()) T = w(N, f, P, T.value, y), T !== null && (e && T.alternate !== null && N.delete(T.key === null ? P : T.key), a = i(T, a, P), _ === null ? E = T : _.sibling = T, _ = T);
    return e && N.forEach(function(sn) {
      return t(f, sn);
    }), U && gt(f, P), E;
  }
  function F(f, a, d, y) {
    if (typeof d == "object" && d !== null && d.type === Mt && d.key === null && (d = d.props.children), typeof d == "object" && d !== null) {
      switch (d.$$typeof) {
        case nr:
          e: {
            for (var E = d.key, _ = a; _ !== null; ) {
              if (_.key === E) {
                if (E = d.type, E === Mt) {
                  if (_.tag === 7) {
                    n(f, _.sibling), a = l(_, d.props.children), a.return = f, f = a;
                    break e;
                  }
                } else if (_.elementType === E || typeof E == "object" && E !== null && E.$$typeof === Ze && go(E) === _.type) {
                  n(f, _.sibling), a = l(_, d.props), a.ref = mn(f, _, d), a.return = f, f = a;
                  break e;
                }
                n(f, _);
                break;
              } else t(f, _);
              _ = _.sibling;
            }
            d.type === Mt ? (a = Ct(d.props.children, f.mode, y, d.key), a.return = f, f = a) : (y = Lr(d.type, d.key, d.props, null, f.mode, y), y.ref = mn(f, a, d), y.return = f, f = y);
          }
          return u(f);
        case Ot:
          e: {
            for (_ = d.key; a !== null; ) {
              if (a.key === _) if (a.tag === 4 && a.stateNode.containerInfo === d.containerInfo && a.stateNode.implementation === d.implementation) {
                n(f, a.sibling), a = l(a, d.children || []), a.return = f, f = a;
                break e;
              } else {
                n(f, a);
                break;
              }
              else t(f, a);
              a = a.sibling;
            }
            a = Ql(d, f.mode, y), a.return = f, f = a;
          }
          return u(f);
        case Ze:
          return _ = d._init, F(f, a, _(d._payload), y);
      }
      if (wn(d)) return k(f, a, d, y);
      if (cn(d)) return S(f, a, d, y);
      pr(f, d);
    }
    return typeof d == "string" && d !== "" || typeof d == "number" ? (d = "" + d, a !== null && a.tag === 6 ? (n(f, a.sibling), a = l(a, d), a.return = f, f = a) : (n(f, a), a = Wl(d, f.mode, y), a.return = f, f = a), u(f)) : n(f, a);
  }
  return F;
}
var en = la(!0), ia = la(!1), Wr = pt(null), Qr = null, Bt = null, su = null;
function au() {
  su = Bt = Qr = null;
}
function cu(e) {
  var t = Wr.current;
  I(Wr), e._currentValue = t;
}
function Si(e, t, n) {
  for (; e !== null; ) {
    var r = e.alternate;
    if ((e.childLanes & t) !== t ? (e.childLanes |= t, r !== null && (r.childLanes |= t)) : r !== null && (r.childLanes & t) !== t && (r.childLanes |= t), e === n) break;
    e = e.return;
  }
}
function Gt(e, t) {
  Qr = e, su = Bt = null, e = e.dependencies, e !== null && e.firstContext !== null && (e.lanes & t && (ce = !0), e.firstContext = null);
}
function Ce(e) {
  var t = e._currentValue;
  if (su !== e) if (e = { context: e, memoizedValue: t, next: null }, Bt === null) {
    if (Qr === null) throw Error(g(308));
    Bt = e, Qr.dependencies = { lanes: 0, firstContext: e };
  } else Bt = Bt.next = e;
  return t;
}
var St = null;
function fu(e) {
  St === null ? St = [e] : St.push(e);
}
function ua(e, t, n, r) {
  var l = t.interleaved;
  return l === null ? (n.next = n, fu(t)) : (n.next = l.next, l.next = n), t.interleaved = n, Ke(e, r);
}
function Ke(e, t) {
  e.lanes |= t;
  var n = e.alternate;
  for (n !== null && (n.lanes |= t), n = e, e = e.return; e !== null; ) e.childLanes |= t, n = e.alternate, n !== null && (n.childLanes |= t), n = e, e = e.return;
  return n.tag === 3 ? n.stateNode : null;
}
var Je = !1;
function du(e) {
  e.updateQueue = { baseState: e.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, interleaved: null, lanes: 0 }, effects: null };
}
function oa(e, t) {
  e = e.updateQueue, t.updateQueue === e && (t.updateQueue = { baseState: e.baseState, firstBaseUpdate: e.firstBaseUpdate, lastBaseUpdate: e.lastBaseUpdate, shared: e.shared, effects: e.effects });
}
function He(e, t) {
  return { eventTime: e, lane: t, tag: 0, payload: null, callback: null, next: null };
}
function ut(e, t, n) {
  var r = e.updateQueue;
  if (r === null) return null;
  if (r = r.shared, R & 2) {
    var l = r.pending;
    return l === null ? t.next = t : (t.next = l.next, l.next = t), r.pending = t, Ke(e, n);
  }
  return l = r.interleaved, l === null ? (t.next = t, fu(r)) : (t.next = l.next, l.next = t), r.interleaved = t, Ke(e, n);
}
function Cr(e, t, n) {
  if (t = t.updateQueue, t !== null && (t = t.shared, (n & 4194240) !== 0)) {
    var r = t.lanes;
    r &= e.pendingLanes, n |= r, t.lanes = n, Ji(e, n);
  }
}
function wo(e, t) {
  var n = e.updateQueue, r = e.alternate;
  if (r !== null && (r = r.updateQueue, n === r)) {
    var l = null, i = null;
    if (n = n.firstBaseUpdate, n !== null) {
      do {
        var u = { eventTime: n.eventTime, lane: n.lane, tag: n.tag, payload: n.payload, callback: n.callback, next: null };
        i === null ? l = i = u : i = i.next = u, n = n.next;
      } while (n !== null);
      i === null ? l = i = t : i = i.next = t;
    } else l = i = t;
    n = { baseState: r.baseState, firstBaseUpdate: l, lastBaseUpdate: i, shared: r.shared, effects: r.effects }, e.updateQueue = n;
    return;
  }
  e = n.lastBaseUpdate, e === null ? n.firstBaseUpdate = t : e.next = t, n.lastBaseUpdate = t;
}
function Kr(e, t, n, r) {
  var l = e.updateQueue;
  Je = !1;
  var i = l.firstBaseUpdate, u = l.lastBaseUpdate, o = l.shared.pending;
  if (o !== null) {
    l.shared.pending = null;
    var s = o, c = s.next;
    s.next = null, u === null ? i = c : u.next = c, u = s;
    var v = e.alternate;
    v !== null && (v = v.updateQueue, o = v.lastBaseUpdate, o !== u && (o === null ? v.firstBaseUpdate = c : o.next = c, v.lastBaseUpdate = s));
  }
  if (i !== null) {
    var m = l.baseState;
    u = 0, v = c = s = null, o = i;
    do {
      var p = o.lane, w = o.eventTime;
      if ((r & p) === p) {
        v !== null && (v = v.next = {
          eventTime: w,
          lane: 0,
          tag: o.tag,
          payload: o.payload,
          callback: o.callback,
          next: null
        });
        e: {
          var k = e, S = o;
          switch (p = t, w = n, S.tag) {
            case 1:
              if (k = S.payload, typeof k == "function") {
                m = k.call(w, m, p);
                break e;
              }
              m = k;
              break e;
            case 3:
              k.flags = k.flags & -65537 | 128;
            case 0:
              if (k = S.payload, p = typeof k == "function" ? k.call(w, m, p) : k, p == null) break e;
              m = V({}, m, p);
              break e;
            case 2:
              Je = !0;
          }
        }
        o.callback !== null && o.lane !== 0 && (e.flags |= 64, p = l.effects, p === null ? l.effects = [o] : p.push(o));
      } else w = { eventTime: w, lane: p, tag: o.tag, payload: o.payload, callback: o.callback, next: null }, v === null ? (c = v = w, s = m) : v = v.next = w, u |= p;
      if (o = o.next, o === null) {
        if (o = l.shared.pending, o === null) break;
        p = o, o = p.next, p.next = null, l.lastBaseUpdate = p, l.shared.pending = null;
      }
    } while (!0);
    if (v === null && (s = m), l.baseState = s, l.firstBaseUpdate = c, l.lastBaseUpdate = v, t = l.shared.interleaved, t !== null) {
      l = t;
      do
        u |= l.lane, l = l.next;
      while (l !== t);
    } else i === null && (l.shared.lanes = 0);
    jt |= u, e.lanes = u, e.memoizedState = m;
  }
}
function ko(e, t, n) {
  if (e = t.effects, t.effects = null, e !== null) for (t = 0; t < e.length; t++) {
    var r = e[t], l = r.callback;
    if (l !== null) {
      if (r.callback = null, r = n, typeof l != "function") throw Error(g(191, l));
      l.call(r);
    }
  }
}
var qn = {}, Ue = pt(qn), Bn = pt(qn), Hn = pt(qn);
function xt(e) {
  if (e === qn) throw Error(g(174));
  return e;
}
function pu(e, t) {
  switch (M(Hn, t), M(Bn, e), M(Ue, qn), e = t.nodeType, e) {
    case 9:
    case 11:
      t = (t = t.documentElement) ? t.namespaceURI : ti(null, "");
      break;
    default:
      e = e === 8 ? t.parentNode : t, t = e.namespaceURI || null, e = e.tagName, t = ti(t, e);
  }
  I(Ue), M(Ue, t);
}
function tn() {
  I(Ue), I(Bn), I(Hn);
}
function sa(e) {
  xt(Hn.current);
  var t = xt(Ue.current), n = ti(t, e.type);
  t !== n && (M(Bn, e), M(Ue, n));
}
function hu(e) {
  Bn.current === e && (I(Ue), I(Bn));
}
var $ = pt(0);
function Yr(e) {
  for (var t = e; t !== null; ) {
    if (t.tag === 13) {
      var n = t.memoizedState;
      if (n !== null && (n = n.dehydrated, n === null || n.data === "$?" || n.data === "$!")) return t;
    } else if (t.tag === 19 && t.memoizedProps.revealOrder !== void 0) {
      if (t.flags & 128) return t;
    } else if (t.child !== null) {
      t.child.return = t, t = t.child;
      continue;
    }
    if (t === e) break;
    for (; t.sibling === null; ) {
      if (t.return === null || t.return === e) return null;
      t = t.return;
    }
    t.sibling.return = t.return, t = t.sibling;
  }
  return null;
}
var Ul = [];
function mu() {
  for (var e = 0; e < Ul.length; e++) Ul[e]._workInProgressVersionPrimary = null;
  Ul.length = 0;
}
var _r = Xe.ReactCurrentDispatcher, $l = Xe.ReactCurrentBatchConfig, Pt = 0, A = null, Y = null, Z = null, Xr = !1, Pn = !1, Wn = 0, ed = 0;
function te() {
  throw Error(g(321));
}
function vu(e, t) {
  if (t === null) return !1;
  for (var n = 0; n < t.length && n < e.length; n++) if (!Oe(e[n], t[n])) return !1;
  return !0;
}
function yu(e, t, n, r, l, i) {
  if (Pt = i, A = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, _r.current = e === null || e.memoizedState === null ? ld : id, e = n(r, l), Pn) {
    i = 0;
    do {
      if (Pn = !1, Wn = 0, 25 <= i) throw Error(g(301));
      i += 1, Z = Y = null, t.updateQueue = null, _r.current = ud, e = n(r, l);
    } while (Pn);
  }
  if (_r.current = Gr, t = Y !== null && Y.next !== null, Pt = 0, Z = Y = A = null, Xr = !1, t) throw Error(g(300));
  return e;
}
function gu() {
  var e = Wn !== 0;
  return Wn = 0, e;
}
function De() {
  var e = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
  return Z === null ? A.memoizedState = Z = e : Z = Z.next = e, Z;
}
function _e() {
  if (Y === null) {
    var e = A.alternate;
    e = e !== null ? e.memoizedState : null;
  } else e = Y.next;
  var t = Z === null ? A.memoizedState : Z.next;
  if (t !== null) Z = t, Y = e;
  else {
    if (e === null) throw Error(g(310));
    Y = e, e = { memoizedState: Y.memoizedState, baseState: Y.baseState, baseQueue: Y.baseQueue, queue: Y.queue, next: null }, Z === null ? A.memoizedState = Z = e : Z = Z.next = e;
  }
  return Z;
}
function Qn(e, t) {
  return typeof t == "function" ? t(e) : t;
}
function Al(e) {
  var t = _e(), n = t.queue;
  if (n === null) throw Error(g(311));
  n.lastRenderedReducer = e;
  var r = Y, l = r.baseQueue, i = n.pending;
  if (i !== null) {
    if (l !== null) {
      var u = l.next;
      l.next = i.next, i.next = u;
    }
    r.baseQueue = l = i, n.pending = null;
  }
  if (l !== null) {
    i = l.next, r = r.baseState;
    var o = u = null, s = null, c = i;
    do {
      var v = c.lane;
      if ((Pt & v) === v) s !== null && (s = s.next = { lane: 0, action: c.action, hasEagerState: c.hasEagerState, eagerState: c.eagerState, next: null }), r = c.hasEagerState ? c.eagerState : e(r, c.action);
      else {
        var m = {
          lane: v,
          action: c.action,
          hasEagerState: c.hasEagerState,
          eagerState: c.eagerState,
          next: null
        };
        s === null ? (o = s = m, u = r) : s = s.next = m, A.lanes |= v, jt |= v;
      }
      c = c.next;
    } while (c !== null && c !== i);
    s === null ? u = r : s.next = o, Oe(r, t.memoizedState) || (ce = !0), t.memoizedState = r, t.baseState = u, t.baseQueue = s, n.lastRenderedState = r;
  }
  if (e = n.interleaved, e !== null) {
    l = e;
    do
      i = l.lane, A.lanes |= i, jt |= i, l = l.next;
    while (l !== e);
  } else l === null && (n.lanes = 0);
  return [t.memoizedState, n.dispatch];
}
function Vl(e) {
  var t = _e(), n = t.queue;
  if (n === null) throw Error(g(311));
  n.lastRenderedReducer = e;
  var r = n.dispatch, l = n.pending, i = t.memoizedState;
  if (l !== null) {
    n.pending = null;
    var u = l = l.next;
    do
      i = e(i, u.action), u = u.next;
    while (u !== l);
    Oe(i, t.memoizedState) || (ce = !0), t.memoizedState = i, t.baseQueue === null && (t.baseState = i), n.lastRenderedState = i;
  }
  return [i, r];
}
function aa() {
}
function ca(e, t) {
  var n = A, r = _e(), l = t(), i = !Oe(r.memoizedState, l);
  if (i && (r.memoizedState = l, ce = !0), r = r.queue, wu(pa.bind(null, n, r, e), [e]), r.getSnapshot !== t || i || Z !== null && Z.memoizedState.tag & 1) {
    if (n.flags |= 2048, Kn(9, da.bind(null, n, r, l, t), void 0, null), J === null) throw Error(g(349));
    Pt & 30 || fa(n, t, l);
  }
  return l;
}
function fa(e, t, n) {
  e.flags |= 16384, e = { getSnapshot: t, value: n }, t = A.updateQueue, t === null ? (t = { lastEffect: null, stores: null }, A.updateQueue = t, t.stores = [e]) : (n = t.stores, n === null ? t.stores = [e] : n.push(e));
}
function da(e, t, n, r) {
  t.value = n, t.getSnapshot = r, ha(t) && ma(e);
}
function pa(e, t, n) {
  return n(function() {
    ha(t) && ma(e);
  });
}
function ha(e) {
  var t = e.getSnapshot;
  e = e.value;
  try {
    var n = t();
    return !Oe(e, n);
  } catch {
    return !0;
  }
}
function ma(e) {
  var t = Ke(e, 1);
  t !== null && Re(t, e, 1, -1);
}
function So(e) {
  var t = De();
  return typeof e == "function" && (e = e()), t.memoizedState = t.baseState = e, e = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: Qn, lastRenderedState: e }, t.queue = e, e = e.dispatch = rd.bind(null, A, e), [t.memoizedState, e];
}
function Kn(e, t, n, r) {
  return e = { tag: e, create: t, destroy: n, deps: r, next: null }, t = A.updateQueue, t === null ? (t = { lastEffect: null, stores: null }, A.updateQueue = t, t.lastEffect = e.next = e) : (n = t.lastEffect, n === null ? t.lastEffect = e.next = e : (r = n.next, n.next = e, e.next = r, t.lastEffect = e)), e;
}
function va() {
  return _e().memoizedState;
}
function Nr(e, t, n, r) {
  var l = De();
  A.flags |= e, l.memoizedState = Kn(1 | t, n, void 0, r === void 0 ? null : r);
}
function sl(e, t, n, r) {
  var l = _e();
  r = r === void 0 ? null : r;
  var i = void 0;
  if (Y !== null) {
    var u = Y.memoizedState;
    if (i = u.destroy, r !== null && vu(r, u.deps)) {
      l.memoizedState = Kn(t, n, i, r);
      return;
    }
  }
  A.flags |= e, l.memoizedState = Kn(1 | t, n, i, r);
}
function xo(e, t) {
  return Nr(8390656, 8, e, t);
}
function wu(e, t) {
  return sl(2048, 8, e, t);
}
function ya(e, t) {
  return sl(4, 2, e, t);
}
function ga(e, t) {
  return sl(4, 4, e, t);
}
function wa(e, t) {
  if (typeof t == "function") return e = e(), t(e), function() {
    t(null);
  };
  if (t != null) return e = e(), t.current = e, function() {
    t.current = null;
  };
}
function ka(e, t, n) {
  return n = n != null ? n.concat([e]) : null, sl(4, 4, wa.bind(null, t, e), n);
}
function ku() {
}
function Sa(e, t) {
  var n = _e();
  t = t === void 0 ? null : t;
  var r = n.memoizedState;
  return r !== null && t !== null && vu(t, r[1]) ? r[0] : (n.memoizedState = [e, t], e);
}
function xa(e, t) {
  var n = _e();
  t = t === void 0 ? null : t;
  var r = n.memoizedState;
  return r !== null && t !== null && vu(t, r[1]) ? r[0] : (e = e(), n.memoizedState = [e, t], e);
}
function Ea(e, t, n) {
  return Pt & 21 ? (Oe(n, t) || (n = js(), A.lanes |= n, jt |= n, e.baseState = !0), t) : (e.baseState && (e.baseState = !1, ce = !0), e.memoizedState = n);
}
function td(e, t) {
  var n = O;
  O = n !== 0 && 4 > n ? n : 4, e(!0);
  var r = $l.transition;
  $l.transition = {};
  try {
    e(!1), t();
  } finally {
    O = n, $l.transition = r;
  }
}
function Ca() {
  return _e().memoizedState;
}
function nd(e, t, n) {
  var r = st(e);
  if (n = { lane: r, action: n, hasEagerState: !1, eagerState: null, next: null }, _a(e)) Na(t, n);
  else if (n = ua(e, t, n, r), n !== null) {
    var l = ue();
    Re(n, e, r, l), Pa(n, t, r);
  }
}
function rd(e, t, n) {
  var r = st(e), l = { lane: r, action: n, hasEagerState: !1, eagerState: null, next: null };
  if (_a(e)) Na(t, l);
  else {
    var i = e.alternate;
    if (e.lanes === 0 && (i === null || i.lanes === 0) && (i = t.lastRenderedReducer, i !== null)) try {
      var u = t.lastRenderedState, o = i(u, n);
      if (l.hasEagerState = !0, l.eagerState = o, Oe(o, u)) {
        var s = t.interleaved;
        s === null ? (l.next = l, fu(t)) : (l.next = s.next, s.next = l), t.interleaved = l;
        return;
      }
    } catch {
    } finally {
    }
    n = ua(e, t, l, r), n !== null && (l = ue(), Re(n, e, r, l), Pa(n, t, r));
  }
}
function _a(e) {
  var t = e.alternate;
  return e === A || t !== null && t === A;
}
function Na(e, t) {
  Pn = Xr = !0;
  var n = e.pending;
  n === null ? t.next = t : (t.next = n.next, n.next = t), e.pending = t;
}
function Pa(e, t, n) {
  if (n & 4194240) {
    var r = t.lanes;
    r &= e.pendingLanes, n |= r, t.lanes = n, Ji(e, n);
  }
}
var Gr = { readContext: Ce, useCallback: te, useContext: te, useEffect: te, useImperativeHandle: te, useInsertionEffect: te, useLayoutEffect: te, useMemo: te, useReducer: te, useRef: te, useState: te, useDebugValue: te, useDeferredValue: te, useTransition: te, useMutableSource: te, useSyncExternalStore: te, useId: te, unstable_isNewReconciler: !1 }, ld = { readContext: Ce, useCallback: function(e, t) {
  return De().memoizedState = [e, t === void 0 ? null : t], e;
}, useContext: Ce, useEffect: xo, useImperativeHandle: function(e, t, n) {
  return n = n != null ? n.concat([e]) : null, Nr(
    4194308,
    4,
    wa.bind(null, t, e),
    n
  );
}, useLayoutEffect: function(e, t) {
  return Nr(4194308, 4, e, t);
}, useInsertionEffect: function(e, t) {
  return Nr(4, 2, e, t);
}, useMemo: function(e, t) {
  var n = De();
  return t = t === void 0 ? null : t, e = e(), n.memoizedState = [e, t], e;
}, useReducer: function(e, t, n) {
  var r = De();
  return t = n !== void 0 ? n(t) : t, r.memoizedState = r.baseState = t, e = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: e, lastRenderedState: t }, r.queue = e, e = e.dispatch = nd.bind(null, A, e), [r.memoizedState, e];
}, useRef: function(e) {
  var t = De();
  return e = { current: e }, t.memoizedState = e;
}, useState: So, useDebugValue: ku, useDeferredValue: function(e) {
  return De().memoizedState = e;
}, useTransition: function() {
  var e = So(!1), t = e[0];
  return e = td.bind(null, e[1]), De().memoizedState = e, [t, e];
}, useMutableSource: function() {
}, useSyncExternalStore: function(e, t, n) {
  var r = A, l = De();
  if (U) {
    if (n === void 0) throw Error(g(407));
    n = n();
  } else {
    if (n = t(), J === null) throw Error(g(349));
    Pt & 30 || fa(r, t, n);
  }
  l.memoizedState = n;
  var i = { value: n, getSnapshot: t };
  return l.queue = i, xo(pa.bind(
    null,
    r,
    i,
    e
  ), [e]), r.flags |= 2048, Kn(9, da.bind(null, r, i, n, t), void 0, null), n;
}, useId: function() {
  var e = De(), t = J.identifierPrefix;
  if (U) {
    var n = Be, r = Ve;
    n = (r & ~(1 << 32 - Te(r) - 1)).toString(32) + n, t = ":" + t + "R" + n, n = Wn++, 0 < n && (t += "H" + n.toString(32)), t += ":";
  } else n = ed++, t = ":" + t + "r" + n.toString(32) + ":";
  return e.memoizedState = t;
}, unstable_isNewReconciler: !1 }, id = {
  readContext: Ce,
  useCallback: Sa,
  useContext: Ce,
  useEffect: wu,
  useImperativeHandle: ka,
  useInsertionEffect: ya,
  useLayoutEffect: ga,
  useMemo: xa,
  useReducer: Al,
  useRef: va,
  useState: function() {
    return Al(Qn);
  },
  useDebugValue: ku,
  useDeferredValue: function(e) {
    var t = _e();
    return Ea(t, Y.memoizedState, e);
  },
  useTransition: function() {
    var e = Al(Qn)[0], t = _e().memoizedState;
    return [e, t];
  },
  useMutableSource: aa,
  useSyncExternalStore: ca,
  useId: Ca,
  unstable_isNewReconciler: !1
}, ud = { readContext: Ce, useCallback: Sa, useContext: Ce, useEffect: wu, useImperativeHandle: ka, useInsertionEffect: ya, useLayoutEffect: ga, useMemo: xa, useReducer: Vl, useRef: va, useState: function() {
  return Vl(Qn);
}, useDebugValue: ku, useDeferredValue: function(e) {
  var t = _e();
  return Y === null ? t.memoizedState = e : Ea(t, Y.memoizedState, e);
}, useTransition: function() {
  var e = Vl(Qn)[0], t = _e().memoizedState;
  return [e, t];
}, useMutableSource: aa, useSyncExternalStore: ca, useId: Ca, unstable_isNewReconciler: !1 };
function je(e, t) {
  if (e && e.defaultProps) {
    t = V({}, t), e = e.defaultProps;
    for (var n in e) t[n] === void 0 && (t[n] = e[n]);
    return t;
  }
  return t;
}
function xi(e, t, n, r) {
  t = e.memoizedState, n = n(r, t), n = n == null ? t : V({}, t, n), e.memoizedState = n, e.lanes === 0 && (e.updateQueue.baseState = n);
}
var al = { isMounted: function(e) {
  return (e = e._reactInternals) ? Tt(e) === e : !1;
}, enqueueSetState: function(e, t, n) {
  e = e._reactInternals;
  var r = ue(), l = st(e), i = He(r, l);
  i.payload = t, n != null && (i.callback = n), t = ut(e, i, l), t !== null && (Re(t, e, l, r), Cr(t, e, l));
}, enqueueReplaceState: function(e, t, n) {
  e = e._reactInternals;
  var r = ue(), l = st(e), i = He(r, l);
  i.tag = 1, i.payload = t, n != null && (i.callback = n), t = ut(e, i, l), t !== null && (Re(t, e, l, r), Cr(t, e, l));
}, enqueueForceUpdate: function(e, t) {
  e = e._reactInternals;
  var n = ue(), r = st(e), l = He(n, r);
  l.tag = 2, t != null && (l.callback = t), t = ut(e, l, r), t !== null && (Re(t, e, r, n), Cr(t, e, r));
} };
function Eo(e, t, n, r, l, i, u) {
  return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, i, u) : t.prototype && t.prototype.isPureReactComponent ? !Un(n, r) || !Un(l, i) : !0;
}
function ja(e, t, n) {
  var r = !1, l = ft, i = t.contextType;
  return typeof i == "object" && i !== null ? i = Ce(i) : (l = de(t) ? _t : le.current, r = t.contextTypes, i = (r = r != null) ? qt(e, l) : ft), t = new t(n, i), e.memoizedState = t.state !== null && t.state !== void 0 ? t.state : null, t.updater = al, e.stateNode = t, t._reactInternals = e, r && (e = e.stateNode, e.__reactInternalMemoizedUnmaskedChildContext = l, e.__reactInternalMemoizedMaskedChildContext = i), t;
}
function Co(e, t, n, r) {
  e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(n, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(n, r), t.state !== e && al.enqueueReplaceState(t, t.state, null);
}
function Ei(e, t, n, r) {
  var l = e.stateNode;
  l.props = n, l.state = e.memoizedState, l.refs = {}, du(e);
  var i = t.contextType;
  typeof i == "object" && i !== null ? l.context = Ce(i) : (i = de(t) ? _t : le.current, l.context = qt(e, i)), l.state = e.memoizedState, i = t.getDerivedStateFromProps, typeof i == "function" && (xi(e, t, i, n), l.state = e.memoizedState), typeof t.getDerivedStateFromProps == "function" || typeof l.getSnapshotBeforeUpdate == "function" || typeof l.UNSAFE_componentWillMount != "function" && typeof l.componentWillMount != "function" || (t = l.state, typeof l.componentWillMount == "function" && l.componentWillMount(), typeof l.UNSAFE_componentWillMount == "function" && l.UNSAFE_componentWillMount(), t !== l.state && al.enqueueReplaceState(l, l.state, null), Kr(e, n, l, r), l.state = e.memoizedState), typeof l.componentDidMount == "function" && (e.flags |= 4194308);
}
function nn(e, t) {
  try {
    var n = "", r = t;
    do
      n += Oc(r), r = r.return;
    while (r);
    var l = n;
  } catch (i) {
    l = `
Error generating stack: ` + i.message + `
` + i.stack;
  }
  return { value: e, source: t, stack: l, digest: null };
}
function Bl(e, t, n) {
  return { value: e, source: null, stack: n ?? null, digest: t ?? null };
}
function Ci(e, t) {
  try {
    console.error(t.value);
  } catch (n) {
    setTimeout(function() {
      throw n;
    });
  }
}
var od = typeof WeakMap == "function" ? WeakMap : Map;
function za(e, t, n) {
  n = He(-1, n), n.tag = 3, n.payload = { element: null };
  var r = t.value;
  return n.callback = function() {
    Jr || (Jr = !0, Mi = r), Ci(e, t);
  }, n;
}
function La(e, t, n) {
  n = He(-1, n), n.tag = 3;
  var r = e.type.getDerivedStateFromError;
  if (typeof r == "function") {
    var l = t.value;
    n.payload = function() {
      return r(l);
    }, n.callback = function() {
      Ci(e, t);
    };
  }
  var i = e.stateNode;
  return i !== null && typeof i.componentDidCatch == "function" && (n.callback = function() {
    Ci(e, t), typeof r != "function" && (ot === null ? ot = /* @__PURE__ */ new Set([this]) : ot.add(this));
    var u = t.stack;
    this.componentDidCatch(t.value, { componentStack: u !== null ? u : "" });
  }), n;
}
function _o(e, t, n) {
  var r = e.pingCache;
  if (r === null) {
    r = e.pingCache = new od();
    var l = /* @__PURE__ */ new Set();
    r.set(t, l);
  } else l = r.get(t), l === void 0 && (l = /* @__PURE__ */ new Set(), r.set(t, l));
  l.has(n) || (l.add(n), e = Sd.bind(null, e, t, n), t.then(e, e));
}
function No(e) {
  do {
    var t;
    if ((t = e.tag === 13) && (t = e.memoizedState, t = t !== null ? t.dehydrated !== null : !0), t) return e;
    e = e.return;
  } while (e !== null);
  return null;
}
function Po(e, t, n, r, l) {
  return e.mode & 1 ? (e.flags |= 65536, e.lanes = l, e) : (e === t ? e.flags |= 65536 : (e.flags |= 128, n.flags |= 131072, n.flags &= -52805, n.tag === 1 && (n.alternate === null ? n.tag = 17 : (t = He(-1, 1), t.tag = 2, ut(n, t, 1))), n.lanes |= 1), e);
}
var sd = Xe.ReactCurrentOwner, ce = !1;
function ie(e, t, n, r) {
  t.child = e === null ? ia(t, null, n, r) : en(t, e.child, n, r);
}
function jo(e, t, n, r, l) {
  n = n.render;
  var i = t.ref;
  return Gt(t, l), r = yu(e, t, n, r, i, l), n = gu(), e !== null && !ce ? (t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~l, Ye(e, t, l)) : (U && n && iu(t), t.flags |= 1, ie(e, t, r, l), t.child);
}
function zo(e, t, n, r, l) {
  if (e === null) {
    var i = n.type;
    return typeof i == "function" && !ju(i) && i.defaultProps === void 0 && n.compare === null && n.defaultProps === void 0 ? (t.tag = 15, t.type = i, Ta(e, t, i, r, l)) : (e = Lr(n.type, null, r, t, t.mode, l), e.ref = t.ref, e.return = t, t.child = e);
  }
  if (i = e.child, !(e.lanes & l)) {
    var u = i.memoizedProps;
    if (n = n.compare, n = n !== null ? n : Un, n(u, r) && e.ref === t.ref) return Ye(e, t, l);
  }
  return t.flags |= 1, e = at(i, r), e.ref = t.ref, e.return = t, t.child = e;
}
function Ta(e, t, n, r, l) {
  if (e !== null) {
    var i = e.memoizedProps;
    if (Un(i, r) && e.ref === t.ref) if (ce = !1, t.pendingProps = r = i, (e.lanes & l) !== 0) e.flags & 131072 && (ce = !0);
    else return t.lanes = e.lanes, Ye(e, t, l);
  }
  return _i(e, t, n, r, l);
}
function Ra(e, t, n) {
  var r = t.pendingProps, l = r.children, i = e !== null ? e.memoizedState : null;
  if (r.mode === "hidden") if (!(t.mode & 1)) t.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, M(Wt, he), he |= n;
  else {
    if (!(n & 1073741824)) return e = i !== null ? i.baseLanes | n : n, t.lanes = t.childLanes = 1073741824, t.memoizedState = { baseLanes: e, cachePool: null, transitions: null }, t.updateQueue = null, M(Wt, he), he |= e, null;
    t.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, r = i !== null ? i.baseLanes : n, M(Wt, he), he |= r;
  }
  else i !== null ? (r = i.baseLanes | n, t.memoizedState = null) : r = n, M(Wt, he), he |= r;
  return ie(e, t, l, n), t.child;
}
function Oa(e, t) {
  var n = t.ref;
  (e === null && n !== null || e !== null && e.ref !== n) && (t.flags |= 512, t.flags |= 2097152);
}
function _i(e, t, n, r, l) {
  var i = de(n) ? _t : le.current;
  return i = qt(t, i), Gt(t, l), n = yu(e, t, n, r, i, l), r = gu(), e !== null && !ce ? (t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~l, Ye(e, t, l)) : (U && r && iu(t), t.flags |= 1, ie(e, t, n, l), t.child);
}
function Lo(e, t, n, r, l) {
  if (de(n)) {
    var i = !0;
    Vr(t);
  } else i = !1;
  if (Gt(t, l), t.stateNode === null) Pr(e, t), ja(t, n, r), Ei(t, n, r, l), r = !0;
  else if (e === null) {
    var u = t.stateNode, o = t.memoizedProps;
    u.props = o;
    var s = u.context, c = n.contextType;
    typeof c == "object" && c !== null ? c = Ce(c) : (c = de(n) ? _t : le.current, c = qt(t, c));
    var v = n.getDerivedStateFromProps, m = typeof v == "function" || typeof u.getSnapshotBeforeUpdate == "function";
    m || typeof u.UNSAFE_componentWillReceiveProps != "function" && typeof u.componentWillReceiveProps != "function" || (o !== r || s !== c) && Co(t, u, r, c), Je = !1;
    var p = t.memoizedState;
    u.state = p, Kr(t, r, u, l), s = t.memoizedState, o !== r || p !== s || fe.current || Je ? (typeof v == "function" && (xi(t, n, v, r), s = t.memoizedState), (o = Je || Eo(t, n, o, r, p, s, c)) ? (m || typeof u.UNSAFE_componentWillMount != "function" && typeof u.componentWillMount != "function" || (typeof u.componentWillMount == "function" && u.componentWillMount(), typeof u.UNSAFE_componentWillMount == "function" && u.UNSAFE_componentWillMount()), typeof u.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof u.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = s), u.props = r, u.state = s, u.context = c, r = o) : (typeof u.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
  } else {
    u = t.stateNode, oa(e, t), o = t.memoizedProps, c = t.type === t.elementType ? o : je(t.type, o), u.props = c, m = t.pendingProps, p = u.context, s = n.contextType, typeof s == "object" && s !== null ? s = Ce(s) : (s = de(n) ? _t : le.current, s = qt(t, s));
    var w = n.getDerivedStateFromProps;
    (v = typeof w == "function" || typeof u.getSnapshotBeforeUpdate == "function") || typeof u.UNSAFE_componentWillReceiveProps != "function" && typeof u.componentWillReceiveProps != "function" || (o !== m || p !== s) && Co(t, u, r, s), Je = !1, p = t.memoizedState, u.state = p, Kr(t, r, u, l);
    var k = t.memoizedState;
    o !== m || p !== k || fe.current || Je ? (typeof w == "function" && (xi(t, n, w, r), k = t.memoizedState), (c = Je || Eo(t, n, c, r, p, k, s) || !1) ? (v || typeof u.UNSAFE_componentWillUpdate != "function" && typeof u.componentWillUpdate != "function" || (typeof u.componentWillUpdate == "function" && u.componentWillUpdate(r, k, s), typeof u.UNSAFE_componentWillUpdate == "function" && u.UNSAFE_componentWillUpdate(r, k, s)), typeof u.componentDidUpdate == "function" && (t.flags |= 4), typeof u.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof u.componentDidUpdate != "function" || o === e.memoizedProps && p === e.memoizedState || (t.flags |= 4), typeof u.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && p === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = k), u.props = r, u.state = k, u.context = s, r = c) : (typeof u.componentDidUpdate != "function" || o === e.memoizedProps && p === e.memoizedState || (t.flags |= 4), typeof u.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && p === e.memoizedState || (t.flags |= 1024), r = !1);
  }
  return Ni(e, t, n, r, i, l);
}
function Ni(e, t, n, r, l, i) {
  Oa(e, t);
  var u = (t.flags & 128) !== 0;
  if (!r && !u) return l && mo(t, n, !1), Ye(e, t, i);
  r = t.stateNode, sd.current = t;
  var o = u && typeof n.getDerivedStateFromError != "function" ? null : r.render();
  return t.flags |= 1, e !== null && u ? (t.child = en(t, e.child, null, i), t.child = en(t, null, o, i)) : ie(e, t, o, i), t.memoizedState = r.state, l && mo(t, n, !0), t.child;
}
function Ma(e) {
  var t = e.stateNode;
  t.pendingContext ? ho(e, t.pendingContext, t.pendingContext !== t.context) : t.context && ho(e, t.context, !1), pu(e, t.containerInfo);
}
function To(e, t, n, r, l) {
  return bt(), ou(l), t.flags |= 256, ie(e, t, n, r), t.child;
}
var Pi = { dehydrated: null, treeContext: null, retryLane: 0 };
function ji(e) {
  return { baseLanes: e, cachePool: null, transitions: null };
}
function Da(e, t, n) {
  var r = t.pendingProps, l = $.current, i = !1, u = (t.flags & 128) !== 0, o;
  if ((o = u) || (o = e !== null && e.memoizedState === null ? !1 : (l & 2) !== 0), o ? (i = !0, t.flags &= -129) : (e === null || e.memoizedState !== null) && (l |= 1), M($, l & 1), e === null)
    return ki(t), e = t.memoizedState, e !== null && (e = e.dehydrated, e !== null) ? (t.mode & 1 ? e.data === "$!" ? t.lanes = 8 : t.lanes = 1073741824 : t.lanes = 1, null) : (u = r.children, e = r.fallback, i ? (r = t.mode, i = t.child, u = { mode: "hidden", children: u }, !(r & 1) && i !== null ? (i.childLanes = 0, i.pendingProps = u) : i = dl(u, r, 0, null), e = Ct(e, r, n, null), i.return = t, e.return = t, i.sibling = e, t.child = i, t.child.memoizedState = ji(n), t.memoizedState = Pi, e) : Su(t, u));
  if (l = e.memoizedState, l !== null && (o = l.dehydrated, o !== null)) return ad(e, t, u, r, o, l, n);
  if (i) {
    i = r.fallback, u = t.mode, l = e.child, o = l.sibling;
    var s = { mode: "hidden", children: r.children };
    return !(u & 1) && t.child !== l ? (r = t.child, r.childLanes = 0, r.pendingProps = s, t.deletions = null) : (r = at(l, s), r.subtreeFlags = l.subtreeFlags & 14680064), o !== null ? i = at(o, i) : (i = Ct(i, u, n, null), i.flags |= 2), i.return = t, r.return = t, r.sibling = i, t.child = r, r = i, i = t.child, u = e.child.memoizedState, u = u === null ? ji(n) : { baseLanes: u.baseLanes | n, cachePool: null, transitions: u.transitions }, i.memoizedState = u, i.childLanes = e.childLanes & ~n, t.memoizedState = Pi, r;
  }
  return i = e.child, e = i.sibling, r = at(i, { mode: "visible", children: r.children }), !(t.mode & 1) && (r.lanes = n), r.return = t, r.sibling = null, e !== null && (n = t.deletions, n === null ? (t.deletions = [e], t.flags |= 16) : n.push(e)), t.child = r, t.memoizedState = null, r;
}
function Su(e, t) {
  return t = dl({ mode: "visible", children: t }, e.mode, 0, null), t.return = e, e.child = t;
}
function hr(e, t, n, r) {
  return r !== null && ou(r), en(t, e.child, null, n), e = Su(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
}
function ad(e, t, n, r, l, i, u) {
  if (n)
    return t.flags & 256 ? (t.flags &= -257, r = Bl(Error(g(422))), hr(e, t, u, r)) : t.memoizedState !== null ? (t.child = e.child, t.flags |= 128, null) : (i = r.fallback, l = t.mode, r = dl({ mode: "visible", children: r.children }, l, 0, null), i = Ct(i, l, u, null), i.flags |= 2, r.return = t, i.return = t, r.sibling = i, t.child = r, t.mode & 1 && en(t, e.child, null, u), t.child.memoizedState = ji(u), t.memoizedState = Pi, i);
  if (!(t.mode & 1)) return hr(e, t, u, null);
  if (l.data === "$!") {
    if (r = l.nextSibling && l.nextSibling.dataset, r) var o = r.dgst;
    return r = o, i = Error(g(419)), r = Bl(i, r, void 0), hr(e, t, u, r);
  }
  if (o = (u & e.childLanes) !== 0, ce || o) {
    if (r = J, r !== null) {
      switch (u & -u) {
        case 4:
          l = 2;
          break;
        case 16:
          l = 8;
          break;
        case 64:
        case 128:
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
        case 67108864:
          l = 32;
          break;
        case 536870912:
          l = 268435456;
          break;
        default:
          l = 0;
      }
      l = l & (r.suspendedLanes | u) ? 0 : l, l !== 0 && l !== i.retryLane && (i.retryLane = l, Ke(e, l), Re(r, e, l, -1));
    }
    return Pu(), r = Bl(Error(g(421))), hr(e, t, u, r);
  }
  return l.data === "$?" ? (t.flags |= 128, t.child = e.child, t = xd.bind(null, e), l._reactRetry = t, null) : (e = i.treeContext, me = it(l.nextSibling), ve = t, U = !0, Le = null, e !== null && (ke[Se++] = Ve, ke[Se++] = Be, ke[Se++] = Nt, Ve = e.id, Be = e.overflow, Nt = t), t = Su(t, r.children), t.flags |= 4096, t);
}
function Ro(e, t, n) {
  e.lanes |= t;
  var r = e.alternate;
  r !== null && (r.lanes |= t), Si(e.return, t, n);
}
function Hl(e, t, n, r, l) {
  var i = e.memoizedState;
  i === null ? e.memoizedState = { isBackwards: t, rendering: null, renderingStartTime: 0, last: r, tail: n, tailMode: l } : (i.isBackwards = t, i.rendering = null, i.renderingStartTime = 0, i.last = r, i.tail = n, i.tailMode = l);
}
function Ia(e, t, n) {
  var r = t.pendingProps, l = r.revealOrder, i = r.tail;
  if (ie(e, t, r.children, n), r = $.current, r & 2) r = r & 1 | 2, t.flags |= 128;
  else {
    if (e !== null && e.flags & 128) e: for (e = t.child; e !== null; ) {
      if (e.tag === 13) e.memoizedState !== null && Ro(e, n, t);
      else if (e.tag === 19) Ro(e, n, t);
      else if (e.child !== null) {
        e.child.return = e, e = e.child;
        continue;
      }
      if (e === t) break e;
      for (; e.sibling === null; ) {
        if (e.return === null || e.return === t) break e;
        e = e.return;
      }
      e.sibling.return = e.return, e = e.sibling;
    }
    r &= 1;
  }
  if (M($, r), !(t.mode & 1)) t.memoizedState = null;
  else switch (l) {
    case "forwards":
      for (n = t.child, l = null; n !== null; ) e = n.alternate, e !== null && Yr(e) === null && (l = n), n = n.sibling;
      n = l, n === null ? (l = t.child, t.child = null) : (l = n.sibling, n.sibling = null), Hl(t, !1, l, n, i);
      break;
    case "backwards":
      for (n = null, l = t.child, t.child = null; l !== null; ) {
        if (e = l.alternate, e !== null && Yr(e) === null) {
          t.child = l;
          break;
        }
        e = l.sibling, l.sibling = n, n = l, l = e;
      }
      Hl(t, !0, n, null, i);
      break;
    case "together":
      Hl(t, !1, null, null, void 0);
      break;
    default:
      t.memoizedState = null;
  }
  return t.child;
}
function Pr(e, t) {
  !(t.mode & 1) && e !== null && (e.alternate = null, t.alternate = null, t.flags |= 2);
}
function Ye(e, t, n) {
  if (e !== null && (t.dependencies = e.dependencies), jt |= t.lanes, !(n & t.childLanes)) return null;
  if (e !== null && t.child !== e.child) throw Error(g(153));
  if (t.child !== null) {
    for (e = t.child, n = at(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null; ) e = e.sibling, n = n.sibling = at(e, e.pendingProps), n.return = t;
    n.sibling = null;
  }
  return t.child;
}
function cd(e, t, n) {
  switch (t.tag) {
    case 3:
      Ma(t), bt();
      break;
    case 5:
      sa(t);
      break;
    case 1:
      de(t.type) && Vr(t);
      break;
    case 4:
      pu(t, t.stateNode.containerInfo);
      break;
    case 10:
      var r = t.type._context, l = t.memoizedProps.value;
      M(Wr, r._currentValue), r._currentValue = l;
      break;
    case 13:
      if (r = t.memoizedState, r !== null)
        return r.dehydrated !== null ? (M($, $.current & 1), t.flags |= 128, null) : n & t.child.childLanes ? Da(e, t, n) : (M($, $.current & 1), e = Ye(e, t, n), e !== null ? e.sibling : null);
      M($, $.current & 1);
      break;
    case 19:
      if (r = (n & t.childLanes) !== 0, e.flags & 128) {
        if (r) return Ia(e, t, n);
        t.flags |= 128;
      }
      if (l = t.memoizedState, l !== null && (l.rendering = null, l.tail = null, l.lastEffect = null), M($, $.current), r) break;
      return null;
    case 22:
    case 23:
      return t.lanes = 0, Ra(e, t, n);
  }
  return Ye(e, t, n);
}
var Fa, zi, Ua, $a;
Fa = function(e, t) {
  for (var n = t.child; n !== null; ) {
    if (n.tag === 5 || n.tag === 6) e.appendChild(n.stateNode);
    else if (n.tag !== 4 && n.child !== null) {
      n.child.return = n, n = n.child;
      continue;
    }
    if (n === t) break;
    for (; n.sibling === null; ) {
      if (n.return === null || n.return === t) return;
      n = n.return;
    }
    n.sibling.return = n.return, n = n.sibling;
  }
};
zi = function() {
};
Ua = function(e, t, n, r) {
  var l = e.memoizedProps;
  if (l !== r) {
    e = t.stateNode, xt(Ue.current);
    var i = null;
    switch (n) {
      case "input":
        l = Jl(e, l), r = Jl(e, r), i = [];
        break;
      case "select":
        l = V({}, l, { value: void 0 }), r = V({}, r, { value: void 0 }), i = [];
        break;
      case "textarea":
        l = ei(e, l), r = ei(e, r), i = [];
        break;
      default:
        typeof l.onClick != "function" && typeof r.onClick == "function" && (e.onclick = $r);
    }
    ni(n, r);
    var u;
    n = null;
    for (c in l) if (!r.hasOwnProperty(c) && l.hasOwnProperty(c) && l[c] != null) if (c === "style") {
      var o = l[c];
      for (u in o) o.hasOwnProperty(u) && (n || (n = {}), n[u] = "");
    } else c !== "dangerouslySetInnerHTML" && c !== "children" && c !== "suppressContentEditableWarning" && c !== "suppressHydrationWarning" && c !== "autoFocus" && (Tn.hasOwnProperty(c) ? i || (i = []) : (i = i || []).push(c, null));
    for (c in r) {
      var s = r[c];
      if (o = l != null ? l[c] : void 0, r.hasOwnProperty(c) && s !== o && (s != null || o != null)) if (c === "style") if (o) {
        for (u in o) !o.hasOwnProperty(u) || s && s.hasOwnProperty(u) || (n || (n = {}), n[u] = "");
        for (u in s) s.hasOwnProperty(u) && o[u] !== s[u] && (n || (n = {}), n[u] = s[u]);
      } else n || (i || (i = []), i.push(
        c,
        n
      )), n = s;
      else c === "dangerouslySetInnerHTML" ? (s = s ? s.__html : void 0, o = o ? o.__html : void 0, s != null && o !== s && (i = i || []).push(c, s)) : c === "children" ? typeof s != "string" && typeof s != "number" || (i = i || []).push(c, "" + s) : c !== "suppressContentEditableWarning" && c !== "suppressHydrationWarning" && (Tn.hasOwnProperty(c) ? (s != null && c === "onScroll" && D("scroll", e), i || o === s || (i = [])) : (i = i || []).push(c, s));
    }
    n && (i = i || []).push("style", n);
    var c = i;
    (t.updateQueue = c) && (t.flags |= 4);
  }
};
$a = function(e, t, n, r) {
  n !== r && (t.flags |= 4);
};
function vn(e, t) {
  if (!U) switch (e.tailMode) {
    case "hidden":
      t = e.tail;
      for (var n = null; t !== null; ) t.alternate !== null && (n = t), t = t.sibling;
      n === null ? e.tail = null : n.sibling = null;
      break;
    case "collapsed":
      n = e.tail;
      for (var r = null; n !== null; ) n.alternate !== null && (r = n), n = n.sibling;
      r === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : r.sibling = null;
  }
}
function ne(e) {
  var t = e.alternate !== null && e.alternate.child === e.child, n = 0, r = 0;
  if (t) for (var l = e.child; l !== null; ) n |= l.lanes | l.childLanes, r |= l.subtreeFlags & 14680064, r |= l.flags & 14680064, l.return = e, l = l.sibling;
  else for (l = e.child; l !== null; ) n |= l.lanes | l.childLanes, r |= l.subtreeFlags, r |= l.flags, l.return = e, l = l.sibling;
  return e.subtreeFlags |= r, e.childLanes = n, t;
}
function fd(e, t, n) {
  var r = t.pendingProps;
  switch (uu(t), t.tag) {
    case 2:
    case 16:
    case 15:
    case 0:
    case 11:
    case 7:
    case 8:
    case 12:
    case 9:
    case 14:
      return ne(t), null;
    case 1:
      return de(t.type) && Ar(), ne(t), null;
    case 3:
      return r = t.stateNode, tn(), I(fe), I(le), mu(), r.pendingContext && (r.context = r.pendingContext, r.pendingContext = null), (e === null || e.child === null) && (dr(t) ? t.flags |= 4 : e === null || e.memoizedState.isDehydrated && !(t.flags & 256) || (t.flags |= 1024, Le !== null && (Fi(Le), Le = null))), zi(e, t), ne(t), null;
    case 5:
      hu(t);
      var l = xt(Hn.current);
      if (n = t.type, e !== null && t.stateNode != null) Ua(e, t, n, r, l), e.ref !== t.ref && (t.flags |= 512, t.flags |= 2097152);
      else {
        if (!r) {
          if (t.stateNode === null) throw Error(g(166));
          return ne(t), null;
        }
        if (e = xt(Ue.current), dr(t)) {
          r = t.stateNode, n = t.type;
          var i = t.memoizedProps;
          switch (r[Ie] = t, r[Vn] = i, e = (t.mode & 1) !== 0, n) {
            case "dialog":
              D("cancel", r), D("close", r);
              break;
            case "iframe":
            case "object":
            case "embed":
              D("load", r);
              break;
            case "video":
            case "audio":
              for (l = 0; l < Sn.length; l++) D(Sn[l], r);
              break;
            case "source":
              D("error", r);
              break;
            case "img":
            case "image":
            case "link":
              D(
                "error",
                r
              ), D("load", r);
              break;
            case "details":
              D("toggle", r);
              break;
            case "input":
              Au(r, i), D("invalid", r);
              break;
            case "select":
              r._wrapperState = { wasMultiple: !!i.multiple }, D("invalid", r);
              break;
            case "textarea":
              Bu(r, i), D("invalid", r);
          }
          ni(n, i), l = null;
          for (var u in i) if (i.hasOwnProperty(u)) {
            var o = i[u];
            u === "children" ? typeof o == "string" ? r.textContent !== o && (i.suppressHydrationWarning !== !0 && fr(r.textContent, o, e), l = ["children", o]) : typeof o == "number" && r.textContent !== "" + o && (i.suppressHydrationWarning !== !0 && fr(
              r.textContent,
              o,
              e
            ), l = ["children", "" + o]) : Tn.hasOwnProperty(u) && o != null && u === "onScroll" && D("scroll", r);
          }
          switch (n) {
            case "input":
              rr(r), Vu(r, i, !0);
              break;
            case "textarea":
              rr(r), Hu(r);
              break;
            case "select":
            case "option":
              break;
            default:
              typeof i.onClick == "function" && (r.onclick = $r);
          }
          r = l, t.updateQueue = r, r !== null && (t.flags |= 4);
        } else {
          u = l.nodeType === 9 ? l : l.ownerDocument, e === "http://www.w3.org/1999/xhtml" && (e = ps(n)), e === "http://www.w3.org/1999/xhtml" ? n === "script" ? (e = u.createElement("div"), e.innerHTML = "<script><\/script>", e = e.removeChild(e.firstChild)) : typeof r.is == "string" ? e = u.createElement(n, { is: r.is }) : (e = u.createElement(n), n === "select" && (u = e, r.multiple ? u.multiple = !0 : r.size && (u.size = r.size))) : e = u.createElementNS(e, n), e[Ie] = t, e[Vn] = r, Fa(e, t, !1, !1), t.stateNode = e;
          e: {
            switch (u = ri(n, r), n) {
              case "dialog":
                D("cancel", e), D("close", e), l = r;
                break;
              case "iframe":
              case "object":
              case "embed":
                D("load", e), l = r;
                break;
              case "video":
              case "audio":
                for (l = 0; l < Sn.length; l++) D(Sn[l], e);
                l = r;
                break;
              case "source":
                D("error", e), l = r;
                break;
              case "img":
              case "image":
              case "link":
                D(
                  "error",
                  e
                ), D("load", e), l = r;
                break;
              case "details":
                D("toggle", e), l = r;
                break;
              case "input":
                Au(e, r), l = Jl(e, r), D("invalid", e);
                break;
              case "option":
                l = r;
                break;
              case "select":
                e._wrapperState = { wasMultiple: !!r.multiple }, l = V({}, r, { value: void 0 }), D("invalid", e);
                break;
              case "textarea":
                Bu(e, r), l = ei(e, r), D("invalid", e);
                break;
              default:
                l = r;
            }
            ni(n, l), o = l;
            for (i in o) if (o.hasOwnProperty(i)) {
              var s = o[i];
              i === "style" ? vs(e, s) : i === "dangerouslySetInnerHTML" ? (s = s ? s.__html : void 0, s != null && hs(e, s)) : i === "children" ? typeof s == "string" ? (n !== "textarea" || s !== "") && Rn(e, s) : typeof s == "number" && Rn(e, "" + s) : i !== "suppressContentEditableWarning" && i !== "suppressHydrationWarning" && i !== "autoFocus" && (Tn.hasOwnProperty(i) ? s != null && i === "onScroll" && D("scroll", e) : s != null && Qi(e, i, s, u));
            }
            switch (n) {
              case "input":
                rr(e), Vu(e, r, !1);
                break;
              case "textarea":
                rr(e), Hu(e);
                break;
              case "option":
                r.value != null && e.setAttribute("value", "" + ct(r.value));
                break;
              case "select":
                e.multiple = !!r.multiple, i = r.value, i != null ? Qt(e, !!r.multiple, i, !1) : r.defaultValue != null && Qt(
                  e,
                  !!r.multiple,
                  r.defaultValue,
                  !0
                );
                break;
              default:
                typeof l.onClick == "function" && (e.onclick = $r);
            }
            switch (n) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                r = !!r.autoFocus;
                break e;
              case "img":
                r = !0;
                break e;
              default:
                r = !1;
            }
          }
          r && (t.flags |= 4);
        }
        t.ref !== null && (t.flags |= 512, t.flags |= 2097152);
      }
      return ne(t), null;
    case 6:
      if (e && t.stateNode != null) $a(e, t, e.memoizedProps, r);
      else {
        if (typeof r != "string" && t.stateNode === null) throw Error(g(166));
        if (n = xt(Hn.current), xt(Ue.current), dr(t)) {
          if (r = t.stateNode, n = t.memoizedProps, r[Ie] = t, (i = r.nodeValue !== n) && (e = ve, e !== null)) switch (e.tag) {
            case 3:
              fr(r.nodeValue, n, (e.mode & 1) !== 0);
              break;
            case 5:
              e.memoizedProps.suppressHydrationWarning !== !0 && fr(r.nodeValue, n, (e.mode & 1) !== 0);
          }
          i && (t.flags |= 4);
        } else r = (n.nodeType === 9 ? n : n.ownerDocument).createTextNode(r), r[Ie] = t, t.stateNode = r;
      }
      return ne(t), null;
    case 13:
      if (I($), r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
        if (U && me !== null && t.mode & 1 && !(t.flags & 128)) ra(), bt(), t.flags |= 98560, i = !1;
        else if (i = dr(t), r !== null && r.dehydrated !== null) {
          if (e === null) {
            if (!i) throw Error(g(318));
            if (i = t.memoizedState, i = i !== null ? i.dehydrated : null, !i) throw Error(g(317));
            i[Ie] = t;
          } else bt(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
          ne(t), i = !1;
        } else Le !== null && (Fi(Le), Le = null), i = !0;
        if (!i) return t.flags & 65536 ? t : null;
      }
      return t.flags & 128 ? (t.lanes = n, t) : (r = r !== null, r !== (e !== null && e.memoizedState !== null) && r && (t.child.flags |= 8192, t.mode & 1 && (e === null || $.current & 1 ? X === 0 && (X = 3) : Pu())), t.updateQueue !== null && (t.flags |= 4), ne(t), null);
    case 4:
      return tn(), zi(e, t), e === null && $n(t.stateNode.containerInfo), ne(t), null;
    case 10:
      return cu(t.type._context), ne(t), null;
    case 17:
      return de(t.type) && Ar(), ne(t), null;
    case 19:
      if (I($), i = t.memoizedState, i === null) return ne(t), null;
      if (r = (t.flags & 128) !== 0, u = i.rendering, u === null) if (r) vn(i, !1);
      else {
        if (X !== 0 || e !== null && e.flags & 128) for (e = t.child; e !== null; ) {
          if (u = Yr(e), u !== null) {
            for (t.flags |= 128, vn(i, !1), r = u.updateQueue, r !== null && (t.updateQueue = r, t.flags |= 4), t.subtreeFlags = 0, r = n, n = t.child; n !== null; ) i = n, e = r, i.flags &= 14680066, u = i.alternate, u === null ? (i.childLanes = 0, i.lanes = e, i.child = null, i.subtreeFlags = 0, i.memoizedProps = null, i.memoizedState = null, i.updateQueue = null, i.dependencies = null, i.stateNode = null) : (i.childLanes = u.childLanes, i.lanes = u.lanes, i.child = u.child, i.subtreeFlags = 0, i.deletions = null, i.memoizedProps = u.memoizedProps, i.memoizedState = u.memoizedState, i.updateQueue = u.updateQueue, i.type = u.type, e = u.dependencies, i.dependencies = e === null ? null : { lanes: e.lanes, firstContext: e.firstContext }), n = n.sibling;
            return M($, $.current & 1 | 2), t.child;
          }
          e = e.sibling;
        }
        i.tail !== null && Q() > rn && (t.flags |= 128, r = !0, vn(i, !1), t.lanes = 4194304);
      }
      else {
        if (!r) if (e = Yr(u), e !== null) {
          if (t.flags |= 128, r = !0, n = e.updateQueue, n !== null && (t.updateQueue = n, t.flags |= 4), vn(i, !0), i.tail === null && i.tailMode === "hidden" && !u.alternate && !U) return ne(t), null;
        } else 2 * Q() - i.renderingStartTime > rn && n !== 1073741824 && (t.flags |= 128, r = !0, vn(i, !1), t.lanes = 4194304);
        i.isBackwards ? (u.sibling = t.child, t.child = u) : (n = i.last, n !== null ? n.sibling = u : t.child = u, i.last = u);
      }
      return i.tail !== null ? (t = i.tail, i.rendering = t, i.tail = t.sibling, i.renderingStartTime = Q(), t.sibling = null, n = $.current, M($, r ? n & 1 | 2 : n & 1), t) : (ne(t), null);
    case 22:
    case 23:
      return Nu(), r = t.memoizedState !== null, e !== null && e.memoizedState !== null !== r && (t.flags |= 8192), r && t.mode & 1 ? he & 1073741824 && (ne(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : ne(t), null;
    case 24:
      return null;
    case 25:
      return null;
  }
  throw Error(g(156, t.tag));
}
function dd(e, t) {
  switch (uu(t), t.tag) {
    case 1:
      return de(t.type) && Ar(), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
    case 3:
      return tn(), I(fe), I(le), mu(), e = t.flags, e & 65536 && !(e & 128) ? (t.flags = e & -65537 | 128, t) : null;
    case 5:
      return hu(t), null;
    case 13:
      if (I($), e = t.memoizedState, e !== null && e.dehydrated !== null) {
        if (t.alternate === null) throw Error(g(340));
        bt();
      }
      return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
    case 19:
      return I($), null;
    case 4:
      return tn(), null;
    case 10:
      return cu(t.type._context), null;
    case 22:
    case 23:
      return Nu(), null;
    case 24:
      return null;
    default:
      return null;
  }
}
var mr = !1, re = !1, pd = typeof WeakSet == "function" ? WeakSet : Set, x = null;
function Ht(e, t) {
  var n = e.ref;
  if (n !== null) if (typeof n == "function") try {
    n(null);
  } catch (r) {
    B(e, t, r);
  }
  else n.current = null;
}
function Li(e, t, n) {
  try {
    n();
  } catch (r) {
    B(e, t, r);
  }
}
var Oo = !1;
function hd(e, t) {
  if (pi = Ir, e = Ws(), lu(e)) {
    if ("selectionStart" in e) var n = { start: e.selectionStart, end: e.selectionEnd };
    else e: {
      n = (n = e.ownerDocument) && n.defaultView || window;
      var r = n.getSelection && n.getSelection();
      if (r && r.rangeCount !== 0) {
        n = r.anchorNode;
        var l = r.anchorOffset, i = r.focusNode;
        r = r.focusOffset;
        try {
          n.nodeType, i.nodeType;
        } catch {
          n = null;
          break e;
        }
        var u = 0, o = -1, s = -1, c = 0, v = 0, m = e, p = null;
        t: for (; ; ) {
          for (var w; m !== n || l !== 0 && m.nodeType !== 3 || (o = u + l), m !== i || r !== 0 && m.nodeType !== 3 || (s = u + r), m.nodeType === 3 && (u += m.nodeValue.length), (w = m.firstChild) !== null; )
            p = m, m = w;
          for (; ; ) {
            if (m === e) break t;
            if (p === n && ++c === l && (o = u), p === i && ++v === r && (s = u), (w = m.nextSibling) !== null) break;
            m = p, p = m.parentNode;
          }
          m = w;
        }
        n = o === -1 || s === -1 ? null : { start: o, end: s };
      } else n = null;
    }
    n = n || { start: 0, end: 0 };
  } else n = null;
  for (hi = { focusedElem: e, selectionRange: n }, Ir = !1, x = t; x !== null; ) if (t = x, e = t.child, (t.subtreeFlags & 1028) !== 0 && e !== null) e.return = t, x = e;
  else for (; x !== null; ) {
    t = x;
    try {
      var k = t.alternate;
      if (t.flags & 1024) switch (t.tag) {
        case 0:
        case 11:
        case 15:
          break;
        case 1:
          if (k !== null) {
            var S = k.memoizedProps, F = k.memoizedState, f = t.stateNode, a = f.getSnapshotBeforeUpdate(t.elementType === t.type ? S : je(t.type, S), F);
            f.__reactInternalSnapshotBeforeUpdate = a;
          }
          break;
        case 3:
          var d = t.stateNode.containerInfo;
          d.nodeType === 1 ? d.textContent = "" : d.nodeType === 9 && d.documentElement && d.removeChild(d.documentElement);
          break;
        case 5:
        case 6:
        case 4:
        case 17:
          break;
        default:
          throw Error(g(163));
      }
    } catch (y) {
      B(t, t.return, y);
    }
    if (e = t.sibling, e !== null) {
      e.return = t.return, x = e;
      break;
    }
    x = t.return;
  }
  return k = Oo, Oo = !1, k;
}
function jn(e, t, n) {
  var r = t.updateQueue;
  if (r = r !== null ? r.lastEffect : null, r !== null) {
    var l = r = r.next;
    do {
      if ((l.tag & e) === e) {
        var i = l.destroy;
        l.destroy = void 0, i !== void 0 && Li(t, n, i);
      }
      l = l.next;
    } while (l !== r);
  }
}
function cl(e, t) {
  if (t = t.updateQueue, t = t !== null ? t.lastEffect : null, t !== null) {
    var n = t = t.next;
    do {
      if ((n.tag & e) === e) {
        var r = n.create;
        n.destroy = r();
      }
      n = n.next;
    } while (n !== t);
  }
}
function Ti(e) {
  var t = e.ref;
  if (t !== null) {
    var n = e.stateNode;
    switch (e.tag) {
      case 5:
        e = n;
        break;
      default:
        e = n;
    }
    typeof t == "function" ? t(e) : t.current = e;
  }
}
function Aa(e) {
  var t = e.alternate;
  t !== null && (e.alternate = null, Aa(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && (delete t[Ie], delete t[Vn], delete t[yi], delete t[Zf], delete t[Jf])), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
}
function Va(e) {
  return e.tag === 5 || e.tag === 3 || e.tag === 4;
}
function Mo(e) {
  e: for (; ; ) {
    for (; e.sibling === null; ) {
      if (e.return === null || Va(e.return)) return null;
      e = e.return;
    }
    for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
      if (e.flags & 2 || e.child === null || e.tag === 4) continue e;
      e.child.return = e, e = e.child;
    }
    if (!(e.flags & 2)) return e.stateNode;
  }
}
function Ri(e, t, n) {
  var r = e.tag;
  if (r === 5 || r === 6) e = e.stateNode, t ? n.nodeType === 8 ? n.parentNode.insertBefore(e, t) : n.insertBefore(e, t) : (n.nodeType === 8 ? (t = n.parentNode, t.insertBefore(e, n)) : (t = n, t.appendChild(e)), n = n._reactRootContainer, n != null || t.onclick !== null || (t.onclick = $r));
  else if (r !== 4 && (e = e.child, e !== null)) for (Ri(e, t, n), e = e.sibling; e !== null; ) Ri(e, t, n), e = e.sibling;
}
function Oi(e, t, n) {
  var r = e.tag;
  if (r === 5 || r === 6) e = e.stateNode, t ? n.insertBefore(e, t) : n.appendChild(e);
  else if (r !== 4 && (e = e.child, e !== null)) for (Oi(e, t, n), e = e.sibling; e !== null; ) Oi(e, t, n), e = e.sibling;
}
var q = null, ze = !1;
function Ge(e, t, n) {
  for (n = n.child; n !== null; ) Ba(e, t, n), n = n.sibling;
}
function Ba(e, t, n) {
  if (Fe && typeof Fe.onCommitFiberUnmount == "function") try {
    Fe.onCommitFiberUnmount(nl, n);
  } catch {
  }
  switch (n.tag) {
    case 5:
      re || Ht(n, t);
    case 6:
      var r = q, l = ze;
      q = null, Ge(e, t, n), q = r, ze = l, q !== null && (ze ? (e = q, n = n.stateNode, e.nodeType === 8 ? e.parentNode.removeChild(n) : e.removeChild(n)) : q.removeChild(n.stateNode));
      break;
    case 18:
      q !== null && (ze ? (e = q, n = n.stateNode, e.nodeType === 8 ? Il(e.parentNode, n) : e.nodeType === 1 && Il(e, n), In(e)) : Il(q, n.stateNode));
      break;
    case 4:
      r = q, l = ze, q = n.stateNode.containerInfo, ze = !0, Ge(e, t, n), q = r, ze = l;
      break;
    case 0:
    case 11:
    case 14:
    case 15:
      if (!re && (r = n.updateQueue, r !== null && (r = r.lastEffect, r !== null))) {
        l = r = r.next;
        do {
          var i = l, u = i.destroy;
          i = i.tag, u !== void 0 && (i & 2 || i & 4) && Li(n, t, u), l = l.next;
        } while (l !== r);
      }
      Ge(e, t, n);
      break;
    case 1:
      if (!re && (Ht(n, t), r = n.stateNode, typeof r.componentWillUnmount == "function")) try {
        r.props = n.memoizedProps, r.state = n.memoizedState, r.componentWillUnmount();
      } catch (o) {
        B(n, t, o);
      }
      Ge(e, t, n);
      break;
    case 21:
      Ge(e, t, n);
      break;
    case 22:
      n.mode & 1 ? (re = (r = re) || n.memoizedState !== null, Ge(e, t, n), re = r) : Ge(e, t, n);
      break;
    default:
      Ge(e, t, n);
  }
}
function Do(e) {
  var t = e.updateQueue;
  if (t !== null) {
    e.updateQueue = null;
    var n = e.stateNode;
    n === null && (n = e.stateNode = new pd()), t.forEach(function(r) {
      var l = Ed.bind(null, e, r);
      n.has(r) || (n.add(r), r.then(l, l));
    });
  }
}
function Pe(e, t) {
  var n = t.deletions;
  if (n !== null) for (var r = 0; r < n.length; r++) {
    var l = n[r];
    try {
      var i = e, u = t, o = u;
      e: for (; o !== null; ) {
        switch (o.tag) {
          case 5:
            q = o.stateNode, ze = !1;
            break e;
          case 3:
            q = o.stateNode.containerInfo, ze = !0;
            break e;
          case 4:
            q = o.stateNode.containerInfo, ze = !0;
            break e;
        }
        o = o.return;
      }
      if (q === null) throw Error(g(160));
      Ba(i, u, l), q = null, ze = !1;
      var s = l.alternate;
      s !== null && (s.return = null), l.return = null;
    } catch (c) {
      B(l, t, c);
    }
  }
  if (t.subtreeFlags & 12854) for (t = t.child; t !== null; ) Ha(t, e), t = t.sibling;
}
function Ha(e, t) {
  var n = e.alternate, r = e.flags;
  switch (e.tag) {
    case 0:
    case 11:
    case 14:
    case 15:
      if (Pe(t, e), Me(e), r & 4) {
        try {
          jn(3, e, e.return), cl(3, e);
        } catch (S) {
          B(e, e.return, S);
        }
        try {
          jn(5, e, e.return);
        } catch (S) {
          B(e, e.return, S);
        }
      }
      break;
    case 1:
      Pe(t, e), Me(e), r & 512 && n !== null && Ht(n, n.return);
      break;
    case 5:
      if (Pe(t, e), Me(e), r & 512 && n !== null && Ht(n, n.return), e.flags & 32) {
        var l = e.stateNode;
        try {
          Rn(l, "");
        } catch (S) {
          B(e, e.return, S);
        }
      }
      if (r & 4 && (l = e.stateNode, l != null)) {
        var i = e.memoizedProps, u = n !== null ? n.memoizedProps : i, o = e.type, s = e.updateQueue;
        if (e.updateQueue = null, s !== null) try {
          o === "input" && i.type === "radio" && i.name != null && fs(l, i), ri(o, u);
          var c = ri(o, i);
          for (u = 0; u < s.length; u += 2) {
            var v = s[u], m = s[u + 1];
            v === "style" ? vs(l, m) : v === "dangerouslySetInnerHTML" ? hs(l, m) : v === "children" ? Rn(l, m) : Qi(l, v, m, c);
          }
          switch (o) {
            case "input":
              ql(l, i);
              break;
            case "textarea":
              ds(l, i);
              break;
            case "select":
              var p = l._wrapperState.wasMultiple;
              l._wrapperState.wasMultiple = !!i.multiple;
              var w = i.value;
              w != null ? Qt(l, !!i.multiple, w, !1) : p !== !!i.multiple && (i.defaultValue != null ? Qt(
                l,
                !!i.multiple,
                i.defaultValue,
                !0
              ) : Qt(l, !!i.multiple, i.multiple ? [] : "", !1));
          }
          l[Vn] = i;
        } catch (S) {
          B(e, e.return, S);
        }
      }
      break;
    case 6:
      if (Pe(t, e), Me(e), r & 4) {
        if (e.stateNode === null) throw Error(g(162));
        l = e.stateNode, i = e.memoizedProps;
        try {
          l.nodeValue = i;
        } catch (S) {
          B(e, e.return, S);
        }
      }
      break;
    case 3:
      if (Pe(t, e), Me(e), r & 4 && n !== null && n.memoizedState.isDehydrated) try {
        In(t.containerInfo);
      } catch (S) {
        B(e, e.return, S);
      }
      break;
    case 4:
      Pe(t, e), Me(e);
      break;
    case 13:
      Pe(t, e), Me(e), l = e.child, l.flags & 8192 && (i = l.memoizedState !== null, l.stateNode.isHidden = i, !i || l.alternate !== null && l.alternate.memoizedState !== null || (Cu = Q())), r & 4 && Do(e);
      break;
    case 22:
      if (v = n !== null && n.memoizedState !== null, e.mode & 1 ? (re = (c = re) || v, Pe(t, e), re = c) : Pe(t, e), Me(e), r & 8192) {
        if (c = e.memoizedState !== null, (e.stateNode.isHidden = c) && !v && e.mode & 1) for (x = e, v = e.child; v !== null; ) {
          for (m = x = v; x !== null; ) {
            switch (p = x, w = p.child, p.tag) {
              case 0:
              case 11:
              case 14:
              case 15:
                jn(4, p, p.return);
                break;
              case 1:
                Ht(p, p.return);
                var k = p.stateNode;
                if (typeof k.componentWillUnmount == "function") {
                  r = p, n = p.return;
                  try {
                    t = r, k.props = t.memoizedProps, k.state = t.memoizedState, k.componentWillUnmount();
                  } catch (S) {
                    B(r, n, S);
                  }
                }
                break;
              case 5:
                Ht(p, p.return);
                break;
              case 22:
                if (p.memoizedState !== null) {
                  Fo(m);
                  continue;
                }
            }
            w !== null ? (w.return = p, x = w) : Fo(m);
          }
          v = v.sibling;
        }
        e: for (v = null, m = e; ; ) {
          if (m.tag === 5) {
            if (v === null) {
              v = m;
              try {
                l = m.stateNode, c ? (i = l.style, typeof i.setProperty == "function" ? i.setProperty("display", "none", "important") : i.display = "none") : (o = m.stateNode, s = m.memoizedProps.style, u = s != null && s.hasOwnProperty("display") ? s.display : null, o.style.display = ms("display", u));
              } catch (S) {
                B(e, e.return, S);
              }
            }
          } else if (m.tag === 6) {
            if (v === null) try {
              m.stateNode.nodeValue = c ? "" : m.memoizedProps;
            } catch (S) {
              B(e, e.return, S);
            }
          } else if ((m.tag !== 22 && m.tag !== 23 || m.memoizedState === null || m === e) && m.child !== null) {
            m.child.return = m, m = m.child;
            continue;
          }
          if (m === e) break e;
          for (; m.sibling === null; ) {
            if (m.return === null || m.return === e) break e;
            v === m && (v = null), m = m.return;
          }
          v === m && (v = null), m.sibling.return = m.return, m = m.sibling;
        }
      }
      break;
    case 19:
      Pe(t, e), Me(e), r & 4 && Do(e);
      break;
    case 21:
      break;
    default:
      Pe(
        t,
        e
      ), Me(e);
  }
}
function Me(e) {
  var t = e.flags;
  if (t & 2) {
    try {
      e: {
        for (var n = e.return; n !== null; ) {
          if (Va(n)) {
            var r = n;
            break e;
          }
          n = n.return;
        }
        throw Error(g(160));
      }
      switch (r.tag) {
        case 5:
          var l = r.stateNode;
          r.flags & 32 && (Rn(l, ""), r.flags &= -33);
          var i = Mo(e);
          Oi(e, i, l);
          break;
        case 3:
        case 4:
          var u = r.stateNode.containerInfo, o = Mo(e);
          Ri(e, o, u);
          break;
        default:
          throw Error(g(161));
      }
    } catch (s) {
      B(e, e.return, s);
    }
    e.flags &= -3;
  }
  t & 4096 && (e.flags &= -4097);
}
function md(e, t, n) {
  x = e, Wa(e);
}
function Wa(e, t, n) {
  for (var r = (e.mode & 1) !== 0; x !== null; ) {
    var l = x, i = l.child;
    if (l.tag === 22 && r) {
      var u = l.memoizedState !== null || mr;
      if (!u) {
        var o = l.alternate, s = o !== null && o.memoizedState !== null || re;
        o = mr;
        var c = re;
        if (mr = u, (re = s) && !c) for (x = l; x !== null; ) u = x, s = u.child, u.tag === 22 && u.memoizedState !== null ? Uo(l) : s !== null ? (s.return = u, x = s) : Uo(l);
        for (; i !== null; ) x = i, Wa(i), i = i.sibling;
        x = l, mr = o, re = c;
      }
      Io(e);
    } else l.subtreeFlags & 8772 && i !== null ? (i.return = l, x = i) : Io(e);
  }
}
function Io(e) {
  for (; x !== null; ) {
    var t = x;
    if (t.flags & 8772) {
      var n = t.alternate;
      try {
        if (t.flags & 8772) switch (t.tag) {
          case 0:
          case 11:
          case 15:
            re || cl(5, t);
            break;
          case 1:
            var r = t.stateNode;
            if (t.flags & 4 && !re) if (n === null) r.componentDidMount();
            else {
              var l = t.elementType === t.type ? n.memoizedProps : je(t.type, n.memoizedProps);
              r.componentDidUpdate(l, n.memoizedState, r.__reactInternalSnapshotBeforeUpdate);
            }
            var i = t.updateQueue;
            i !== null && ko(t, i, r);
            break;
          case 3:
            var u = t.updateQueue;
            if (u !== null) {
              if (n = null, t.child !== null) switch (t.child.tag) {
                case 5:
                  n = t.child.stateNode;
                  break;
                case 1:
                  n = t.child.stateNode;
              }
              ko(t, u, n);
            }
            break;
          case 5:
            var o = t.stateNode;
            if (n === null && t.flags & 4) {
              n = o;
              var s = t.memoizedProps;
              switch (t.type) {
                case "button":
                case "input":
                case "select":
                case "textarea":
                  s.autoFocus && n.focus();
                  break;
                case "img":
                  s.src && (n.src = s.src);
              }
            }
            break;
          case 6:
            break;
          case 4:
            break;
          case 12:
            break;
          case 13:
            if (t.memoizedState === null) {
              var c = t.alternate;
              if (c !== null) {
                var v = c.memoizedState;
                if (v !== null) {
                  var m = v.dehydrated;
                  m !== null && In(m);
                }
              }
            }
            break;
          case 19:
          case 17:
          case 21:
          case 22:
          case 23:
          case 25:
            break;
          default:
            throw Error(g(163));
        }
        re || t.flags & 512 && Ti(t);
      } catch (p) {
        B(t, t.return, p);
      }
    }
    if (t === e) {
      x = null;
      break;
    }
    if (n = t.sibling, n !== null) {
      n.return = t.return, x = n;
      break;
    }
    x = t.return;
  }
}
function Fo(e) {
  for (; x !== null; ) {
    var t = x;
    if (t === e) {
      x = null;
      break;
    }
    var n = t.sibling;
    if (n !== null) {
      n.return = t.return, x = n;
      break;
    }
    x = t.return;
  }
}
function Uo(e) {
  for (; x !== null; ) {
    var t = x;
    try {
      switch (t.tag) {
        case 0:
        case 11:
        case 15:
          var n = t.return;
          try {
            cl(4, t);
          } catch (s) {
            B(t, n, s);
          }
          break;
        case 1:
          var r = t.stateNode;
          if (typeof r.componentDidMount == "function") {
            var l = t.return;
            try {
              r.componentDidMount();
            } catch (s) {
              B(t, l, s);
            }
          }
          var i = t.return;
          try {
            Ti(t);
          } catch (s) {
            B(t, i, s);
          }
          break;
        case 5:
          var u = t.return;
          try {
            Ti(t);
          } catch (s) {
            B(t, u, s);
          }
      }
    } catch (s) {
      B(t, t.return, s);
    }
    if (t === e) {
      x = null;
      break;
    }
    var o = t.sibling;
    if (o !== null) {
      o.return = t.return, x = o;
      break;
    }
    x = t.return;
  }
}
var vd = Math.ceil, Zr = Xe.ReactCurrentDispatcher, xu = Xe.ReactCurrentOwner, Ee = Xe.ReactCurrentBatchConfig, R = 0, J = null, K = null, b = 0, he = 0, Wt = pt(0), X = 0, Yn = null, jt = 0, fl = 0, Eu = 0, zn = null, ae = null, Cu = 0, rn = 1 / 0, $e = null, Jr = !1, Mi = null, ot = null, vr = !1, tt = null, qr = 0, Ln = 0, Di = null, jr = -1, zr = 0;
function ue() {
  return R & 6 ? Q() : jr !== -1 ? jr : jr = Q();
}
function st(e) {
  return e.mode & 1 ? R & 2 && b !== 0 ? b & -b : bf.transition !== null ? (zr === 0 && (zr = js()), zr) : (e = O, e !== 0 || (e = window.event, e = e === void 0 ? 16 : Ds(e.type)), e) : 1;
}
function Re(e, t, n, r) {
  if (50 < Ln) throw Ln = 0, Di = null, Error(g(185));
  Gn(e, n, r), (!(R & 2) || e !== J) && (e === J && (!(R & 2) && (fl |= n), X === 4 && be(e, b)), pe(e, r), n === 1 && R === 0 && !(t.mode & 1) && (rn = Q() + 500, ol && ht()));
}
function pe(e, t) {
  var n = e.callbackNode;
  qc(e, t);
  var r = Dr(e, e === J ? b : 0);
  if (r === 0) n !== null && Ku(n), e.callbackNode = null, e.callbackPriority = 0;
  else if (t = r & -r, e.callbackPriority !== t) {
    if (n != null && Ku(n), t === 1) e.tag === 0 ? qf($o.bind(null, e)) : ea($o.bind(null, e)), Xf(function() {
      !(R & 6) && ht();
    }), n = null;
    else {
      switch (zs(r)) {
        case 1:
          n = Zi;
          break;
        case 4:
          n = Ns;
          break;
        case 16:
          n = Mr;
          break;
        case 536870912:
          n = Ps;
          break;
        default:
          n = Mr;
      }
      n = qa(n, Qa.bind(null, e));
    }
    e.callbackPriority = t, e.callbackNode = n;
  }
}
function Qa(e, t) {
  if (jr = -1, zr = 0, R & 6) throw Error(g(327));
  var n = e.callbackNode;
  if (Zt() && e.callbackNode !== n) return null;
  var r = Dr(e, e === J ? b : 0);
  if (r === 0) return null;
  if (r & 30 || r & e.expiredLanes || t) t = br(e, r);
  else {
    t = r;
    var l = R;
    R |= 2;
    var i = Ya();
    (J !== e || b !== t) && ($e = null, rn = Q() + 500, Et(e, t));
    do
      try {
        wd();
        break;
      } catch (o) {
        Ka(e, o);
      }
    while (!0);
    au(), Zr.current = i, R = l, K !== null ? t = 0 : (J = null, b = 0, t = X);
  }
  if (t !== 0) {
    if (t === 2 && (l = si(e), l !== 0 && (r = l, t = Ii(e, l))), t === 1) throw n = Yn, Et(e, 0), be(e, r), pe(e, Q()), n;
    if (t === 6) be(e, r);
    else {
      if (l = e.current.alternate, !(r & 30) && !yd(l) && (t = br(e, r), t === 2 && (i = si(e), i !== 0 && (r = i, t = Ii(e, i))), t === 1)) throw n = Yn, Et(e, 0), be(e, r), pe(e, Q()), n;
      switch (e.finishedWork = l, e.finishedLanes = r, t) {
        case 0:
        case 1:
          throw Error(g(345));
        case 2:
          wt(e, ae, $e);
          break;
        case 3:
          if (be(e, r), (r & 130023424) === r && (t = Cu + 500 - Q(), 10 < t)) {
            if (Dr(e, 0) !== 0) break;
            if (l = e.suspendedLanes, (l & r) !== r) {
              ue(), e.pingedLanes |= e.suspendedLanes & l;
              break;
            }
            e.timeoutHandle = vi(wt.bind(null, e, ae, $e), t);
            break;
          }
          wt(e, ae, $e);
          break;
        case 4:
          if (be(e, r), (r & 4194240) === r) break;
          for (t = e.eventTimes, l = -1; 0 < r; ) {
            var u = 31 - Te(r);
            i = 1 << u, u = t[u], u > l && (l = u), r &= ~i;
          }
          if (r = l, r = Q() - r, r = (120 > r ? 120 : 480 > r ? 480 : 1080 > r ? 1080 : 1920 > r ? 1920 : 3e3 > r ? 3e3 : 4320 > r ? 4320 : 1960 * vd(r / 1960)) - r, 10 < r) {
            e.timeoutHandle = vi(wt.bind(null, e, ae, $e), r);
            break;
          }
          wt(e, ae, $e);
          break;
        case 5:
          wt(e, ae, $e);
          break;
        default:
          throw Error(g(329));
      }
    }
  }
  return pe(e, Q()), e.callbackNode === n ? Qa.bind(null, e) : null;
}
function Ii(e, t) {
  var n = zn;
  return e.current.memoizedState.isDehydrated && (Et(e, t).flags |= 256), e = br(e, t), e !== 2 && (t = ae, ae = n, t !== null && Fi(t)), e;
}
function Fi(e) {
  ae === null ? ae = e : ae.push.apply(ae, e);
}
function yd(e) {
  for (var t = e; ; ) {
    if (t.flags & 16384) {
      var n = t.updateQueue;
      if (n !== null && (n = n.stores, n !== null)) for (var r = 0; r < n.length; r++) {
        var l = n[r], i = l.getSnapshot;
        l = l.value;
        try {
          if (!Oe(i(), l)) return !1;
        } catch {
          return !1;
        }
      }
    }
    if (n = t.child, t.subtreeFlags & 16384 && n !== null) n.return = t, t = n;
    else {
      if (t === e) break;
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === e) return !0;
        t = t.return;
      }
      t.sibling.return = t.return, t = t.sibling;
    }
  }
  return !0;
}
function be(e, t) {
  for (t &= ~Eu, t &= ~fl, e.suspendedLanes |= t, e.pingedLanes &= ~t, e = e.expirationTimes; 0 < t; ) {
    var n = 31 - Te(t), r = 1 << n;
    e[n] = -1, t &= ~r;
  }
}
function $o(e) {
  if (R & 6) throw Error(g(327));
  Zt();
  var t = Dr(e, 0);
  if (!(t & 1)) return pe(e, Q()), null;
  var n = br(e, t);
  if (e.tag !== 0 && n === 2) {
    var r = si(e);
    r !== 0 && (t = r, n = Ii(e, r));
  }
  if (n === 1) throw n = Yn, Et(e, 0), be(e, t), pe(e, Q()), n;
  if (n === 6) throw Error(g(345));
  return e.finishedWork = e.current.alternate, e.finishedLanes = t, wt(e, ae, $e), pe(e, Q()), null;
}
function _u(e, t) {
  var n = R;
  R |= 1;
  try {
    return e(t);
  } finally {
    R = n, R === 0 && (rn = Q() + 500, ol && ht());
  }
}
function zt(e) {
  tt !== null && tt.tag === 0 && !(R & 6) && Zt();
  var t = R;
  R |= 1;
  var n = Ee.transition, r = O;
  try {
    if (Ee.transition = null, O = 1, e) return e();
  } finally {
    O = r, Ee.transition = n, R = t, !(R & 6) && ht();
  }
}
function Nu() {
  he = Wt.current, I(Wt);
}
function Et(e, t) {
  e.finishedWork = null, e.finishedLanes = 0;
  var n = e.timeoutHandle;
  if (n !== -1 && (e.timeoutHandle = -1, Yf(n)), K !== null) for (n = K.return; n !== null; ) {
    var r = n;
    switch (uu(r), r.tag) {
      case 1:
        r = r.type.childContextTypes, r != null && Ar();
        break;
      case 3:
        tn(), I(fe), I(le), mu();
        break;
      case 5:
        hu(r);
        break;
      case 4:
        tn();
        break;
      case 13:
        I($);
        break;
      case 19:
        I($);
        break;
      case 10:
        cu(r.type._context);
        break;
      case 22:
      case 23:
        Nu();
    }
    n = n.return;
  }
  if (J = e, K = e = at(e.current, null), b = he = t, X = 0, Yn = null, Eu = fl = jt = 0, ae = zn = null, St !== null) {
    for (t = 0; t < St.length; t++) if (n = St[t], r = n.interleaved, r !== null) {
      n.interleaved = null;
      var l = r.next, i = n.pending;
      if (i !== null) {
        var u = i.next;
        i.next = l, r.next = u;
      }
      n.pending = r;
    }
    St = null;
  }
  return e;
}
function Ka(e, t) {
  do {
    var n = K;
    try {
      if (au(), _r.current = Gr, Xr) {
        for (var r = A.memoizedState; r !== null; ) {
          var l = r.queue;
          l !== null && (l.pending = null), r = r.next;
        }
        Xr = !1;
      }
      if (Pt = 0, Z = Y = A = null, Pn = !1, Wn = 0, xu.current = null, n === null || n.return === null) {
        X = 1, Yn = t, K = null;
        break;
      }
      e: {
        var i = e, u = n.return, o = n, s = t;
        if (t = b, o.flags |= 32768, s !== null && typeof s == "object" && typeof s.then == "function") {
          var c = s, v = o, m = v.tag;
          if (!(v.mode & 1) && (m === 0 || m === 11 || m === 15)) {
            var p = v.alternate;
            p ? (v.updateQueue = p.updateQueue, v.memoizedState = p.memoizedState, v.lanes = p.lanes) : (v.updateQueue = null, v.memoizedState = null);
          }
          var w = No(u);
          if (w !== null) {
            w.flags &= -257, Po(w, u, o, i, t), w.mode & 1 && _o(i, c, t), t = w, s = c;
            var k = t.updateQueue;
            if (k === null) {
              var S = /* @__PURE__ */ new Set();
              S.add(s), t.updateQueue = S;
            } else k.add(s);
            break e;
          } else {
            if (!(t & 1)) {
              _o(i, c, t), Pu();
              break e;
            }
            s = Error(g(426));
          }
        } else if (U && o.mode & 1) {
          var F = No(u);
          if (F !== null) {
            !(F.flags & 65536) && (F.flags |= 256), Po(F, u, o, i, t), ou(nn(s, o));
            break e;
          }
        }
        i = s = nn(s, o), X !== 4 && (X = 2), zn === null ? zn = [i] : zn.push(i), i = u;
        do {
          switch (i.tag) {
            case 3:
              i.flags |= 65536, t &= -t, i.lanes |= t;
              var f = za(i, s, t);
              wo(i, f);
              break e;
            case 1:
              o = s;
              var a = i.type, d = i.stateNode;
              if (!(i.flags & 128) && (typeof a.getDerivedStateFromError == "function" || d !== null && typeof d.componentDidCatch == "function" && (ot === null || !ot.has(d)))) {
                i.flags |= 65536, t &= -t, i.lanes |= t;
                var y = La(i, o, t);
                wo(i, y);
                break e;
              }
          }
          i = i.return;
        } while (i !== null);
      }
      Ga(n);
    } catch (E) {
      t = E, K === n && n !== null && (K = n = n.return);
      continue;
    }
    break;
  } while (!0);
}
function Ya() {
  var e = Zr.current;
  return Zr.current = Gr, e === null ? Gr : e;
}
function Pu() {
  (X === 0 || X === 3 || X === 2) && (X = 4), J === null || !(jt & 268435455) && !(fl & 268435455) || be(J, b);
}
function br(e, t) {
  var n = R;
  R |= 2;
  var r = Ya();
  (J !== e || b !== t) && ($e = null, Et(e, t));
  do
    try {
      gd();
      break;
    } catch (l) {
      Ka(e, l);
    }
  while (!0);
  if (au(), R = n, Zr.current = r, K !== null) throw Error(g(261));
  return J = null, b = 0, X;
}
function gd() {
  for (; K !== null; ) Xa(K);
}
function wd() {
  for (; K !== null && !Hc(); ) Xa(K);
}
function Xa(e) {
  var t = Ja(e.alternate, e, he);
  e.memoizedProps = e.pendingProps, t === null ? Ga(e) : K = t, xu.current = null;
}
function Ga(e) {
  var t = e;
  do {
    var n = t.alternate;
    if (e = t.return, t.flags & 32768) {
      if (n = dd(n, t), n !== null) {
        n.flags &= 32767, K = n;
        return;
      }
      if (e !== null) e.flags |= 32768, e.subtreeFlags = 0, e.deletions = null;
      else {
        X = 6, K = null;
        return;
      }
    } else if (n = fd(n, t, he), n !== null) {
      K = n;
      return;
    }
    if (t = t.sibling, t !== null) {
      K = t;
      return;
    }
    K = t = e;
  } while (t !== null);
  X === 0 && (X = 5);
}
function wt(e, t, n) {
  var r = O, l = Ee.transition;
  try {
    Ee.transition = null, O = 1, kd(e, t, n, r);
  } finally {
    Ee.transition = l, O = r;
  }
  return null;
}
function kd(e, t, n, r) {
  do
    Zt();
  while (tt !== null);
  if (R & 6) throw Error(g(327));
  n = e.finishedWork;
  var l = e.finishedLanes;
  if (n === null) return null;
  if (e.finishedWork = null, e.finishedLanes = 0, n === e.current) throw Error(g(177));
  e.callbackNode = null, e.callbackPriority = 0;
  var i = n.lanes | n.childLanes;
  if (bc(e, i), e === J && (K = J = null, b = 0), !(n.subtreeFlags & 2064) && !(n.flags & 2064) || vr || (vr = !0, qa(Mr, function() {
    return Zt(), null;
  })), i = (n.flags & 15990) !== 0, n.subtreeFlags & 15990 || i) {
    i = Ee.transition, Ee.transition = null;
    var u = O;
    O = 1;
    var o = R;
    R |= 4, xu.current = null, hd(e, n), Ha(n, e), Af(hi), Ir = !!pi, hi = pi = null, e.current = n, md(n), Wc(), R = o, O = u, Ee.transition = i;
  } else e.current = n;
  if (vr && (vr = !1, tt = e, qr = l), i = e.pendingLanes, i === 0 && (ot = null), Yc(n.stateNode), pe(e, Q()), t !== null) for (r = e.onRecoverableError, n = 0; n < t.length; n++) l = t[n], r(l.value, { componentStack: l.stack, digest: l.digest });
  if (Jr) throw Jr = !1, e = Mi, Mi = null, e;
  return qr & 1 && e.tag !== 0 && Zt(), i = e.pendingLanes, i & 1 ? e === Di ? Ln++ : (Ln = 0, Di = e) : Ln = 0, ht(), null;
}
function Zt() {
  if (tt !== null) {
    var e = zs(qr), t = Ee.transition, n = O;
    try {
      if (Ee.transition = null, O = 16 > e ? 16 : e, tt === null) var r = !1;
      else {
        if (e = tt, tt = null, qr = 0, R & 6) throw Error(g(331));
        var l = R;
        for (R |= 4, x = e.current; x !== null; ) {
          var i = x, u = i.child;
          if (x.flags & 16) {
            var o = i.deletions;
            if (o !== null) {
              for (var s = 0; s < o.length; s++) {
                var c = o[s];
                for (x = c; x !== null; ) {
                  var v = x;
                  switch (v.tag) {
                    case 0:
                    case 11:
                    case 15:
                      jn(8, v, i);
                  }
                  var m = v.child;
                  if (m !== null) m.return = v, x = m;
                  else for (; x !== null; ) {
                    v = x;
                    var p = v.sibling, w = v.return;
                    if (Aa(v), v === c) {
                      x = null;
                      break;
                    }
                    if (p !== null) {
                      p.return = w, x = p;
                      break;
                    }
                    x = w;
                  }
                }
              }
              var k = i.alternate;
              if (k !== null) {
                var S = k.child;
                if (S !== null) {
                  k.child = null;
                  do {
                    var F = S.sibling;
                    S.sibling = null, S = F;
                  } while (S !== null);
                }
              }
              x = i;
            }
          }
          if (i.subtreeFlags & 2064 && u !== null) u.return = i, x = u;
          else e: for (; x !== null; ) {
            if (i = x, i.flags & 2048) switch (i.tag) {
              case 0:
              case 11:
              case 15:
                jn(9, i, i.return);
            }
            var f = i.sibling;
            if (f !== null) {
              f.return = i.return, x = f;
              break e;
            }
            x = i.return;
          }
        }
        var a = e.current;
        for (x = a; x !== null; ) {
          u = x;
          var d = u.child;
          if (u.subtreeFlags & 2064 && d !== null) d.return = u, x = d;
          else e: for (u = a; x !== null; ) {
            if (o = x, o.flags & 2048) try {
              switch (o.tag) {
                case 0:
                case 11:
                case 15:
                  cl(9, o);
              }
            } catch (E) {
              B(o, o.return, E);
            }
            if (o === u) {
              x = null;
              break e;
            }
            var y = o.sibling;
            if (y !== null) {
              y.return = o.return, x = y;
              break e;
            }
            x = o.return;
          }
        }
        if (R = l, ht(), Fe && typeof Fe.onPostCommitFiberRoot == "function") try {
          Fe.onPostCommitFiberRoot(nl, e);
        } catch {
        }
        r = !0;
      }
      return r;
    } finally {
      O = n, Ee.transition = t;
    }
  }
  return !1;
}
function Ao(e, t, n) {
  t = nn(n, t), t = za(e, t, 1), e = ut(e, t, 1), t = ue(), e !== null && (Gn(e, 1, t), pe(e, t));
}
function B(e, t, n) {
  if (e.tag === 3) Ao(e, e, n);
  else for (; t !== null; ) {
    if (t.tag === 3) {
      Ao(t, e, n);
      break;
    } else if (t.tag === 1) {
      var r = t.stateNode;
      if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (ot === null || !ot.has(r))) {
        e = nn(n, e), e = La(t, e, 1), t = ut(t, e, 1), e = ue(), t !== null && (Gn(t, 1, e), pe(t, e));
        break;
      }
    }
    t = t.return;
  }
}
function Sd(e, t, n) {
  var r = e.pingCache;
  r !== null && r.delete(t), t = ue(), e.pingedLanes |= e.suspendedLanes & n, J === e && (b & n) === n && (X === 4 || X === 3 && (b & 130023424) === b && 500 > Q() - Cu ? Et(e, 0) : Eu |= n), pe(e, t);
}
function Za(e, t) {
  t === 0 && (e.mode & 1 ? (t = ur, ur <<= 1, !(ur & 130023424) && (ur = 4194304)) : t = 1);
  var n = ue();
  e = Ke(e, t), e !== null && (Gn(e, t, n), pe(e, n));
}
function xd(e) {
  var t = e.memoizedState, n = 0;
  t !== null && (n = t.retryLane), Za(e, n);
}
function Ed(e, t) {
  var n = 0;
  switch (e.tag) {
    case 13:
      var r = e.stateNode, l = e.memoizedState;
      l !== null && (n = l.retryLane);
      break;
    case 19:
      r = e.stateNode;
      break;
    default:
      throw Error(g(314));
  }
  r !== null && r.delete(t), Za(e, n);
}
var Ja;
Ja = function(e, t, n) {
  if (e !== null) if (e.memoizedProps !== t.pendingProps || fe.current) ce = !0;
  else {
    if (!(e.lanes & n) && !(t.flags & 128)) return ce = !1, cd(e, t, n);
    ce = !!(e.flags & 131072);
  }
  else ce = !1, U && t.flags & 1048576 && ta(t, Hr, t.index);
  switch (t.lanes = 0, t.tag) {
    case 2:
      var r = t.type;
      Pr(e, t), e = t.pendingProps;
      var l = qt(t, le.current);
      Gt(t, n), l = yu(null, t, r, e, l, n);
      var i = gu();
      return t.flags |= 1, typeof l == "object" && l !== null && typeof l.render == "function" && l.$$typeof === void 0 ? (t.tag = 1, t.memoizedState = null, t.updateQueue = null, de(r) ? (i = !0, Vr(t)) : i = !1, t.memoizedState = l.state !== null && l.state !== void 0 ? l.state : null, du(t), l.updater = al, t.stateNode = l, l._reactInternals = t, Ei(t, r, e, n), t = Ni(null, t, r, !0, i, n)) : (t.tag = 0, U && i && iu(t), ie(null, t, l, n), t = t.child), t;
    case 16:
      r = t.elementType;
      e: {
        switch (Pr(e, t), e = t.pendingProps, l = r._init, r = l(r._payload), t.type = r, l = t.tag = _d(r), e = je(r, e), l) {
          case 0:
            t = _i(null, t, r, e, n);
            break e;
          case 1:
            t = Lo(null, t, r, e, n);
            break e;
          case 11:
            t = jo(null, t, r, e, n);
            break e;
          case 14:
            t = zo(null, t, r, je(r.type, e), n);
            break e;
        }
        throw Error(g(
          306,
          r,
          ""
        ));
      }
      return t;
    case 0:
      return r = t.type, l = t.pendingProps, l = t.elementType === r ? l : je(r, l), _i(e, t, r, l, n);
    case 1:
      return r = t.type, l = t.pendingProps, l = t.elementType === r ? l : je(r, l), Lo(e, t, r, l, n);
    case 3:
      e: {
        if (Ma(t), e === null) throw Error(g(387));
        r = t.pendingProps, i = t.memoizedState, l = i.element, oa(e, t), Kr(t, r, null, n);
        var u = t.memoizedState;
        if (r = u.element, i.isDehydrated) if (i = { element: r, isDehydrated: !1, cache: u.cache, pendingSuspenseBoundaries: u.pendingSuspenseBoundaries, transitions: u.transitions }, t.updateQueue.baseState = i, t.memoizedState = i, t.flags & 256) {
          l = nn(Error(g(423)), t), t = To(e, t, r, n, l);
          break e;
        } else if (r !== l) {
          l = nn(Error(g(424)), t), t = To(e, t, r, n, l);
          break e;
        } else for (me = it(t.stateNode.containerInfo.firstChild), ve = t, U = !0, Le = null, n = ia(t, null, r, n), t.child = n; n; ) n.flags = n.flags & -3 | 4096, n = n.sibling;
        else {
          if (bt(), r === l) {
            t = Ye(e, t, n);
            break e;
          }
          ie(e, t, r, n);
        }
        t = t.child;
      }
      return t;
    case 5:
      return sa(t), e === null && ki(t), r = t.type, l = t.pendingProps, i = e !== null ? e.memoizedProps : null, u = l.children, mi(r, l) ? u = null : i !== null && mi(r, i) && (t.flags |= 32), Oa(e, t), ie(e, t, u, n), t.child;
    case 6:
      return e === null && ki(t), null;
    case 13:
      return Da(e, t, n);
    case 4:
      return pu(t, t.stateNode.containerInfo), r = t.pendingProps, e === null ? t.child = en(t, null, r, n) : ie(e, t, r, n), t.child;
    case 11:
      return r = t.type, l = t.pendingProps, l = t.elementType === r ? l : je(r, l), jo(e, t, r, l, n);
    case 7:
      return ie(e, t, t.pendingProps, n), t.child;
    case 8:
      return ie(e, t, t.pendingProps.children, n), t.child;
    case 12:
      return ie(e, t, t.pendingProps.children, n), t.child;
    case 10:
      e: {
        if (r = t.type._context, l = t.pendingProps, i = t.memoizedProps, u = l.value, M(Wr, r._currentValue), r._currentValue = u, i !== null) if (Oe(i.value, u)) {
          if (i.children === l.children && !fe.current) {
            t = Ye(e, t, n);
            break e;
          }
        } else for (i = t.child, i !== null && (i.return = t); i !== null; ) {
          var o = i.dependencies;
          if (o !== null) {
            u = i.child;
            for (var s = o.firstContext; s !== null; ) {
              if (s.context === r) {
                if (i.tag === 1) {
                  s = He(-1, n & -n), s.tag = 2;
                  var c = i.updateQueue;
                  if (c !== null) {
                    c = c.shared;
                    var v = c.pending;
                    v === null ? s.next = s : (s.next = v.next, v.next = s), c.pending = s;
                  }
                }
                i.lanes |= n, s = i.alternate, s !== null && (s.lanes |= n), Si(
                  i.return,
                  n,
                  t
                ), o.lanes |= n;
                break;
              }
              s = s.next;
            }
          } else if (i.tag === 10) u = i.type === t.type ? null : i.child;
          else if (i.tag === 18) {
            if (u = i.return, u === null) throw Error(g(341));
            u.lanes |= n, o = u.alternate, o !== null && (o.lanes |= n), Si(u, n, t), u = i.sibling;
          } else u = i.child;
          if (u !== null) u.return = i;
          else for (u = i; u !== null; ) {
            if (u === t) {
              u = null;
              break;
            }
            if (i = u.sibling, i !== null) {
              i.return = u.return, u = i;
              break;
            }
            u = u.return;
          }
          i = u;
        }
        ie(e, t, l.children, n), t = t.child;
      }
      return t;
    case 9:
      return l = t.type, r = t.pendingProps.children, Gt(t, n), l = Ce(l), r = r(l), t.flags |= 1, ie(e, t, r, n), t.child;
    case 14:
      return r = t.type, l = je(r, t.pendingProps), l = je(r.type, l), zo(e, t, r, l, n);
    case 15:
      return Ta(e, t, t.type, t.pendingProps, n);
    case 17:
      return r = t.type, l = t.pendingProps, l = t.elementType === r ? l : je(r, l), Pr(e, t), t.tag = 1, de(r) ? (e = !0, Vr(t)) : e = !1, Gt(t, n), ja(t, r, l), Ei(t, r, l, n), Ni(null, t, r, !0, e, n);
    case 19:
      return Ia(e, t, n);
    case 22:
      return Ra(e, t, n);
  }
  throw Error(g(156, t.tag));
};
function qa(e, t) {
  return _s(e, t);
}
function Cd(e, t, n, r) {
  this.tag = e, this.key = n, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
}
function xe(e, t, n, r) {
  return new Cd(e, t, n, r);
}
function ju(e) {
  return e = e.prototype, !(!e || !e.isReactComponent);
}
function _d(e) {
  if (typeof e == "function") return ju(e) ? 1 : 0;
  if (e != null) {
    if (e = e.$$typeof, e === Yi) return 11;
    if (e === Xi) return 14;
  }
  return 2;
}
function at(e, t) {
  var n = e.alternate;
  return n === null ? (n = xe(e.tag, t, e.key, e.mode), n.elementType = e.elementType, n.type = e.type, n.stateNode = e.stateNode, n.alternate = e, e.alternate = n) : (n.pendingProps = t, n.type = e.type, n.flags = 0, n.subtreeFlags = 0, n.deletions = null), n.flags = e.flags & 14680064, n.childLanes = e.childLanes, n.lanes = e.lanes, n.child = e.child, n.memoizedProps = e.memoizedProps, n.memoizedState = e.memoizedState, n.updateQueue = e.updateQueue, t = e.dependencies, n.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, n.sibling = e.sibling, n.index = e.index, n.ref = e.ref, n;
}
function Lr(e, t, n, r, l, i) {
  var u = 2;
  if (r = e, typeof e == "function") ju(e) && (u = 1);
  else if (typeof e == "string") u = 5;
  else e: switch (e) {
    case Mt:
      return Ct(n.children, l, i, t);
    case Ki:
      u = 8, l |= 8;
      break;
    case Yl:
      return e = xe(12, n, t, l | 2), e.elementType = Yl, e.lanes = i, e;
    case Xl:
      return e = xe(13, n, t, l), e.elementType = Xl, e.lanes = i, e;
    case Gl:
      return e = xe(19, n, t, l), e.elementType = Gl, e.lanes = i, e;
    case ss:
      return dl(n, l, i, t);
    default:
      if (typeof e == "object" && e !== null) switch (e.$$typeof) {
        case us:
          u = 10;
          break e;
        case os:
          u = 9;
          break e;
        case Yi:
          u = 11;
          break e;
        case Xi:
          u = 14;
          break e;
        case Ze:
          u = 16, r = null;
          break e;
      }
      throw Error(g(130, e == null ? e : typeof e, ""));
  }
  return t = xe(u, n, t, l), t.elementType = e, t.type = r, t.lanes = i, t;
}
function Ct(e, t, n, r) {
  return e = xe(7, e, r, t), e.lanes = n, e;
}
function dl(e, t, n, r) {
  return e = xe(22, e, r, t), e.elementType = ss, e.lanes = n, e.stateNode = { isHidden: !1 }, e;
}
function Wl(e, t, n) {
  return e = xe(6, e, null, t), e.lanes = n, e;
}
function Ql(e, t, n) {
  return t = xe(4, e.children !== null ? e.children : [], e.key, t), t.lanes = n, t.stateNode = { containerInfo: e.containerInfo, pendingChildren: null, implementation: e.implementation }, t;
}
function Nd(e, t, n, r, l) {
  this.tag = t, this.containerInfo = e, this.finishedWork = this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.pendingContext = this.context = null, this.callbackPriority = 0, this.eventTimes = _l(0), this.expirationTimes = _l(-1), this.entangledLanes = this.finishedLanes = this.mutableReadLanes = this.expiredLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = _l(0), this.identifierPrefix = r, this.onRecoverableError = l, this.mutableSourceEagerHydrationData = null;
}
function zu(e, t, n, r, l, i, u, o, s) {
  return e = new Nd(e, t, n, o, s), t === 1 ? (t = 1, i === !0 && (t |= 8)) : t = 0, i = xe(3, null, null, t), e.current = i, i.stateNode = e, i.memoizedState = { element: r, isDehydrated: n, cache: null, transitions: null, pendingSuspenseBoundaries: null }, du(i), e;
}
function Pd(e, t, n) {
  var r = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
  return { $$typeof: Ot, key: r == null ? null : "" + r, children: e, containerInfo: t, implementation: n };
}
function ba(e) {
  if (!e) return ft;
  e = e._reactInternals;
  e: {
    if (Tt(e) !== e || e.tag !== 1) throw Error(g(170));
    var t = e;
    do {
      switch (t.tag) {
        case 3:
          t = t.stateNode.context;
          break e;
        case 1:
          if (de(t.type)) {
            t = t.stateNode.__reactInternalMemoizedMergedChildContext;
            break e;
          }
      }
      t = t.return;
    } while (t !== null);
    throw Error(g(171));
  }
  if (e.tag === 1) {
    var n = e.type;
    if (de(n)) return bs(e, n, t);
  }
  return t;
}
function ec(e, t, n, r, l, i, u, o, s) {
  return e = zu(n, r, !0, e, l, i, u, o, s), e.context = ba(null), n = e.current, r = ue(), l = st(n), i = He(r, l), i.callback = t ?? null, ut(n, i, l), e.current.lanes = l, Gn(e, l, r), pe(e, r), e;
}
function pl(e, t, n, r) {
  var l = t.current, i = ue(), u = st(l);
  return n = ba(n), t.context === null ? t.context = n : t.pendingContext = n, t = He(i, u), t.payload = { element: e }, r = r === void 0 ? null : r, r !== null && (t.callback = r), e = ut(l, t, u), e !== null && (Re(e, l, u, i), Cr(e, l, u)), u;
}
function el(e) {
  if (e = e.current, !e.child) return null;
  switch (e.child.tag) {
    case 5:
      return e.child.stateNode;
    default:
      return e.child.stateNode;
  }
}
function Vo(e, t) {
  if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
    var n = e.retryLane;
    e.retryLane = n !== 0 && n < t ? n : t;
  }
}
function Lu(e, t) {
  Vo(e, t), (e = e.alternate) && Vo(e, t);
}
function jd() {
  return null;
}
var tc = typeof reportError == "function" ? reportError : function(e) {
  console.error(e);
};
function Tu(e) {
  this._internalRoot = e;
}
hl.prototype.render = Tu.prototype.render = function(e) {
  var t = this._internalRoot;
  if (t === null) throw Error(g(409));
  pl(e, t, null, null);
};
hl.prototype.unmount = Tu.prototype.unmount = function() {
  var e = this._internalRoot;
  if (e !== null) {
    this._internalRoot = null;
    var t = e.containerInfo;
    zt(function() {
      pl(null, e, null, null);
    }), t[Qe] = null;
  }
};
function hl(e) {
  this._internalRoot = e;
}
hl.prototype.unstable_scheduleHydration = function(e) {
  if (e) {
    var t = Rs();
    e = { blockedOn: null, target: e, priority: t };
    for (var n = 0; n < qe.length && t !== 0 && t < qe[n].priority; n++) ;
    qe.splice(n, 0, e), n === 0 && Ms(e);
  }
};
function Ru(e) {
  return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
}
function ml(e) {
  return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11 && (e.nodeType !== 8 || e.nodeValue !== " react-mount-point-unstable "));
}
function Bo() {
}
function zd(e, t, n, r, l) {
  if (l) {
    if (typeof r == "function") {
      var i = r;
      r = function() {
        var c = el(u);
        i.call(c);
      };
    }
    var u = ec(t, r, e, 0, null, !1, !1, "", Bo);
    return e._reactRootContainer = u, e[Qe] = u.current, $n(e.nodeType === 8 ? e.parentNode : e), zt(), u;
  }
  for (; l = e.lastChild; ) e.removeChild(l);
  if (typeof r == "function") {
    var o = r;
    r = function() {
      var c = el(s);
      o.call(c);
    };
  }
  var s = zu(e, 0, !1, null, null, !1, !1, "", Bo);
  return e._reactRootContainer = s, e[Qe] = s.current, $n(e.nodeType === 8 ? e.parentNode : e), zt(function() {
    pl(t, s, n, r);
  }), s;
}
function vl(e, t, n, r, l) {
  var i = n._reactRootContainer;
  if (i) {
    var u = i;
    if (typeof l == "function") {
      var o = l;
      l = function() {
        var s = el(u);
        o.call(s);
      };
    }
    pl(t, u, e, l);
  } else u = zd(n, t, e, l, r);
  return el(u);
}
Ls = function(e) {
  switch (e.tag) {
    case 3:
      var t = e.stateNode;
      if (t.current.memoizedState.isDehydrated) {
        var n = kn(t.pendingLanes);
        n !== 0 && (Ji(t, n | 1), pe(t, Q()), !(R & 6) && (rn = Q() + 500, ht()));
      }
      break;
    case 13:
      zt(function() {
        var r = Ke(e, 1);
        if (r !== null) {
          var l = ue();
          Re(r, e, 1, l);
        }
      }), Lu(e, 1);
  }
};
qi = function(e) {
  if (e.tag === 13) {
    var t = Ke(e, 134217728);
    if (t !== null) {
      var n = ue();
      Re(t, e, 134217728, n);
    }
    Lu(e, 134217728);
  }
};
Ts = function(e) {
  if (e.tag === 13) {
    var t = st(e), n = Ke(e, t);
    if (n !== null) {
      var r = ue();
      Re(n, e, t, r);
    }
    Lu(e, t);
  }
};
Rs = function() {
  return O;
};
Os = function(e, t) {
  var n = O;
  try {
    return O = e, t();
  } finally {
    O = n;
  }
};
ii = function(e, t, n) {
  switch (t) {
    case "input":
      if (ql(e, n), t = n.name, n.type === "radio" && t != null) {
        for (n = e; n.parentNode; ) n = n.parentNode;
        for (n = n.querySelectorAll("input[name=" + JSON.stringify("" + t) + '][type="radio"]'), t = 0; t < n.length; t++) {
          var r = n[t];
          if (r !== e && r.form === e.form) {
            var l = ul(r);
            if (!l) throw Error(g(90));
            cs(r), ql(r, l);
          }
        }
      }
      break;
    case "textarea":
      ds(e, n);
      break;
    case "select":
      t = n.value, t != null && Qt(e, !!n.multiple, t, !1);
  }
};
ws = _u;
ks = zt;
var Ld = { usingClientEntryPoint: !1, Events: [Jn, Ut, ul, ys, gs, _u] }, yn = { findFiberByHostInstance: kt, bundleType: 0, version: "18.3.1", rendererPackageName: "react-dom" }, Td = { bundleType: yn.bundleType, version: yn.version, rendererPackageName: yn.rendererPackageName, rendererConfig: yn.rendererConfig, overrideHookState: null, overrideHookStateDeletePath: null, overrideHookStateRenamePath: null, overrideProps: null, overridePropsDeletePath: null, overridePropsRenamePath: null, setErrorHandler: null, setSuspenseHandler: null, scheduleUpdate: null, currentDispatcherRef: Xe.ReactCurrentDispatcher, findHostInstanceByFiber: function(e) {
  return e = Es(e), e === null ? null : e.stateNode;
}, findFiberByHostInstance: yn.findFiberByHostInstance || jd, findHostInstancesForRefresh: null, scheduleRefresh: null, scheduleRoot: null, setRefreshHandler: null, getCurrentFiber: null, reconcilerVersion: "18.3.1-next-f1338f8080-20240426" };
if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
  var yr = __REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!yr.isDisabled && yr.supportsFiber) try {
    nl = yr.inject(Td), Fe = yr;
  } catch {
  }
}
ge.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = Ld;
ge.createPortal = function(e, t) {
  var n = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
  if (!Ru(t)) throw Error(g(200));
  return Pd(e, t, null, n);
};
ge.createRoot = function(e, t) {
  if (!Ru(e)) throw Error(g(299));
  var n = !1, r = "", l = tc;
  return t != null && (t.unstable_strictMode === !0 && (n = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onRecoverableError !== void 0 && (l = t.onRecoverableError)), t = zu(e, 1, !1, null, null, n, !1, r, l), e[Qe] = t.current, $n(e.nodeType === 8 ? e.parentNode : e), new Tu(t);
};
ge.findDOMNode = function(e) {
  if (e == null) return null;
  if (e.nodeType === 1) return e;
  var t = e._reactInternals;
  if (t === void 0)
    throw typeof e.render == "function" ? Error(g(188)) : (e = Object.keys(e).join(","), Error(g(268, e)));
  return e = Es(t), e = e === null ? null : e.stateNode, e;
};
ge.flushSync = function(e) {
  return zt(e);
};
ge.hydrate = function(e, t, n) {
  if (!ml(t)) throw Error(g(200));
  return vl(null, e, t, !0, n);
};
ge.hydrateRoot = function(e, t, n) {
  if (!Ru(e)) throw Error(g(405));
  var r = n != null && n.hydratedSources || null, l = !1, i = "", u = tc;
  if (n != null && (n.unstable_strictMode === !0 && (l = !0), n.identifierPrefix !== void 0 && (i = n.identifierPrefix), n.onRecoverableError !== void 0 && (u = n.onRecoverableError)), t = ec(t, null, e, 1, n ?? null, l, !1, i, u), e[Qe] = t.current, $n(e), r) for (e = 0; e < r.length; e++) n = r[e], l = n._getVersion, l = l(n._source), t.mutableSourceEagerHydrationData == null ? t.mutableSourceEagerHydrationData = [n, l] : t.mutableSourceEagerHydrationData.push(
    n,
    l
  );
  return new hl(t);
};
ge.render = function(e, t, n) {
  if (!ml(t)) throw Error(g(200));
  return vl(null, e, t, !1, n);
};
ge.unmountComponentAtNode = function(e) {
  if (!ml(e)) throw Error(g(40));
  return e._reactRootContainer ? (zt(function() {
    vl(null, null, e, !1, function() {
      e._reactRootContainer = null, e[Qe] = null;
    });
  }), !0) : !1;
};
ge.unstable_batchedUpdates = _u;
ge.unstable_renderSubtreeIntoContainer = function(e, t, n, r) {
  if (!ml(n)) throw Error(g(200));
  if (e == null || e._reactInternals === void 0) throw Error(g(38));
  return vl(e, t, n, !1, r);
};
ge.version = "18.3.1-next-f1338f8080-20240426";
function nc() {
  if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
    try {
      __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(nc);
    } catch (e) {
      console.error(e);
    }
}
nc(), ns.exports = ge;
var Rd = ns.exports, rc, Ho = Rd;
rc = Ho.createRoot, Ho.hydrateRoot;
const gr = "/site/hp-story-preview/";
function Od() {
  const [e, t] = Bi.useState(!1);
  return /* @__PURE__ */ h.jsxs("section", { className: "hp-story hp-origin hp-section hp-shell", id: "origin", "aria-labelledby": "origin-title", children: [
    /* @__PURE__ */ h.jsx("p", { className: "hp-origin-kicker", children: "Origin｜縦糸♾️横糸が生まれた理由" }),
    /* @__PURE__ */ h.jsxs("h2", { id: "origin-title", children: [
      "家族でも知らない、",
      /* @__PURE__ */ h.jsx("br", { className: "hp-origin-heading-break" }),
      "人生がある。"
    ] }),
    /* @__PURE__ */ h.jsxs("div", { className: "hp-origin-brief", children: [
      /* @__PURE__ */ h.jsx("p", { children: "18年間、約1,000世帯の方々の人生に関わってきました。" }),
      /* @__PURE__ */ h.jsxs("p", { children: [
        "その中で感じたのは、誰の人生にも、",
        /* @__PURE__ */ h.jsx("br", {}),
        "家族さえ知らない物語や想いがあるということです。",
        /* @__PURE__ */ h.jsx("br", {}),
        "けれど、その多くは、語られないまま失われていきます。"
      ] }),
      /* @__PURE__ */ h.jsxs("p", { children: [
        "私自身、祖父が用意した「家族史」を見つけたとき、",
        /* @__PURE__ */ h.jsx("br", {}),
        "胸を突かれる思いがしました。"
      ] }),
      /* @__PURE__ */ h.jsxs("p", { children: [
        "最初のページには家紋が貼られていましたが、",
        /* @__PURE__ */ h.jsx("br", {}),
        "その先は全て白紙のままだったのです。"
      ] })
    ] }),
    /* @__PURE__ */ h.jsxs("div", { className: "hp-origin-photo-stack", children: [
      /* @__PURE__ */ h.jsx("figure", { className: "hp-origin-cover", children: /* @__PURE__ */ h.jsx("img", { src: gr + "family-history-spine-20261022.jpeg", alt: "祖父が用意した「わが家の歴史」の冊子と背表紙", width: "5712", height: "4284", loading: "lazy" }) }),
      /* @__PURE__ */ h.jsx("figure", { className: "hp-origin-book", children: /* @__PURE__ */ h.jsx("img", { src: gr + "origin-family-history-preview-20261021.jpg", alt: "家紋が貼られたページと、白紙のままの家系図のページ", width: "1052", height: "746", loading: "lazy" }) })
    ] }),
    /* @__PURE__ */ h.jsxs("div", { className: "hp-origin-closing", children: [
      /* @__PURE__ */ h.jsxs("p", { children: [
        "祖父は、どんな想いでこの冊子を用意したのか。",
        /* @__PURE__ */ h.jsx("br", {}),
        "何を残したかったのか。"
      ] }),
      /* @__PURE__ */ h.jsxs("p", { children: [
        "今なら聞いてみたいことが、たくさんあります。",
        /* @__PURE__ */ h.jsx("br", {}),
        "でも、もう聞くことはできません。"
      ] })
    ] }),
    /* @__PURE__ */ h.jsx("button", { className: "hp-origin-toggle", type: "button", "aria-expanded": e, "aria-controls": "origin-full-story", onClick: () => t(!e), children: e ? "− 実話を閉じる" : "＋ 縦糸♾️横糸が生まれた２つの実話を読む" }),
    /* @__PURE__ */ h.jsxs("div", { id: "origin-full-story", hidden: !e, children: [
      /* @__PURE__ */ h.jsxs("div", { className: "hp-origin-scene hp-origin-client", children: [
        /* @__PURE__ */ h.jsx("h3", { children: "01　家族に届いた、12年前の言葉" }),
        /* @__PURE__ */ h.jsxs("p", { children: [
          "私が初めて死亡保険金をお支払いしたのは、",
          /* @__PURE__ */ h.jsx("br", {}),
          "当時の私と同じ、37歳の男性でした。"
        ] }),
        /* @__PURE__ */ h.jsxs("p", { children: [
          "持病もなく、いつもの通勤電車で突然具合が悪くなり、",
          /* @__PURE__ */ h.jsx("br", {}),
          "病院へ運ばれ、数日後にこの世を去りました。"
        ] }),
        /* @__PURE__ */ h.jsxs("p", { children: [
          "九州から駆けつけたご両親とお姉さまは、",
          /* @__PURE__ */ h.jsx("br", {}),
          "深い悲しみと戸惑いの中にいらっしゃいました。"
        ] }),
        /* @__PURE__ */ h.jsx("p", { children: "そんなご家族に、私ができたことが一つ。" }),
        /* @__PURE__ */ h.jsxs("p", { children: [
          "それは、12年前、彼が25歳のときの面談で聞いた、",
          /* @__PURE__ */ h.jsx("br", {}),
          "家族への想いや、今の自分のこと、将来への希望。"
        ] }),
        /* @__PURE__ */ h.jsx("p", { children: "それらを記したメモを、お渡しすることでした。" }),
        /* @__PURE__ */ h.jsx("p", { children: "決して十分なものではありません。" }),
        /* @__PURE__ */ h.jsx("p", { children: "それでも、ご両親から、こんな言葉をいただきました。" }),
        /* @__PURE__ */ h.jsxs("blockquote", { children: [
          "東京に出てから、あまり話もできていなかった。",
          /* @__PURE__ */ h.jsx("br", {}),
          "息子を誇りに思う。"
        ] }),
        /* @__PURE__ */ h.jsx("p", { children: "その言葉を、今も忘れることができません。" })
      ] }),
      /* @__PURE__ */ h.jsxs("div", { className: "hp-origin-scene hp-origin-scene-grandparents", children: [
        /* @__PURE__ */ h.jsx("h3", { children: "02　聞けなかったこと。まだ聞けること。" }),
        /* @__PURE__ */ h.jsxs("div", { className: "hp-origin-grandparents-layout", children: [
          /* @__PURE__ */ h.jsx("figure", { className: "hp-origin-grandparents-photo", children: /* @__PURE__ */ h.jsx("img", { src: gr + "grandparents.jpg", alt: "創業者の祖父母の写真", width: "1102", height: "713", loading: "lazy" }) }),
          /* @__PURE__ */ h.jsxs("div", { className: "hp-origin-grandparents-copy", children: [
            /* @__PURE__ */ h.jsxs("p", { children: [
              "多くの方々の人生に触れてきた私自身、",
              /* @__PURE__ */ h.jsx("br", {}),
              "身近な祖父母の人生については、",
              /* @__PURE__ */ h.jsx("br", {}),
              "驚くほど何も聞けていませんでした。"
            ] }),
            /* @__PURE__ */ h.jsxs("p", { children: [
              "あの「わが家の歴史」には、",
              /* @__PURE__ */ h.jsx("br", {}),
              "どんな物語が綴られるはずだったのだろう。"
            ] }),
            /* @__PURE__ */ h.jsx("p", { children: "今となっては、想像することしかできません。" }),
            /* @__PURE__ */ h.jsx("p", { children: "そして、思いました。" }),
            /* @__PURE__ */ h.jsxs("p", { children: [
              "まだ話を聞ける両親についても、",
              /* @__PURE__ */ h.jsx("br", {}),
              "いつか同じ後悔をするのではないか、と。"
            ] })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ h.jsxs("div", { className: "hp-origin-vision", children: [
      /* @__PURE__ */ h.jsx("p", { className: "hp-origin-vision-label", children: "創業者の想い" }),
      /* @__PURE__ */ h.jsx("h3", { children: "家族に還れる場所をつくる" }),
      /* @__PURE__ */ h.jsxs("div", { className: "hp-origin-vision-layout", children: [
        /* @__PURE__ */ h.jsxs("div", { className: "hp-origin-vision-copy", children: [
          /* @__PURE__ */ h.jsxs("p", { children: [
            "特別な人だけが、自伝を書くのではなく。",
            /* @__PURE__ */ h.jsx("br", {}),
            "成功した人生だけを、きれいな物語にするのでもなく。"
          ] }),
          /* @__PURE__ */ h.jsx("p", { className: "hp-origin-vision-pledge", children: "誰もが、自分の人生を気軽に残せないか。" }),
          /* @__PURE__ */ h.jsxs("p", { children: [
            "語ることで、自分の人生をもう一度辿り、",
            /* @__PURE__ */ h.jsx("br", {}),
            "忙しい日々に埋もれていた、大切なものに気づく。"
          ] }),
          /* @__PURE__ */ h.jsxs("p", { children: [
            "そして、家族が受け取りたいと思ったときには、",
            /* @__PURE__ */ h.jsx("br", {}),
            "時を越えて、その人らしさに触れられる場所として。"
          ] }),
          /* @__PURE__ */ h.jsxs("p", { children: [
            "そんな願いを、",
            /* @__PURE__ */ h.jsx("br", { className: "hp-origin-mobile-break" }),
            "「縦糸♾️横糸」に込めています。"
          ] })
        ] }),
        /* @__PURE__ */ h.jsxs("div", { className: "hp-origin-vision-person", children: [
          /* @__PURE__ */ h.jsx("figure", { children: /* @__PURE__ */ h.jsx("img", { src: gr + "founder-and-son-landscape-20261022.png", alt: "創業者・菅原英俊と息子", width: "1402", height: "1122", loading: "lazy" }) }),
          /* @__PURE__ */ h.jsxs("p", { children: [
            /* @__PURE__ */ h.jsx("span", { children: "株式会社SaltLight" }),
            /* @__PURE__ */ h.jsx("span", { children: "代表取締役" }),
            /* @__PURE__ */ h.jsx("strong", { children: "菅原 英俊" })
          ] })
        ] })
      ] })
    ] })
  ] });
}
const Md = "/?app=1&entry=trial", Dd = "/?app=1&entry=login", Id = [
  ["無料3問の後、勝手に課金されますか？", "自動課金はありません。無料の3問にカード登録は不要です。続けたいと思ったときに、ご自身で購入を選べます。"],
  ["完成までどのくらいかかりますか？", "語る量やペースによって異なります。1〜3ヶ月を目安に、ゆっくりなら最長1年間取り組めます。製本・発送の時期は、内容が確定してからご案内します。"],
  ["途中で休んでも大丈夫ですか？", "一度に語り終える必要はありません。無理のないペースで進められます。利用期間などの条件は、お申し込み時の案内をご確認ください。"],
  ["スマートフォンが苦手でも使えますか？", "問いを読み、録音ボタンを押して話すところから始められます。写真や文章の整理、本に仕上げる作業は、信頼する方に手伝ってもらうこともできます。"],
  ["家族が制作を手伝えますか？", "ご本人の同意のもと、一緒に思い出を辿り、制作を手伝えます。信頼する方をサポーターとして招く方法もあります。ご本人のアカウントがない場合の始め方は、現在ご案内を準備しています。"],
  ["語った内容は誰に見えますか？", "完成した物語を家族に見せる範囲は、自分たちで選べます。本づくりを手伝うサポーターは、制作に必要な語りや写真などを扱います。完成した物語を見る家族とは役割が異なります。"],
  ["家族へのギフトはどう進めますか？", "現在の「家族に3問を贈る」はログイン画面へ進みます。ギフトの開始方法と受け取る方の手順は、正式公開前にご案内します。"],
  ["ギフトの返金保証はありますか？", "ギフト購入には、決済日から45日以内かつ本編開始前までの返金保証があります。適用条件は、お申し込み前にご確認ください。"]
];
function Fd() {
  const e = [...document.querySelectorAll(".hp-footer button")].find((t) => t.textContent.trim() === "プライバシー");
  e == null || e.click();
}
function Ud() {
  return /* @__PURE__ */ h.jsxs(h.Fragment, { children: [
    /* @__PURE__ */ h.jsx(Od, {}),
    /* @__PURE__ */ h.jsxs("section", { className: "hp-trust hp-section hp-shell", id: "trust", "aria-labelledby": "trust-title", children: [
      /* @__PURE__ */ h.jsxs("h2", { id: "trust-title", children: [
        "大切な人生を、",
        /* @__PURE__ */ h.jsx("br", { className: "hp-mobile-break" }),
        "お預かりするから。"
      ] }),
      /* @__PURE__ */ h.jsxs("div", { className: "hp-trust-grid", children: [
        /* @__PURE__ */ h.jsxs("article", { children: [
          /* @__PURE__ */ h.jsx("h3", { children: "公開範囲" }),
          /* @__PURE__ */ h.jsx("p", { children: "誰に見せるかは、自分で選べます。" })
        ] }),
        /* @__PURE__ */ h.jsxs("article", { children: [
          /* @__PURE__ */ h.jsx("h3", { children: "プライバシー" }),
          /* @__PURE__ */ h.jsx("p", { children: "語った内容や写真、音声を大切に扱います。" })
        ] }),
        /* @__PURE__ */ h.jsxs("article", { children: [
          /* @__PURE__ */ h.jsx("h3", { children: "家族のサポート" }),
          /* @__PURE__ */ h.jsx("p", { children: "必要に応じて、家族と一緒に進められます。" })
        ] })
      ] }),
      /* @__PURE__ */ h.jsxs("button", { type: "button", className: "hp-text-link", onClick: Fd, children: [
        "プライバシーとデータの取り扱いについて ",
        /* @__PURE__ */ h.jsx("span", { "aria-hidden": "true", children: "→" })
      ] })
    ] }),
    /* @__PURE__ */ h.jsxs("section", { className: "hp-faq hp-section hp-shell", id: "faq", "aria-labelledby": "faq-title", children: [
      /* @__PURE__ */ h.jsx("p", { className: "hp-label", children: "始める前に、気になること。" }),
      /* @__PURE__ */ h.jsx("h2", { id: "faq-title", children: "よくあるご質問" }),
      /* @__PURE__ */ h.jsx("div", { children: Id.map(([e, t]) => /* @__PURE__ */ h.jsxs("details", { children: [
        /* @__PURE__ */ h.jsxs("summary", { children: [
          e,
          /* @__PURE__ */ h.jsx("span", { "aria-hidden": "true", children: "＋" })
        ] }),
        /* @__PURE__ */ h.jsx("p", { children: t })
      ] }, e)) })
    ] }),
    /* @__PURE__ */ h.jsx("section", { className: "hp-final hp-dark hp-section", "aria-labelledby": "final-title", children: /* @__PURE__ */ h.jsxs("div", { className: "hp-shell", children: [
      /* @__PURE__ */ h.jsx("h2", { id: "final-title", children: "まずは、3問。" }),
      /* @__PURE__ */ h.jsxs("p", { children: [
        "人生を語るって、どんな感じだろう。",
        /* @__PURE__ */ h.jsx("br", {}),
        "声で気軽に試してみてください。"
      ] }),
      /* @__PURE__ */ h.jsxs("div", { className: "hp-final-actions", children: [
        /* @__PURE__ */ h.jsxs("a", { className: "hp-button", href: Md, children: [
          "3問を試してみる ",
          /* @__PURE__ */ h.jsx("span", { "aria-hidden": "true", children: "→" })
        ] }),
        /* @__PURE__ */ h.jsxs("a", { className: "hp-button hp-final-gift", href: Dd, children: [
          "家族に3問を贈る ",
          /* @__PURE__ */ h.jsx("span", { "aria-hidden": "true", children: "→" })
        ] })
      ] }),
      /* @__PURE__ */ h.jsx("p", { className: "hp-note", children: "カード登録不要・自動課金なし" })
    ] }) })
  ] });
}
const $d = "hp-postcta-live-mount";
let yt, Wo;
function lc() {
  const e = document.getElementById("hp-main"), t = document.getElementById("hp-price-live-mount");
  if (!e || !t || t.parentElement !== e) return;
  yt || (yt = document.createElement("div"), yt.id = $d, Wo = rc(yt), Wo.render(/* @__PURE__ */ h.jsx(Ud, {}))), yt.previousElementSibling !== t && t.after(yt);
  for (let r = yt.nextElementSibling; r; r = r.nextElementSibling) {
    if (r.matches("dialog.hp-product-zoom")) {
      r.classList.remove("hp-postcta-legacy"), r.removeAttribute("aria-hidden"), r.inert = !1;
      continue;
    }
    r.classList.contains("hp-postcta-legacy") || (r.classList.add("hp-postcta-legacy"), r.setAttribute("aria-hidden", "true"), r.inert = !0);
  }
  const n = document.querySelector(".hp-footer > div");
  if (n && !n.querySelector("a[href='/life/']")) {
    const r = document.createElement("a");
    r.href = "/life/", r.textContent = "縦糸横糸ライフ", n.prepend(r);
  }
}
lc();
new MutationObserver(lc).observe(document.getElementById("root") || document.body, {
  childList: !0,
  subtree: !0
});
