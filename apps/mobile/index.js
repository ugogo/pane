// Local entry point. Expo's default `expo/AppEntry` does `import App from
// '../../App'`, which — because `expo` is hoisted to the workspace root
// node_modules — resolves to the monorepo root instead of this app. Register
// the root component from here so the App resolves relative to apps/mobile.
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
