import { Application, ColorSource, Graphics } from 'pixi.js';

import { GetSpacetime } from './spacetime/spacetime';

const SPACETIMEDB_URI = import.meta.env.VITE_SPACETIMEDB_URI ?? 'ws://localhost:3000';
const SPACETIMEDB_DATABASE = import.meta.env.VITE_SPACETIMEDB_DATABASE ?? 'despoiler-dev';

type AuthMode = 'login' | 'register';

async function bootstrap(): Promise<void> {
  const mountNode = document.getElementById('app');
  if (!mountNode) {
    throw new Error('Missing #app mount node');
  }

  mountNode.style.position = 'relative';

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

  const spacetime = GetSpacetime({
    uri: SPACETIMEDB_URI,
    databaseName: SPACETIMEDB_DATABASE
  });

  spacetime.start();

  const menu = document.createElement('div');
  menu.style.position = 'absolute';
  menu.style.top = '50%';
  menu.style.left = '50%';
  menu.style.transform = 'translate(-50%, -50%)';
  menu.style.display = 'flex';
  menu.style.flexDirection = 'column';
  menu.style.gap = '10px';
  menu.style.padding = '20px';
  menu.style.minWidth = '280px';
  menu.style.background = 'rgba(11, 17, 34, 0.92)';
  menu.style.border = '1px solid #394976';
  menu.style.borderRadius = '8px';

  const title = document.createElement('h2');
  title.textContent = 'Main Menu';
  title.style.margin = '0 0 6px';
  title.style.color = '#e9eeff';

  const usernameInput = document.createElement('input');
  usernameInput.placeholder = 'Username';

  const passwordInput = document.createElement('input');
  passwordInput.placeholder = 'Password';
  passwordInput.type = 'password';

  const repeatPasswordInput = document.createElement('input');
  repeatPasswordInput.placeholder = 'Repeat Password';
  repeatPasswordInput.type = 'password';
  repeatPasswordInput.style.display = 'none';

  const authButton = document.createElement('button');
  authButton.textContent = 'Login';

  const toggleModeButton = document.createElement('button');
  toggleModeButton.textContent = 'Switch to Register';

  const settingsButton = document.createElement('button');
  settingsButton.textContent = 'Settings';

  const message = document.createElement('p');
  message.style.minHeight = '20px';
  message.style.margin = '2px 0 0';
  message.style.color = '#ff9393';

  for (const input of [usernameInput, passwordInput, repeatPasswordInput]) {
    input.style.padding = '10px';
    input.style.borderRadius = '4px';
    input.style.border = '1px solid #5d6a8f';
  }

  for (const button of [authButton, toggleModeButton, settingsButton]) {
    button.style.padding = '10px';
    button.style.border = '1px solid #576591';
    button.style.background = '#1b294c';
    button.style.color = '#e9eeff';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
  }

  menu.append(title, usernameInput, passwordInput, repeatPasswordInput, authButton, toggleModeButton, settingsButton, message);
  mountNode.appendChild(menu);

  let authMode: AuthMode = 'login';

  const setMode = (nextMode: AuthMode): void => {
    authMode = nextMode;
    const isRegister = authMode === 'register';

    authButton.textContent = isRegister ? 'Register' : 'Login';
    toggleModeButton.textContent = isRegister ? 'Switch to Login' : 'Switch to Register';
    repeatPasswordInput.style.display = isRegister ? 'block' : 'none';
    message.textContent = '';
    passwordInput.value = '';
    repeatPasswordInput.value = '';
  };

  const setLoading = (isLoading: boolean): void => {
    authButton.disabled = isLoading;
    toggleModeButton.disabled = isLoading;
    settingsButton.disabled = isLoading;
  };

  const startGameScene = (backgroundColor: ColorSource): void => {
    menu.style.display = 'none';
    app.stage.removeChildren();

    const solidScene = new Graphics();
    solidScene.rect(0, 0, app.screen.width, app.screen.height);
    solidScene.fill(backgroundColor);
    app.stage.addChild(solidScene);

    const resizeScene = (): void => {
      solidScene.clear();
      solidScene.rect(0, 0, app.screen.width, app.screen.height);
      solidScene.fill(backgroundColor);
    };

    window.addEventListener('resize', resizeScene);
  };

  const invokeReducer = async (reducerName: string, ...args: string[]): Promise<void> => {
    const client = spacetime as Record<string, unknown>;
    const direct = client[reducerName];
    const camel = reducerName.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const alternate = client[camel];
    const reducer = typeof direct === 'function' ? direct : alternate;

    if (typeof reducer !== 'function') {
      throw new Error(`Missing reducer '${reducerName}' on client bindings.`);
    }

    await Promise.resolve((reducer as (...params: string[]) => unknown)(...args));
  };

  authButton.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const repeatPassword = repeatPasswordInput.value;

    setLoading(true);
    message.style.color = '#ff9393';

    try {
      if (authMode === 'register') {
        await invokeReducer('register_user', username, password, repeatPassword);
        message.style.color = '#8dffb0';
        message.textContent = 'Registration successful. Please log in.';
        setMode('login');
      } else {
        await invokeReducer('login_user', username, password);
        message.textContent = '';
        startGameScene('#183052');
      }
    } catch (error) {
      const err = error instanceof Error ? error.message : 'Login failed. Please retry.';
      message.textContent = err;
    } finally {
      setLoading(false);
    }
  });

  toggleModeButton.addEventListener('click', () => {
    setMode(authMode === 'login' ? 'register' : 'login');
  });

  settingsButton.addEventListener('click', () => {
    message.style.color = '#b7c4ff';
    message.textContent = 'Settings will be added in a future update.';
  });

  window.addEventListener('beforeunload', () => {
    spacetime.stop();
  });
}

void bootstrap();
