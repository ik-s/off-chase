import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { createMockRepository } from './data/mock.ts';
import './styles.css';

// Composition root: replace the repository here once HTTP contracts are agreed.
const repository = createMockRepository();
createRoot(document.getElementById('root')!).render(<StrictMode><App repository={repository} /></StrictMode>);
