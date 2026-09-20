import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { createHttpRepository } from './data/http.ts';
import './styles.css';

const repository = createHttpRepository();
createRoot(document.getElementById('root')!).render(<StrictMode><App repository={repository} /></StrictMode>);
