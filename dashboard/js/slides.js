// Crossfading photo slideshow. Old Android WebView safe: two absolutely
// positioned layers with background-size: cover, opacity transitions, and one
// image preloaded ahead.
//
// Robustness: the timer is a self-rescheduling setTimeout owned by this object
// (re-renders and data refreshes never reset it), a slow or failed image load
// cannot stall the rotation (8 s load timeout), a watchdog restarts a stalled
// loop, and the start index is random so a page reload doesn't always show the
// same first photo.
export function createSlides(host, opts) {
  opts = opts || {};
  var ms = opts.interval || 15000;
  host.innerHTML = '<div class="sl-layer"></div><div class="sl-layer"></div>';
  var layers = host.querySelectorAll('.sl-layer');
  var front = 0;
  var index = -1;
  var timer = 0;
  var running = false;
  var list = [];
  var lastShown = 0;
  var token = 0;
  var preload = null;

  function wrap(i) { return list.length ? ((i % list.length) + list.length) % list.length : 0; }
  function urlAt(i) { return list.length ? list[wrap(i)].url : ''; }

  function schedule() {
    clearTimeout(timer);
    if (!running || list.length < 2) return;
    timer = setTimeout(function () { show(index + 1); }, ms);
  }

  function show(i) {
    if (!list.length) return;
    index = wrap(i);
    var my = ++token;
    var url = urlAt(index);
    var img = new Image();
    var done = false;
    function swap() {
      if (done || my !== token) return;
      done = true;
      var back = 1 - front;
      layers[back].style.backgroundImage = 'url("' + url + '")';
      layers[back].className = 'sl-layer is-on';
      layers[front].className = 'sl-layer';
      front = back;
      lastShown = Date.now();
      if (opts.onShow) opts.onShow(list[index]);
      if (list.length > 1) { preload = new Image(); preload.src = urlAt(index + 1); }
      schedule();
    }
    img.onload = swap;
    img.onerror = swap;
    setTimeout(swap, 8000);
    img.src = url;
  }

  setInterval(function () {
    if (running && list.length > 1 && lastShown && Date.now() - lastShown > ms * 3) show(index + 1);
  }, ms);

  return {
    setPhotos: function (photos) {
      var next = photos || [];
      var same = next.length === list.length && next.every(function (p, k) { return p.url === list[k].url; });
      list = next;
      if (index < 0 && list.length) { show(Math.floor(Math.random() * list.length)); return; }
      if (!same && list.length) show(index);
    },
    start: function () { if (running) return; running = true; schedule(); },
    stop: function () { running = false; clearTimeout(timer); },
  };
}
