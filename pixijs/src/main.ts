import { Application } from 'pixi.js';

const SPACETIMEDB_URI = import.meta.env.VITE_SPACETIMEDB_URI ?? 'ws://localhost:3000';
const SPACETIMEDB_DATABASE = import.meta.env.VITE_SPACETIMEDB_DATABASE ?? 'despoiler-dev';

async function bootstrap(): Promise<void> {
  const mountNode = document.getElementById('app');
  if (!mountNode) {
    throw new Error('Missing #app mount node');
  }

  const app = new Application();
  await app.init({
    resizeTo: mountNode,
    background: '#0e111b',
    antialias: true,
    eventFeatures: {
      move: true,
      click: true,
      wheel: true,
      globalMove: true
    }
  });

  mountNode.appendChild(app.canvas);

 
  app.ticker.add(() => {

  });

  window.addEventListener('resize', () => {

  });

  window.addEventListener('beforeunload', () => {

  });
}

void bootstrap();
