import { renderApp, renderPreview, renderPublicBrowse, setShellWiring } from './shell-runtime';
import { wire } from './shell-events';

// Keep the public shell entry point tiny: rendering and interaction stay in separate modules.
setShellWiring(wire);

export { renderApp, renderPreview, renderPublicBrowse };
