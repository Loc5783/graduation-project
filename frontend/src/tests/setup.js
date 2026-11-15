const storageData = new WeakMap();

function getStorageMap(instance) {
  let map = storageData.get(instance);
  if (!map) {
    map = new Map();
    storageData.set(instance, map);
  }
  return map;
}

if (typeof Storage !== 'undefined') {
  Storage.prototype.getItem = function (key) {
    const map = getStorageMap(this);
    const k = String(key);
    return map.has(k) ? map.get(k) : null;
  };

  Storage.prototype.setItem = function (key, value) {
    const map = getStorageMap(this);
    map.set(String(key), String(value));
  };

  Storage.prototype.removeItem = function (key) {
    const map = getStorageMap(this);
    map.delete(String(key));
  };

  Storage.prototype.clear = function () {
    const map = getStorageMap(this);
    map.clear();
  };

  Storage.prototype.key = function (index) {
    const map = getStorageMap(this);
    return Array.from(map.keys())[index] ?? null;
  };

  Object.defineProperty(Storage.prototype, 'length', {
    get() {
      const map = getStorageMap(this);
      return map.size;
    },
    configurable: true
  });
}

const localStorageInstance = typeof Storage !== 'undefined' ? Object.create(Storage.prototype) : {};
const sessionStorageInstance = typeof Storage !== 'undefined' ? Object.create(Storage.prototype) : {};

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    get: () => localStorageInstance,
    configurable: true,
    enumerable: true
  });

  Object.defineProperty(window, 'sessionStorage', {
    get: () => sessionStorageInstance,
    configurable: true,
    enumerable: true
  });
}

try {
  Object.defineProperty(globalThis, 'localStorage', {
    get: () => localStorageInstance,
    configurable: true,
    enumerable: true
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    get: () => sessionStorageInstance,
    configurable: true,
    enumerable: true
  });
} catch {
  // Bỏ qua nếu không thể ghi đè trên globalThis
}

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => ({
    fillRect: () => {},
    clearRect: () => {},
    getImageData: () => ({ data: new Array(4) }),
    putImageData: () => {},
    createImageData: () => [],
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    fillText: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    arc: () => {},
    fill: () => {},
    measureText: () => ({ width: 0 }),
    transform: () => {},
    rect: () => {},
    clip: () => {},
    canvas: { width: 300, height: 150 }
  });
}
