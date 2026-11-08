import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/unbounded/900.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
