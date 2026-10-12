// Crossfading photo slideshow. Old Android WebView safe: two absolutely
// positioned layers with background-size: cover, opacity transitions, and one
// image preloaded ahead.
export function createSlides(host, opts = {}) {
  const ms = opts.interval || 15000;
  host.innerHTML = '<div class="sl-layer"></div><div class="sl-layer"></div>';
  const layers = host.querySelectorAll('.sl-layer');
  let front = 0;
  let index = -1;
  let timer = 0;
  let list = [];
  let preload = null;

  function urlAt(i) { return list.length ? list[((i % list.length) + list.length) % list.length].url : ''; }

  function warm(i) {
    if (list.length < 2) return;
    preload = new Image();
    preload.src = urlAt(i);
  }

  function show(i) {
    if (!list.length) return;
    index = ((i % list.length) + list.length) % list.length;
    const back = 1 - front;
    const url = urlAt(index);
    const img = new Image();
    img.onload = img.onerror = () => {
      layers[back].style.backgroundImage = `url("${url}")`;
      layers[back].className = 'sl-layer is-on';
      layers[front].className = 'sl-layer';
      front = back;
      if (opts.onShow) opts.onShow(list[index]);
      warm(index + 1);
    };
    img.src = url;
  }

  return {
    setPhotos(photos) {
      const next = photos || [];
      const same = next.length === list.length && next.every((p, i) => p.url === list[i].url);
      list = next;
      if (!same || index < 0) show(index < 0 ? 0 : index);
    },
    start() {
      clearInterval(timer);
      timer = setInterval(() => show(index + 1), ms);
    },
    stop() { clearInterval(timer); timer = 0; },
  };
}
