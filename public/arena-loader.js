// Start the decorative 3D background after the live UI has had a chance to render.
(() => {
  const loadArena = () => {
    const three = document.createElement('script');
    three.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    three.async = true;
    three.onload = () => {
      const arena = document.createElement('script');
      arena.src = 'arena.js';
      arena.async = true;
      document.body.appendChild(arena);
    };
    document.head.appendChild(three);
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadArena, { timeout: 1200 });
  } else {
    setTimeout(loadArena, 250);
  }
})();
