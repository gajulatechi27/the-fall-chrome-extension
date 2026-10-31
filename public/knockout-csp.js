// Cesium's bundled Knockout 3.5.1 probes the global object with (0, eval)("this").
// Manifest V3 correctly blocks eval. Replace only that harmless global-object probe;
// all other string evaluation remains explicitly blocked.
(function () {
  const safeEval = function (source) {
    if (source === "this") return window;
    throw new EvalError("Dynamic JavaScript evaluation is disabled by THE FALL's CSP.");
  };
  Object.defineProperty(window, "eval", {
    value: safeEval,
    writable: false,
    configurable: false
  });
})();
